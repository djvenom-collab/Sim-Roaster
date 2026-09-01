/* ===========================================================================
 * MANAGEMENT ANALYTICS — per-YEAR rollups for the Management Overview page
 * ===========================================================================
 * Upper management wants the whole picture of the operation, year by year, on
 * one page. These pure helpers turn the program-scoped store arrays into one
 * `YearMetrics` record per calendar year so the page can compare any two years
 * and chart every metric across the full retained window.
 *
 * PURE (no React, no store) so they are easy to reason about and test. Feed
 * them the store's `scoped*` selectors (program-scoped, archive-excluded) so
 * the figures follow the active Program slicer but span every live year rather
 * than the year slicer.
 *
 * CHANGEABLE PARAMETERS:
 *   - DELIVERED_STATUSES: which run statuses count as simulator time actually
 *     delivered (drives Sim hours + Runs delivered).
 *   - MANAGEMENT_METRICS: the metric catalogue (labels, units, and whether a
 *     rise is good or bad) shared by the KPI cards, trend chart and table.
 * =========================================================================== */
import type { Run, RunAssignment, LeaveRecord, TrainingSession, Exercise, RunStatus, Simulator } from "./types"
import { parseISO, addDays } from "./dates"
import { runHours } from "./analytics"
import { parsePrograms } from "./program"
import { monthLabel, enumerateMonths } from "./forecast"

/** The continuous list of "YYYY-MM" month keys covering every given year (Jan–Dec). */
export function monthKeysForYears(years: number[]): string[] {
  if (years.length === 0) return []
  const sorted = [...years].sort((a, b) => a - b)
  return enumerateMonths(`${sorted[0]}-01`, `${sorted[sorted.length - 1]}-12`)
}

// Run statuses that represent simulator time that was (or will be) delivered.
export const DELIVERED_STATUSES: RunStatus[] = ["confirmed", "completed"]

// ── Time granularity + period buckets ───────────────────────────────────────
// Both line charts can be viewed by YEAR (one point per year) or by MONTH (12
// points per year → e.g. 60 across a five-year slicer window), like the
// projections timeline. A "bucket" is one point on the x-axis: an inclusive
// [startISO, endISO] date range plus a stable key and a short display label.
export type TimeGranularity = "month" | "year"

export interface PeriodBucket {
  key: string // "2024" (year) or "2024-03" (month)
  label: string // "2024" or "Mar 24"
  startISO: string // inclusive range start (YYYY-MM-DD)
  endISO: string // inclusive range end (YYYY-MM-DD)
}

const endOfMonthISO = (monthKey: string) => {
  const [y, m] = monthKey.split("-").map(Number)
  const days = new Date(y, m, 0).getDate() // day 0 of next month = last day of this one
  return `${monthKey}-${String(days).padStart(2, "0")}`
}

/** Expand the slicer's year list into x-axis buckets at the requested granularity. */
export function buildBuckets(years: number[], granularity: TimeGranularity): PeriodBucket[] {
  const sorted = [...years].sort((a, b) => a - b)
  if (granularity === "year") {
    return sorted.map((y) => ({ key: String(y), label: String(y), startISO: `${y}-01-01`, endISO: `${y}-12-31` }))
  }
  return monthKeysForYears(sorted).map((k) => ({
    key: k,
    label: monthLabel(k),
    startISO: `${k}-01`,
    endISO: endOfMonthISO(k),
  }))
}

// The numeric operational metrics shared by every rollup, independent of whether
// the bucket is a year or a month.
export interface MetricValues {
  simHours: number // delivered simulator hours (confirmed + completed)
  runsDelivered: number // delivered run count
  runsTotal: number // every scheduled run, any status
  cancelled: number // cancelled runs
  cancelRate: number // cancelled / runsTotal (0..1)
  fillRate: number // filled position slots / total slots (0..1)
  training: number // training sessions held
  leaveDays: number // leave days taken (excl. rejected)
  staffRostered: number // distinct staff assigned to at least one run
}

export interface YearMetrics extends MetricValues {
  year: number
}

export interface BucketMetrics extends MetricValues {
  key: string
  label: string
}

/**
 * Roll every run/assignment/training/leave record falling inside the inclusive
 * [startISO, endISO] range into one MetricValues record. ISO date strings sort
 * lexicographically, so plain string comparison is a correct range test.
 * `runAssignments` is filtered to the supplied `runs` so program scoping carries
 * through from the scoped run list the caller passes in.
 */
