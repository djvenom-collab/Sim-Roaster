import { z } from "zod"

// Risk-management domain. Deliberately independent of scheduling code:
// nothing here imports from lib/store, lib/assignment-eval or lib/types.

export const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"] as const
export const IMPACT_LABELS = ["Insignificant", "Minor", "Moderate", "Major", "Severe"] as const

export const RISK_CATEGORIES = [
  "Information security",
  "Cybersecurity",
  "Authentication",
  "Authorization",
  "Data integrity",
  "Data loss",
  "Availability",
  "Business continuity",
  "Third-party services",
  "Vercel",
  "Database",
  "Blob storage",
  "Operational errors",
  "Human error",
  "Unauthorized scheduling changes",
  "Incorrect staff assignment",
  "Validity/currency errors",
  "Leave conflicts",
  "Qualification/eligibility errors",
  "Software defects",
  "Deployment failure",
  "Dependency vulnerabilities",
  "Insider misuse",
  "Administrative privilege",
  "AI risks",
] as const

export const BASES = ["observed", "potential"] as const
export const EFFECTIVENESS = ["none", "weak", "partial", "effective"] as const
export const STRATEGIES = ["avoid", "reduce", "transfer", "accept"] as const
export const STATUSES = ["open", "treating", "mitigated", "accepted", "closed"] as const
export const REVIEW_OUTCOMES = ["no_change", "rescored", "escalated", "treatment_updated"] as const
export const TREATMENT_STATUSES = ["planned", "in_progress", "done", "cancelled"] as const

export type RiskStatus = (typeof STATUSES)[number]
export type Band = "low" | "medium" | "high" | "critical"

export const score = (likelihood: number, impact: number) => likelihood * impact

export function band(value: number): Band {
  if (value >= 15) return "critical"
  if (value >= 10) return "high"
  if (value >= 5) return "medium"
  return "low"
}

export const BAND_LABEL: Record<Band, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" }

const rating = z.number().int().min(1).max(5)
const text = (max: number) => z.string().trim().max(max)
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
const person = text(120).nullable()

export const controlSchema = z.object({
  id: z.string().min(1).max(40),
  description: text(500).min(1),
  effectiveness: z.enum(EFFECTIVENESS),
})

export const treatmentSchema = z.object({
  id: z.string().min(1).max(40),
  action: text(1000).min(1),
  owner: person,
  targetDate: isoDate,
  status: z.enum(TREATMENT_STATUSES),
})

export const evidenceSchema = z.object({ ref: text(300).min(1), note: text(500) })

export type Control = z.infer<typeof controlSchema>
export type Treatment = z.infer<typeof treatmentSchema>
export type Evidence = z.infer<typeof evidenceSchema>

const identification = {
  category: z.enum(RISK_CATEGORIES),
  title: text(200).min(1),
  description: text(4000),
  cause: text(4000),
  consequence: text(4000),
  assets: z.array(text(200).min(1)).max(30),
  basis: z.enum(BASES),
  likelihood: rating,
  impact: rating,
}

export const createRiskSchema = z.object({
  ...identification,
  evidence: z.array(evidenceSchema).max(20).default([]),
  riskOwner: person.default(null),
  reviewDate: isoDate.default(null),
})

const withVersion = { version: z.number().int().min(1) }

export const patchRiskSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update"), ...withVersion, fields: z.object(identification).partial() }),
  z.object({ op: z.literal("assign_owners"), ...withVersion, riskOwner: person, treatmentOwner: person }),
  z.object({
    op: z.literal("record_controls"),
    ...withVersion,
    controls: z.array(controlSchema).max(30),
    controlEffectiveness: z.enum(EFFECTIVENESS),
  }),
  z.object({
    op: z.literal("record_treatment"),
    ...withVersion,
    strategy: z.enum(STRATEGIES),
    plan: text(4000),
    treatments: z.array(treatmentSchema).max(30),
    targetDate: isoDate,
    status: z.enum(["open", "treating", "mitigated"]),
  }),
  z.object({ op: z.literal("update_residual"), ...withVersion, residualLikelihood: rating, residualImpact: rating, reason: text(1000).min(1) }),
  z.object({
    op: z.literal("record_review"),
    ...withVersion,
    outcome: z.enum(REVIEW_OUTCOMES),
    notes: text(4000).min(1),
    residualLikelihood: rating,
    residualImpact: rating,
    nextReviewDate: isoDate,
  }),
  z.object({ op: z.literal("accept"), ...withVersion, rationale: text(2000).min(1) }),
  z.object({ op: z.literal("close"), ...withVersion, reason: text(2000).min(1) }),
])

export type CreateRiskInput = z.infer<typeof createRiskSchema>
export type PatchRiskInput = z.infer<typeof patchRiskSchema>
export type PatchOp = PatchRiskInput["op"]

export interface Acceptance {
  approvedBy: string | null
  approvedOn: string
  rationale: string
}

export interface Risk {
  id: string
  category: string
  title: string
  description: string
  cause: string
  consequence: string
  assets: string[]
  basis: (typeof BASES)[number]
  evidence: Evidence[]
  likelihood: number
  impact: number
  inherentScore: number
  controls: Control[]
  controlEffectiveness: (typeof EFFECTIVENESS)[number]
  residualLikelihood: number
  residualImpact: number
  residualScore: number
  riskOwner: string | null
  treatmentStrategy: (typeof STRATEGIES)[number]
  treatmentPlan: string
  treatments: Treatment[]
  treatmentOwner: string | null
  targetDate: string | null
  status: RiskStatus
  acceptance: Acceptance | null
  reviewDate: string | null
  closedAt: string | null
  closureReason: string | null
  version: number
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface RiskReview {
  id: string
  riskId: string
  reviewedAt: string
  reviewerEmail: string | null
  outcome: (typeof REVIEW_OUTCOMES)[number]
  notes: string
  residualLikelihood: number
  residualImpact: number
  nextReviewDate: string | null
}

/** Which audit action each patch op is recorded as. */
export const PATCH_AUDIT_ACTION: Record<PatchOp, string> = {
  update: "risk.updated",
  assign_owners: "risk.owner_assigned",
  record_controls: "risk.controls_recorded",
  record_treatment: "risk.treatment_recorded",
  update_residual: "risk.residual_updated",
  record_review: "risk.reviewed",
  accept: "risk.accepted",
  close: "risk.closed",
}
