import { z } from "zod"

/** Backup ids are blob pathnames created by POST /api/backup. Restricting the
 * character set blocks path traversal and access to other blob prefixes. */
export const backupIdSchema = z.object({
  id: z
    .string()
    .max(200)
    .regex(/^sim-roster\/backups\/[\w-]+\.json$/),
})

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Training attachments are always stored under the `training/` prefix. */
export const trainingPathnameSchema = z
  .string()
  .max(300)
  .regex(/^training\/[\w.\-]+$/)

export function isTrainingBlobUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 1000) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".blob.vercel-storage.com") &&
      trainingPathnameSchema.safeParse(decodeURIComponent(url.pathname.slice(1))).success
    )
  } catch {
    return false
  }
}
