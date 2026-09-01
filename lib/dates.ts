import type { ValidityStatus } from "./types"

/* ===========================================================================
 * DATES & STATUS COLOURS — date math and the colour rules for badges
 * ===========================================================================
 * Two jobs:
 *   1. Small helper functions for working with dates as plain text
 *      ("2026-06-10"), e.g. add days, measure the gap between two dates, and
 *      format them nicely for display.
 *   2. The colour rules used by status badges and calendar dots.
 *
 * CHANGEABLE PARAMETERS:
 *   - TODAY (just below): the app's pretend "current date". Everything (which
 *     runs are past/future, currency expiry, etc.) is measured from here.
 *     In a real deployment you would use the real clock instead.
 *   - The "expiring soon" window is 14 days — see computeValidity() lower down.
 *   - statusColor() / dayTint(): change the Tailwind colour classes to re-skin
 *     the badges and calendar without touching any logic.
 * =========================================================================== */

// The app's "today" — tracks the real wall-clock date (normalized to local
// midnight). All seeded runs/leave/validity are generated relative to this same
// constant (see sample-data's `T = todayISO()`), so the demo data automatically
// lines up around whatever the real current date is.
const _now = new Date()
export const TODAY = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate())

export function todayISO(): string {
  return toISO(TODAY)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseISO(s: string): Date {
  return new Date(`${s}T00:00:00`)
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

export function addDaysISO(s: string, n: number): string {
  return toISO(addDays(parseISO(s), n))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
}

export function formatDate(s: string): string {
  return parseISO(s).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function formatShort(s: string): string {
  return parseISO(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

// Simple "week of year" (1–53): which 7-day block of its calendar year the
// date falls in, counting from Jan 1. Used for the Gantt "Week 10 → 18" labels.
export function weekOfYear(s: string): number {
  const year = s.slice(0, 4)
  return Math.floor(daysBetween(`${year}-01-01`, s) / 7) + 1
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// ── Currency / validity calculation ──────────────────────────────────────
// Works out whether a person is still "current" on a position. Given the last
// date they sat the position and how long that stays valid (validityDays), it
// returns the expiry date, days remaining, and a status word used for colours.
//   never    = they have never sat this position
//   expired  = past the expiry date
//   expiring = within the warning window (CHANGEABLE: 14 days below)
//   valid    = current
export function computeValidity(
  lastDateSat: string | null,
  validityDays: number,
  ref: string = todayISO(),
): { expiry: string | null; daysRemaining: number | null; status: ValidityStatus } {
  if (!lastDateSat) {
    return { expiry: null, daysRemaining: null, status: "never" }
  }
  const expiry = addDaysISO(lastDateSat, validityDays)
  const daysRemaining = daysBetween(ref, expiry)
  let status: ValidityStatus
  if (daysRemaining < 0) status = "expired"
  else if (daysRemaining <= 14) status = "expiring" // CHANGEABLE: warning window in days
  else status = "valid"
  return { expiry, daysRemaining, status }
}

export function statusColor(status: string): string {
  switch (status) {
    case "confirmed":
    case "completed":
    case "valid":
    case "approved":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
    case "tentative":
    case "expiring":
    case "pending":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
    case "cancelled":
    case "expired":
    case "rejected":
      return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
    case "postponed":
      return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30"
    case "training":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
    case "leave":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30"
    case "never":
    case "unavailable":
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

// Calendar day fill color (solid dot / cell tint)
export function dayTint(kind: string): string {
  switch (kind) {
    case "run":
      return "bg-emerald-500"
    case "training":
      return "bg-blue-500"
    case "leave":
      return "bg-violet-500"
    case "holiday":
      return "bg-red-500"
    default:
      return "bg-muted-foreground"
  }
}
