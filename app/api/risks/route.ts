import { NextResponse } from "next/server"
import { z } from "zod"
import { jsonError } from "@/lib/security/authz"
import { actorFromAuth, auditContext, AuditUnavailableError, withAudit } from "@/lib/audit/log"
import { authorizeRiskAdmin, readJson } from "@/lib/risk/guard"
import { createRiskSchema } from "@/lib/risk/model"
import { baselineRisks, newRisk } from "@/lib/risk/apply"
import { allocateRiskId, existingIds, insertRisks, listRisks } from "@/lib/risk/repository"

export const dynamic = "force-dynamic"

const postSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), risk: createRiskSchema }),
  z.object({ op: z.literal("import_baseline") }),
])

export async function GET(request: Request) {
  const authz = await authorizeRiskAdmin(request, "risk-read")
  if (!authz.ok) return authz.response
  try {
    return NextResponse.json({ risks: await listRisks() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[risk] list failed:", (error as Error).message)
    return jsonError(500, "risk_query_failed")
  }
}

export async function POST(request: Request) {
  const authz = await authorizeRiskAdmin(request, "risk-write", 30)
  if (!authz.ok) return authz.response

  let parsed: z.infer<typeof postSchema>
  try {
    const result = postSchema.safeParse(await readJson(request))
    if (!result.success) return NextResponse.json({ error: "invalid_input", issues: result.error.issues }, { status: 400 })
    parsed = result.data
  } catch {
    return jsonError(400, "invalid_json")
  }

  const actor = actorFromAuth(authz.ctx)
  const ctx = auditContext(request, actor, "api/risks")

  try {
    if (parsed.op === "create") {
      const risk = newRisk(await allocateRiskId(), parsed.risk, actor.email)
      const [created] = await withAudit(
        ctx,
        [{ action: "risk.created", entityType: "risk", entityId: risk.id, entityLabel: risk.title, newValue: risk }],
        () => insertRisks([risk], actor.email),
      )
      return NextResponse.json({ risk: created }, { status: 201 })
    }

    const present = await existingIds()
    const missing = baselineRisks(actor.email).filter((r) => !present.has(r.id))
    if (missing.length === 0) return NextResponse.json({ imported: 0 })
    const created = await withAudit(
      ctx,
      missing.map((r) => ({
        action: "risk.created",
        entityType: "risk",
        entityId: r.id,
        entityLabel: r.title,
        newValue: r,
        reason: "Baseline import from config/risk-register.initial.json",
      })),
      () => insertRisks(missing, actor.email),
    )
    return NextResponse.json({ imported: created.length }, { status: 201 })
  } catch (error) {
    if (error instanceof AuditUnavailableError) return jsonError(503, "audit_unavailable")
    console.error("[risk] create failed:", (error as Error).message)
    return jsonError(500, "risk_write_failed")
  }
}
