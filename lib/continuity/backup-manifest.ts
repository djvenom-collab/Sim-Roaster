import "server-only"
import { createHash } from "node:crypto"
import { put } from "@vercel/blob"

export const BACKUP_PREFIX = "sim-roster/backups/"
export const MANIFEST_PREFIX = "sim-roster/dr/manifests/"

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/** Manifest path mirrors the backup filename under a separate prefix so the backup list is unaffected. */
export function manifestPathFor(backupPath: string): string {
  return MANIFEST_PREFIX + backupPath.slice(BACKUP_PREFIX.length)
}

export interface BackupManifest {
  backupPath: string
  sha256: string
  bytes: number
  kind: "manual" | "scheduled"
  createdAt: string
  sourceEtag: string | null
  verifiedAfterWrite: boolean
}

/**
 * Writes an integrity manifest for a backup. Best-effort: a missing manifest
 * only means verify-backups falls back to parse/structure checks.
 */
export async function writeManifest(m: BackupManifest): Promise<void> {
  try {
    await put(manifestPathFor(m.backupPath), JSON.stringify(m, null, 2), {
      access: "private",
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    })
  } catch (error) {
    console.error("[backup] manifest write failed:", (error as Error).message)
  }
}
