/* Phase 1 — EXISTING DATA BACKUP (non-destructive).
 * Copies the live snapshot to a NEW immutable blob under sim-roster/backups/
 * (allowOverwrite: false), re-reads it, and verifies the SHA-256 matches the
 * source byte-for-byte. The backup appears in the app's Backup page and can be
 * restored from there. Optionally also writes a local copy with --local=<dir>.
 *
 * Usage: node --env-file-if-exists=/vercel/share/.env.project scripts/migration/backup-blob-state.mjs [--label=pre-migration] [--local=/tmp/sim-roster-backups]
 */
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { get, put } from "@vercel/blob"
import { parseArgs, readLiveSnapshot, sha256 } from "./lib.mjs"

const args = parseArgs()
const label = String(args.label ?? "pre-migration").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40)

const snap = await readLiveSnapshot()
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const backupPath = `sim-roster/backups/${stamp}_${label}-${snap.sha256.slice(0, 8)}.json`

await put(backupPath, snap.text, {
  access: "private",
  allowOverwrite: false,
  contentType: "application/json",
  cacheControlMaxAge: 0,
})

const check = await get(backupPath, { access: "private", useCache: false })
const copied = check?.stream ? await new Response(check.stream).text() : ""
const copiedSha = sha256(copied)
if (copiedSha !== snap.sha256) {
  console.error(`Backup verification FAILED: source ${snap.sha256} != backup ${copiedSha}`)
  process.exit(1)
}

let localPath = null
if (args.local) {
  await mkdir(String(args.local), { recursive: true })
  localPath = path.join(String(args.local), path.basename(backupPath))
  await writeFile(localPath, snap.text, { flag: "wx" })
}

console.log(
  JSON.stringify(
    { ok: true, backupPath, localPath, sourceEtag: snap.etag, sha256: snap.sha256, bytes: snap.bytes, version: snap.state.version },
    null,
    2,
  ),
)
