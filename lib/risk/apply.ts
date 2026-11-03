import { score, type CreateRiskInput, type PatchRiskInput, type Risk, type RiskReview } from "./model"
import baseline from "@/config/risk-register.initial.json"

export class RiskClosedError extends Error {
  constructor() {
    super("closed risks are read-only")
    this.name = "RiskClosedError"
  }
}

export interface PatchResult {
  next: Risk
  reason: string | null
  review?: Omit<RiskReview, "id" | "riskId" | "reviewedAt" | "reviewerEmail">
}

/** Pure: computes the next state so the audit diff is known before anything is written. */
export function applyPatch(current: Risk, patch: PatchRiskInput, actorEmail: string | null, now = new Date()): PatchResult {
  if (current.status === "closed") throw new RiskClosedError()
  const next: Risk = structuredClone(current)
  let reason: string | null = null
  let review: PatchResult["review"]

  switch (patch.op) {
    case "update":
      Object.assign(next, patch.fields)
      break
    case "assign_owners":
      next.riskOwner = patch.riskOwner
      next.treatmentOwner = patch.treatmentOwner
      break
    case "record_controls":
      next.controls = patch.controls
      next.controlEffectiveness = patch.controlEffectiveness
      break
    case "record_treatment":
      next.treatmentStrategy = patch.strategy
      next.treatmentPlan = patch.plan
      next.treatments = patch.treatments
      next.targetDate = patch.targetDate
      next.status = patch.status
      break
    case "update_residual":
      next.residualLikelihood = patch.residualLikelihood
      next.residualImpact = patch.residualImpact
      reason = patch.reason
      break
    case "record_review":
      next.residualLikelihood = patch.residualLikelihood
      next.residualImpact = patch.residualImpact
      next.reviewDate = patch.nextReviewDate
      reason = patch.notes
      review = {
        outcome: patch.outcome,
        notes: patch.notes,
        residualLikelihood: patch.residualLikelihood,
        residualImpact: patch.residualImpact,
        nextReviewDate: patch.nextReviewDate,
      }
      break
    case "accept":
      next.treatmentStrategy = "accept"
      next.status = "accepted"
      next.acceptance = { approvedBy: actorEmail, approvedOn: now.toISOString().slice(0, 10), rationale: patch.rationale }
      reason = patch.rationale
      break
    case "close":
      next.status = "closed"
      next.closedAt = now.toISOString()
      next.closureReason = patch.reason
      reason = patch.reason
      break
  }

  next.inherentScore = score(next.likelihood, next.impact)
  next.residualScore = score(next.residualLikelihood, next.residualImpact)
  return { next, reason, review }
}

const IGNORED = new Set(["version", "updatedAt", "updatedBy", "createdAt", "createdBy"])

/** Only the fields that actually changed, for compact audit previous/new values. */
export function changedFields(before: Risk, after: Risk) {
  const previous: Record<string, unknown> = {}
  const next: Record<string, unknown> = {}
  for (const key of Object.keys(after) as (keyof Risk)[]) {
    if (IGNORED.has(key)) continue
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      previous[key] = before[key]
      next[key] = after[key]
    }
  }
  return { previous, next, count: Object.keys(next).length }
}

function blank(id: string, actorEmail: string | null): Risk {
  const now = new Date().toISOString()
  return {
    id, category: "Information security", title: "", description: "", cause: "", consequence: "", assets: [],
    basis: "potential", evidence: [], likelihood: 1, impact: 1, inherentScore: 1, controls: [],
    controlEffectiveness: "none", residualLikelihood: 1, residualImpact: 1, residualScore: 1,
    riskOwner: null, treatmentStrategy: "reduce", treatmentPlan: "", treatments: [], treatmentOwner: null,
    targetDate: null, status: "open", acceptance: null, reviewDate: null, closedAt: null, closureReason: null,
    version: 1, createdAt: now, createdBy: actorEmail, updatedAt: now, updatedBy: actorEmail,
  }
}

/** New risks start with residual = inherent until controls are assessed. */
export function newRisk(id: string, input: CreateRiskInput, actorEmail: string | null): Risk {
  const r = { ...blank(id, actorEmail), ...input }
  r.residualLikelihood = input.likelihood
  r.residualImpact = input.impact
  r.inherentScore = score(r.likelihood, r.impact)
  r.residualScore = r.inherentScore
  return r
}

type BaselineRecord = (typeof baseline.risks)[number]

export function baselineRisks(actorEmail: string | null): Risk[] {
  return (baseline.risks as BaselineRecord[]).map((b) => {
    const r: Risk = {
      ...blank(b.id, actorEmail),
      category: b.category,
      title: b.title,
      description: b.description,
      cause: b.cause,
      consequence: b.consequence,
      assets: b.assets,
      basis: b.basis as Risk["basis"],
      evidence: b.evidence,
      likelihood: b.likelihood,
      impact: b.impact,
      controls: b.existingControls.map((c, i) => ({
        id: `C${i + 1}`,
        description: c.description,
        effectiveness: c.effectiveness as Risk["controlEffectiveness"],
      })),
      controlEffectiveness: b.controlEffectiveness as Risk["controlEffectiveness"],
      residualLikelihood: b.residualLikelihood,
      residualImpact: b.residualImpact,
      riskOwner: b.riskOwner,
      treatmentStrategy: b.treatmentStrategy as Risk["treatmentStrategy"],
      treatmentPlan: b.treatmentPlan,
      treatmentOwner: b.treatmentOwner,
      targetDate: b.targetDate,
      status: b.status as Risk["status"],
      reviewDate: b.reviewDate,
    }
    r.inherentScore = score(r.likelihood, r.impact)
    r.residualScore = score(r.residualLikelihood, r.residualImpact)
    return r
  })
}
