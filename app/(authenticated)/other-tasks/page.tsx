"use client"

/* ===========================================================================
 * OTHER TASKS PAGE ("/other-tasks") — non-simulator commitments
 * ===========================================================================
 * Meetings, courses, projects, detachments — anything that occupies a person
 * but isn't a sim run. While a task runs, everyone on it is "busy" and is
 * excluded from runs and the Fill Positions auto-assigner for its dates.
 *
 * CHANGEABLE: starting tasks are seeded in lib/sample-data.ts (otherTasks).
 * Create/edit/delete is handled by store actions in lib/store.tsx.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { programDisplay } from "@/lib/program"
import { PageHeader, EmptyState } from "@/components/shared"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ListTodo,
  Plus,
  Pencil,
  Trash2,
  Users,
  MapPin,
  CalendarRange,
  Clock,
} from "lucide-react"
import { formatShort, formatDate, todayISO } from "@/lib/dates"
import { DayNavigator } from "@/components/day-navigator"
import { useScopedDate } from "@/lib/use-scoped-date"
import type { OtherTask } from "@/lib/types"

// Render a task's window as a compact, readable string.
function formatWindow(t: OtherTask): string {
  const start = `${formatShort(t.startDate)}${t.startTime ? ` ${t.startTime}` : ""}`
  const end = `${formatShort(t.endDate)}${t.endTime ? ` ${t.endTime}` : ""}`
  return t.startDate === t.endDate && !t.endTime && !t.startTime
    ? formatShort(t.startDate)
    : `${start} → ${end}`
}

const PROGRAM_OPTIONS = ["", "RADAR", "TOWER"] as const

export default function OtherTasksPage() {
  const store = useStore()
  const canManage = can(store.currentRole, "manage_other_tasks")

  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteRec, setDeleteRec] = useState<OtherTask | null>(null)

  // form state
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [staffIds, setStaffIds] = useState<string[]>([])
  const [startDate, setStartDate] = useState(todayISO())
  const [startTime, setStartTime] = useState("09:00")
  const [endDate, setEndDate] = useState(todayISO())
  const [endTime, setEndTime] = useState("12:00")
  const [duration, setDuration] = useState("")
  const [classroom, setClassroom] = useState("")
  const [program, setProgram] = useState<string>("")

  // Day-scoped view (like the Daily Run Planner): step through days and see the
  // tasks whose window covers the selected date (startDate ≤ date ≤ endDate).
  // "View all" bypasses the day filter and lists every task (newest first).
  const [date, setDate] = useScopedDate()
  const [viewAll, setViewAll] = useState(false)
  // View-all follows the top-bar year slicer (reportOtherTasks); the day view is
  // navigated by `date`, which useScopedDate already keeps inside the slicer.
  const sorted = useMemo(
    () =>
      viewAll
        ? [...store.reportOtherTasks].sort((a, b) => b.startDate.localeCompare(a.startDate))
        : store.scopedOtherTasks
            .filter((t) => t.startDate <= date && t.endDate >= date)
            .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
    [store.reportOtherTasks, store.scopedOtherTasks, date, viewAll],
  )

  const resetForm = () => {
    setTitle("")
    setDescription("")
    setStaffIds([])
    setStartDate(todayISO())
    setStartTime("09:00")
    setEndDate(todayISO())
    setEndTime("12:00")
    setDuration("")
    setClassroom("")
    setProgram("")
  }

  const openAdd = () => {
    setEditId(null)
    resetForm()
    setOpen(true)
  }

  const openEdit = (t: OtherTask) => {
    setEditId(t.id)
    setTitle(t.title)
    setDescription(t.description ?? "")
    setStaffIds([...t.staffIds])
    setStartDate(t.startDate)
    setStartTime(t.startTime ?? "")
    setEndDate(t.endDate)
    setEndTime(t.endTime ?? "")
    setDuration(t.durationMin ? String(t.durationMin) : "")
    setClassroom(t.classroom ?? "")
    setProgram(t.program ?? "")
    setOpen(true)
  }

  const toggleStaff = (id: string) =>
    setStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = () => {
    if (!title.trim()) {
      toast.error("A task title is required")
      return
    }
    if (staffIds.length === 0) {
      toast.error("Assign at least one staff member")
      return
    }
    if (endDate < startDate) {
      toast.error("End date cannot be before start date")
      return
    }
    const durationMin = duration.trim() ? Number(duration) : undefined
    if (durationMin !== undefined && (Number.isNaN(durationMin) || durationMin <= 0)) {
      toast.error("Duration must be a positive number of minutes")
      return
    }
    const payload: OtherTask = {
      id: editId ?? `ot-${Date.now()}`,
      title: title.trim(),
      description: description.trim() || undefined,
      staffIds,
      startDate,
      startTime: startTime.trim() || undefined,
      endDate,
      endTime: endTime.trim() || undefined,
      durationMin,
      classroom: classroom.trim() || undefined,
      program: program || undefined,
    }
    if (editId) {
      store.updateOtherTask(payload)
      toast.success("Task updated")
    } else {
      store.addOtherTask(payload)
      toast.success("Task created")
    }
    setOpen(false)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Other Tasks"
        description="Non-simulator commitments (meetings, courses, projects). While a task runs, assigned staff are busy and are excluded from exercises and Fill Positions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DayNavigator date={date} onDateChange={setDate} viewAll={viewAll} onViewAllChange={setViewAll} />
            <Button disabled={!canManage} onClick={openAdd}>
              <Plus className="size-4" /> Add Task
            </Button>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        {viewAll ? `All tasks · ${sorted.length} total` : `${formatDate(date)} · ${sorted.length} task(s) active this day`}
      </p>

      <Card>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title={viewAll ? "No tasks defined" : "No tasks on this day"}
              description={
                viewAll
                  ? canManage
                    ? "Add a task to mark staff as busy for its duration."
                    : "No other tasks have been scheduled."
                  : canManage
                    ? "Step to another day, use View all, or add a task to mark staff as busy for its duration."
                    : "No other tasks are scheduled for this day."
              }
            />
          ) : (
            <>
              {/* Desktop: table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Location</TableHead>
                      {canManage && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="font-medium">{t.title}</div>
                          {t.description && (
                            <div className="max-w-md text-pretty text-xs text-muted-foreground">{t.description}</div>
                          )}
                          {t.program && (
                            <Badge variant="outline" className="mt-1">
                              {programDisplay(t.program)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">
                          {formatWindow(t)}
                          {t.durationMin && (
                            <span className="block text-xs text-muted-foreground">{t.durationMin} min</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {t.staffIds.map((id) => {
                              const s = store.staffById(id)
                              return (
                                <Badge key={id} variant="secondary" className="font-normal">
                                  {s ? s.initials : id}
                                </Badge>
                              )
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.classroom || "—"}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(t)} aria-label="Edit task">
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="size-7" onClick={() => setDeleteRec(t)} aria-label="Delete task">
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: stacked cards */}
              <ul className="divide-y md:hidden">
                {sorted.map((t) => (
                  <li key={t.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{t.title}</span>
                      {canManage && (
                        <div className="flex shrink-0 gap-1">
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(t)} aria-label="Edit task">
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => setDeleteRec(t)} aria-label="Delete task">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {t.description && <p className="text-pretty text-xs text-muted-foreground">{t.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <CalendarRange className="size-3.5" /> {formatWindow(t)}
                      </span>
                      {t.durationMin && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3.5" /> {t.durationMin} min
                        </span>
                      )}
                      {t.classroom && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" /> {t.classroom}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <Users className="size-3.5 text-muted-foreground" />
                      {t.staffIds.map((id) => {
                        const s = store.staffById(id)
                        return (
                          <Badge key={id} variant="secondary" className="font-normal">
                            {s ? s.initials : id}
                          </Badge>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Task" : "Add Task"}</DialogTitle>
            <DialogDescription>
              Assigned staff are treated as busy for the task window and excluded from exercises and Fill Positions.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="title">Task title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Safety review" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="description">Describe the task</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this task about?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startTime">Start time</Label>
              <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endTime">End time</Label>
              <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duration">Duration (min)</Label>
              <Input
                id="duration"
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="classroom">Classroom / venue</Label>
              <Input
                id="classroom"
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Program (optional)</Label>
              <Select value={program} onValueChange={(v) => setProgram(v === "ALL" ? "" : (v ?? ""))}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) => (value && value !== "ALL" ? programDisplay(value as string) : "No specific program")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">No specific program</SelectItem>
                  {PROGRAM_OPTIONS.filter(Boolean).map((p) => (
                    <SelectItem key={p} value={p}>
                      {programDisplay(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Assigned staff ({staffIds.length})</Label>
              <ScrollArea className="h-44 rounded-md border p-2">
                <div className="flex flex-col gap-1">
                  {store.scopedStaff.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox checked={staffIds.includes(s.id)} onCheckedChange={() => toggleStaff(s.id)} />
                      <span>
                        {s.firstName} {s.lastName}{" "}
                        <span className="text-muted-foreground">({s.initials})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>{editId ? "Save changes" : "Add task"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteRec}
        onOpenChange={(o) => !o && setDeleteRec(null)}
        title="Delete task?"
        description="This removes the task and frees the assigned staff for scheduling. This cannot be undone."
        onConfirm={() => {
          if (deleteRec) {
            store.deleteOtherTask(deleteRec.id)
            toast.success("Task deleted")
            setDeleteRec(null)
          }
        }}
      />
    </div>
  )
}
