/* ===========================================================================
 * ASSIGNMENT RULES — can this person sit this seat?
 * ===========================================================================
 * This is the rulebook used when you try to put a staff member into a position
 * on a run. It returns two lists:
 *   - blocks:   hard "no" reasons (on leave, double-booked, missing a required
 *               qualification…). If there are ANY blocks, the seat is not
 *               allowed (ok = false) unless a manager uses manual override.
 *   - warnings: soft "be careful" notes (currency expiring, never sat it…)
 *               that still allow the assignment.
 *
 * WHERE THE RULES LIVE: most rules read from the reference data in
 * sample-data.ts (qualifications and the per-position / per-exercise rules).
 * To change WHO is blocked, edit those lists, not this file.
 *
 * SAFE TO CHANGE HERE:
 *   - Move a check between `blocks` (hard stop) and `warnings` (allowed) to
 *     make a rule stricter or softer.
 *   - Edit the wording shown to the user in push()/blocks messages.
 * =========================================================================== */
import * as seed from "./sample-data"
import type { ValidityStatus } from "./types"

// The result of checking one person against one seat. `ok` is the bottom line;
// the lists explain why. qualMatch summarises how well their quals fit.
export interface AssignmentEval {
  ok: boolean
  warnings: string[]
  blocks: string[]
  validityStatus: ValidityStatus
  qualMatch: "match" | "preferred" | "missing-required" | "excluded" | "neutral"
}

/**
 * Evaluate a candidate staff member against a position for a given run/date.
 * Pure function — pass in the lookups it needs.
 */
export function evaluateAssignment(opts: {
  staffId: string
  positionId: string
  exerciseId: string
  date: string
  validity: { status: ValidityStatus }
  onLeave: boolean
  inTraining: boolean
  /** Title of another (non-sim) task the staff is committed to on this date, if any. */
  onOtherTask?: string | null
  /** Code/name of another position this staff already occupies in the same run, if any. */
  seatedAtInRun?: string | null
  /**
   * Whether this position is one of the staff member's operational positions
   * (i.e. it appears on their profile). If it does not, they were never
   * validated for it and are not eligible to sit it.
   */
  isOperational: boolean
}): AssignmentEval {
  const { staffId, positionId, exerciseId, validity, onLeave, inTraining, onOtherTask, seatedAtInRun, isOperational } =
    opts
  const warnings: string[] = []
  const blocks: string[] = []

  const staffQuals = seed.staffQualifications
    .filter((sq) => sq.staffId === staffId)
    .map((sq) => sq.qualificationId)

  // operational eligibility — must hold this position on their profile, which
  // means they have been validated for it. If not, they are not eligible at all
  // (a hard block) regardless of currency.
  if (!isOperational) {
    blocks.push("Not validated for this position")
  } else {
    // currency only matters for positions they are operational on
    if (validity.status === "expired") warnings.push("Position validity expired")
    else if (validity.status === "expiring") warnings.push("Validity expiring soon")
  }

  // already seated elsewhere in this run — one person can occupy one position only
  if (seatedAtInRun)
    blocks.push(`Already seated at ${seatedAtInRun} in this run`)

  // leave / training / other task — all make the person unavailable that day
  if (onLeave) blocks.push("Staff is on leave")
  if (inTraining) blocks.push("Staff is in training")
  if (onOtherTask) blocks.push(`Assigned to other task: ${onOtherTask}`)

  // position qual rule
  const posRule = seed.positionQualRules.find((r) => r.positionId === positionId)
  let qualMatch: AssignmentEval["qualMatch"] = "neutral"
  if (posRule) {
    if (posRule.excludedQuals.some((q) => staffQuals.includes(q))) {
      blocks.push("Holds excluded qualification for this position")
      qualMatch = "excluded"
    } else if (posRule.requiredQuals.some((q) => !staffQuals.includes(q))) {
      const missing = posRule.requiredQuals
        .filter((q) => !staffQuals.includes(q))
        .map((q) => seed.qualifications.find((x) => x.id === q)?.code)
        .join(", ")
      blocks.push(`Missing required qualification: ${missing}`)
      qualMatch = "missing-required"
    } else if (posRule.preferredQuals.some((q) => staffQuals.includes(q))) {
      qualMatch = "preferred"
    } else {
      qualMatch = "match"
    }
  }

  // exercise qual rule
  const exRule = seed.exerciseQualRules.find((r) => r.exerciseId === exerciseId)
  if (exRule) {
    if (exRule.excludedQuals.some((q) => staffQuals.includes(q)))
      blocks.push("Holds excluded qualification for this exercise")
    const missingEx = exRule.requiredQuals.filter((q) => !staffQuals.includes(q))
    if (missingEx.length) {
      const codes = missingEx.map((q) => seed.qualifications.find((x) => x.id === q)?.code).join(", ")
      blocks.push(`Missing exercise qualification: ${codes}`)
    }
  }

  // temporary restriction
  if (staffQuals.includes("q-restr")) warnings.push("Holds temporary restriction")

  return {
    ok: blocks.length === 0,
    warnings,
    blocks,
    validityStatus: validity.status,
    qualMatch,
  }
}
