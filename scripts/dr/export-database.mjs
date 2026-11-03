/* LOGICAL DATABASE EXPORT (read-only), independent of Neon's own PITR.
 * Exports every table in the chosen schemas to NDJSON inside ONE
 * REPEATABLE READ, READ ONLY transaction (consistent point-in-time), and
 * writes a manifest with per-table row counts and SHA-256.
 *
 * SENSITIVE: public.account contains password hashes and public.session
 * contains live session tokens. Store the output encrypted and off-platform;
 * the script refuses to write inside the repository.
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/dr/export-database.mjs [--out=/secure/dir] [--schemas=public,audit,ops] [--exclude=public.session]
 * For a full physical-level dump use pg_dump against DATABASE_URL_UNPOOLED (see docs/backup-restore.md).
 */
import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import pg from "pg"
import { assertOutsideRepo, parseArgs, requireEnv } from "./lib.mjs"

requireEnv("DATABASE_URL")
const args = parseArgs()
const schemas = String(args.schemas ?? "public,audit,ops").split(",").map((s) => s.trim()).filter(Boolean)
const exclude = new Set(String(args.exclude ?? "public.session").split(",").filter(Boolean))
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const outDir = assertOutsideRepo(path.join(String(args.out ?? "/tmp"), `sim-roster-db-export-${stamp}`))
await mkdir(outDir, { recursive: true, mode: 0o700 })

const BATCH = 5000
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL })
await client.connect()
const manifest = { exportedAt: new Date().toISOString(), schemas, excluded: [...exclude], tables: [] }
try {
  await client.query("begin isolation level repeatable read read only")
  const { rows: snap } = await client.query("select now() as at, pg_current_snapshot()::text as snapshot")
  manifest.consistentAt = snap[0].at
  const { rows: tables } = await client.query(
    `select table_schema as s, table_name as t from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema = any($1) order by 1, 2`,
    [schemas],
  )
  for (const { s, t } of tables) {
    const fq = `${s}.${t}`
    if (exclude.has(fq)) continue
    const ident = `${client.escapeIdentifier(s)}.${client.escapeIdentifier(t)}`
    const hash = createHash("sha256")
    const lines = []
    for (let offset = 0; ; offset += BATCH) {
      const { rows } = await client.query(`select * from ${ident} order by ctid limit ${BATCH} offset ${offset}`)
      for (const r of rows) {
        const line = JSON.stringify(r)
        hash.update(line + "\n")
        lines.push(line)
      }
      if (rows.length < BATCH) break
    }
    const file = `${fq}.ndjson`
    await writeFile(path.join(outDir, file), lines.length ? lines.join("\n") + "\n" : "", { mode: 0o600 })
    manifest.tables.push({ table: fq, rows: lines.length, file, sha256: hash.digest("hex") })
    console.log(`${fq.padEnd(48)} ${String(lines.length).padStart(8)} rows`)
  }
  await client.query("rollback")
} finally {
  await client.end()
}
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 })
console.log(`\nExport written to ${outDir} (consistent at ${manifest.consistentAt}).`)
