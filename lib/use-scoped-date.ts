"use client"

/* ===========================================================================
 * useScopedDate — day-navigation state bounded by the top-bar YEAR slicer
 * ===========================================================================
 * A drop-in replacement for useState<string>(isoDate) on the date-navigated
 * pages (Dashboard, Daily, Seating, Other Tasks, Training day view). Every
 * value is clamped to the store's active yearRange:
 *   • the initial value (e.g. today, or a ?date= URL param),
 *   • user navigation (prev/next/date-picker/deep-links), and
 *   • an automatic re-clamp whenever the year slicer itself changes.
 * The result is that these pages can never show a day outside the selected
 * years, so the top-bar year filter reaches operational pages too — not just
 * the analytics/report surfaces.
 * =========================================================================== */
import { useCallback, useEffect, useState } from "react"
import { useStore } from "./store"
import { clampISOToYearRange } from "./retention"
import { todayISO } from "./dates"

export function useScopedDate(initial?: string) {
  const { yearRange } = useStore()
  const [date, setDateRaw] = useState(() => clampISOToYearRange(initial ?? todayISO(), yearRange))

  // Re-clamp when the year slicer changes so the selected day follows it.
  useEffect(() => {
    setDateRaw((d) => clampISOToYearRange(d, yearRange))
  }, [yearRange])

  const setDate = useCallback(
    (next: string | ((prev: string) => string)) => {
      setDateRaw((prev) => {
        const raw = typeof next === "function" ? next(prev) : next
        return clampISOToYearRange(raw, yearRange)
      })
    },
    [yearRange],
  )

  return [date, setDate] as const
}
