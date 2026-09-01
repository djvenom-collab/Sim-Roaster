"use client"

/* ===========================================================================
 * ASSIGN FREE STAFF POPOVER — the reverse of StaffAssignPopover
 * ===========================================================================
 * Opens from a FREE person on the dashboard and lists everything they can be
 * added to on the day, in three groups:
 *   1. OPEN SIM SEATS — every open seat across the day's runs, each scored with
 *      evaluateAssignment() so eligible seats sort first and blocked ones need a
 *      manager's manual override + reason (same rules as the seating planner,
 *      including flexible support / training seats).
 *   2. OTHER TASKS — the day's non-simulator commitments (meetings, projects,
 *      detachments…). Picking one adds the person to that task's roster.
 *   3. TRAINING — the day's training sessions. Picking one enrols the person as
 *      an attendee (their own instructing sessions are excluded).
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import { Check, AlertTriangle, Ban, CalendarX2, ClipboardList, GraduationCap, Armchair } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { evaluateAssignment } from "@/lib/assignment-eval"
import type { Staff } from "@/lib/types"

export function AssignFreeStaffPopover({
  staff,
  date,
  trigger,
}: {
  staff: Staff
  date: string
  trigger: React.ReactElement
}) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [override, setOverride] = useState<{ runId: string; positionId: string; label: string } | null>(null)
  const [reason, setReason] = useState("")

  const canOverride = can(store.currentRole, "manual_override")
  const canEdit = can(store.currentRole, "edit_assignment") || can(store.currentRole, "fill_positions")

  // Build the list of OPEN seats across the day's non-cancelled runs.
  const seats = store.scopedRuns
    .filter((r) => r.date === date && r.status !== "cancelled")
    .flatMap((run) => {
      const asgs = store.assignmentsForRun(run.id)
      const ex = store.exerciseById(run.exerciseId)
      return run.requiredPositions
        .filter((posId) => {
          // Open = no one seated there yet.
          const a = asgs.find((x) => x.positionId === posId)
          return !a?.staffId
        })
        .map((posId) => {
          const pos = store.positionById(posId)
          const a = asgs.find((x) => x.positionId === posId)
          const isFlexible = pos?.category === "Flexible"
          const linkedId = a?.linkedPositionId ?? null
          const trainingMode = !!a?.trainingMode
          // A flexible seat is scored against its linked primary; training or
          // an unlinked flexible seat is a free seat that waives validation.
          const scoreId = isFlexible && linkedId ? linkedId : posId
          const freeSeat = isFlexible && (trainingMode || !linkedId)
          const validity = store.validityFor(staff.id, scoreId)
          const ev = evaluateAssignment({
            staffId: staff.id,
            positionId: scoreId,
            exerciseId: run.exerciseId,
            date: run.date,
            validity,
            onLeave: !!store.isOnLeave(staff.id, run.date),
            inTraining: !!store.isInTraining(staff.id, run.date),
            onOtherTask: store.otherTaskOn(staff.id, run.date)?.title ?? null,
            seatedAtInRun: null,
            isOperational: freeSeat ? true : staff.homePositions.includes(scoreId),
          })
          return {
            runId: run.id,
            positionId: posId,
            runLabel: `${ex?.code ?? run.exerciseId} · ${run.slotTime}`,
            posCode: pos?.code ?? posId,
            posName: pos?.name ?? "",
            isFlexible,
            trainingMode,
            ev,
          }
        })
    })
    .sort((a, b) => {
      if (a.ev.ok !== b.ev.ok) return a.ev.ok ? -1 : 1
      return a.runLabel.localeCompare(b.runLabel)
    })

  // OTHER TASKS running on this day that the person is not already on.
  const tasks = store.scopedOtherTasks
    .filter((t) => date >= t.startDate && date <= t.endDate && !t.staffIds.includes(staff.id))
    .map((t) => {
      const when = t.startTime && t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime ? `from ${t.startTime}` : "All day"
      return {
        id: t.id,
        title: t.title,
        meta: [when, t.classroom && `Room ${t.classroom}`, t.description].filter(Boolean).join(" · "),
      }
    })
    .sort((a, b) => a.title.localeCompare(b.title))

  // TRAINING sessions on this day the person can join as an attendee (they are
  // not already attending, and it is not a session they instruct).
  const attendingIds = new Set(
    store.trainingAttendance.filter((ta) => ta.staffId === staff.id).map((ta) => ta.sessionId),
  )
  const trainings = store.scopedTrainingSessions
    .filter((t) => t.date === date && t.instructorId !== staff.id && !attendingIds.has(t.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      meta: [t.slotTime, `${t.type}`, t.durationMin ? `${t.durationMin} min` : null]
        .filter(Boolean)
        .join(" · "),
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const nothingToAssign = seats.length === 0 && tasks.length === 0 && trainings.length === 0

  const doAssign = (runId: string, positionId: string) => {
    store.assignStaff(runId, positionId, staff.id)
    toast.success(`${staff.firstName} ${staff.lastName} assigned`)
    setOpen(false)
  }

  const addToTask = (taskId: string) => {
    const task = store.otherTasks.find((t) => t.id === taskId)
    if (!task) return
    store.updateOtherTask({ ...task, staffIds: [...task.staffIds, staff.id] })
    toast.success(`${staff.firstName} ${staff.lastName} added to ${task.title}`)
    setOpen(false)
  }

  const addToTraining = (sessionId: string) => {
    const session = store.trainingSessions.find((t) => t.id === sessionId)
    store.toggleAttendance(sessionId, staff.id)
    toast.success(`${staff.firstName} ${staff.lastName} added to ${session?.title ?? "training"}`)
    setOpen(false)
  }

  const onPick = (seat: (typeof seats)[number]) => {
    if (!seat.ev.ok) {
      if (!canOverride) {
        toast.error("This seat is blocked. Manual override requires TL/Admin.")
        return
      }
      setOverride({ runId: seat.runId, positionId: seat.positionId, label: `${seat.runLabel} — ${seat.posCode}` })
      return
    }
    doAssign(seat.runId, seat.positionId)
  }

  const confirmOverride = () => {
    if (!override) return
    if (!reason.trim()) {
      toast.error("Override reason required")
      return
    }
    store.assignStaff(override.runId, override.positionId, staff.id, true, reason.trim())
    toast.warning("Assigned with manual override")
    setOverride(null)
    setReason("")
    setOpen(false)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger disabled={!canEdit} render={trigger} />
        <PopoverContent className="w-80 p-0" align="end">
          <div className="border-b px-3 py-2">
            <p className="text-sm font-medium">
              Assign {staff.firstName} {staff.lastName}
            </p>
            <p className="text-xs text-muted-foreground">Seats, tasks &amp; training on {date}</p>
          </div>
          <ScrollArea className="max-h-80">
            <div className="p-1">
              {nothingToAssign ? (
                <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
                  <CalendarX2 className="size-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Nothing to assign on this day.</p>
                </div>
              ) : (
                <>
                  {seats.length > 0 && (
                    <>
                      <SectionLabel icon={<Armchair className="size-3" />}>Open sim seats</SectionLabel>
                      {seats.map((seat) => (
                        <button
                          key={`${seat.runId}:${seat.positionId}`}
                          onClick={() => onPick(seat)}
                          className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {seat.posCode}
                              </Badge>
                              {seat.isFlexible && (
                                <Badge variant="secondary" className="text-[9px]">
                                  {seat.trainingMode ? "Training" : "Flex"}
                                </Badge>
                              )}
                              <span className="truncate text-xs text-muted-foreground">{seat.runLabel}</span>
                            </div>
                            {seat.ev.ok ? (
                              <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-emerald-600">
                                <Check className="size-3" /> eligible
                              </span>
                            ) : (
                              <span className="mt-0.5 flex items-center gap-0.5 text-[10px] text-red-600">
                                <Ban className="size-3" /> {seat.ev.blocks[0]}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  {tasks.length > 0 && (
                    <>
                      <SectionLabel icon={<ClipboardList className="size-3" />}>Other tasks</SectionLabel>
                      {tasks.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => addToTask(t.id)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                        >
                          <span className="truncate text-xs font-medium">{t.title}</span>
                          {t.meta && <span className="truncate text-[10px] text-muted-foreground">{t.meta}</span>}
                        </button>
                      ))}
                    </>
                  )}

                  {trainings.length > 0 && (
                    <>
                      <SectionLabel icon={<GraduationCap className="size-3" />}>Training</SectionLabel>
                      {trainings.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => addToTraining(t.id)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                        >
                          <span className="truncate text-xs font-medium">{t.title}</span>
                          {t.meta && <span className="truncate text-[10px] text-muted-foreground">{t.meta}</span>}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={!!override} onOpenChange={(o) => !o && setOverride(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" /> Manual Override
            </DialogTitle>
            <DialogDescription>
              {staff.firstName} {staff.lastName} does not meet all requirements for {override?.label}. As{" "}
              {store.currentRole}, you may override with a recorded reason. This is logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="free-ovr">Override reason</Label>
            <Input
              id="free-ovr"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Operational necessity, supervised by instructor…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverride(null)}>
              Cancel
            </Button>
            <Button onClick={confirmOverride}>Override &amp; assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </div>
  )
}
