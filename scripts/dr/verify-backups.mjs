/* BACKUP INTEGRITY VERIFICATION (read-only).
 * For each backup: download, SHA-256, compare with its manifest (if any),
 * JSON parse, structural profile. Optionally saves verified copies to an
 * off-platform directory (--download=<dir>, must be outside the repo).
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/dr/verify-backups.mjs [--latest=5] [--json] [--download=/secure/offsite]
 * Exit code 1 if any checked backup fails.
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  assertOutsideRepo, integritySummary, listBackups, objectiveFor, parseArgs,
  profileSnapshot, readManifest, readText, requireEnv, sha256,
} from "./lib.mjs"

requireEnv("BLOB_READ_WRITE_TOKEN")
const args = parseArgs()
const all = await listBackups()
const targets = args.latest ? all.slice(0, Number(args.latest)) : all
const downloadDir = args.download ? assertOutsideRepo(String(args.download)) : null
if (downloadDir) await mkdir(downloadDir, { recursive: true })

const results = []
for (const b of targets) {
  const r = { backup: b.pathname, uploadedAt: b.uploadedAt.toISOString(), bytes: b.size, ok: false, checks: {} }
  try {
    const text = await readText(b.pathname)
    if (text === null) throw new Error("unreadable")
    r.sha256 = sha256(text)
    const manifest = await readManifest(b.pathname)
    r.checks.manifest = manifest ? (manifest.sha256 === r.sha256 ? "match" : "MISMATCH") : "absent"
    const state = JSON.parse(text)
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("not a JSON object")
    r.checks.parse = "ok"
    r.integrity = integritySummary(profileSnapshot(state))
    r.checks.structure = r.integrity.slices > 0 ? "ok" : "EMPTY"
    r.ok = r.checks.manifest !== "MISMATCH" && r.checks.structure === "ok"
    if (downloadDir && r.ok) {
      const file = path.join(downloadDir, path.basename(b.pathname))
      await writeFile(file, text, { flag: "wx" }).catch((e) => { if (e.code !== "EEXIST") throw e })
      await writeFile(`${file}.sha256`, `${r.sha256}  ${path.basename(b.pathname)}\n`).catch(() => {})
      r.downloadedTo = file
    }
  } catch (error) {
    r.error = error.message
  }
  results.push(r)
}

const rpo = await objectiveFor(1)
const newest = all[0]
const ageMin = newest ? Math.round((Date.now() - newest.uploadedAt.getTime()) / 60_000) : null
const summary = {
  checkedAt: new Date().toISOString(),
  totalBackups: all.length,
  checked: results.length,
  failed: results.filter((r) => !r.ok).length,
  newestBackupAgeMinutes: ageMin,
  rpoMinutes: rpo.rpoMinutes,
  rpoBasis: rpo.basis,
  rpoMet: ageMin !== null && rpo.rpoMinutes !== null ? ageMin <= rpo.rpoMinutes : null,
}

if (args.json) {
  console.log(JSON.stringify({ summary, results }, null, 2))
} else {
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL"
    console.log(`${tag}  ${r.backup}  manifest=${r.checks.manifest ?? "-"}  records=${r.integrity?.records ?? "-"}  ${r.error ?? ""}`)
  }
  console.log("\n", summary)
}
process.exit(summary.failed > 0 ? 1 : 0)
