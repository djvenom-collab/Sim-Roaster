/* ===========================================================================
 * PERSISTED STATE — the shape of the single JSON snapshot saved to Vercel Blob
 * ===========================================================================
 * This is the complete set of editable data the app retains across reloads and
 * rebuilds. The store collects these slices into one object, saves it to Blob
 * (via /api/state), and re-applies it on the next load. Anything NOT listed
 * here is either static seed reference data (roles, positionQualRules) or a
 * per-viewer UI preference (active program / role) kept in localStorage.
 *
 * SEED-ONCE SEMANTICS: the seed only populates a brand-new store. Once a
 * snapshot exists, the saved data always wins. New slices added in a later
 * version fall back to the seed for that slice only (see mergeWithSeed in the
 * store), so adding fields never wipes existing data.
 * =========================================================================== */
import type {
  Assignment,
  AuditLog,
  Course,
  Exercise,
  LeaveRecord,
  OtherTask,
  Position,
  PublicHoliday,
  Qualification,
  RoleCode,
  Run,
  RunAssignment,
  NotificationRecord,
  Simulator,
  SlotTime,
  Staff,
  StaffQualification,
  StaffValidity,
  TrainingAttendance,
  TrainingLogEntry,
  TrainingSession,
  User,
  FaultLog,
  OperatorLog,
  FirewallLog,
  AdminLog,
} from "./types"
import type { TrainingGroup } from "./training-groups"
import type * as seed from "./sample-data"
import {
  historicalSeed,
  runs as seedRuns,
  runAssignments as seedRunAssignments,
  leaveRecords as seedLeaveRecords,
  otherTasks as seedOtherTasks,
  trainingSessions as seedTrainingSessions,
  trainingAttendance as seedTrainingAttendance,
  staffValidity as seedStaffValidity,
  exercises as seedExercises,
  courses as seedCourses,
  courseSimClass as seedCourseSimClass,
  exerciseQualRules as seedExerciseQualRules,
  publicHolidays as seedPublicHolidays,
  auditLogs as seedAuditLogs,
  importHistory as seedImportHistory,
  notifications as seedNotifications,
  trainingLogs as seedTrainingLogs,
  staffQualifications as seedStaffQualifications,
} from "./sample-data"
import type { Permission } from "./permissions"

// Bump only for breaking transforms that need real migration logic. Adding a
// new optional slice does NOT require a bump — mergeWithSeed handles gaps.
//
// v2: re-seed the generated demo schedule (runs/assignments/leave/tasks/
//     training/currency) so the seasonal volume curve and the reduced
//     conflict / currency-warning counts take effect over pre-v2 snapshots.
// v3: full re-seed. Replaces the generated schedule AND the structural
//     exercises / courses / courseSimClass / exercise qual rules so the new
//     QUARTERLY intensity model, the validation-vs-normal course split, and the
//     filled-out exercise-sheet SIM buckets take effect over pre-v3 snapshots.
// v4: re-seed again so (a) COURSES now span every retained year — the Yearly
//     Gantt is populated under past years, not just the current year — and
//     (b) TRAINING SESSIONS now include future/scheduled dates through year-end,
//     so the dashboard's "Upcoming Training" panel is populated.
// v5: full-coverage completeness pass — LEAVE and OTHER TASKS now extend into
//     the future (planning through 31 Dec), and the PUBLIC HOLIDAYS, AUDIT LOGS,
//     IMPORT HISTORY and NOTIFICATIONS tables are populated across every retained
//     year (previously single-year or empty). These are added to the reseed so a
//     version bump replaces the old thin data.
// v6: soften the leave lean-period bias so leave spreads across the WHOLE year
//     (incl. the second half) — a stronger bias clustered every current-year
//     spell into Q1, leaving the "Upcoming Leave" panel almost empty.
// v7: add the SOO (Simulator Operational Officer, Level 3) and STO (Simulator
//     Training Officer, Level 4) access roles between Supervisor and Team Lead,
//     both starting from the Supervisor permission baseline, plus a couple of
//     seeded users for each. The migration merges in the missing seeded users so
//     the new roles appear without clobbering existing user edits.
// v8: OJTI training-log completeness pass — every instructor now holds the OJTI
//     qualification and every non-OJTI trainee has accumulated hours on EVERY
//     position group of their program. The migration replaces the saved
//     TRAINING LOGS and STAFF QUALIFICATIONS with the corrected seed so pre-v8
//     snapshots (sparse logs, unqualified instructors) pick up the full data.
// v9: re-trigger the v8 training-log/qualifications reseed. The v8 bump landed a
//     snapshot before the reworked sample-data generator had finished compiling,
//     so it persisted the old sparse logs under v8. Bumping again re-runs the
//     same reseed against the now-stable seed module.
export const SNAPSHOT_VERSION = 9

