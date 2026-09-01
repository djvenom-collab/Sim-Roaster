"use client"

/* ===========================================================================
 * YEARLY GANTT — the exercise schedule timeline chart
 * ===========================================================================
 * Presentational chart used by the Yearly Exercise Gantt page. Each row is one
 * exercise; the left label shows its code/name, program and the positions it
 * requires, and the right-hand track plots every scheduled run across the year
 * as a coloured tick positioned by date (colour = run status).
 *
 * It does no data fetching — the page passes in the prepared `rows`, the `year`
 * to plot, and small lookup helpers. Clicking a run calls `onRunClick(date)`.
 * =========================================================================== */
import { useMemo } from "react"
import { daysBetween } from "@/lib/dates"
import { programBadgeClass, programDisplay } from "@/lib/program"
import { Badge } from "@/components/ui/badge"
import type { Exercise, Run } from "@/lib/types"
import type { Program } from "@/lib/program"

export interface GanttRow {
  exercise: Exercise
  runs: Run[]
}

// Solid tick colour per run status (mirrors the app's status palette).
export const statusDot: Record<string, string> = {
  confirmed: "bg-emerald-500",
  completed: "bg-emerald-500/50",
  tentative: "bg-amber-500",
  postponed: "bg-orange-500",
  cancelled: "bg-red-500",
}

export const GANTT_STATUSES: { status: string; label: string }[] = [
  { status: "confirmed", label: "Confirmed" },
  { status: "completed", label: "Completed" },
  { status: "tentative", label: "Tentative" },
  { status: "postponed", label: "Postponed" },
  { status: "cancelled", label: "Cancelled" },
]

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function YearlyGantt({
  year,
  rows,
  today,
  positionCode,
  simulatorCode,
  onRunClick,
}: {
  year: number
  rows: GanttRow[]
  today: string
  positionCode: (id: string) => string | undefined
  simulatorCode: (id: string) => string | undefined
  onRunClick: (date: string) => void
}) {
  const yearStart = `${year}-01-01`

  // Month bands (left/width as a % of the year) — months have unequal lengths.
  const months = useMemo(() => {
    const total = daysBetween(yearStart, `${year + 1}-01-01`)
    return MONTH_LABELS.map((label, m) => {
      const first = `${year}-${pad(m + 1)}-01`
      const next = m === 11 ? `${year + 1}-01-01` : `${year}-${pad(m + 2)}-01`
      const leftDays = daysBetween(yearStart, first)
      const days = daysBetween(first, next)
      return { label, leftPct: (leftDays / total) * 100, widthPct: (days / total) * 100 }
    })
  }, [year, yearStart])

  const totalDays = daysBetween(yearStart, `${year + 1}-01-01`)
  const todayPct = today.startsWith(String(year)) ? (daysBetween(yearStart, today) / totalDays) * 100 : null

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[860px]">
        {/* ── Month header ─────────────────────────────────────────────── */}
        <div className="flex border-b bg-muted/40">
          <div className="w-60 shrink-0 border-r px-3 py-2 text-xs font-medium text-muted-foreground">
            Exercise
          </div>
          <div className="relative h-8 flex-1">
            {months.map((m) => (
              <div
                key={m.label}
                className="absolute top-0 flex h-full items-center justify-center border-l border-border/60 text-[11px] font-medium text-muted-foreground"
                style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
              >
                {m.label}
              </div>
            ))}
            {todayPct !== null && (
              <div
                className="absolute top-0 z-10 h-full w-px bg-primary"
                style={{ left: `${todayPct}%` }}
                aria-hidden
              />
            )}
          </div>
        </div>

        {/* ── Exercise rows ────────────────────────────────────────────── */}
        <div className="divide-y">
          {rows.map(({ exercise, runs }) => {
            const posCodes = exercise.requiredPositions
              .map((id) => positionCode(id))
              .filter((c): c is string => !!c)
            const shown = posCodes.slice(0, 5)
            const extra = posCodes.length - shown.length
            return (
              <div key={exercise.id} className="flex hover:bg-muted/30">
                {/* Left label */}
                <div className="w-60 shrink-0 border-r px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium" title={exercise.name}>
                      {exercise.code}
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 px-1 text-[10px] ${programBadgeClass(exercise.program as Program)}`}
                    >
                      {programDisplay(exercise.program)}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={exercise.name}>
                    {exercise.name}
                  </p>
                  {shown.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {shown.map((code) => (
                        <span
                          key={code}
                          className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground"
                        >
                          {code}
                        </span>
                      ))}
                      {extra > 0 && (
                        <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
                          +{extra}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Timeline track */}
                <div className="relative h-[3.25rem] flex-1">
                  {/* month gridlines */}
                  {months.map((m) => (
                    <div
                      key={m.label}
                      className="absolute inset-y-0 border-l border-border/40"
                      style={{ left: `${m.leftPct}%` }}
                      aria-hidden
                    />
                  ))}
                  {/* today line */}
                  {todayPct !== null && (
                    <div
                      className="absolute inset-y-0 z-10 w-px bg-primary/70"
                      style={{ left: `${todayPct}%` }}
                      aria-hidden
                    />
                  )}
                  {/* run ticks */}
                  {runs.map((run) => {
                    const leftPct = (daysBetween(yearStart, run.date) / totalDays) * 100
                    const sim = simulatorCode(run.simulatorId)
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => onRunClick(run.date)}
                        title={`${run.date} · ${exercise.code} · ${run.status}${run.slotTime ? ` · ${run.slotTime}` : ""}${sim ? ` · Sim ${sim}` : ""}`}
                        className={`absolute top-1/2 h-6 w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-sm transition-transform hover:h-7 hover:w-[6px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statusDot[run.status] ?? "bg-muted-foreground"}`}
                        style={{ left: `${leftPct}%` }}
                        aria-label={`${exercise.code} run on ${run.date}, ${run.status}`}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
