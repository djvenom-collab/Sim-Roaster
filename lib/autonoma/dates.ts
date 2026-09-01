/* ===========================================================================
 * AUTONOMA — seed-time date derivation
 * ===========================================================================
 * Autonoma stores a recipe once and re-seeds it, UNCHANGED, before every run
 * for months. Any value the app compares against "now" (a run in the future, a
 * currency that must still be valid, an expiry) would go stale the day after it
 * was written if it were a literal date. So the recipe carries OFFSETS and the
 * factory turns each offset into a real instant at seeding time — the factory's
 * clock is the correct one.
 * =========================================================================== */

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_MS = 60 * 1000

/** A Date `days` from the seeding moment (negative = in the past). */
export function dateFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_MS)
}

/** yyyy-mm-dd, `days` from now. Used by date-only fields (runs, leave, courses). */
export function isoDate(days: number): string {
  return dateFromNow(days).toISOString().slice(0, 10)
}

/** Full ISO datetime, `days`/`minutes` from now. Used by timestamps/logs. */
export function isoDateTime(days = 0, minutes = 0): string {
  return new Date(Date.now() + days * DAY_MS + minutes * MIN_MS).toISOString()
}

/**
 * A concrete calendar date (month/day) resolved to the year that keeps it
 * sensible relative to now: the current year, or next year if that day has
 * already passed by more than a week. Used for values the app does NOT branch
 * on as an expiry (e.g. public holidays) but which should still look current.
 */
export function calendarDate(month: number, day: number): string {
  const now = new Date()
  let year = now.getFullYear()
  const thisYear = new Date(year, month - 1, day)
  if (thisYear.getTime() < now.getTime() - 7 * DAY_MS) year += 1
  const mm = String(month).padStart(2, "0")
  const dd = String(day).padStart(2, "0")
  return `${year}-${mm}-${dd}`
}