export function rangeMetrics(
  startISO: string,
  endISO: string,
  runs: Run[],
  runAssignments: RunAssignment[],
  trainingSessions: TrainingSession[],
  leaveRecords: LeaveRecord[],
  exerciseById: (id: string) => Exercise | undefined,
): MetricValues {
  const inRange = (iso: string) => iso >= startISO && iso <= endISO
  const rangeRuns = runs.filter((r) => inRange(r.date))
  const runIds = new Set(rangeRuns.map((r) => r.id))
  const deliveredSet = new Set(DELIVERED_STATUSES)

  const delivered = rangeRuns.filter((r) => deliveredSet.has(r.status))
  const cancelled = rangeRuns.filter((r) => r.status === "cancelled").length
  const simHours = delivered.reduce((sum, r) => sum + runHours(r, exerciseById), 0)

  const rangeAssignments = runAssignments.filter((a) => runIds.has(a.runId))
  const filled = rangeAssignments.filter((a) => a.staffId).length
  const fillRate = rangeAssignments.length ? filled / rangeAssignments.length : 0
  const staffRostered = new Set(
    rangeAssignments.filter((a) => a.staffId).map((a) => a.staffId as string),
  ).size

  const training = trainingSessions.filter((t) => inRange(t.date)).length

  // Leave days taken, clamped to the range and excluding rejected requests.
  let leaveDays = 0
  for (const rec of leaveRecords) {
    if (rec.approval === "rejected") continue
    const start = rec.startDate < startISO ? startISO : rec.startDate
    const end = rec.endDate > endISO ? endISO : rec.endDate
    if (start > end) continue
    let cursor = parseISO(start)
    const last = parseISO(end)
    while (cursor <= last) {
      leaveDays += 1
      cursor = addDays(cursor, 1)
    }
  }

  const round1 = (n: number) => Math.round(n * 10) / 10
  return {
    simHours: round1(simHours),
    runsDelivered: delivered.length,
    runsTotal: rangeRuns.length,
    cancelled,
    cancelRate: rangeRuns.length ? cancelled / rangeRuns.length : 0,
    fillRate,
    training,
    leaveDays,
    staffRostered,
  }
}

/** Roll a single calendar `year` up into a YearMetrics record. */
export function yearMetrics(
  year: number,
  runs: Run[],
  runAssignments: RunAssignment[],
  trainingSessions: TrainingSession[],
  leaveRecords: LeaveRecord[],
  exerciseById: (id: string) => Exercise | undefined,
): YearMetrics {
  return {
    year,
    ...rangeMetrics(`${year}-01-01`, `${year}-12-31`, runs, runAssignments, trainingSessions, leaveRecords, exerciseById),
  }
}

/** Build one YearMetrics per year, in the order the `years` array is given. */
export function metricsForYears(
  years: number[],
  runs: Run[],
  runAssignments: RunAssignment[],
  trainingSessions: TrainingSession[],
  leaveRecords: LeaveRecord[],
  exerciseById: (id: string) => Exercise | undefined,
): YearMetrics[] {
  return years.map((y) => yearMetrics(y, runs, runAssignments, trainingSessions, leaveRecords, exerciseById))
}

/** Build one BucketMetrics per bucket (year or month) for the trend chart. */
export function metricsForBuckets(
  buckets: PeriodBucket[],
  runs: Run[],
  runAssignments: RunAssignment[],
  trainingSessions: TrainingSession[],
  leaveRecords: LeaveRecord[],
  exerciseById: (id: string) => Exercise | undefined,
): BucketMetrics[] {
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    ...rangeMetrics(b.startISO, b.endISO, runs, runAssignments, trainingSessions, leaveRecords, exerciseById),
  }))
}

// ── Per-program, per-status sim-hours utilization ───────────────────────────
// Simulator hours broken down by PROGRAM (RADAR / TOWER) and RUN STATUS for each
// year, so leadership can chart utilization with one line per program plus a
// combined overarching line — or collapse to a single program. The status
// dimension is kept so the chart can filter which run statuses count toward the
// hours (e.g. completed + confirmed only, or include cancelled/tentative).
//
// Hours are the exercise duration regardless of status, so "cancelled hours"
// means hours that were scheduled but fell through. A run inherits its program
// from its simulator; a run whose simulator maps to both programs splits its
// hours evenly, and a run with no resolvable program (shared) counts toward the
// COMBINED series only. Feed this the program-scoped run list; it filters by
// year internally and always keeps a COMBINED aggregate per year.
export const CHART_RUN_STATUSES: RunStatus[] = [
  "completed",
  "confirmed",
  "tentative",
  "postponed",
  "cancelled",
]

// Sentinel key for the combined-across-programs series.
export const COMBINED_PROGRAM = "ALL"

