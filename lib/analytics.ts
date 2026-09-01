/* ===========================================================================
 * ANALYTICS — pure helpers that turn raw store data into chart-ready rows
 * ===========================================================================
 * These functions take the flat arrays from the store (runs, leave, training,
 * simulators) and roll them up into the little `{ month, seriesA, seriesB }`
 * shapes that the chart components feed straight into Recharts.
 *
 * They are PURE (no React, no store) so they are easy to reason about and test.
 * Everything is bucketed by calendar month for a single chosen `year`.
 *
 * CHANGEABLE PARAMETERS:
 *   - USED_STATUSES: which run statuses count as "simulator time actually used"
 *     on the utilisation line chart. The status breakdown table always shows
 *     every status regardless of this list.
 *   - MONTHS / STATUS_ORDER: display order only.
 * =========================================================================== */
import type { Run, Simulator, Exercise, LeaveRecord, TrainingSession, Staff, RunStatus } from "./types"
import { parseISO, addDays } from "./dates"
import { PROGRAMS, parsePrograms, type Program } from "./program"

// Short month labels, Jan..Dec, used as the X axis of every trend chart.
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const

// Run statuses that represent simulator time that was (or will be) actually
// used — this drives the utilisation line chart. Cancelled/postponed/tentative
// time is excluded here but still shown in the status breakdown table.
export const USED_STATUSES: RunStatus[] = ["confirmed", "completed"]

// Every status, in the order we present them in the breakdown table.
export const STATUS_ORDER: RunStatus[] = ["confirmed", "completed", "tentative", "postponed", "cancelled"]

// ── Small shared helpers ─────────────────────────────────────────────────

const yearOf = (iso: string) => Number(iso.slice(0, 4))
const monthOf = (iso: string) => Number(iso.slice(5, 7)) - 1 // 0-based

// Convert a run into the number of hours it occupies (from its exercise).
export function runHours(run: Run, exerciseById: (id: string) => Exercise | undefined): number {
  const mins = exerciseById(run.exerciseId)?.durationMin ?? 0
  return mins / 60
}

// The list of years that appear in a set of ISO date strings, newest first.
// The current year is always included so the selector is never empty.
export function availableYears(dates: string[]): number[] {
  const set = new Set<number>()
  for (const d of dates) if (d) set.add(yearOf(d))
  set.add(new Date().getFullYear())
  return [...set].sort((a, b) => b - a)
}

// Pick a sensible default year: the current year if it has data, else the most
// recent year that does.
export function defaultYear(years: number[]): number {
  const now = new Date().getFullYear()
  return years.includes(now) ? now : (years[0] ?? now)
}

// Empty 12-row scaffold keyed by month, so months with no data still render.
function monthScaffold<T extends Record<string, number>>(seed: () => T) {
  return MONTHS.map((month) => ({ month, ...seed() }))
}

// ── Year-to-date helpers ───────────────────────────────────────────────────

// How many months to include for a "year-to-date" figure in a given year:
//   - past year   -> all 12 months (the whole year is "to date")
//   - current year-> January through the current month (inclusive)
//   - future year -> none yet
export function ytdMonthCount(year: number, now: Date = new Date()): number {
  if (year < now.getFullYear()) return 12
  if (year > now.getFullYear()) return 0
  return now.getMonth() + 1
}

// Sum the first `ytdMonthCount(year)` monthly rows using the `value` accessor.
// Rounded to 1 dp so hour figures stay tidy.
export function ytdSum<T>(rows: T[], year: number, value: (row: T) => number): number {
  const n = ytdMonthCount(year)
  let sum = 0
  for (let i = 0; i < n && i < rows.length; i++) sum += value(rows[i])
  return Math.round(sum * 10) / 10
}

// A chart's active time range: a specific calendar year, or year-to-date (which
// is always anchored to the current calendar year). Drives every chart filter.
export interface ChartRange {
  year: number
  ytd: boolean
}

// Trim 12 month-rows down to the year-to-date window when `range.ytd` is set,
// leaving full-year data otherwise.
export function applyRange<T>(rows: T[], range: ChartRange): T[] {
  return range.ytd ? rows.slice(0, ytdMonthCount(range.year)) : rows
}

// True when a run's date falls inside the range (right year, and — for YTD —
// on or before the current month).
export function runInRange(dateISO: string, range: ChartRange): boolean {
  if (yearOf(dateISO) !== range.year) return false
  if (range.ytd && monthOf(dateISO) >= ytdMonthCount(range.year)) return false
  return true
}

// ── Leave taken per month, split by program ───────────────────────────────
export interface LeaveTrendRow {
  month: string
  RADAR: number
  TOWER: number
}

