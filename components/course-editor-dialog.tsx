"use client"

/* ===========================================================================
 * COURSE EDITOR DIALOG — create or edit a course
 * ===========================================================================
 * The form behind the Yearly Course Gantt. Set the code, name, program, kind
 * (exercise course vs training course), the start/end dates (its week range is
 * shown live), the number of people required for the whole course, and which
 * exercises make it up. Saves to the store; courses persist across reloads.
 * Only exercises belonging to the chosen program can be added.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import { PROGRAMS, programDisplay } from "@/lib/program"
import { weekOfYear } from "@/lib/dates"
import { Trash2 } from "lucide-react"
import type { Course, CourseKind } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  course?: Course | null
  // Default dates for a brand-new course (the visible Gantt year).
  defaultYear?: number
}

const KIND_LABELS: Record<CourseKind, string> = {
  exercise: "Exercise course",
  training: "Training course",
}

export function CourseEditorDialog({ open, onOpenChange, course, defaultYear }: Props) {
  const store = useStore()
  const year = defaultYear ?? new Date().getFullYear()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState<Partial<Course>>(
    course ?? {
      code: "",
      name: "",
      program: "RADAR",
      kind: "exercise",
      exerciseIds: [],
      startDate: `${year}-01-06`,
      endDate: `${year}-02-02`,
      requiredPeople: 6,
      notes: "",
      active: true,
      cancelled: false,
    },
  )

  // Natural sort so codes order numerically (RX-2, RX-5, RX-11 — not RX-11, RX-2)
  // instead of plain string order. Splits each code into text/number chunks and
  // compares chunk by chunk: text lexicographically, numbers numerically.
  const compareCodes = (a: string, b: string) => {
    const chunk = (s: string) => s.toUpperCase().match(/\d+|\D+/g) ?? []
    const ax = chunk(a)
    const bx = chunk(b)
    for (let i = 0; i < Math.max(ax.length, bx.length); i++) {
      const an = ax[i]
      const bn = bx[i]
      if (an === undefined) return -1
      if (bn === undefined) return 1
      const aNum = /^\d+$/.test(an)
      const bNum = /^\d+$/.test(bn)
      if (aNum && bNum) {
        const d = Number(an) - Number(bn)
        if (d !== 0) return d
      } else {
        const d = an.localeCompare(bn)
        if (d !== 0) return d
      }
    }
    return 0
  }

  const programExercises = store.exercises
    .filter((e) => e.program === form.program)
    .sort((a, b) => compareCodes(a.code, b.code))
  // Split the picker: real exercises vs their validation deliveries.
  const exerciseOptions = programExercises.filter((e) => !e.isValidation)
  const validationOptions = programExercises.filter((e) => e.isValidation)

  const toggleExercise = (id: string) =>
    setForm((f) => {
      const set = new Set(f.exerciseIds ?? [])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, exerciseIds: [...set] }
    })

  // Switching program drops any selected exercises that aren't in it.
  const onProgramChange = (program: string | null) => {
    if (!program) return
    setForm((f) => ({
      ...f,
      program,
      exerciseIds: (f.exerciseIds ?? []).filter((id) =>
        store.exercises.some((e) => e.id === id && e.program === program),
      ),
    }))
  }

  const wkFrom = form.startDate ? weekOfYear(form.startDate) : null
  const wkTo = form.endDate ? weekOfYear(form.endDate) : null

  const save = () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and name are required")
      return
    }
    if (!form.startDate || !form.endDate) {
      toast.error("Start and end dates are required")
      return
    }
    if (form.endDate < form.startDate) {
      toast.error("End date must be on or after the start date")
      return
    }
    if (!form.requiredPeople || form.requiredPeople < 1) {
      toast.error("Required people must be at least 1")
      return
    }
    if (course) {
      store.updateCourse({ ...(course as Course), ...form } as Course)
      toast.success("Course updated")
    } else {
      store.addCourse({
        id: `course-${Date.now()}`,
        code: form.code!.trim(),
        name: form.name!.trim(),
        program: form.program?.trim() || "RADAR",
        kind: (form.kind as CourseKind) ?? "exercise",
        exerciseIds: form.exerciseIds ?? [],
        startDate: form.startDate!,
        endDate: form.endDate!,
        requiredPeople: Number(form.requiredPeople) || 1,
        notes: form.notes?.trim() || undefined,
        active: form.active ?? true,
        cancelled: form.cancelled ?? false,
      })
      toast.success("Course added")
    }
    onOpenChange(false)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{course ? "Edit Course" : "Add Course"}</DialogTitle>
          <DialogDescription>
            Group exercises into a multi-week course and set how many people it needs.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="course-code">Course code</Label>
            <Input
              id="course-code"
              placeholder="RAD-C1"
              value={form.code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-name">Name</Label>
            <Input
              id="course-name"
              placeholder="RADAR Course Alpha"
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-program">Program</Label>
            <Select value={form.program ?? ""} onValueChange={onProgramChange}>
              <SelectTrigger id="course-program">
                <SelectValue placeholder="Select program">
                  {(value) => (value ? programDisplay(value as string) : "Select program")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PROGRAMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {programDisplay(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-kind">Kind</Label>
            <Select
              value={form.kind ?? "exercise"}
              onValueChange={(v) => setForm((f) => ({ ...f, kind: (v as CourseKind) ?? "exercise" }))}
            >
              <SelectTrigger id="course-kind">
                <SelectValue placeholder="Select kind">
                  {(value) => KIND_LABELS[(value as CourseKind) ?? "exercise"]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exercise">Exercise course</SelectItem>
                <SelectItem value="training">Training course</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-start">Start date</Label>
            <Input
              id="course-start"
              type="date"
              value={form.startDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-end">End date</Label>
            <Input
              id="course-end"
              type="date"
              value={form.endDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="course-people">People required</Label>
            <Input
              id="course-people"
              type="number"
              min={1}
              value={form.requiredPeople ?? 1}
              onChange={(e) => setForm((f) => ({ ...f, requiredPeople: Number(e.target.value) }))}
            />
          </div>
          <div className="flex items-end">
            {wkFrom !== null && wkTo !== null && (
              <p className="text-xs text-muted-foreground">
                Runs <span className="font-medium text-foreground">Week {wkFrom}</span> to{" "}
                <span className="font-medium text-foreground">Week {wkTo}</span>
              </p>
            )}
          </div>
          <div className="col-span-2 space-y-3">
            <div className="space-y-1">
              <Label>Exercises in this course</Label>
              <p className="text-xs text-muted-foreground">
                Tap to add or remove. Only {programDisplay(form.program ?? "RADAR")} deliveries are shown.
              </p>
            </div>
            {programExercises.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No exercises defined for {programDisplay(form.program ?? "RADAR")}.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Exercises <span className="font-normal">({exerciseOptions.length})</span>
                  </p>
                  {exerciseOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {exerciseOptions.map((e) => {
                        const on = form.exerciseIds?.includes(e.id)
                        return (
                          <button key={e.id} type="button" onClick={() => toggleExercise(e.id)}>
                            <Badge
                              variant={on ? "default" : "outline"}
                              className={cn("cursor-pointer font-mono", !on && "text-muted-foreground")}
                              title={e.name}
                            >
                              {e.code}
                            </Badge>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Validations <span className="font-normal">({validationOptions.length})</span>
                  </p>
                  {validationOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {validationOptions.map((e) => {
                        const on = form.exerciseIds?.includes(e.id)
                        return (
                          <button key={e.id} type="button" onClick={() => toggleExercise(e.id)}>
                            <Badge
                              variant={on ? "default" : "secondary"}
                              className={cn("cursor-pointer font-mono", !on && "text-muted-foreground")}
                              title={e.name}
                            >
                              {e.code}
                            </Badge>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="course-notes">Notes</Label>
            <Textarea
              id="course-notes"
              value={form.notes ?? ""}
              placeholder="Optional notes…"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="course-active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive courses are dimmed on the Gantt.</p>
            </div>
            <Switch
              id="course-active"
              checked={form.active ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="course-cancelled">Cancelled</Label>
              <p className="text-xs text-muted-foreground">
                Mark the whole course as called off. It stays on the Gantt with a red hatch and a “Cancelled” badge.
              </p>
            </div>
            <Switch
              id="course-cancelled"
              checked={form.cancelled ?? false}
              onCheckedChange={(v) => setForm((f) => ({ ...f, cancelled: v }))}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {course ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{course ? "Save changes" : "Add course"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {course && (
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${course.code}?`}
        description="This removes the course from the schedule. Its exercises and any scheduled runs are not affected. This cannot be undone."
        onConfirm={() => {
          store.deleteCourse(course.id)
          toast.success("Course deleted")
          onOpenChange(false)
        }}
      />
    )}
    </>
  )
}
