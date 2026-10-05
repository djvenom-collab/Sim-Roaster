/* BACKUP RETENTION (dry-run by default; never automatic).
 * Grandfather-father-son policy. Prints which backups would be kept or pruned.
 * Deletion only happens with BOTH --apply and --confirm=<exact prune count>.
 * Always kept: the newest backup, anything labelled _pre-, _keep or _legal-hold,
 * and at least --min-keep backups.
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/dr/backup-retention.mjs [--keep-daily=14] [--keep-weekly=8] [--keep-monthly=12] [--min-keep=10]
 *   ... --apply --confirm=<n>
 */
import { del } from "@vercel/blob"
import { BACKUP_PREFIX, MANIFEST_PREFIX, listBackups, parseArgs, requireEnv } from "./lib.mjs"

requireEnv("BLOB_READ_WRITE_TOKEN")
const args = parseArgs()
const keepDaily = Number(args["keep-daily"] ?? 14)
const keepWeekly = Number(args["keep-weekly"] ?? 8)
const keepMonthly = Number(args["keep-monthly"] ?? 12)
const minKeep = Number(args["min-keep"] ?? 10)
const PROTECTED = /_(pre-|keep|legal-hold)/i

const backups = await listBackups()
const keep = new Map()
const mark = (b, why) => { if (!keep.has(b.pathname)) keep.set(b.pathname, why) }

if (backups[0]) mark(backups[0], "newest")
backups.filter((b) => PROTECTED.test(b.pathname)).forEach((b) => mark(b, "protected-label"))
backups.slice(0, minKeep).forEach((b) => mark(b, "min-keep"))

const bucket = (fmt, limit, why) => {
  const seen = new Set()
  for (const b of backups) {
    const k = fmt(b.uploadedAt)
    if (seen.has(k)) continue
    if (seen.size >= limit) break
    seen.add(k)
    mark(b, why)
  }
}
const isoWeek = (d) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y) / 86_400_000 + 1) / 7)}`
}
bucket((d) => d.toISOString().slice(0, 10), keepDaily, "daily")
bucket(isoWeek, keepWeekly, "weekly")
bucket((d) => d.toISOString().slice(0, 7), keepMonthly, "monthly")

const prune = backups.filter((b) => !keep.has(b.pathname))
for (const b of backups) console.log(`${keep.has(b.pathname) ? "KEEP " : "PRUNE"}  ${b.uploadedAt.toISOString()}  ${b.pathname}  ${keep.get(b.pathname) ?? ""}`)
console.log(`\n${backups.length} backups: keep ${keep.size}, prune ${prune.length}`)

if (!args.apply) {
  console.log("Dry run. Nothing deleted. Re-run with --apply --confirm=" + prune.length + " to delete.")
  process.exit(0)
}
if (Number(args.confirm) !== prune.length) {
  console.error(`Refusing: --confirm must equal the prune count (${prune.length}).`)
  process.exit(2)
}
for (const b of prune) {
  await del([b.pathname, MANIFEST_PREFIX + b.pathname.slice(BACKUP_PREFIX.length)])
  console.log("deleted", b.pathname)
}
