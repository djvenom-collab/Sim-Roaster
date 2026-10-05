import { put, get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { authorize, invalidatePermissionCache, jsonError } from "@/lib/security/authz"
import { backupIdSchema } from "@/lib/security/validation"

export const dynamic = "force-dynamic"

const STATE_PATH = "sim-roster/state.json"

// POST /api/backup/restore
// Body: { id: string }  — the backup pathname to restore.
// Copies the backup blob content back over the live state.json so the next
// store load (or browser refresh) picks up the restored snapshot.
export async function POST(request: NextRequest) {
  const authz = await authorize(request, {
    anyPermission: ["page_backup"],
    rateLimit: { bucket: "backup-restore", limit: 5, windowSec: 60 },
  })
  if (!authz.ok) return authz.response

  try {
    const parsed = backupIdSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, "invalid_id")
    const { id } = parsed.data

    // Read the chosen backup blob.
    const backup = await get(id, { access: "private", useCache: false })
    if (!backup || !backup.stream) {
      return jsonError(404, "backup_not_found")
    }
    const snapshotText = await new Response(backup.stream).text()
    if (!snapshotText) {
      return jsonError(404, "empty_backup")
    }

    // Validate that it is a JSON object before overwriting live state.
    try {
      const snapshot: unknown = JSON.parse(snapshotText)
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        return jsonError(422, "invalid_json")
      }
    } catch {
      return jsonError(422, "invalid_json")
    }

    // Overwrite the live state with the backup content.
    await put(STATE_PATH, snapshotText, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    })
    invalidatePermissionCache()
    console.info(`[audit] backup restored id=${id} by user=${authz.ctx.userId}`)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[backup] restore error:", (error as Error).message)
    return jsonError(500, "restore_failed")
  }
}
