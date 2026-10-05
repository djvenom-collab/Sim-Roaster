import { del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { backupIdSchema } from "@/lib/security/validation"
import { AuditUnavailableError, actorFromAuth, auditContext, withAudit } from "@/lib/audit/log"

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

    const id = parsed.data.id
    await withAudit(
      auditContext(request, actorFromAuth(authz.ctx), "api/backup/delete"),
      [{ action: "backup.delete", entityType: "backup", entityId: id }],
      () => del(id),
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuditUnavailableError) return jsonError(503, "audit_unavailable", { "Retry-After": "5" })
    console.error("[backup] delete error:", (error as Error).message)
    return jsonError(500, "delete_failed")
  }
}
