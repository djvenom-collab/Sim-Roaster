"use client"

/* ===========================================================================
 * SIM MONTHLY PLANNER PAGE ("/monthly") — month-grid calendar
 * ===========================================================================
 * Shows a whole month at a glance with a coloured dot/count per day for runs,
 * training, leave and holidays, plus a small totals row at the top. Uses the
 * useCalendarData hook (lib/use-calendar-data.ts) to build the per-day summary
 * and a filter bar to narrow by staff / position / simulator / exercise.
 *
 * CHANGEABLE PARAMETERS:
 *   - statusBg (just below): the colour for each run status block.
 *   - The legend + dot colours lower down should match statusBg.
 *   - Clicking a day navigates to /daily for that date.
 * Everything shown respects the active RADAR/TOWER program.
 * =========================================================================== */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared"
import { FilterBar } from "@/components/filter-bar"
import { useStore } from "@/lib/store"
import { useCalendarData, emptyFilters, type CalendarFilters } from "@/lib/use-calendar-data"
import { clampYearToRange } from "@/lib/retention"
import { MONTHS, toISO, TODAY } from "@/lib/dates"
import { cn } from "@/lib/utils"

const statusBg: Record<string, string> = {
  confirmed: "border-l-emerald-500 bg-emerald-500/10",
  completed: "border-l-emerald-500 bg-emerald-500/10",
  tentative: "border-l-amber-500 bg-amber-500/10",
  cancelled: "border-l-red-500 bg-red-500/10 line-through opacity-70",
  postponed: "border-l-orange-500 bg-orange-500/10",
}

export default function MonthlyPage() {
  const router = useRouter()
  const store = useStore()
  const [cursor, setCursor] = useState(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
  const [filters, setFilters] = useState<CalendarFilters>(emptyFilters)
  const data = useCalendarData(filters)

  // Keep the visible month inside the top-bar YEAR slicer (and re-clamp if the
  // slicer changes or navigation steps past a boundary).
  useEffect(() => {
    const y = cursor.getFullYear()
    const cy = clampYearToRange(y, store.yearRange)
    if (cy !== y) setCursor(new Date(cy, cursor.getMonth(), 1))
  }, [cursor, store.yearRange])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const shift = (n: number) => setCursor(new Date(year, month + n, 1))

  // Year-at-a-glance totals, scoped to the visible month
  const summary = (() => {
    let runs = 0
    let runDays = 0
    let training = 0
    let leaveDays = 0
    let holidays = 0
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = data.get(toISO(new Date(year, month, d)))
      if (!dd) continue
      if (dd.runs.length) {
        runs += dd.runs.length
        runDays++
      }
      training += dd.trainingCount
      if (dd.leaveCount) leaveDays++
      if (dd.holiday) holidays++
    }
    return { runs, runDays, training, leaveDays, holidays }
  })()

  const stats: [string, number, string][] = [
    ["Runs", summary.runs, "text-emerald-600"],
    ["Run days", summary.runDays, "text-foreground"],
    ["Training", summary.training, "text-blue-600"],
    ["Leave days", summary.leaveDays, "text-violet-600"],
    ["Holidays", summary.holidays, "text-red-600"],
  ]

  return (
    <>
      <PageHeader
        title="Monthly Calendar"
        description="Run slots, exercises, simulators and assigned staff per day."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-36 text-center text-lg font-semibold">
              {MONTHS[month]} {year}
            </span>
            <Button variant="outline" size="icon" className="size-8" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      <FilterBar filters={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, value, color]) => (
          <Card key={label} className="p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-semibold tabular-nums", color)}>{value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {[
          ["Confirmed/Complete", "bg-emerald-500"],
          ["Tentative/Incomplete", "bg-amber-500"],
          ["Cancelled/Conflict", "bg-red-500"],
          ["Training", "bg-blue-500"],
          ["Leave", "bg-violet-500"],
        ].map(([label, c]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", c)} /> {label}
          </span>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-28 border-b border-r bg-muted/20" />
            const date = toISO(new Date(year, month, day))
            const dd = data.get(date)
            const isToday = date === toISO(TODAY)
            return (
              <button
                key={i}
                onClick={() => router.push(`/daily?date=${date}`)}
                className="flex min-h-28 flex-col gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-accent/50"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday && "bg-primary text-primary-foreground font-semibold",
                    )}
                  >
                    {day}
                  </span>
                  <span className="flex items-center gap-0.5">
                    {dd?.trainingCount ? <span className="size-1.5 rounded-full bg-blue-500" /> : null}
                    {dd?.leaveCount ? <span className="size-1.5 rounded-full bg-violet-500" /> : null}
                    {dd?.holiday ? <span className="size-1.5 rounded-full bg-red-500" /> : null}
                  </span>
                </div>
                {dd?.holiday && (
                  <span className="truncate rounded bg-red-500/10 px-1 text-[10px] text-red-600">{dd.holiday}</span>
                )}
                <div className="flex flex-col gap-0.5">
                  {dd?.runs.slice(0, 3).map((r) => {
                    const ex = store.exerciseById(r.exerciseId)
                    const sim = store.simulatorById(r.simulatorId)
                    const asgs = store.assignmentsForRun(r.id)
                    const filled = asgs.filter((a) => a.staffId).length
                    const incomplete = filled < asgs.length && r.status !== "cancelled"
                    const initials = asgs
                      .filter((a) => a.staffId)
                      .slice(0, 3)
                      .map((a) => store.staffById(a.staffId)?.initials.slice(0, 3))
                      .join(" ")
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "rounded border-l-2 px-1 py-0.5 text-[10px] leading-tight",
                          statusBg[r.status] ?? "border-l-muted bg-muted",
                        )}
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span>{r.slotTime} {ex?.code}</span>
                          <span className="text-muted-foreground">{sim?.code}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="truncate">{initials || "—"}</span>
                          <span className={cn(incomplete && "text-amber-600 font-medium")}>
                            {filled}/{asgs.length}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {dd && dd.runs.length > 3 && (
                    <span className="px-1 text-[10px] text-muted-foreground">+{dd.runs.length - 3} more</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </Card>
    </>
  )
}