export interface PersistedState {
  version: number
  staff: Staff[]
  positions: Position[]
  simulators: Simulator[]
  exercises: Exercise[]
  courses: Course[]
  courseSimClass: Record<string, "operational" | "non-operational">
  exerciseQualRules: typeof seed.exerciseQualRules
  qualifications: Qualification[]
  assignments: Assignment[]
  staffQualifications: StaffQualification[]
  users: User[]
  slotTimes: SlotTime[]
  publicHolidays: PublicHoliday[]
  // Editable OJTI position groups (Group 1..4 per program). A new optional slice
  // as of the DIM Training Groups feature: older snapshots simply lack it and
  // fall back to the seed, so no version bump is required.
  trainingGroups: TrainingGroup[]
  permissionMatrix: Record<RoleCode, Permission[]>
  runs: Run[]
  runAssignments: RunAssignment[]
  leaveRecords: LeaveRecord[]
  otherTasks: OtherTask[]
  trainingSessions: TrainingSession[]
  trainingAttendance: TrainingAttendance[]
  trainingLogs: TrainingLogEntry[]
  staffValidity: StaffValidity[]
  auditLogs: AuditLog[]
  importHistory: typeof seed.importHistory
  notifications: NotificationRecord[]
  notifyDirty: Record<string, { changedAt: string; notifiedAt?: string }>
  faultLogs: FaultLog[]
  operatorLogs: OperatorLog[]
  firewallLogs: FirewallLog[]
  adminLogs: AdminLog[]
}

// Keys that make up the data payload (everything except `version`).
export type PersistedKey = Exclude<keyof PersistedState, "version">

export interface ExerciseDedupeResult {
  exercises: Exercise[]
  courses: Course[]
  runs: Run[]
  exerciseQualRules: PersistedState["exerciseQualRules"]
  changed: boolean
}

/**
 * Every exercise name must be unique. Older snapshots (and older seeds) contain
 * several exercises that share a name because the DIM source repeated the same
 * code across simulators/headcounts. This collapses same-named exercises into a
 * single survivor (the first occurrence) and remaps every reference — course
 * `exerciseIds`, run `exerciseId`, and exercise qual rules — to that survivor.
 *
 * Idempotent: if names are already unique it returns the inputs unchanged, so it
 * is safe to run on every load.
 */
export function dedupeExercises(
  exercises: Exercise[],
  courses: Course[],
  runs: Run[],
  exerciseQualRules: PersistedState["exerciseQualRules"],
): ExerciseDedupeResult {
  const survivorByName = new Map<string, string>() // nameKey -> survivor exercise id
  const remap = new Map<string, string>() // any old id -> survivor id
  const keptExercises: Exercise[] = []

  for (const ex of exercises) {
    const key = ex.name.trim().toLowerCase()
    const survivorId = survivorByName.get(key)
    if (survivorId) {
      remap.set(ex.id, survivorId)
    } else {
      survivorByName.set(key, ex.id)
      remap.set(ex.id, ex.id)
      keptExercises.push(ex)
    }
  }

  const changed = keptExercises.length !== exercises.length
  if (!changed) {
    return { exercises, courses, runs, exerciseQualRules, changed: false }
  }

  const map = (id: string) => remap.get(id) ?? id

  const nextCourses = courses.map((c) => ({
    ...c,
    exerciseIds: Array.from(new Set((c.exerciseIds ?? []).map(map))),
  }))

  const nextRuns = runs.map((r) => (remap.get(r.exerciseId) ? { ...r, exerciseId: map(r.exerciseId) } : r))

  // Remap rule targets, then drop rules that now point at the same exercise
  // (keep the first) so a collapsed pair doesn't leave duplicate rules.
  const seenRuleTarget = new Set<string>()
  const nextRules = exerciseQualRules
    .map((rule) => ({ ...rule, exerciseId: map(rule.exerciseId) }))
    .filter((rule) => {
      if (seenRuleTarget.has(rule.exerciseId)) return false
      seenRuleTarget.add(rule.exerciseId)
      return true
    })

  return {
    exercises: keptExercises,
    courses: nextCourses,
    runs: nextRuns,
    exerciseQualRules: nextRules,
    changed: true,
  }
}

export interface HistoryBackfillResult {
  runs: Run[]
  runAssignments: RunAssignment[]
  leaveRecords: LeaveRecord[]
  trainingSessions: TrainingSession[]
  trainingAttendance: TrainingAttendance[]
  otherTasks: OtherTask[]
  changed: boolean
}

/**
 * Injects the multi-year history (see `historicalSeed` in lib/sample-data) into a
 * snapshot that only holds current-year data. Historical records use a distinct
 * year-infixed id namespace (`run-2023-…`) so they never collide with the saved
 * current-year records (`run-…`), and appending is matched by id — so this is
 * fully idempotent and safe to run on every load. Current-year edits are never
 * touched: we only ADD missing historical rows.
 */
