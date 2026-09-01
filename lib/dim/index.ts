/* ===========================================================================
 * DIM (REFERENCE DATA) — the master lists the whole app is built from
 * ===========================================================================
 * "DIM" = dimension/reference data: the foundational lists that rarely change
 * — the POSITIONS that can be sat, the SIMULATORS, the COURSE LIST (exercises),
 * the STAFF ROSTER, and the ASSIGNMENT category codes (leave/training labels).
 *
 * This file is just a tidy front door: it re-exports those lists from
 * ./sample.ts under friendly names (dimPositions, dimRoster, …) and adds two
 * small display helpers. To actually EDIT the lists (add a position, a sim, a
 * course, or a staff member), open ./sample.ts — that's where the data lives.
 * =========================================================================== */
import {
  samplePositions,
  sampleSimulators,
  sampleCourseList,
  sampleRoster,
  sampleAssignments,
} from "./sample"

export const dimPositions = samplePositions
export const dimSimulators = sampleSimulators
export const dimCourseList = sampleCourseList
export const dimRoster = sampleRoster
export const dimAssignments = sampleAssignments

// ── Program display labels ──────────────────────────────────────────────
// The program TOKENS are "RADAR"/"TOWER". The label shown to the user is
// title-cased: RADAR → "Radar" and TOWER → "Tower".
const PROGRAM_LABEL_REPLACEMENTS: [RegExp, string][] = [
  [/TOWER/gi, "Tower"],
  [/RADAR/gi, "Radar"],
]

export function programDisplay(value: string | undefined | null): string {
  if (!value) return value ?? ""
  let out = value
  for (const [re, label] of PROGRAM_LABEL_REPLACEMENTS) out = out.replace(re, label)
  return out
}

// ── SimulatorID display ─────────────────────────────────────────────────
// Simulator ids are already demo-safe (e.g. "sim-rs1", "sim-ts1"), so the raw
// id can be surfaced directly to users (e.g. the Power BI export tables).
export function simulatorIdDisplay(id: string | undefined | null): string {
  return id ?? ""
}
