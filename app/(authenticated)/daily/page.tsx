"use client"

/* ===========================================================================
 * SIM DAILY RUN PLANNER PAGE ("/daily") — the day-at-a-time control screen
 * ===========================================================================
 * The main day view: every simulator run scheduled for the chosen date, each
 * shown with its positions and who's assigned. From here you add/edit runs,
 * confirm or cancel them, jump to the seating view, and notify the people on a
 * run. Below the runs, the "Freed staff" panel lists anyone freed up by a
 * cancelled run (with how much downtime they gained) and lets a planner
 * reassign them to another task for the day.
 *
 * CHANGEABLE: the date is taken from the URL (?date=YYYY-MM-DD) and the arrows.
 * Edit/confirm/cancel buttons are gated by the current role's permissions; the
 * run list respects the active RADAR/TOWER program (store.scopedRuns).
 * =========================================================================== */
import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  CheckCircle2,
  XCircle,
  Armchair,
  Clock,
  StickyNote,
  Trash2,
  CalendarClock,
  UserPlus,
} from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared"
import { RunEditorDialog } from "@/components/run-editor-dialog"
import { CancelRunDialog } from "@/components/cancel-run-dialog"
import { NotifyRunDialog } from "@/components/notify-run-dialog"
import { useStore } from "@/lib/store"
import { useScopedDate } from "@/lib/use-scoped-date"
import { can } from "@/lib/permissions"
import { formatDate, addDaysISO } from "@/lib/dates"
import type { Run } from "@/lib/types"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// Format a downtime in minutes as a compact "Xh Ym" string.
function formatDowntime(min: number): string {
  if (min <= 0) return "0m"
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`
}

export default function DailyPage() {
  return (
    <Suspense fallback={null}>
      <DailyPlanner />
    </Suspense>
  )
}

function DailyPlanner() {
  const store = useStore()
  const params = useSearchParams()
  const [date, setDate] = useScopedDate(params.get("date") ?? undefined)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editRun, setEditRun] = useState<Run | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelRun, setCancelRun] = useState<Run | null>(null)

  const canEdit = can(store.currentRole, "edit_run")
  const canConfirm = can(store.currentRole, "confirm_cancel")

  const runs = store.scopedRuns
    .filter((r) => r.date === date)
    .sort((a, b) => a.slotTime.localeCompare(b.slotTime))

  const openNew = () => {
    setEditRun(null)
    setEditorOpen(true)
  }
  const openEdit = (r: Run) => {
    setEditRun(r)
    setEditorOpen(true)
  }
  const doCancel = (r: Run) => {
    setCancelRun(r)
    setCancelOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Daily Run Planner"
        description="Manage all simulator runs for a single day."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" className="size-8" onClick={() => setDate((d) => addDaysISO(d, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-auto" />
            <Button variant="outline" size="icon" className="size-8" onClick={() => setDate((d) => addDaysISO(d, 1))}>
              <ChevronRight className="size-4" />
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    <Button onClick={openNew} disabled={!canEdit}>
                      <Plus className="size-4" /> New Run
                    </Button>
                  </span>
                }
              />
              {!canEdit && <TooltipContent>Requires SUP role or higher</TooltipContent>}
            </Tooltip>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">{formatDate(date)} · {runs.length} run(s)</p>

      {runs.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No runs scheduled"
          description="There are no simulator runs planned for this day."
          action={
            canEdit ? (
              <Button size="sm" onClick={openNew}>
                <Plus className="size-4" /> Add a run
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4">
          {runs.map((run) => {
            const ex = store.exerciseById(run.exerciseId)
            const sim = store.simulatorById(run.simulatorId)
            const asgs = store.assignmentsForRun(run.id)
            const filled = asgs.filter((a) => a.staffId).length
            return (
              <Card key={run.id} className={cn(run.status === "cancelled" && "opacity-70")}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex w-16 flex-col items-center rounded-lg bg-primary/10 px-2 py-2 text-primary">
                      <Clock className="size-4" />
                      <span className="mt-1 text-sm font-semibold tabular-nums">{run.slotTime}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{ex?.code}</h3>
                        <StatusBadge status={run.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">{ex?.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sim?.code} · {sim?.name} · {filled}/{asgs.length} positions
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={
                        <Link href={`/seating?run=${run.id}`}>
                          <Armchair className="size-4" /> Seating
                        </Link>
                      }
                    />
                    <Button variant="outline" size="sm" onClick={() => openEdit(run)} disabled={!canEdit}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                    {filled > 0 && run.status !== "cancelled" && <NotifyRunDialog run={run} />}
                    {run.status !== "confirmed" && run.status !== "cancelled" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          store.updateRunStatus(run.id, "confirmed")
                          toast.success(`${run.id.toUpperCase()} confirmed`)
                        }}
                        disabled={!canConfirm}
                      >
                        <CheckCircle2 className="size-4" /> Confirm
                      </Button>
                    )}
                    {run.status !== "cancelled" && (
                      <Button variant="destructive" size="sm" onClick={() => doCancel(run)} disabled={!canConfirm}>
                        <XCircle className="size-4" /> Cancel
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {asgs.map((a) => {
                      const pos = store.positionById(a.positionId)
                      const s = store.staffById(a.staffId)
                      return (
                        <div
                          key={a.id}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
                            !a.staffId && "border-dashed border-amber-500/50 bg-amber-500/5",
                          )}
                        >
                          <span className="font-medium">{pos?.code}</span>
                          {s ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Avatar className="size-5">
                                <AvatarFallback className="text-[7px]">{s.initials.slice(0, 3)}</AvatarFallback>
                              </Avatar>
                              {s.firstName} {s.lastName[0]}.
                            </span>
                          ) : (
                            <span className="text-amber-600">Unassigned</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {run.notes && (
                    <p className="flex items-start gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      <StickyNote className="mt-0.5 size-3.5 shrink-0" /> {run.notes}
                    </p>
                  )}
                  {run.status === "cancelled" && run.cancellationReason && (
                    <p className="rounded-md bg-red-500/10 p-2 text-xs text-red-600">
                      Cancelled: {run.cancellationReason}
                    </p>
                  )}
                  {run.statusChangedBy && (
                    <p className="text-[11px] text-muted-foreground">
                      Status last changed by {run.statusChangedBy} · {run.statusChangedAt}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <FreedStaffSection date={date} canManage={canEdit} />

      <RunEditorDialog open={editorOpen} onOpenChange={setEditorOpen} run={editRun} defaultDate={date} />
      <CancelRunDialog open={cancelOpen} onOpenChange={setCancelOpen} run={cancelRun} />
    </>
  )
}

// Shows staff freed by cancelled runs on this day, how much downtime each gained,
// and lets a planner reassign them to another (non-sim) task.
function FreedStaffSection({ date, canManage }: { date: string; canManage: boolean }) {
  const store = useStore()
  const [reassign, setReassign] = useState<{ staffId: string; name: string } | null>(null)

  const cancelledRuns = store.scopedRuns.filter((r) => r.date === date && r.status === "cancelled")

  // One row per freed person; if they were on multiple cancelled runs, sum the downtime.
  const freed = new Map<
    string,
    { staffId: string; name: string; initials: string; downtime: number; runs: string[] }
  >()
  for (const run of cancelledRuns) {
    const ex = store.exerciseById(run.exerciseId)
    const downtime = ex?.durationMin ?? 0
    for (const a of store.assignmentsForRun(run.id)) {
      if (!a.staffId) continue
      const s = store.staffById(a.staffId)
      if (!s) continue
      const existing = freed.get(a.staffId)
      const runLabel = `${ex?.code ?? run.exerciseId} ${run.slotTime}`
      if (existing) {
        existing.downtime += downtime
        existing.runs.push(runLabel)
      } else {
        freed.set(a.staffId, {
          staffId: a.staffId,
          name: `${s.firstName} ${s.lastName}`,
          initials: s.initials,
          downtime,
          runs: [runLabel],
        })
      }
    }
  }
  const rows = Array.from(freed.values()).sort((a, b) => b.downtime - a.downtime)

  if (cancelledRuns.length === 0) return null

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-amber-600" />
          <h3 className="font-semibold">Freed staff from cancellations</h3>
          <Badge variant="secondary">{rows.length}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {cancelledRuns.length} cancelled run(s) on {formatDate(date)}. These staff are now available — reassign them
          to another task if needed.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No staff were assigned to the cancelled run(s).</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.staffId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[9px]">{r.initials.slice(0, 3)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">Was on {r.runs.join(", ")}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-sm tabular-nums text-amber-700">
                    <Clock className="size-3.5" /> {formatDowntime(r.downtime)} downtime
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canManage}
                    onClick={() => setReassign({ staffId: r.staffId, name: r.name })}
                  >
                    <UserPlus className="size-4" /> Reassign
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ReassignTaskDialog
        date={date}
        staff={reassign}
        onOpenChange={(o) => !o && setReassign(null)}
      />
    </Card>
  )
}

// Lightweight dialog to assign a freed staff member to a new "other task" for the day.
function ReassignTaskDialog({
  date,
  staff,
  onOpenChange,
}: {
  date: string
  staff: { staffId: string; name: string } | null
  onOpenChange: (open: boolean) => void
}) {
  const store = useStore()
  const [title, setTitle] = useState("")
  const [classroom, setClassroom] = useState("")
  const [duration, setDuration] = useState("")

  const open = !!staff
  const targetId = staff?.staffId

  const submit = () => {
    if (!staff) return
    if (!title.trim()) {
      toast.error("A task title is required")
      return
    }
    const durationMin = duration.trim() ? Number(duration) : undefined
    if (durationMin !== undefined && (Number.isNaN(durationMin) || durationMin <= 0)) {
      toast.error("Duration must be a positive number of minutes")
      return
    }
    store.addOtherTask({
      id: `ot-${Date.now()}`,
      title: title.trim(),
      staffIds: [staff.staffId],
      startDate: date,
      endDate: date,
      classroom: classroom.trim() || undefined,
      durationMin,
    })
    toast.success(`${staff.name} reassigned to "${title.trim()}"`)
    setTitle("")
    setClassroom("")
    setDuration("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {staff?.name}</DialogTitle>
          <DialogDescription>
            Assign a new task for {formatDate(date)}. They will be marked busy and excluded from exercises and Fill
            Positions for the task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="reassign-title">Task title</Label>
            <Input
              id="reassign-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Documentation review, OJT support…"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reassign-room">Classroom / venue</Label>
              <Input
                id="reassign-room"
                value={classroom}
                onChange={(e) => setClassroom(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reassign-duration">Duration (min)</Label>
              <Input
                id="reassign-duration"
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!targetId}>
            Assign task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