export interface ProgramStatusBucketHours {
  key: string // bucket key ("2024" or "2024-03")
  label: string // short x-axis label
  // byProgram[program | COMBINED_PROGRAM][status] = hours scheduled in that status
  byProgram: Record<string, Record<RunStatus, number>>
}

const emptyStatusRecord = (): Record<RunStatus, number> =>
  Object.fromEntries(CHART_RUN_STATUSES.map((s) => [s, 0])) as Record<RunStatus, number>

/**
 * Per-bucket (year OR month), per-program, per-status simulator hours. Feed the
 * program-scoped run list; buckets come from `buildBuckets` so the chart follows
 * the slicer window and the chosen granularity.
 */
export function simHoursByProgramForBuckets(
  buckets: PeriodBucket[],
  runs: Run[],
  simulatorById: (id: string) => Simulator | undefined,
  exerciseById: (id: string) => Exercise | undefined,
): ProgramStatusBucketHours[] {
  const trackedStatuses = new Set<RunStatus>(CHART_RUN_STATUSES)
  const round1 = (n: number) => Math.round(n * 10) / 10
  return buckets.map((b) => {
    const byProgram: Record<string, Record<RunStatus, number>> = { [COMBINED_PROGRAM]: emptyStatusRecord() }
    for (const r of runs) {
      if (r.date < b.startISO || r.date > b.endISO) continue
      if (!trackedStatuses.has(r.status)) continue
      const hours = runHours(r, exerciseById)
      byProgram[COMBINED_PROGRAM][r.status] += hours
      const progs = parsePrograms(simulatorById(r.simulatorId)?.program)
      if (progs.length === 0) continue // shared / unscoped → combined only
      const share = hours / progs.length // dual-program runs split evenly
      for (const p of progs) {
        if (!byProgram[p]) byProgram[p] = emptyStatusRecord()
        byProgram[p][r.status] += share
      }
    }
    for (const k of Object.keys(byProgram)) {
      for (const s of CHART_RUN_STATUSES) byProgram[k][s] = round1(byProgram[k][s])
    }
    return { key: b.key, label: b.label, byProgram }
  })
}

// ── Metric catalogue ───────────────────────────────────────────────────────
// A single source of truth for how each metric is labelled, formatted, and
// whether a higher value is good (green) or bad (red) — shared by the KPI
// cards, the trend chart selector and the comparison table.
export type MetricKey =
  | "simHours"
  | "runsDelivered"
  | "cancelRate"
  | "fillRate"
  | "training"
  | "leaveDays"
  | "staffRostered"

export interface MetricDef {
  key: MetricKey
  label: string
  short: string
  /** How to render a raw value as display text. */
  format: (v: number) => string
  /** true = higher is better (green up); false = higher is worse (red up). */
  higherIsBetter: boolean
  /** Pull the raw numeric value from any metric row (year or bucket). */
  get: (m: MetricValues) => number
}

const asInt = (v: number) => Math.round(v).toLocaleString()
const asHours = (v: number) => `${Math.round(v).toLocaleString()} h`
const asPct = (v: number) => `${Math.round(v * 100)}%`

export const MANAGEMENT_METRICS: MetricDef[] = [
  { key: "simHours", label: "Sim hours delivered", short: "Sim hours", format: asHours, higherIsBetter: true, get: (m) => m.simHours },
  { key: "runsDelivered", label: "Runs delivered", short: "Runs", format: asInt, higherIsBetter: true, get: (m) => m.runsDelivered },
  { key: "fillRate", label: "Position fill rate", short: "Fill rate", format: asPct, higherIsBetter: true, get: (m) => m.fillRate },
  { key: "cancelRate", label: "Cancellation rate", short: "Cancel rate", format: asPct, higherIsBetter: false, get: (m) => m.cancelRate },
  { key: "training", label: "Training sessions", short: "Training", format: asInt, higherIsBetter: true, get: (m) => m.training },
  { key: "leaveDays", label: "Leave days taken", short: "Leave days", format: asInt, higherIsBetter: false, get: (m) => m.leaveDays },
  { key: "staffRostered", label: "Staff rostered", short: "Staff", format: asInt, higherIsBetter: true, get: (m) => m.staffRostered },
]

/**
 * Percentage change from `from` to `to`. Returns null when there is no sensible
 * baseline (from is 0), so callers can show an em-dash instead of Infinity.
 */
export function pctChange(from: number, to: number): number | null {
  if (from === 0) return to === 0 ? 0 : null
  return ((to - from) / Math.abs(from)) * 100
}