// Counts leave DAYS taken in each month of `year`, attributing each day to the
// program(s) the person belongs to (staff in both count on both lines).
// Rejected leave is ignored. Days are split accurately across month boundaries.
export function leaveTrendByMonth(
  records: LeaveRecord[],
  staffById: (id: string | null) => Staff | undefined,
  year: number,
): LeaveTrendRow[] {
  const rows = monthScaffold<{ RADAR: number; TOWER: number }>(() => ({ RADAR: 0, TOWER: 0 })) as LeaveTrendRow[]
  const jan1 = `${year}-01-01`
  const dec31 = `${year}-12-31`

  for (const rec of records) {
    if (rec.approval === "rejected") continue
    // Clamp the leave span to the selected year.
    const start = rec.startDate < jan1 ? jan1 : rec.startDate
    const end = rec.endDate > dec31 ? dec31 : rec.endDate
    if (start > end) continue

    const staff = staffById(rec.staffId)
    const progs = (staff?.programs ?? []).filter((p): p is Program => PROGRAMS.includes(p as Program))
    const targets: Program[] = progs.length ? progs : PROGRAMS // unassigned -> both

    let cursor = parseISO(start)
    const last = parseISO(end)
    // Iterate day by day so multi-month leave lands in the right buckets.
    while (cursor <= last) {
      const m = cursor.getMonth()
      for (const p of targets) rows[m][p] += 1
      cursor = addDays(cursor, 1)
    }
  }
  return rows
}

// ── Leave taken per month, split by leave TYPE ─────────────────────────────
// The canonical leave types, in display order. Mirrors LEAVE_TYPES in the
// leave page / LeaveType union in lib/types.ts.
export const LEAVE_TYPE_ORDER = ["Annual", "Sick", "Training", "Course", "Compassionate", "Other"] as const
export type LeaveTypeName = (typeof LEAVE_TYPE_ORDER)[number]

export interface LeaveTypeTotal {
  type: LeaveTypeName
  days: number
}

// Total leave DAYS taken per leave type within `range` (a full year or YTD).
// Rejected leave is ignored; multi-day spans are counted per day and clamped to
// the selected year (and to the YTD window when range.ytd is set).
export function leaveDaysByType(records: LeaveRecord[], range: ChartRange): LeaveTypeTotal[] {
  const totals = new Map<LeaveTypeName, number>(LEAVE_TYPE_ORDER.map((t) => [t, 0]))
  const jan1 = `${range.year}-01-01`
  const dec31 = `${range.year}-12-31`
  const ytdMonths = ytdMonthCount(range.year)

  for (const rec of records) {
    if (rec.approval === "rejected") continue
    const start = rec.startDate < jan1 ? jan1 : rec.startDate
    const end = rec.endDate > dec31 ? dec31 : rec.endDate
    if (start > end) continue
    const type: LeaveTypeName = LEAVE_TYPE_ORDER.includes(rec.type as LeaveTypeName)
      ? (rec.type as LeaveTypeName)
      : "Other"
    let cursor = parseISO(start)
    const last = parseISO(end)
    while (cursor <= last) {
      if (!range.ytd || cursor.getMonth() < ytdMonths) {
        totals.set(type, (totals.get(type) ?? 0) + 1)
      }
      cursor = addDays(cursor, 1)
    }
  }
  return LEAVE_TYPE_ORDER.map((type) => ({ type, days: totals.get(type) ?? 0 }))
}

// Per-month leave DAYS for every leave type across `year`, for a multi-line
// trend chart. Each row is { month, Annual, Sick, ... }. Trim to YTD via
// applyRange afterwards if needed.
export type LeaveTypeTrendRow = { month: string } & Record<LeaveTypeName, number>

export function leaveTypeTrendByMonth(records: LeaveRecord[], year: number): LeaveTypeTrendRow[] {
  const rows = monthScaffold<Record<LeaveTypeName, number>>(() => ({
    Annual: 0,
    Sick: 0,
    Training: 0,
    Course: 0,
    Compassionate: 0,
    Other: 0,
  })) as LeaveTypeTrendRow[]
  const jan1 = `${year}-01-01`
  const dec31 = `${year}-12-31`

  for (const rec of records) {
    if (rec.approval === "rejected") continue
    const start = rec.startDate < jan1 ? jan1 : rec.startDate
    const end = rec.endDate > dec31 ? dec31 : rec.endDate
    if (start > end) continue
    const type: LeaveTypeName = LEAVE_TYPE_ORDER.includes(rec.type as LeaveTypeName)
      ? (rec.type as LeaveTypeName)
      : "Other"
    let cursor = parseISO(start)
    const last = parseISO(end)
    while (cursor <= last) {
      rows[cursor.getMonth()][type] += 1
      cursor = addDays(cursor, 1)
    }
  }
  return rows
}

