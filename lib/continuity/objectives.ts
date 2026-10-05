import objectives from "@/config/recovery-objectives.json"
import registry from "@/config/dependencies.json"

export type Tier = "1" | "2" | "3" | "4"

export interface EffectiveObjective {
  tier: Tier
  rtoMinutes: number | null
  rpoMinutes: number | null
  basis: "approved" | "recommended-unapproved"
}

export function objectiveFor(tier: Tier): EffectiveObjective {
  const t = objectives.tiers[tier]
  const approved = t.approved.approvedBy !== null && (t.approved.rtoMinutes !== null || t.approved.rpoMinutes !== null)
  const src = approved ? t.approved : t.recommended
  return {
    tier,
    rtoMinutes: src.rtoMinutes,
    rpoMinutes: src.rpoMinutes,
    basis: approved ? "approved" : "recommended-unapproved",
  }
}

export const dependencyRegistry = registry
