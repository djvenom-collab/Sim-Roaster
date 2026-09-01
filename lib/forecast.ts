/* ===========================================================================
 * FORECAST — client-side linear-trend projection for the Projections page
 * ===========================================================================
 * Turns monthly history into a 12-month look-ahead using ordinary least-squares
 * linear regression, plus a prediction interval (confidence band) derived from
 * the residual standard error. Everything here is PURE (no React, no store) so
 * it is easy to reason about and test.
 *
 * The model is deliberately simple and explainable — a straight-line trend, not
 * a black box. It is well suited to the modest, seasonal-but-steady operational
 * series this app tracks (sim hours, runs, leave, training).
 *
 * CHANGEABLE PARAMETERS:
 *   - DEFAULT_HORIZON: how many months to project forward.
 *   - Z_SCORE: width of the confidence band (1.96 ≈ 95%).
 * =========================================================================== */
import type { Run, Exercise, LeaveRecord, TrainingSession } from "./types"
import { parseISO, addDays } from "./dates"
import { USED_STATUSES } from "./analytics"
import type { RunStatus } from "./types"

export const DEFAULT_HORIZON = 12
// 1.96 ≈ 95% prediction interval; 1.64 ≈ 90%. Widen/narrow the band here.
const Z_SCORE = 1.96

// A single point on a continuous monthly axis. `key` is "YYYY-MM".
export interface MonthPoint {
  key: string
  value: number
}

// ── Month-axis helpers ─────────────────────────────────────────────────────

const monthKey = (iso: string) => iso.slice(0, 7) // "2024-03-01" -> "2024-03"

/** A short, human label for a "YYYY-MM" key, e.g. "Mar 24". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number)
  const short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] ?? ""
  return `${short} ${String(y).slice(2)}`
}

/** Add `n` months to a "YYYY-MM" key, returning a new key. */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

/** Inclusive list of month keys from `start` to `end` ("YYYY-MM"). */
export function enumerateMonths(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  // Guard against pathological inputs — cap at 10 years of months.
  for (let i = 0; i < 120 && cur <= end; i++) {
    out.push(cur)
    cur = addMonths(cur, 1)
  }
  return out
}

/**
 * Turn a bag of dated amounts into a CONTINUOUS monthly series (zero-filled
 * gaps) spanning the first through the last month that has data. Returns [] when
 * there is nothing to bucket.
 */
function toMonthlySeries(entries: { date: string; amount: number }[]): MonthPoint[] {
  if (entries.length === 0) return []
  const totals = new Map<string, number>()
  let min = "9999-99"
  let max = "0000-00"
  for (const e of entries) {
    const k = monthKey(e.date)
    totals.set(k, (totals.get(k) ?? 0) + e.amount)
    if (k < min) min = k
    if (k > max) max = k
  }
  return enumerateMonths(min, max).map((key) => ({ key, value: Math.round((totals.get(key) ?? 0) * 10) / 10 }))
}

// ── Metric series builders (raw store records -> monthly series) ─────────────

/** Simulator hours actually used (confirmed + completed) per month. */
export function simHoursSeries(
  runs: Run[],
  exerciseById: (id: string) => Exercise | undefined,
  statuses: RunStatus[] = USED_STATUSES,
): MonthPoint[] {
  const set = new Set(statuses)
  const entries = runs
    .filter((r) => set.has(r.status))
    .map((r) => ({ date: r.date, amount: (exerciseById(r.exerciseId)?.durationMin ?? 0) / 60 }))
  return toMonthlySeries(entries)
}

/** Count of exercise runs delivered (confirmed + completed) per month. */
export function runsDeliveredSeries(runs: Run[], statuses: RunStatus[] = USED_STATUSES): MonthPoint[] {
  const set = new Set(statuses)
  return toMonthlySeries(runs.filter((r) => set.has(r.status)).map((r) => ({ date: r.date, amount: 1 })))
}