// ── Simulator utilisation per month (one line per simulator) ───────────────
export interface SimSeries {
  id: string
  code: string
  name: string
}
export interface SimHoursTrend {
  rows: Record<string, number | string>[] // { month, [simId]: hours }
  sims: SimSeries[]
}

// Hours used per simulator per month for one program. Rows are keyed by
// simulator id (CSS-safe for chart color variables); `sims` carries the code &
// name for labels, one entry per line the chart should draw.
export function simHoursTrendByMonth(
  runs: Run[],
  simulators: Simulator[],
  exerciseById: (id: string) => Exercise | undefined,
  program: Program,
  year: number,
  statuses: RunStatus[] = USED_STATUSES,
): SimHoursTrend {
  const sims = simulators
    .filter((s) => parsePrograms(s.program).includes(program))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code))
    .map((s) => ({ id: s.id, code: s.code, name: s.name }))

  const ids = new Set(sims.map((s) => s.id))
  const statusSet = new Set(statuses)

  const rows = monthScaffold(() => {
    const seed: Record<string, number> = {}
    for (const s of sims) seed[s.id] = 0
    return seed
  }) as Record<string, number | string>[]

  for (const run of runs) {
    if (!statusSet.has(run.status)) continue
    if (yearOf(run.date) !== year) continue
    if (!ids.has(run.simulatorId)) continue // simulator not in this program
    const m = monthOf(run.date)
    ;(rows[m][run.simulatorId] as number) += runHours(run, exerciseById)
  }

  // Round to 1 dp for tidy tooltips.
  for (const row of rows) {
    for (const s of sims) row[s.id] = Math.round((row[s.id] as number) * 10) / 10
  }
  return { rows, sims }
}

// ── Simulator hours by status (breakdown table) ────────────────────────────
export interface SimStatusHours {
  sim: SimSeries
  confirmed: number
  completed: number
  tentative: number
  postponed: number
  cancelled: number
  total: number
}

// Total hours per simulator broken down by every run status, for one program
// and range (a full year, or year-to-date). Powers both the calculation table
// and the status bar charts on the SIM Hours Utilization page.
export function simHoursByStatus(
  runs: Run[],
  simulators: Simulator[],
  exerciseById: (id: string) => Exercise | undefined,
  program: Program,
  range: ChartRange,
): SimStatusHours[] {
  const sims = simulators
    .filter((s) => parsePrograms(s.program).includes(program))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code))

  const byId = new Map<string, SimStatusHours>(
    sims.map((s) => [
      s.id,
      { sim: { id: s.id, code: s.code, name: s.name }, confirmed: 0, completed: 0, tentative: 0, postponed: 0, cancelled: 0, total: 0 },
    ]),
  )

  for (const run of runs) {
    if (!runInRange(run.date, range)) continue
    const entry = byId.get(run.simulatorId)
    if (!entry) continue
    const h = runHours(run, exerciseById)
    entry[run.status] += h
    entry.total += h
  }

  // Round every figure to 1 dp.
  const round = (n: number) => Math.round(n * 10) / 10
  return [...byId.values()].map((e) => ({
    ...e,
    confirmed: round(e.confirmed),
    completed: round(e.completed),
    tentative: round(e.tentative),
    postponed: round(e.postponed),
    cancelled: round(e.cancelled),
    total: round(e.total),
  }))
}

// ── Simulator hours by status, per month (line chart) ──────────────────────
export interface SimStatusMonthRow {
  month: string
  confirmed: number
  completed: number
  tentative: number
  postponed: number
  cancelled: number
}

// Hours per run status for every month of `year`, summed across all simulators
// of one program. Powers the month-by-month status line chart. Cut to the YTD
// window afterwards via applyRange if needed.
export function simStatusHoursByMonth(
  runs: Run[],
  simulators: Simulator[],
  exerciseById: (id: string) => Exercise | undefined,
  program: Program,
  year: number,
): SimStatusMonthRow[] {
  const ids = new Set(
    simulators.filter((s) => parsePrograms(s.program).includes(program)).map((s) => s.id),
  )
  const rows = monthScaffold<{ confirmed: number; completed: number; tentative: number; postponed: number; cancelled: number }>(
    () => ({ confirmed: 0, completed: 0, tentative: 0, postponed: 0, cancelled: 0 }),
  ) as SimStatusMonthRow[]

  for (const run of runs) {
    if (yearOf(run.date) !== year) continue
    if (!ids.has(run.simulatorId)) continue
    rows[monthOf(run.date)][run.status] += runHours(run, exerciseById)
  }

  for (const row of rows) {
    row.confirmed = Math.round(row.confirmed * 10) / 10
    row.completed = Math.round(row.completed * 10) / 10
    row.tentative = Math.round(row.tentative * 10) / 10
    row.postponed = Math.round(row.postponed * 10) / 10
    row.cancelled = Math.round(row.cancelled * 10) / 10
  }
  return rows
}

