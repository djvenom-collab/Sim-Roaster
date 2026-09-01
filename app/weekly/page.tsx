"use client"

/* ===========================================================================
 * WEEKLY CALENDAR PAGE ("/weekly") — a seven-day overview
 * ===========================================================================
 * Shows one Monday-start week as seven day columns. Each day lists its runs
 * (with a filled/total seat count and status colour) plus little badges for
 * training, leave and public holidays. Good for spotting gaps before drilling
 * into a single day. Use the arrows to change week and the filter bar to narrow
 * things down; "Weekly push" sends everyone their week ahead.
 *
 * Clicking a day header jumps to /daily; clicking a run jumps to /seating. Data
 * comes from useCalendarData (lib/use-calendar-data.ts) and respects the active
 * RADAR/TOWER program.
 * =========================================================================== */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, GraduationCap, CalendarOff, Plane } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared"
import { FilterBar } from "@/components/filter-bar"
import { WeeklyPushDialog } from "@/components/weekly-push-dialog"
import { useStore } from "@/lib/store"
import { useCalendarData, emptyFilters, type CalendarFilters } from "@/lib/use-calendar-data"
import { clampYearToRange } from "@/lib/retention"
import { addDays, toISO, TODAY, WEEKDAYS, formatShort, MONTHS } from "@/lib/dates"
import { cn } from "@/lib/utils"

const statusBg: Record<string, string> = {
  confirmed: "border-l-emerald-500 bg-emerald-500/10",
  completed: "border-l-emerald-500 bg-emerald-500/10",
  tentative: "border-l-amber-500 bg-amber-500/10",
  cancelled: "border-l-red-500 bg-red-500/10 line-through opacity-70",
  postponed: "border-l-orange-500 bg-orange-500/10",
}

// Monday-start week containing the given date
function weekStart(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return addDays(d, -offset)
}

export default function WeeklyPage() {
  const router = useRouter()
  const store = useStore()
  const [start, setStart] = useState(() => weekStart(TODAY))
  const [filters, setFilters] = useState<CalendarFilters>(emptyFilters)
  const data = useCalendarData(filters)

  // Keep the visible week inside the top-bar YEAR slicer: if navigation (or a
  // change to the slicer) pushes the week outside the range, snap it back to the
  // nearest allowed year. Fires after navigation too, so you can't step past it.
  useEffect(() => {
    const y = start.getFullYear()
    const cy = clampYearToRange(y, store.yearRange)
    if (cy !== y) {
      const moved = new Date(start)
      moved.setFullYear(cy)
      setStart(weekStart(moved))
    }
  }, [start, store.yearRange])

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const end = days[6]
  const shift = (n: number) => setStart(addDays(start, n * 7))
  const todayISO = toISO(TODAY)

  const rangeLabel =
    start.getMonth() === end.getMonth()
      ? `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`
      : `${formatShort(toISO(start))} – ${formatShort(toISO(end))}`

  return (
    <>
      <PageHeader
        title="Weekly Calendar"
        description="Seven-day operations view with run slots, coverage and staff."
        actions={
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => shift(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-0 flex-1 text-center text-sm font-semibold tabular-nums sm:w-44 sm:flex-none">
              {rangeLabel}
            </span>
            <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => shift(1)}>
              <ChevronRight className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setStart(weekStart(TODAY))}>
              Today
            </Button>
            <WeeklyPushDialog />
          </div>
        }
      />

      <FilterBar filters={filters} onChange={setFilters} />

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((d) => {
          const date = toISO(d)
          const dd = data.get(date)
          const isToday = date === todayISO
          const isWeekend = d.getDay() === 0 || d.getDay() === 6
          const runs = dd?.runs ?? []
          return (
            <Card
              key={date}
              className={cn(
                "flex min-h-64 flex-col gap-2 p-2",
                isWeekend && "bg-muted/30",
                isToday && "ring-2 ring-primary",
              )}
            >
              <button
                onClick={() => router.push(`/daily?date=${date}`)}
                className="flex items-center justify-between rounded px-1 py-0.5 text-left transition-colors hover:bg-accent"
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-xs font-medium text-muted-foreground">{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                  <span className={cn("text-lg font-semibold tabular-nums", isToday && "text-primary")}>
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {dd?.trainingCount ? (
                    <span className="flex items-center gap-1 rounded bg-blue-500/10 px-1 text-[10px] text-blue-600">
                      <GraduationCap className="size-3" /> {dd.trainingCount}
                    </span>
                  ) : null}
                  {dd?.leaveCount ? (
                    <span className="flex items-center gap-1 rounded bg-violet-500/10 px-1 text-[10px] text-violet-600">
                      <CalendarOff className="size-3" /> {dd.leaveCount}
                    </span>
                  ) : null}
                </div>
              </button>

              {dd?.holiday && (
                <span className="truncate rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                  {dd.holiday}
                </span>
              )}

              <div className="flex flex-1 flex-col gap-1.5">
                {runs.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded border border-dashed text-[11px] text-muted-foreground">
                    No runs
                  </div>
                ) : (
                  runs.map((r) => {
                    const ex = store.exerciseById(r.exerciseId)
                    const sim = store.simulatorById(r.simulatorId)
                    const asgs = store.assignmentsForRun(r.id)
                    const filled = asgs.filter((a) => a.staffId).length
                    const incomplete = filled < asgs.length && r.status !== "cancelled"
                    const initials = asgs
                      .filter((a) => a.staffId)
                      .map((a) => store.staffById(a.staffId)?.initials)
                      .filter(Boolean)
                      .join(" · ")
                    return (
                      <button
                        key={r.id}
                        onClick={() => router.push(`/seating?run=${r.id}`)}
                        className={cn(
                          "rounded border-l-2 px-1.5 py-1 text-left text-[11px] leading-tight transition-colors hover:bg-accent",
                          statusBg[r.status] ?? "border-l-muted bg-muted",
                        )}
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span className="flex items-center gap-1">
                            <Plane className="size-3 shrink-0" />
                            {r.slotTime} {ex?.code}
                          </span>
                          <span className="text-muted-foreground">{sim?.code}</span>
                        </div>
                        {ex?.name && <p className="truncate text-muted-foreground">{ex.name}</p>}
                        <div className="mt-0.5 flex items-center justify-between">
                          <span className="truncate text-muted-foreground">{initials || "Unassigned"}</span>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1 tabular-nums",
                              incomplete ? "bg-amber-500/20 text-amber-700" : "bg-emerald-500/20 text-emerald-700",
                            )}
                          >
                            {filled}/{asgs.length}
                          </span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </Card>
          )
        })}
      </div>
    </>
  )
}
