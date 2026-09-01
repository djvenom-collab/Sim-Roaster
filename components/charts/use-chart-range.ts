"use client"

/* ===========================================================================
 * useChartRange — shared state for the chart range selector (YTD + years)
 * ===========================================================================
 * Holds the raw <Select> value ("ytd" or a year string) and derives a
 * `ChartRange` the analytics helpers understand. "YTD" always anchors to the
 * current calendar year. Charts feed `range` into their data helpers and pass
 * `value`/`setValue` straight into <ChartShell>.
 * =========================================================================== */
import { useEffect, useState } from "react"
import { defaultYear, type ChartRange } from "@/lib/analytics"
import { useStore } from "@/lib/store"
import { YTD_VALUE } from "./chart-shell"

// The years the GLOBAL year slicer currently allows, newest → oldest. Every
// analytics chart's own year dropdown is constrained to this list so it can only
// ever pick a year that is inside the app-wide selection.
export function useSlicerYears(): number[] {
  const { yearRange } = useStore()
  const out: number[] = []
  for (let y = yearRange.end; y >= yearRange.start; y--) out.push(y)
  return out
}

export function useChartRange(years: number[]) {
  const [value, setValue] = useState<string>(() => String(defaultYear(years)))

  // Keep the per-chart selection valid as the global slicer changes: if the
  // currently-picked year drops out of the allowed range, snap to the newest
  // year still in range. "YTD" is left alone (it anchors to the current year).
  useEffect(() => {
    if (value === YTD_VALUE) return
    if (years.length > 0 && !years.includes(Number(value))) {
      setValue(String(years[0]))
    }
  }, [years, value])

  const range: ChartRange =
    value === YTD_VALUE
      ? { year: new Date().getFullYear(), ytd: true }
      : { year: Number(value), ytd: false }

  return { value, setValue, range }
}
