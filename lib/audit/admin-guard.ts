import "server-only"
import { authorize, jsonError, type AuthorizeResult } from "@/lib/security/authz"
import { auditContext, actorFromAuth, recordAuditSafe } from "./log"

/** The audit trail is Admin-only regardless of the editable permission matrix. */
export async function authorizeAuditAdmin(request: Request, bucket: string): Promise<AuthorizeResult> {
  const authz = await authorize(request, { rateLimit: { bucket, limit: 60, windowSec: 60 } })
  if (!authz.ok) return authz
  if (authz.ctx.role !== "Admin") {
    await recordAuditSafe(auditContext(request, actorFromAuth(authz.ctx), `api/${bucket}`), [
      { action: "authz.denied", entityType: "audit_log", result: "failure", failureReason: "admin_required" },
    ])
    return { ok: false, response: jsonError(403, "forbidden") }
  }
  return authz
}
