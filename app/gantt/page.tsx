"use client"

/* ===========================================================================
 * YEARLY GANTT PAGE ("/gantt") — the year-long course schedule timeline
 * ===========================================================================
 * One bar per course spanning its date range across a 12-month timeline,
 * labelled with the people it requires. Courses can overlap; each gets its own
 * row so all stay visible. Managers can add a course or click any bar to edit
 * it (dates, required people, and which exercises it groups). Courses persist.
 *
 * Cancellations are surfaced here too:
 *   • A whole course called off is drawn with a red hatch + "Cancelled" badge.
 *   • Individual cancelled days (a run/exercise cancelled on a date that falls
 *     inside the course) are drawn as red tick marks on the bar.
 *
 * SLICER: this page follows the GLOBAL slicer. The RADAR/TOWER program scope and
 * the year-range selector both apply — data is read from the year+program
 * filtered `reportCourses` / `reportRuns` views, and one 12-month band is drawn
 * per selected year that actually has courses (newest first). Nothing from an
 * unselected program or year is shown.
 * Chart rendering lives in components/course-gantt.tsx.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { todayISO } from "@/lib/dates"
import { yearOfISO } from "@/lib/retention"
import { PageHeader, EmptyState } from "@/components/shared"
import { CourseGantt, type CancelledDay } from "@/components/course-gantt"
import { CourseEditorDialog } from "@/components/course-editor-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Plus, Users, Layers, GraduationCap, Ban } from "lucide-react"
import type { Course, Run } from "@/lib/types"

export default function YearlyGanttPage() {
  const store = useStore()
  const { reportCourses, reportRuns, exerciseById, yearRange } = store
  const canManage = can(store.currentRole, "manage_exercises")

  // New courses default to the newest selected year so they land in view.
  const defaultYear = yearRange.end

  const rangeLabel = yearRange.start === yearRange.end ? `${yearRange.start}` : `${yearRange.start}–${yearRange.end}`

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Yearly Gantt"
        description={`Course schedule for ${rangeLabel}: each course, the people it requires, and any cancellations. Follows the program and year slicer.`}
        actions={canManage && <AddCourseButton year={defaultYear} />}
      />

      <CoursesView
        yearStart={yearRange.start}
        yearEnd={yearRange.end}
        defaultYear={defaultYear}
        courses={reportCourses}
        runs={reportRuns}
        canManage={canManage}
        exerciseById={exerciseById}
      />
    </div>
  )
}

/* ── Add-course button + dialog ──────────────────────────────────────────── */
function AddCourseButton({ year }: { year: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add course
      </Button>
      {open && <CourseEditorDialog open={open} onOpenChange={setOpen} defaultYear={year} />}
    </>
  )
}

