import { type NextRequest, NextResponse } from "next/server"
import { authorizeAuditAdmin } from "@/lib/audit/admin-guard"
import { actorFromAuth, auditContext, recordAuditSafe } from "@/lib/audit/log"
import { verifyChain } from "@/lib/audit/query"
import { jsonError } from "@/lib/security/authz"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const authz = await authorizeAuditAdmin(request, "audit-verify")
  if (!authz.ok) return authz.response
  try {
    const result = await verifyChain()
    await recordAuditSafe(auditContext(request, actorFromAuth(authz.ctx), "api/audit/verify"), [
      {
        action: "audit.verify",
        entityType: "audit_log",
        newValue: result,
        result: result.ok ? "success" : "failure",
        failureReason: result.ok ? null : `chain_broken_at_seq_${result.brokenAtSeq}`,
      },
    ])
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[audit] verify failed:", (error as Error).message)
    return jsonError(500, "audit_verify_failed")
  }
}
