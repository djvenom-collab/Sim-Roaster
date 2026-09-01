import type { Staff, Run, Simulator, Assignment, TrainingSession } from "./types"
import { programDisplay } from "./dim"

/* ===========================================================================
 * PROGRAMS — the RADAR vs TOWER department filter
 * ===========================================================================
 * The app serves two departments (RADAR and TOWER) from one codebase. A
 * top-bar "view" can focus on one department or show ALL of them at once.
 * The functions here answer "does this run / staff member / training belong in
 * the currently selected view?" so each page can hide what isn't relevant.
 *
 * CHANGEABLE PARAMETERS:
 *   - PROGRAMS: the list of departments. If you ever add a third department,
 *     add it here and to the Program type, then check parsePrograms() handles
 *     its name. Most other logic flows from these.
 *   - Anything with no resolvable program is treated as "shared" and shows in
 *     every view (see the `length === 0` checks below).
 * =========================================================================== */

// ── Program model ───────────────────────────────────────────────────────
// CHANGEABLE: the two departments. Program is a single department; ProgramView
// adds "ALL" for the oversight view that shows everything.
export type Program = "RADAR" | "TOWER"
export type ProgramView = Program | "ALL"

export const PROGRAMS: Program[] = ["RADAR", "TOWER"]
export const PROGRAM_VIEWS: ProgramView[] = ["ALL", "RADAR", "TOWER"]

// Normalize free-text program-ish strings into known Program tokens.
// Handles values like "RADAR / TOWER", "radar", "TOWER" etc.
export function parsePrograms(value: string | undefined | null): Program[] {
  if (!value) return []
  const upper = value.toUpperCase()
  const out: Program[] = []
  if (upper.includes("RADAR")) out.push("RADAR")
  if (upper.includes("TOWER")) out.push("TOWER")
  return out
}

// Core predicate: does an entity's program token satisfy the active view?
// ALL always passes. An entity with no resolvable program is treated as
// shared and shows in every view.
export function matchesProgram(entityProgram: string | undefined | null, view: ProgramView): boolean {
  if (view === "ALL") return true
  const progs = parsePrograms(entityProgram)
  if (progs.length === 0) return true // shared / unscoped -> visible everywhere
  return progs.includes(view)
}

export function staffInProgram(staff: Staff, view: ProgramView): boolean {
  if (view === "ALL") return true
  const progs = staff.programs ?? []
  if (progs.length === 0) return true // unassigned staff are shared
  return progs.includes(view)
}

export function assignmentInProgram(a: Assignment, view: ProgramView): boolean {
  return matchesProgram(a.appliesTo, view)
}

// A run inherits its program from the simulator it runs on.
export function runProgram(run: Run, simulatorById: (id: string) => Simulator | undefined): string | undefined {
  return simulatorById(run.simulatorId)?.program
}

export function runInProgram(
  run: Run,
  simulatorById: (id: string) => Simulator | undefined,
  view: ProgramView,
): boolean {
  return matchesProgram(runProgram(run, simulatorById), view)
}

// Training program: simulator's program if set, else the instructor's
// program(s). If neither resolves, treat as shared (visible everywhere).
export function trainingInProgram(
  session: TrainingSession,
  simulatorById: (id: string) => Simulator | undefined,
  staffById: (id: string) => Staff | undefined,
  view: ProgramView,
): boolean {
  if (view === "ALL") return true
  if (session.simulatorId) {
    const simProgram = simulatorById(session.simulatorId)?.program
    if (parsePrograms(simProgram).length > 0) return matchesProgram(simProgram, view)
  }
  const instructor = staffById(session.instructorId)
  if (instructor) return staffInProgram(instructor, view)
  return true
}

// ── Display helpers ─────────────────────────────────────────────────────
export function programBadgeClass(program: Program): string {
  return program === "RADAR"
    ? "bg-chart-1/15 text-chart-1 border-chart-1/30"
    : "bg-chart-2/15 text-chart-2 border-chart-2/30"
}

export function programLabel(view: ProgramView): string {
  return view === "ALL" ? "All Programs" : programDisplay(view)
}

// Re-exported for convenience so UI can render program tokens with their
// display labels (RADAR→Radar / TOWER→Tower).
export { programDisplay }
