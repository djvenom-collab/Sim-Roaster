"use client"

/* ===========================================================================
 * YEAR RANGE SLICER — the global 5-year retention filter (top bar)
 * ===========================================================================
 * Sits next to the program switch and scopes every reporting/analytics surface
 * to a year or a span of years (e.g. 2022–2024). Only the live retention window
 * is selectable; archived years are admin-only (see the admin Archive card).
 *
 * The selection lives in the store (`yearRange`) so it is shared across pages;
 * the report* selectors apply it automatically.
 * =========================================================================== */
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { CalendarRange } from "lucide-react"

export function YearRangeSlicer() {
  const { yearRange, setYearRange, liveYears } = useStore()
  const lo = liveYears[0]
  const hi = liveYears[liveYears.length - 1]
  const spansAll = yearRange.start === lo && yearRange.end === hi
  const single = yearRange.start === yearRange.end
  const label = single ? `${yearRange.start}` : `${yearRange.start}–${yearRange.end}`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 sm:px-2.5" aria-label={`Year range: ${label}`} />
        }
      >
        <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium tabular-nums">{label}</span>
        {spansAll && <span className="hidden text-[10px] text-muted-foreground sm:inline">All years</span>}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium leading-none">Filter by year</p>
          <p className="text-xs text-muted-foreground">
            Showing the rolling {liveYears.length}-year window ({lo}–{hi}).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground" htmlFor="year-from">
              From
            </label>
            <Select
              value={String(yearRange.start)}
              onValueChange={(v) => setYearRange({ start: Number(v), end: yearRange.end })}
            >
              <SelectTrigger id="year-from" size="sm" className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {liveYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="mt-5 text-muted-foreground">–</span>
          <div className="flex-1 space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground" htmlFor="year-to">
              To
            </label>
            <Select
              value={String(yearRange.end)}
              onValueChange={(v) => setYearRange({ start: yearRange.start, end: Number(v) })}
            >
              <SelectTrigger id="year-to" size="sm" className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {liveYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Quick single-year jump — sets the range to exactly one year. */}
        <div className="space-y-1 border-t pt-2">
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="year-jump">
            Jump to year
          </label>
          <Select
            value={single ? String(yearRange.start) : ""}
            onValueChange={(v) => setYearRange({ start: Number(v), end: Number(v) })}
          >
            <SelectTrigger id="year-jump" size="sm" className="h-8 w-full">
              <SelectValue placeholder="Select a single year…" />
            </SelectTrigger>
            <SelectContent>
              {[...liveYears].reverse().map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-1.5 border-t pt-2">
          {[
            { label: "All years", start: lo, end: hi },
            { label: `${hi}`, start: hi, end: hi },
            { label: "Last 3 yrs", start: Math.max(lo, hi - 2), end: hi },
          ].map((preset) => {
            const active = yearRange.start === preset.start && yearRange.end === preset.end
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => setYearRange({ start: preset.start, end: preset.end })}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
