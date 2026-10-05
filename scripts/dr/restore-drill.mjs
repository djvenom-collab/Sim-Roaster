/* BACKUP RESTORATION TEST (non-destructive).
 * Proves a backup can actually be restored, without touching live data:
 *   1. select a backup (latest, or --id=<pathname>)
 *   2. verify integrity (SHA-256 vs manifest, JSON parse, structure)
 *   3. RESTORE it into an isolated path sim-roster/dr/drills/<ts>/state.json
 *   4. read the restored copy back and prove byte-for-byte equality
 *   5. profile the restored copy and compare record counts with the source
 *   6. (optional --compare-live) compare counts with live state to measure the data-loss window
 *   7. check database recoverability signals (connectivity, auth + audit tables, audit row count)
 *   8. compare measured duration and backup age with RTO/RPO
 *   9. write an evidence record (Blob sim-roster/dr/evidence/ and --out=<dir>)
 * The live state path is never written; the script asserts this.
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/dr/restore-drill.mjs [--id=<backup>] [--compare-live] [--operator=<name>] [--out=/tmp/sim-roster-dr]
 * Exit code 1 if any step fails.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { put } from "@vercel/blob"
import pg from "pg"
import {
  DRILL_PREFIX, EVIDENCE_PREFIX, STATE_PATH, assertOutsideRepo, integritySummary, listBackups,
  objectiveFor, parseArgs, profileSnapshot, readManifest, readText, requireEnv, sha256,
} from "./lib.mjs"

requireEnv("BLOB_READ_WRITE_TOKEN")
const args = parseArgs()
const started = Date.now()
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const steps = []
const step = async (name, fn) => {
  const t = Date.now()
  try {
    const detail = await fn()
    steps.push({ name, ok: true, ms: Date.now() - t, detail })
    return detail
  } catch (error) {
    steps.push({ name, ok: false, ms: Date.now() - t, error: error.message })
    throw error
  }
}

let backup, text, sourceSha, restoredPath, sourceProfile
try {
  backup = await step("select-backup", async () => {
    const all = await listBackups()
    const b = args.id ? all.find((x) => x.pathname === args.id) : all[0]
    if (!b) throw new Error(args.id ? `backup not found: ${args.id}` : "no backups exist")
    return { pathname: b.pathname, uploadedAt: b.uploadedAt.toISOString(), bytes: b.size }
  })

  await step("verify-integrity", async () => {
    text = await readText(backup.pathname)
    if (text === null) throw new Error("backup unreadable")
    sourceSha = sha256(text)
    const manifest = await readManifest(backup.pathname)
    if (manifest && manifest.sha256 !== sourceSha) throw new Error("SHA-256 does not match manifest")
    const state = JSON.parse(text)
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("not a JSON object")
    sourceProfile = profileSnapshot(state)
    return { sha256: sourceSha, manifest: manifest ? "match" : "absent", ...integritySummary(sourceProfile) }
  })

  await step("restore-to-isolated-target", async () => {
    restoredPath = `${DRILL_PREFIX}${stamp}/state.json`
    if (restoredPath === STATE_PATH) throw new Error("refusing to target live state")
    await put(restoredPath, text, { access: "private", allowOverwrite: false, contentType: "application/json", cacheControlMaxAge: 0 })
    return { restoredPath }
  })

  await step("read-back-and-compare", async () => {
    const restored = await readText(restoredPath)
    const restoredSha = restored === null ? null : sha256(restored)
    if (restoredSha !== sourceSha) throw new Error("restored copy differs from backup")
    const p = profileSnapshot(JSON.parse(restored))
    const diffs = Object.keys({ ...p.counts, ...sourceProfile.counts }).filter((k) => p.counts[k] !== sourceProfile.counts[k])
    if (diffs.length) throw new Error(`record counts differ: ${diffs.join(", ")}`)
    return { restoredSha, slicesCompared: Object.keys(p.counts).length }
  })

  if (args["compare-live"]) {
    await step("compare-with-live (read-only)", async () => {
      const live = await readText(STATE_PATH)
      if (live === null) return { live: "absent" }
      const lp = profileSnapshot(JSON.parse(live))
      const delta = {}
      for (const k of new Set([...Object.keys(lp.counts), ...Object.keys(sourceProfile.counts)])) {
        const d = (lp.counts[k] ?? 0) - (sourceProfile.counts[k] ?? 0)
        if (d) delta[k] = d
      }
      return { identicalToLive: sha256(live) === sourceSha, recordDeltaLiveMinusBackup: delta }
    })
  }

  if (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL) {
    await step("database-recoverability-checks (read-only)", async () => {
      const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL })
      await client.connect()
      try {
        await client.query("begin transaction read only")
        const { rows } = await client.query(`
          select to_regclass('public."user"')::text as users, to_regclass('public.session')::text as sessions,
                 to_regclass('audit.event')::text as audit,
                 (select count(*) from public."user")::int as user_count,
                 (case when to_regclass('audit.event') is null then null
                       else (select count(*) from audit.event) end)::int as audit_events,
                 now() as db_now`)
        await client.query("rollback")
        const r = rows[0]
        if (!r.users || !r.sessions) throw new Error("auth tables missing")
        return r
      } finally {
        await client.end()
      }
    })
  }
} catch {
  /* recorded in steps */
}

const tier1 = await objectiveFor(1)
const durationMs = Date.now() - started
const backupAgeMin = backup ? Math.round((Date.now() - new Date(backup.uploadedAt).getTime()) / 60_000) : null
const evidence = {
  drillId: stamp,
  type: "backup-restoration-test",
  operator: args.operator ?? process.env.USER ?? "unknown",
  startedAt: new Date(started).toISOString(),
  durationMs,
  backup,
  restoredPath,
  passed: steps.every((s) => s.ok) && steps.length >= 4,
  objectives: {
    basis: tier1.basis,
    rtoMinutes: tier1.rtoMinutes,
    rpoMinutes: tier1.rpoMinutes,
    measuredRestoreMinutes: +(durationMs / 60_000).toFixed(2),
    backupAgeMinutes: backupAgeMin,
    rpoMet: backupAgeMin !== null && tier1.rpoMinutes !== null ? backupAgeMin <= tier1.rpoMinutes : null,
    note: "measuredRestoreMinutes covers the technical restore only; the full RTO also includes detection, decision and user verification time.",
  },
  steps,
}

const outDir = assertOutsideRepo(String(args.out ?? "/tmp/sim-roster-dr"))
await mkdir(outDir, { recursive: true })
const localFile = path.join(outDir, `restore-drill-${stamp}.json`)
await writeFile(localFile, JSON.stringify(evidence, null, 2))
await put(`${EVIDENCE_PREFIX}${stamp}.json`, JSON.stringify(evidence, null, 2), {
  access: "private", allowOverwrite: false, contentType: "application/json", cacheControlMaxAge: 0,
}).catch((e) => console.error("evidence upload failed:", e.message))

for (const s of steps) console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.name}  (${s.ms} ms)${s.error ? "  " + s.error : ""}`)
console.log(`\nResult: ${evidence.passed ? "PASSED" : "FAILED"}  evidence: ${localFile}`)
console.log(evidence.objectives)
process.exit(evidence.passed ? 0 : 1)
