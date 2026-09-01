"use client"

/* ===========================================================================
 * STAFF ASSIGN POPOVER — the "pick who sits here" search list
 * ===========================================================================
 * Opens from an empty (or filled) seat and lets you search staff and assign
 * one. Each candidate is scored by evaluateAssignment() (lib/assignment-eval.ts)
 * and shown with a currency badge plus green "eligible" / red "blocked" /
 * amber "warning" hints. Eligible + home-position + soonest-to-expire staff
 * sort to the top. Blocked picks need a manager's manual override + reason.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import { Check, AlertTriangle, Ban } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { evaluateAssignment } from "@/lib/assignment-eval"
import type { Run } from "@/lib/types"
import { StatusBadge } from "@/components/shared"

export function StaffAssignPopover({
  run,
  positionId,
  trigger,
  evalPositionId,
  freeSeat = false,
}: {
  run: Run
  positionId: string
  trigger: React.ReactElement
  /**
   * Position to score candidates against, when it differs from the seat itself.
   * For a flexible support seat linked to a primary position, pass the primary
   * id so the eligible people (those rated & current on it) surface correctly.
   */
  evalPositionId?: string
  /** Unlinked flexible seat: a free support seat anyone may sit — skip the
   * "not validated" hard block so every active staff member is selectable. */
  freeSeat?: boolean
}) {
  const store = useStore()
  // The position used for validity + eligibility scoring (may be the linked
  // primary). Assignment itself always writes to the real seat `positionId`.
  const scorePositionId = evalPositionId ?? positionId
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [overrideTarget, setOverrideTarget] = useState<string | null>(null)
  const [overrideReason, setOverrideReason] = useState("")

  const canOverride = can(store.currentRole, "manual_override")
  const canEdit = can(store.currentRole, "edit_assignment") || can(store.currentRole, "fill_positions")

  // Map of staffId -> position code they already occupy in OTHER positions of this run.
  const seatedElsewhere = new Map<string, string>()
  store.assignmentsForRun(run.id).forEach((a) => {
    if (a.staffId && a.positionId !== positionId) {
      seatedElsewhere.set(a.staffId, store.positionById(a.positionId)?.code ?? "another position")
    }
  })

  const candidates = store.staff
    .filter((s) => s.active)
    .filter((s) =>
      `${s.firstName} ${s.lastName} ${s.initials}`.toLowerCase().includes(search.toLowerCase()),
    )
    .map((s) => {
      const validity = store.validityFor(s.id, scorePositionId)
      const home = s.homePositions.includes(scorePositionId)
      const ev = evaluateAssignment({
        staffId: s.id,
        positionId: scorePositionId,
        exerciseId: run.exerciseId,
        date: run.date,
        validity,
        onLeave: !!store.isOnLeave(s.id, run.date),
        inTraining: !!store.isInTraining(s.id, run.date),
        onOtherTask: store.otherTaskOn(s.id, run.date)?.title ?? null,
        seatedAtInRun: seatedElsewhere.get(s.id) ?? null,
        // Free flexible seat: anyone may support, so don't hard-block on
        // validation for the seat itself.
        isOperational: freeSeat ? true : home,
      })
      return { s, ev, validity, home }
    })
    .sort((a, b) => {
      if (a.ev.ok !== b.ev.ok) return a.ev.ok ? -1 : 1
      if (a.home !== b.home) return a.home ? -1 : 1
      return (a.validity.daysRemaining ?? -999) - (b.validity.daysRemaining ?? -999)
    })

  const assign = (staffId: string, ev: ReturnType<typeof evaluateAssignment>) => {
    if (!ev.ok && !canOverride) {
      toast.error("This assignment is blocked. Manual override requires TL/Admin.")
      return
    }
    if (!ev.ok && canOverride) {
      setOverrideTarget(staffId)
      return
    }
    store.assignStaff(run.id, positionId, staffId)
    toast.success("Staff assigned")
    setOpen(false)
  }

  const confirmOverride = () => {
    if (!overrideTarget) return
    if (!overrideReason.trim()) {
      toast.error("Override reason required")
      return
    }
    store.assignStaff(run.id, positionId, overrideTarget, true, overrideReason.trim())
    toast.warning("Assigned with manual override")
    setOverrideTarget(null)
    setOverrideReason("")
    setOpen(false)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger disabled={!canEdit} render={trigger} />
        <PopoverContent className="w-80 p-0" align="start">
          <div className="border-b p-2">
            <Input
              placeholder="Search staff…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
          </div>
          <ScrollArea className="h-72">
            <div className="p-1">
              <button
                onClick={() => {
                  store.assignStaff(run.id, positionId, null)
                  toast.success("Position cleared")
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
              >
                <Ban className="size-3.5" /> Clear assignment
              </button>
              {candidates.map(({ s, ev, validity, home }) => (
                <button
                  key={s.id}
                  onClick={() => assign(s.id, ev)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                >
                  <Avatar className="mt-0.5 size-7">
                    <AvatarFallback className="text-[9px]">{s.initials.slice(0, 3)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {s.firstName} {s.lastName}
                      </span>
                      {home && <span className="text-[10px] text-muted-foreground">home</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge
                        status={home ? validity.status : "not validated"}
                        className="h-4 px-1 text-[9px]"
                      />
                      {ev.ok ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-emerald-600">
                          <Check className="size-3" /> eligible
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-600">
                          <Ban className="size-3" /> {ev.blocks[0]}
                        </span>
                      )}
                    </div>
                    {ev.warnings.length > 0 && ev.ok && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                        <AlertTriangle className="size-3" /> {ev.warnings[0]}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <Dialog open={!!overrideTarget} onOpenChange={(o) => !o && setOverrideTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-600" /> Manual Override
            </DialogTitle>
            <DialogDescription>
              This staff member does not meet all requirements for this position. As {store.currentRole}, you may
              override with a recorded reason. This is logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ovr">Override reason</Label>
            <Input
              id="ovr"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Operational necessity, supervised by instructor…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmOverride}>Override &amp; assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
