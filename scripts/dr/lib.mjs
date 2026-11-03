/* Shared helpers for disaster-recovery tooling. Read-only against Blob unless
 * a caller explicitly writes to an isolated (non-live) path. */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { get, list } from "@vercel/blob"

export { STATE_PATH, sha256, parseArgs, requireEnv } from "../migration/lib.mjs"
export { profileSnapshot } from "../migration/validate-snapshot.mjs"

export const BACKUP_PREFIX = "sim-roster/backups/"
export const MANIFEST_PREFIX = "sim-roster/dr/manifests/"
export const DRILL_PREFIX = "sim-roster/dr/drills/"
export const EVIDENCE_PREFIX = "sim-roster/dr/evidence/"

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export async function loadJson(rel) {
  return JSON.parse(await readFile(path.join(REPO_ROOT, rel), "utf8"))
}

export async function listAll(prefix) {
  const out = []
  let cursor
  do {
    const page = await list({ prefix, cursor, limit: 1000 })
    out.push(...page.blobs)
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return out
}

/** Backups newest first. */
export async function listBackups() {
  const blobs = await listAll(BACKUP_PREFIX)
  return blobs.filter((b) => b.pathname.endsWith(".json")).sort((a, b) => b.uploadedAt - a.uploadedAt)
}

export async function readText(pathname) {
  const r = await get(pathname, { access: "private", useCache: false })
  if (!r || r.statusCode !== 200 || !r.stream) return null
  return new Response(r.stream).text()
}

export async function readManifest(backupPath) {
  const text = await readText(MANIFEST_PREFIX + backupPath.slice(BACKUP_PREFIX.length)).catch(() => null)
  return text ? JSON.parse(text) : null
}

/** Effective objective: approved when signed off, otherwise the recommendation (labelled as such). */
export async function objectiveFor(tier) {
  const o = (await loadJson("config/recovery-objectives.json")).tiers[String(tier)]
  const approved = o.approved.approvedBy !== null && (o.approved.rtoMinutes !== null || o.approved.rpoMinutes !== null)
  const src = approved ? o.approved : o.recommended
  return { rtoMinutes: src.rtoMinutes, rpoMinutes: src.rpoMinutes, basis: approved ? "approved" : "recommended-unapproved" }
}

export function assertOutsideRepo(dir) {
  const abs = path.resolve(dir)
  if (abs === REPO_ROOT || abs.startsWith(REPO_ROOT + path.sep)) {
    console.error(`Refusing to write recovery data inside the repository (${abs}). Choose a directory outside source control.`)
    process.exit(2)
  }
  return abs
}

/** Structural integrity summary of a parsed snapshot. */
export function integritySummary(profile) {
  const sum = (o) => Object.values(o).reduce((n, v) => n + (Array.isArray(v) ? v.length : Number(v) || 0), 0)
  return {
    slices: Object.keys(profile.counts).length,
    records: Object.values(profile.counts).reduce((a, b) => a + b, 0),
    duplicateIds: sum(profile.duplicateIds),
    orphans: sum(profile.orphans),
  }
}