/** Leave DAYS taken per month (rejected excluded, multi-day spans split). */
export function leaveDaysSeries(records: LeaveRecord[]): MonthPoint[] {
  const entries: { date: string; amount: number }[] = []
  for (const rec of records) {
    if (rec.approval === "rejected") continue
    let cursor = parseISO(rec.startDate)
    const last = parseISO(rec.endDate)
    // Split each spanned day into its own month bucket.
    let guard = 0
    while (cursor <= last && guard < 400) {
      const iso = cursor.toISOString().slice(0, 10)
      entries.push({ date: iso, amount: 1 })
      cursor = addDays(cursor, 1)
      guard++
    }
  }
  return toMonthlySeries(entries)
}

/** Count of training sessions per month. */
export function trainingSessionsSeries(sessions: TrainingSession[]): MonthPoint[] {
  return toMonthlySeries(sessions.map((s) => ({ date: s.date, amount: 1 })))
}

// ── Linear regression + prediction interval ─────────────────────────────────

export interface ForecastPoint {
  key: string
  value: number // projected value (never negative)
  lower: number // lower confidence bound
  upper: number // upper confidence bound
}

export interface ForecastResult {
  slope: number // average change per month
  intercept: number
  projected: ForecastPoint[]
  /** Fitted values for the historical range (for an optional trend line). */
  fitted: number[]
  /** R² goodness-of-fit in [0,1]; 0 when undefined. */
  r2: number
}

/**
 * Ordinary least-squares fit over the history (x = 0..n-1) projected `horizon`
 * months forward from the last history month. The band is a prediction interval
 * widening with distance from the mean x, floored at zero (counts can't be
 * negative).
 */
export function linearForecast(history: MonthPoint[], horizon = DEFAULT_HORIZON): ForecastResult {
  const n = history.length
  const empty: ForecastResult = { slope: 0, intercept: 0, projected: [], fitted: [], r2: 0 }
  if (n < 2) return empty

  const xs = history.map((_, i) => i)
  const ys = history.map((p) => p.value)
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
    syy += (ys[i] - meanY) ** 2
  }
  if (sxx === 0) return empty

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const fitted = xs.map((x) => intercept + slope * x)

  // Residual standard error (with n-2 dof) drives the band width.
  let sse = 0
  for (let i = 0; i < n; i++) sse += (ys[i] - fitted[i]) ** 2
  const dof = Math.max(1, n - 2)
  const residualStd = Math.sqrt(sse / dof)
  const r2 = syy === 0 ? 0 : Math.max(0, 1 - sse / syy)

  const lastKey = history[n - 1].key
  const projected: ForecastPoint[] = []
  for (let h = 1; h <= horizon; h++) {
    const x = n - 1 + h
    const yhat = intercept + slope * x
    // Prediction interval half-width for a new observation at x.
    const se = residualStd * Math.sqrt(1 + 1 / n + (x - meanX) ** 2 / sxx)
    const half = Z_SCORE * se
    const value = Math.max(0, Math.round(yhat * 10) / 10)
    projected.push({
      key: addMonths(lastKey, h),
      value,
      lower: Math.max(0, Math.round((yhat - half) * 10) / 10),
      upper: Math.max(0, Math.round((yhat + half) * 10) / 10),
    })
  }

  return { slope: Math.round(slope * 100) / 100, intercept, projected, fitted, r2: Math.round(r2 * 100) / 100 }
}

// ── Combined chart rows (history + forecast + band on one axis) ──────────────

export interface ChartRow {
  key: string
  label: string
  history: number | null
  forecast: number | null
  band: [number, number] | null
}

/**
 * Merge a history series and a forecast into a single row set for one chart.
 * The last history point is duplicated into `forecast` so the solid and dashed
 * lines join seamlessly.
 */
export function toChartRows(history: MonthPoint[], forecast: ForecastPoint[]): ChartRow[] {
  const rows: ChartRow[] = history.map((p, i) => ({
    key: p.key,
    label: monthLabel(p.key),
    history: p.value,
    forecast: i === history.length - 1 ? p.value : null,
    band: i === history.length - 1 ? [p.value, p.value] : null,
  }))
  for (const f of forecast) {
    rows.push({
      key: f.key,
      label: monthLabel(f.key),
      history: null,
      forecast: f.value,
      band: [f.lower, f.upper],
    })
  }
  return rows
}
