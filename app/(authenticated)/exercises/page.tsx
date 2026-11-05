"use client"

/* ===========================================================================
 * SIM EXERCISES PAGE ("/exercises") — the catalogue of courses
 * ===========================================================================
 * Lists every exercise/course (e.g. "RX-2", "RX-2 V") with its program,
 * simulator, duration, required staff and the seats it needs. Managers can
 * create, edit or delete exercises here via the exercise editor dialog.
 *
 * The starting set is built in lib/sample-data.ts from the DIM course list;
 * edits here update the live store copy. Validation courses (code ending in
 * " V") are flagged automatically. Lives under SIM Administration.
 * =========================================================================== */
import { useState } from "react"
import { useStore } from "@/lib/store"
import { useDeepLinkHighlight } from "@/lib/use-deep-link"
import { cn } from "@/lib/utils"
import { can } from "@/lib/permissions"
import { programDisplay, programBadgeClass } from "@/lib/program"
import { toast } from "sonner"
import { PageHeader } from "@/components/shared"
import { ExerciseTree } from "@/components/exercise-tree"
import { ExerciseEditorDialog } from "@/components/exercise-editor-dialog"
import { CourseEditorDialog } from "@/components/course-editor-dialog"
import { PositionEditorDialog } from "@/components/position-editor-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatShort } from "@/lib/dates"
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Layers,
  GraduationCap,
  Ban,
  CalendarRange,
  Power,
  PowerOff,
} from "lucide-react"
import type { Exercise, Course, Position } from "@/lib/types"

export default function ExercisesPage() {
  const store = useStore()
  const canManage = can(store.currentRole, "manage_exercises")
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [deleting, setDeleting] = useState<Exercise | null>(null)

  // Deep link: /exercises?exercise=<id> scrolls the exercise into view and
  // highlights it briefly; the tree auto-expands the path to it.
  const highlightExercise = useDeepLinkHighlight("exercise", "exercise")

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exercises"
        description="Course catalogue by simulator, with required staff and qualification rules."
        actions={
          canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add exercise
            </Button>
          )
        }
      />

      {addOpen && <ExerciseEditorDialog open={addOpen} onOpenChange={setAddOpen} />}
      {editing && <ExerciseEditorDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} exercise={editing} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.code}?`}
        description="This removes the exercise from the catalogue. Existing scheduled runs are not affected. This cannot be undone."
        onConfirm={() => {
          if (deleting) {
            store.deleteExercise(deleting.id)
            toast.success("Exercise deleted")
            setDeleting(null)
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Browse by {programDisplay("RADAR")} / {programDisplay("TOWER")} → Course / Validation → SIM section → course →
          exercise. Add courses into the SIM sections from the course list below.
        </p>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <ExerciseTree
        store={store}
        canManage={canManage}
        search={search}
        highlightExercise={highlightExercise}
        onEdit={setEditing}
        onDelete={setDeleting}
      />

      <CoursesSection canManage={canManage} store={store} />

      <PositionReferenceSection canManage={canManage} store={store} />
    </div>
  )
}

/* ── Position Reference ────────────────────────────────────────────────────
 * Editable catalogue of seat types. Managers can add, edit (code / name /
 * description / validity / program) and delete positions here; the two spare
 * "flexible" seats per program are ordinary positions that can be renamed and,
 * via the exercise editor, attached to or removed from any exercise on demand.
 * ========================================================================= */
function PositionReferenceSection({
  canManage,
  store,
}: {
  canManage: boolean
  store: ReturnType<typeof useStore>
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Position | null>(null)
  const [deleting, setDeleting] = useState<Position | null>(null)

  // How many exercises currently reference the position being deleted, so the
  // confirmation can warn that those seats will be dropped.
  const usageCount = deleting
    ? store.exercises.filter((e) => e.requiredPositions?.includes(deleting.id)).length
    : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Position Reference</CardTitle>
          {canManage && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add position
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Validity</TableHead>
              {canManage && <TableHead className="w-20 text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {store.scopedPositions.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Badge variant="outline" className="font-mono">
                    {p.code}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn("font-mono", programBadgeClass(p.program as "RADAR" | "TOWER"))}
                  >
                    {programDisplay(p.program)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.description}</TableCell>
                <TableCell className="text-right tabular-nums">{p.validityDays}d</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setEditing(p)}
                        aria-label={`Edit ${p.code}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setDeleting(p)}
                        aria-label={`Delete ${p.code}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {addOpen && <PositionEditorDialog open={addOpen} onOpenChange={setAddOpen} />}
      {editing && (
        <PositionEditorDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          position={editing}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.code}?`}
        description={
          usageCount > 0
            ? `This position is a required seat on ${usageCount} exercise${usageCount === 1 ? "" : "s"}. Deleting it removes that seat from those exercises. This cannot be undone.`
            : "This removes the position from the catalogue. This cannot be undone."
        }
        onConfirm={() => {
          if (deleting) {
            store.deletePosition(deleting.id)
            toast.success("Position deleted")
            setDeleting(null)
          }
        }}
      />
    </Card>
  )
}