/* ── Courses view ────────────────────────────────────────────────────────── */
function CoursesView({
  yearStart,
  yearEnd,
  defaultYear,
  courses,
  runs,
  canManage,
  exerciseById,
}: {
  yearStart: number
  yearEnd: number
  defaultYear: number
  courses: Course[]
  runs: Run[]
  canManage: boolean
  exerciseById: (id: string) => { id: string } | undefined
}) {
  const [search, setSearch] = useState("")
  const [kindFilter, setKindFilter] = useState<string>("all")
  const [hideInactive, setHideInactive] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  // Apply the on-page filters (search / kind / inactive) on top of the already
  // year+program scoped `courses` prop.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return courses
      .filter((c) => {
        if (kindFilter !== "all" && c.kind !== kindFilter) return false
        if (hideInactive && !c.active) return false
        if (q && !`${c.code} ${c.name}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort(
        (a, b) =>
          a.program.localeCompare(b.program) ||
          a.startDate.localeCompare(b.startDate) ||
          a.code.localeCompare(b.code),
      )
  }, [courses, search, kindFilter, hideInactive])

  // Map each course → the days inside its range that had cancelled runs. A day
  // groups every cancelled run on that date (so "a day of exercises cancelled"
  // shows as one mark). Whole-course cancellations are handled by the bar itself.
  const cancellationsByCourse = useMemo(() => {
    const cancelled = runs.filter((r) => r.status === "cancelled")
    const map = new Map<string, CancelledDay[]>()
    for (const c of courses) {
      const exSet = new Set(c.exerciseIds)
      const byDate = new Map<string, number>()
      for (const r of cancelled) {
        if (!exSet.has(r.exerciseId)) continue
        if (r.date < c.startDate || r.date > c.endDate) continue
        byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1)
      }
      if (byDate.size > 0) {
        map.set(
          c.id,
          [...byDate.entries()]
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        )
      }
    }
    return map
  }, [runs, courses])

  // One band per selected year (newest first), but only years that actually have
  // matching courses so empty years don't clutter the page. A course whose
  // window straddles a year boundary appears (clamped) in each year it touches.
  const yearBands = useMemo(() => {
    const bands: { year: number; rows: Course[] }[] = []
    for (let y = yearEnd; y >= yearStart; y--) {
      const yr = rows.filter((c) => yearOfISO(c.startDate) <= y && yearOfISO(c.endDate) >= y)
      if (yr.length > 0) bands.push({ year: y, rows: yr })
    }
    return bands
  }, [rows, yearStart, yearEnd])

  const totalPeople = useMemo(() => rows.reduce((sum, c) => sum + c.requiredPeople, 0), [rows])
  const cancelledCourses = useMemo(() => rows.filter((c) => c.cancelled).length, [rows])
  const exerciseCount = (c: Course) => c.exerciseIds.filter((id) => exerciseById(id)).length

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-4 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="course-search" className="text-xs leading-4">
                Search course
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="course-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Code or name…"
                  className="h-8 w-full pl-8 sm:w-56"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs leading-4">Kind</Label>
              <Select value={kindFilter} onValueChange={(v) => setKindFilter(v ?? "all")}>
                <SelectTrigger className="h-8 w-full sm:w-48">
                  <SelectValue placeholder="All kinds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  <SelectItem value="exercise">Exercise courses</SelectItem>
                  <SelectItem value="training">Training courses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex h-8 cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={hideInactive} onCheckedChange={(v) => setHideInactive(v === true)} />
              Hide inactive
            </label>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm bg-chart-1" aria-hidden /> RADAR
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-sm bg-chart-2" aria-hidden /> TOWER
            </div>
            <div className="flex items-center gap-1.5">
              <GraduationCap className="size-3.5" /> Training (dashed)
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="size-3.5" /> People required
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-[3px] rounded-sm bg-destructive" aria-hidden /> Cancelled day
            </div>
            <div className="flex items-center gap-1.5">
              <Ban className="size-3.5 text-destructive" /> Course cancelled
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">{rows.length}</span> course{rows.length === 1 ? "" : "s"}
        </span>
        <span>
          <span className="font-medium text-foreground">{totalPeople}</span> total people required
        </span>
        {cancelledCourses > 0 && (
          <span className="text-destructive">
            <span className="font-medium">{cancelledCourses}</span> cancelled
          </span>
        )}
      </div>

      {yearBands.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No courses to show"
          description={
            canManage
              ? "No courses match the current filters, program scope, or selected years. Add a course or adjust the filters and slicer."
              : "No courses match the current filters, program scope, or selected years. Try clearing the filters or adjusting the program/year slicer in the top bar."
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {yearBands.map((band) => (
            <section key={band.year} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{band.year}</h2>
                <span className="text-sm text-muted-foreground">
                  {band.rows.length} course{band.rows.length === 1 ? "" : "s"}
                </span>
              </div>
              <CourseGantt
                year={band.year}
                courses={band.rows}
                today={todayISO()}
                exerciseCount={exerciseCount}
                cancelledDays={(c) => cancellationsByCourse.get(c.id) ?? []}
                onCourseClick={(c) => {
                  if (canManage) setEditing(c)
                }}
              />
            </section>
          ))}
        </div>
      )}

      {editing && (
        <CourseEditorDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          course={editing}
          defaultYear={defaultYear}
        />
      )}
    </>
  )
}
