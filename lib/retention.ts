/* ===========================================================================
 * RETENTION — the 5-year information-retention window
 * ===========================================================================
 * The system keeps a ROLLING 5 years of data "live" and treats anything older
 * as ARCHIVED. Archived data never appears in normal/operational views; it is
 * only reachable by an Admin through the archive card (view counts + download).
 *
 * With today in 2026:
 *   live window .... 2022 … 2026   (current year + previous 4)
 *   archived ....... 2021 and older
 *   seeded ......... 2021 … 2026   (one extra year older than live so the
 *                    archive has real, downloadable data to demonstrate)
 *
 * All helpers accept an optional `today` so they stay pure and testable; the
 * default uses the shared app clock (lib/dates → TODAY) for consistency with
 * the seed generators.
 * =========================================================================== */
import { TODAY } from "./dates"

export const RETENTION_YEARS = 5

export interface YearRange {
  start: number
  end: number
}

/** Four-digit year of an ISO date string (`2024-03-01` → 2024). */
export function yearOfISO(iso: string): number {
  return Number(iso.slice(0, 4))
}

export function currentYear(today: Date = TODAY): number {
  return today.getFullYear()
}

/** Live window = current year and the previous (RETENTION_YEARS − 1) years. */
export function liveYearRange(today: Date = TODAY): YearRange {
  const end = today.getFullYear()
  return { start: end - (RETENTION_YEARS - 1), end }
}

/** Every live year, oldest → newest (e.g. [2022,2023,2024,2025,2026]). */
export function liveYears(today: Date = TODAY): number[] {
  const { start, end } = liveYearRange(today)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

/** Older than the live window → archived (admin-only). */
export function isArchivedYear(year: number, today: Date = TODAY): boolean {
  return year < liveYearRange(today).start
}

export function isLiveYear(year: number, today: Date = TODAY): boolean {
  const { start, end } = liveYearRange(today)
  return year >= start && year <= end
}

/**
 * Earliest year we seed data for — one year older than the live window so the
 * archive is populated with genuine, downloadable history out of the box.
 */
export function seededStartYear(today: Date = TODAY): number {
  return liveYearRange(today).start - 1
}

/** All seeded years, oldest → newest (includes the archived year). */
export function allSeededYears(today: Date = TODAY): number[] {
  const end = today.getFullYear()
  const start = seededStartYear(today)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

/** The archived (seeded-but-not-live) years, e.g. [2021]. */
export function archivedSeededYears(today: Date = TODAY): number[] {
  return allSeededYears(today).filter((y) => isArchivedYear(y, today))
}

/** True when an ISO date falls inside an inclusive year range (null = allow). */
export function inYearRange(iso: string, range: YearRange | null): boolean {
  if (!range) return true
  const y = yearOfISO(iso)
  return y >= range.start && y <= range.end
}

/** True when an ISO date is in a live (non-archived) year. */
export function isLiveISO(iso: string, today: Date = TODAY): boolean {
  return isLiveYear(yearOfISO(iso), today)
}

/**
 * Clamp an ISO date so its YEAR sits inside the range, preserving month/day.
 * Used by the date-navigated pages so the top-bar year slicer also bounds the
 * day/week/month you can navigate to (null range = no clamp). Feb 29 is nudged
 * to Feb 28 when the target boundary year isn't a leap year.
 */
export function clampISOToYearRange(iso: string, range: YearRange | null): string {
  if (!range) return iso
  const y = yearOfISO(iso)
  if (y >= range.start && y <= range.end) return iso
  const targetYear = y < range.start ? range.start : range.end
  let monthDay = iso.slice(4) // "-MM-DD"
  if (monthDay === "-02-29") monthDay = "-02-28"
  return `${targetYear}${monthDay}`
}

/** Clamp a plain four-digit year into the inclusive range (null = no clamp). */
export function clampYearToRange(year: number, range: YearRange | null): number {
  if (!range) return year
  return Math.min(Math.max(year, range.start), range.end)
}
