"use client"

/* ===========================================================================
 * COURSE GANTT — the yearly course schedule timeline
 * ===========================================================================
 * One row per course. The left label shows the course code/name, program,
 * kind (exercise vs training), how many people it needs and its week range.
 * The right-hand track draws a horizontal bar spanning the course's date range
 * across a 12-month timeline. Courses may overlap; each gets its own row so
 * every one stays visible. Clicking a bar (or its label) calls onCourseClick.
 *
 * Purely presentational — the page prepares and sorts `courses` and passes in
 * small lookup helpers. Bars are positioned by date as a % of the year.
 * =========================================================================== */
import { useMemo } from "react"
import { daysBetween, formatShort } from "@/lib/dates"
import { programBadgeClass, programDisplay } from "@/lib/program"
import { Badge } from "@/components/ui/badge"
import { Users, GraduationCap, Layers, Ban } from "lucide-react"
import type { Course } from "@/lib/types"
import type { Program } from "@/lib/program"

// One calendar day within a course that had one or more runs cancelled.
export interface CancelledDay {
  date: string
  count: number
}

// Diagonal red hatch used to mark a fully cancelled course bar.
const CANCEL_STRIPES =
  "repeating-linear-gradient(45deg, rgba(220,38,38,0.18) 0 6px, rgba(220,38,38,0.45) 6px 12px)"

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function pad(n: number) {
  return String(n).padStart(2, "0")
}

// Bar fill per program (solid, colour-coded). Training courses are rendered
// with a dashed outline on top of the same hue so they read differently.
function barColor(program: string): string {
  return program === "RADAR" ? "bg-chart-1" : "bg-chart-2"
}

