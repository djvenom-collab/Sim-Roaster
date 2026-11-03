import { NextResponse } from "next/server"
import { jsonError } from "@/lib/security/authz"
import { actorFromAuth, auditContext, AuditUnavailableError, withAudit } from "@/lib/audit/log"
import { authorizeRiskAdmin, readJson } from "@/lib/risk/guard"
import { PATCH_AUDIT_ACTION, patchRiskSchema } from "@/lib/risk/model"
import { applyPatch, changedFields, RiskClosedError } from "@/lib/risk/apply"
import { getRisk, listReviews, RiskVersionConflictError, saveRisk } from "@/lib/risk/repository"

export const dynamic = "force-dynamic"

const RISK_ID = /^R-\d{3,6}$/

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizeRiskAdmin(request, "risk-read")
  if (!authz.ok) return authz.response
  const { id } = await params
  if (!RISK_ID.test(id)) return jsonError(400, "invalid_id")
  try {
    const risk = await getRisk(id)
    if (!risk) return jsonError(404, "not_found")
    return NextResponse.json({ risk, reviews: await listReviews(id) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[risk] read failed:", (error as Error).message)
    return jsonError(500, "risk_query_failed")
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizeRiskAdmin(request, "risk-write", 30)
  if (!authz.ok) return authz.response
  const { id } = await params
  if (!RISK_ID.test(id)) return jsonError(400, "invalid_id")

  let body: unknown
  try {
    body = await readJson(request)
  } catch {
    return jsonError(400, "invalid_json")
  }
  const parsed = patchRiskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 })
  const patch = parsed.data

  const actor = actorFromAuth(authz.ctx)
  const ctx = auditContext(request, actor, "api/risks")

  try {
    const current = await getRisk(id)
    if (!current) return jsonError(404, "not_found")
    if (current.version !== patch.version) return NextResponse.json({ error: "version_conflict", risk: current }, { status: 409 })

    const { next, reason, review } = applyPatch(current, patch, actor.email)
    const diff = changedFields(current, next)
    if (diff.count === 0 && !review) return NextResponse.json({ risk: current })

    const saved = await withAudit(
      ctx,
      [
        {
          action: PATCH_AUDIT_ACTION[patch.op],
          entityType: "risk",
          entityId: id,
          entityLabel: current.title,
          previousValue: diff.previous,
          newValue: review ? { ...diff.next, review } : diff.next,
          reason,
        },
      ],
      () => saveRisk(next, patch.version, actor, review),
    )
    return NextResponse.json({ risk: saved })
  } catch (error) {
    if (error instanceof RiskClosedError) return jsonError(409, "risk_closed")
    if (error instanceof RiskVersionConflictError) return jsonError(409, "version_conflict")
    if (error instanceof AuditUnavailableError) return jsonError(503, "audit_unavailable")
    console.error("[risk] update failed:", (error as Error).message)
    return jsonError(500, "risk_write_failed")
  }
}