// ── Training sessions per month, split by program ─────────────────────────
export interface TrainingTrendRow {
  month: string
  RADAR: number
  TOWER: number
}

// Resolve which program(s) a training session belongs to: its simulator's
// program if set, else the instructor's program(s); unresolved -> both.
export function trainingPrograms(
  session: TrainingSession,
  simulatorById: (id: string) => Simulator | undefined,
  staffById: (id: string | null) => Staff | undefined,
): Program[] {
  if (session.simulatorId) {
    const p = parsePrograms(simulatorById(session.simulatorId)?.program)
    if (p.length) return p
  }
  const instr = staffById(session.instructorId)
  const p = (instr?.programs ?? []).filter((x): x is Program => PROGRAMS.includes(x as Program))
  return p.length ? p : PROGRAMS
}

// Count training sessions per month of `year`, split onto RADAR / TOWER lines.
export function trainingTrendByMonth(
  sessions: TrainingSession[],
  simulatorById: (id: string) => Simulator | undefined,
  staffById: (id: string | null) => Staff | undefined,
  year: number,
): TrainingTrendRow[] {
  const rows = monthScaffold<{ RADAR: number; TOWER: number }>(() => ({ RADAR: 0, TOWER: 0 })) as TrainingTrendRow[]
  for (const session of sessions) {
    if (yearOf(session.date) !== year) continue
    const m = monthOf(session.date)
    for (const p of trainingPrograms(session, simulatorById, staffById)) rows[m][p] += 1
  }
  return rows
}

// ── Per-person activity per month (one staff member across a year) ─────────
export interface PersonActivityRow {
  month: string
  runs: number // exercise runs the person was assigned to
  training: number // training sessions attended
  leave: number // leave days taken
  tasks: number // other tasks / duties
}

// Minimal shapes this needs from the store — kept loose so callers can pass the
// raw arrays directly.
interface PersonActivityInput {
  staffId: string
  runAssignments: { runId: string; staffId: string | null }[]
  runs: Run[]
  trainingAttendance: { sessionId: string; staffId: string }[]
  trainingSessions: TrainingSession[]
  leaveRecords: LeaveRecord[]
  otherTasks: { staffIds: string[]; startDate: string }[]
  year: number
}

// Roll a single person's year up into a per-month activity breakdown: runs
// they were rostered on, training sessions attended, leave days taken (split
// across month boundaries, excluding rejected leave) and other duties.
export function personActivityByMonth(input: PersonActivityInput): PersonActivityRow[] {
  const { staffId, runAssignments, runs, trainingAttendance, trainingSessions, leaveRecords, otherTasks, year } = input
  const rows = monthScaffold<{ runs: number; training: number; leave: number; tasks: number }>(() => ({
    runs: 0,
    training: 0,
    leave: 0,
    tasks: 0,
  })) as PersonActivityRow[]

  // Runs the person was assigned to.
  const runById = new Map(runs.map((r) => [r.id, r]))
  for (const a of runAssignments) {
    if (a.staffId !== staffId) continue
    const run = runById.get(a.runId)
    if (!run || yearOf(run.date) !== year) continue
    rows[monthOf(run.date)].runs += 1
  }

  // Training sessions attended.
  const sessionById = new Map(trainingSessions.map((t) => [t.id, t]))
  for (const t of trainingAttendance) {
    if (t.staffId !== staffId) continue
    const session = sessionById.get(t.sessionId)
    if (!session || yearOf(session.date) !== year) continue
    rows[monthOf(session.date)].training += 1
  }

  // Leave days, split across months and clamped to the selected year.
  const jan1 = `${year}-01-01`
  const dec31 = `${year}-12-31`
  for (const rec of leaveRecords) {
    if (rec.staffId !== staffId || rec.approval === "rejected") continue
    const start = rec.startDate < jan1 ? jan1 : rec.startDate
    const end = rec.endDate > dec31 ? dec31 : rec.endDate
    if (start > end) continue
    let cursor = parseISO(start)
    const last = parseISO(end)
    while (cursor <= last) {
      rows[cursor.getMonth()].leave += 1
      cursor = addDays(cursor, 1)
    }
  }

  // Other tasks / duties (attributed to their start month).
  for (const task of otherTasks) {
    if (!task.staffIds.includes(staffId) || yearOf(task.startDate) !== year) continue
    rows[monthOf(task.startDate)].tasks += 1
  }

  return rows
}