export function CourseGantt({
  year,
  courses,
  today,
  exerciseCount,
  cancelledDays,
  onCourseClick,
}: {
  year: number
  courses: Course[]
  today: string
  exerciseCount: (c: Course) => number
  // Per-course list of days that had cancelled runs (drawn as red marks).
  cancelledDays: (c: Course) => CancelledDay[]
  onCourseClick: (course: Course) => void
}) {
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`
  const totalDays = daysBetween(yearStart, yearEnd)

  const months = useMemo(() => {
    return MONTH_LABELS.map((label, m) => {
      const first = `${year}-${pad(m + 1)}-01`
      const next = m === 11 ? `${year + 1}-01-01` : `${year}-${pad(m + 2)}-01`
      const leftDays = daysBetween(yearStart, first)
      const days = daysBetween(first, next)
      return { label, leftPct: (leftDays / total(totalDays)) * 100, widthPct: (days / total(totalDays)) * 100 }
    })
  }, [year, yearStart, totalDays])

  const todayPct = today.startsWith(String(year)) ? (daysBetween(yearStart, today) / totalDays) * 100 : null

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[920px]">
        {/* ── Month header ─────────────────────────────────────────────── */}
        <div className="flex border-b bg-muted/40">
          <div className="w-72 shrink-0 border-r px-3 py-2 text-xs font-medium text-muted-foreground">Course</div>
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
              <div className="absolute top-0 z-10 h-full w-px bg-primary" style={{ left: `${todayPct}%` }} aria-hidden />
            )}
          </div>
        </div>

        {/* ── Course rows ──────────────────────────────────────────────── */}
        <div className="divide-y">
          {courses.map((course) => {
            // Clamp the bar to the visible year.
            const start = course.startDate < yearStart ? yearStart : course.startDate
            const end = course.endDate >= yearEnd ? yearEnd : course.endDate
            const leftPct = (daysBetween(yearStart, start) / totalDays) * 100
            const widthPct = Math.max((daysBetween(start, end) / totalDays) * 100, 1.2)
            const isTraining = course.kind === "training"
            const exCount = exerciseCount(course)
            const durationWeeks = Math.max(1, Math.round((daysBetween(course.startDate, course.endDate) + 1) / 7))
            const dateRange = `${formatShort(course.startDate)} – ${formatShort(course.endDate)}`
            const KindIcon = isTraining ? GraduationCap : Layers
            // Place the people-count chip inside the bar when there's room,
            // otherwise float it just past the bar so short courses still show it.
            const labelInside = widthPct > 6
            // Cancellation state: whole course called off, and/or specific days.
            const wholeCancelled = course.cancelled === true
            const cancels = wholeCancelled ? [] : cancelledDays(course)
            return (
              <div key={course.id} className={`flex hover:bg-muted/30 ${course.active ? "" : "opacity-50"}`}>
                {/* Left label */}
                <button
                  type="button"
                  onClick={() => onCourseClick(course)}
                  className="w-72 shrink-0 border-r px-3 py-2 text-left transition-colors hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`truncate text-sm font-medium ${wholeCancelled ? "text-muted-foreground line-through" : ""}`}
                      title={course.name}
                    >
                      {course.code}
                    </span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 px-1 text-[10px] ${programBadgeClass(course.program as Program)}`}
                    >
                      {programDisplay(course.program)}
                    </Badge>
                    <Badge variant="outline" className="shrink-0 px-1 text-[10px]">
                      <KindIcon className="size-3" /> {isTraining ? "Training" : "Course"}
                    </Badge>
                    {wholeCancelled && (
                      <Badge variant="destructive" className="shrink-0 px-1 text-[10px]">
                        <Ban className="size-3" /> Cancelled
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={course.name}>
                    {course.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                      <Users className="size-3" /> {course.requiredPeople}
                    </span>
                    <span>
                      {exCount} exercise{exCount === 1 ? "" : "s"}
                    </span>
                    <span className="font-medium text-foreground">
                      {durationWeeks} wk{durationWeeks === 1 ? "" : "s"}
                    </span>
                    <span>{dateRange}</span>
                    {cancels.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 font-medium text-destructive">
                        <Ban className="size-3" /> {cancels.length} day{cancels.length === 1 ? "" : "s"} cancelled
                      </span>
                    )}
                  </div>
                </button>

                {/* Timeline track */}
                <div className="relative h-[3.75rem] flex-1">
                  {months.map((m) => (
                    <div
                      key={m.label}
                      className="absolute inset-y-0 border-l border-border/40"
                      style={{ left: `${m.leftPct}%` }}
                      aria-hidden
                    />
                  ))}
                  {todayPct !== null && (
                    <div
                      className="absolute inset-y-0 z-10 w-px bg-primary/70"
                      style={{ left: `${todayPct}%` }}
                      aria-hidden
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onCourseClick(course)}
                    title={`${course.code} · ${course.name} · ${course.requiredPeople} people · ${durationWeeks} wk${durationWeeks === 1 ? "" : "s"} · ${dateRange}${wholeCancelled ? " · CANCELLED" : ""}`}
                    aria-label={`${course.name}, ${course.requiredPeople} people, ${durationWeeks} weeks, ${dateRange}${wholeCancelled ? ", cancelled" : ""}`}
                    className={`absolute top-1/2 flex h-7 -translate-y-1/2 items-center gap-1 overflow-hidden rounded-md shadow-sm transition-all hover:h-8 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      wholeCancelled ? "bg-muted px-1.5 ring-1 ring-destructive/50" : `${barColor(course.program)} px-1.5`
                    } ${isTraining ? "border-2 border-dashed border-background/70" : ""}`}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      ...(wholeCancelled ? { backgroundImage: CANCEL_STRIPES } : {}),
                    }}
                  >
                    {labelInside && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-background/90 px-1 py-0.5 text-[10px] font-semibold text-foreground">
                        {wholeCancelled ? <Ban className="size-3 text-destructive" /> : <Users className="size-3" />}
                        {course.requiredPeople}
                      </span>
                    )}
                  </button>

                  {/* Per-day cancellation marks: a red tick at each cancelled day. */}
                  {cancels.map((d) => {
                    const pct = (daysBetween(yearStart, d.date) / totalDays) * 100
                    return (
                      <span
                        key={d.date}
                        className="pointer-events-none absolute top-1/2 z-20 h-7 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-destructive ring-1 ring-background"
                        style={{ left: `${pct}%` }}
                        title={`Cancelled — ${formatShort(d.date)}${d.count > 1 ? ` (${d.count} runs)` : ""}`}
                        aria-hidden
                      />
                    )
                  })}
                  {/* For narrow bars, float the headcount just past the bar so
                      it never gets clipped. Non-interactive; the bar handles clicks. */}
                  {!labelInside && (
                    <span
                      className="pointer-events-none absolute top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-0.5 whitespace-nowrap rounded bg-background/90 px-1 py-0.5 text-[10px] font-semibold text-foreground shadow-sm ring-1 ring-border"
                      style={{ left: `calc(${leftPct}% + ${widthPct}% + 4px)` }}
                    >
                      <Users className="size-3" />
                      {course.requiredPeople}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// tiny guard so a zero-length year never divides by zero
function total(n: number) {
  return n || 1
}
