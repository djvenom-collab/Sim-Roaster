/* ===========================================================================
 * TRAINING GROUPS — position groupings used by the OJTI Training Log
 * ===========================================================================
 * The OJTI training log organises positions into fixed groups per program.
 * Groups are referenced by POSITION ID (not code) so they stay stable even if a
 * position's display code is renamed. Each group lists the positions a trainee
 * can be worked on for that log entry.
 *
 * RADAR
 *   Pool 1 — ARR, DIR
 *   Pool 2 — AWR (AMR), SSR (DSR), INL (MIN)
 *   Pool 3 — DPS, DPN
 *   Pool 4 — COD
 * TOWER
 *   Pool 1 — GMP, GMC 1, GMC 2
 *   Pool 2 — AIR-DEP, AIR-ARR
 *   Pool 3 — GMC, AIR
 *   Pool 4 — COD
 * =========================================================================== */

export interface TrainingGroup {
  id: string
  label: string
  program: "RADAR" | "TOWER"
  positionIds: string[]
}

export const TRAINING_GROUPS: TrainingGroup[] = [
  // ── RADAR ────────────────────────────────────────────────────────────────
  { id: "radar-g1", label: "Pool 1", program: "RADAR", positionIds: ["pos-arr", "pos-dir"] },
  { id: "radar-g2", label: "Pool 2", program: "RADAR", positionIds: ["pos-amr", "pos-dsr", "pos-min"] },
  { id: "radar-g3", label: "Pool 3", program: "RADAR", positionIds: ["pos-dps", "pos-dpn"] },
  { id: "radar-g4", label: "Pool 4", program: "RADAR", positionIds: ["pos-cod"] },
  // ── TOWER ────────────────────────────────────────────────────────────────
  { id: "tower-g1", label: "Pool 1", program: "TOWER", positionIds: ["pos-gmp", "pos-gmc1", "pos-gmc2"] },
  { id: "tower-g2", label: "Pool 2", program: "TOWER", positionIds: ["pos-air-dep", "pos-air-arr"] },
  { id: "tower-g3", label: "Pool 3", program: "TOWER", positionIds: ["pos-gmc", "pos-air"] },
  { id: "tower-g4", label: "Pool 4", program: "TOWER", positionIds: ["pos-tcod"] },
]

const GROUP_BY_ID = new Map(TRAINING_GROUPS.map((g) => [g.id, g]))

export function trainingGroupsFor(program: "RADAR" | "TOWER"): TrainingGroup[] {
  return TRAINING_GROUPS.filter((g) => g.program === program)
}

export function trainingGroupById(id: string): TrainingGroup | undefined {
  return GROUP_BY_ID.get(id)
}