export function backfillHistory(
  runs: Run[],
  runAssignments: RunAssignment[],
  leaveRecords: LeaveRecord[],
  trainingSessions: TrainingSession[],
  trainingAttendance: TrainingAttendance[],
  otherTasks: OtherTask[],
): HistoryBackfillResult {
  // Append only the historical rows whose id isn't already present.
  const mergeById = <T extends { id: string }>(existing: T[], additions: T[]): [T[], number] => {
    const have = new Set(existing.map((r) => r.id))
    const missing = additions.filter((r) => !have.has(r.id))
    return missing.length ? [[...existing, ...missing], missing.length] : [existing, 0]
  }

  const [nextRuns, addedRuns] = mergeById(runs, historicalSeed.runs)
  const [nextRunAssignments] = mergeById(runAssignments, historicalSeed.runAssignments)
  const [nextLeave] = mergeById(leaveRecords, historicalSeed.leaveRecords)
  const [nextTraining] = mergeById(trainingSessions, historicalSeed.trainingSessions)
  const [nextAttendance] = mergeById(trainingAttendance, historicalSeed.trainingAttendance)
  const [nextTasks] = mergeById(otherTasks, historicalSeed.otherTasks)

  // If no runs were added, the history is already present — treat as unchanged
  // (runs are the anchor; the other slices track them one-to-one).
  const changed = addedRuns > 0
  if (!changed) {
    return {
      runs,
      runAssignments,
      leaveRecords,
      trainingSessions,
      trainingAttendance,
      otherTasks,
      changed: false,
    }
  }

  return {
    runs: nextRuns,
    runAssignments: nextRunAssignments,
    leaveRecords: nextLeave,
    trainingSessions: nextTraining,
    trainingAttendance: nextAttendance,
    otherTasks: nextTasks,
    changed: true,
  }
}

export interface ScheduleReseed {
  runs: Run[]
  runAssignments: RunAssignment[]
  leaveRecords: LeaveRecord[]
  otherTasks: OtherTask[]
  trainingSessions: TrainingSession[]
  trainingAttendance: TrainingAttendance[]
  staffValidity: StaffValidity[]
  // Structural slices reworked in v3 (see SNAPSHOT_VERSION notes): the
  // quarterly intensity model reshaped the schedule, and the course rework split
  // validation courses out from normal ones and pre-assigned every course to a
  // SIM bucket, so these must be replaced alongside the schedule.
  exercises: Exercise[]
  courses: Course[]
  courseSimClass: Record<string, "operational" | "non-operational">
  exerciseQualRules: PersistedState["exerciseQualRules"]
  // v5 completeness pass: multi-year reference/log tables that previously only
  // held current-year (or zero) rows, so they get replaced on the version bump.
  publicHolidays: PublicHoliday[]
  auditLogs: AuditLog[]
  importHistory: PersistedState["importHistory"]
  notifications: NotificationRecord[]
  // v8 OJTI completeness pass: the training log was reworked to give full group
  // coverage per trainee, and staff qualifications were backfilled so every
  // instructor holds the OJTI qual. Both are replaced on the version bump.
  trainingLogs: PersistedState["trainingLogs"]
  staffQualifications: PersistedState["staffQualifications"]
}

/**
 * Returns fresh copies of the fully-generated demo slices used by the migration
 * to REPLACE saved data when an older snapshot is loaded.
 *
 * - v2 used this to replace only the generated SCHEDULE (runs, assignments,
 *   leave, other tasks, training, currency) so the seasonal volume curve and the
 *   reduced conflict / currency-warning counts took effect.
 * - v3 additionally replaces the STRUCTURAL slices (exercises, courses,
 *   courseSimClass, exercise qual rules) so the quarterly intensity rework, the
 *   validation-vs-normal course split, and the filled-out exercise-sheet SIM
 *   buckets take effect over pre-v3 data.
 *
 * The generated seed already spans every retained year (current + history), so
 * no separate history-backfill is needed after a re-seed. Remaining user-
 * editable slices (staff, positions, simulators, quals, users, permissions,
 * holidays, slot times) are deliberately NOT touched.
 */
export function reseedGeneratedSchedule(): ScheduleReseed {
  return {
    runs: [...seedRuns],
    runAssignments: [...seedRunAssignments],
    leaveRecords: [...seedLeaveRecords],
    otherTasks: [...seedOtherTasks],
    trainingSessions: [...seedTrainingSessions],
    trainingAttendance: [...seedTrainingAttendance],
    staffValidity: [...seedStaffValidity],
    exercises: [...seedExercises],
    courses: [...seedCourses],
    courseSimClass: { ...seedCourseSimClass },
    exerciseQualRules: [...seedExerciseQualRules],
    publicHolidays: [...seedPublicHolidays],
    auditLogs: [...seedAuditLogs],
    importHistory: [...seedImportHistory],
    notifications: [...seedNotifications],
    trainingLogs: [...seedTrainingLogs],
    staffQualifications: [...seedStaffQualifications],
  }
}
