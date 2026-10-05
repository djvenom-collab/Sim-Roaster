import { del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { backupIdSchema } from "@/lib/security/validation"

export const dynamic = "force-dynamic"

// DELETE /api/backup/delete
// Body: { id: string }  — the backup pathname to permanently remove.
export async function DELETE(request: NextRequest) {
  const authz = await authorize(request, {
    anyPermission: ["page_backup"],
    rateLimit: { bucket: "backup-delete", limit: 10, windowSec: 60 },
  })
  if (!authz.ok) return authz.response

  try {
    const parsed = backupIdSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, "invalid_id")

    await del(parsed.data.id)
    console.info(`[audit] backup deleted id=${parsed.data.id} by user=${authz.ctx.userId}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[backup] delete error:", (error as Error).message)
    return jsonError(500, "delete_failed")
  }
}
