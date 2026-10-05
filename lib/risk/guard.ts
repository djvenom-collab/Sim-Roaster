import "server-only"
import { authorize, jsonError, type AuthorizeResult } from "@/lib/security/authz"
import { auditContext, actorFromAuth, recordAuditSafe } from "@/lib/audit/log"

/** The risk register is Admin-only regardless of the editable permission matrix. */
export async function authorizeRiskAdmin(request: Request, bucket: string, limit = 60): Promise<AuthorizeResult> {
  const authz = await authorize(request, { rateLimit: { bucket, limit, windowSec: 60 } })
  if (!authz.ok) return authz
  if (authz.ctx.role !== "Admin") {
    await recordAuditSafe(auditContext(request, actorFromAuth(authz.ctx), `api/${bucket}`), [
      { action: "authz.denied", entityType: "risk", result: "failure", failureReason: "admin_required" },
    ])
    return { ok: false, response: jsonError(403, "forbidden") }
  }
  return authz
}

export async function readJson(request: Request, maxBytes = 64_000): Promise<unknown> {
  const text = await request.text()
  if (text.length > maxBytes) throw new Error("payload_too_large")
  return JSON.parse(text)
}