/* ── Courses management ───────────────────────────────────────────────────
 * Add / edit / view / delete the multi-week courses that group exercises and
 * drive the Yearly Gantt. Scoped to the program tab selected above.
 * ========================================================================= */
function CoursesSection({
  canManage,
  store,
}: {
  canManage: boolean
  store: ReturnType<typeof useStore>
}) {
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)
  const [deleting, setDeleting] = useState<Course | null>(null)

  // The exercise sheet is a structural view of ONE year (course→SIM-bucket→
  // exercise). Courses now repeat per year, so scope to the newest selected year
  // (the global slicer's end) to keep the sheet to a single, editable set and to
  // default new courses to that year.
  const year = store.yearRange.end

  const courses = store.scopedCourses
    .filter((c) => Number(c.startDate.slice(0, 4)) === year)
    .filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(search.toLowerCase()))
    .sort(
      (a, b) =>
        a.program.localeCompare(b.program) ||
        a.startDate.localeCompare(b.startDate) ||
        a.code.localeCompare(b.code),
    )

  const durationWeeks = (c: Course) => {
    const ms = new Date(c.endDate).getTime() - new Date(c.startDate).getTime()
    return Math.max(1, Math.round(ms / (7 * 24 * 60 * 60 * 1000)) + 1)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="size-4" /> Courses
            <Badge variant="secondary" className="font-normal">
              {courses.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search courses…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-44 pl-8 sm:w-56"
              />
            </div>
            {canManage && (
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="size-4" /> Add course
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {courses.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No courses yet. {canManage ? "Use “Add course” to create one." : ""}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>SIM Section</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Exercises</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((c) => {
                const wks = durationWeeks(c)
                const exCount = c.exerciseIds.filter((id) => store.exerciseById(id)).length
                return (
                  <TableRow key={c.id} className={c.active ? "" : "opacity-60"}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {c.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-mono", programBadgeClass(c.program as "RADAR" | "TOWER"))}>
                        {programDisplay(c.program)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {store.courseSimClass[c.id] === "operational" ? (
                        <Badge variant="secondary" className="gap-1">
                          <Power className="size-3" /> Operational
                        </Badge>
                      ) : store.courseSimClass[c.id] === "non-operational" ? (
                        <Badge variant="secondary" className="gap-1">
                          <PowerOff className="size-3" /> Non-Operational
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {c.kind === "training" ? (
                          <>
                            <GraduationCap className="size-3.5" /> Training
                          </>
                        ) : (
                          <>
                            <Layers className="size-3.5" /> Course
                          </>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-xs">
                        <CalendarRange className="size-3.5 text-muted-foreground" />
                        <span className="tabular-nums">
                          {formatShort(c.startDate)} – {formatShort(c.endDate)}
                        </span>
                        <span className="text-muted-foreground">
                          ({wks} wk{wks === 1 ? "" : "s"})
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.requiredPeople}</TableCell>
                    <TableCell className="text-right tabular-nums">{exCount}</TableCell>
                    <TableCell>
                      {c.cancelled ? (
                        <Badge variant="destructive" className="gap-1">
                          <Ban className="size-3" /> Cancelled
                        </Badge>
                      ) : c.active ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setEditing(c)}
                            aria-label={`Edit ${c.code}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setDeleting(c)}
                            aria-label={`Delete ${c.code}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {addOpen && <CourseEditorDialog open={addOpen} onOpenChange={setAddOpen} defaultYear={year} />}
      {editing && (
        <CourseEditorDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          course={editing}
          defaultYear={year}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.code}?`}
        description="This removes the course from the schedule. Its exercises and any scheduled runs are not affected. This cannot be undone."
        onConfirm={() => {
          if (deleting) {
            store.deleteCourse(deleting.id)
            toast.success("Course deleted")
            setDeleting(null)
          }
        }}
      />
    </Card>
  )
}


