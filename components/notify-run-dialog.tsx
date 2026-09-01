"use client"

/* ===========================================================================
 * NOTIFY RUN DIALOG — message everyone assigned to a run
 * ===========================================================================
 * Lists the staff assigned to one run and lets you notify each person, or
 * "Send all" which emails each person ONE combined daily digest (covering this
 * run plus any other seating/training they have that day). Uses the useNotify
 * hook (lib/use-notify.ts); wording comes from lib/notify.ts. Hidden unless the
 * role has the notify_staff permission.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { useNotify } from "@/lib/use-notify"
import { can } from "@/lib/permissions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { NotifyStaffButton } from "@/components/notify-staff-button"
import { Send, Mail, Phone, Loader2, Users } from "lucide-react"
import { formatDate } from "@/lib/dates"
import type { Run } from "@/lib/types"

export function NotifyRunDialog({ run, trigger }: { run: Run; trigger?: React.ReactElement }) {
  const store = useStore()
  const { buildDailyContext, sendDailyEmail } = useNotify()
  const [open, setOpen] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)

  // Per-run notifications require the notify_staff permission.
  if (!can(store.currentRole, "notify_staff")) return null

  const ex = store.exerciseById(run.exerciseId)
  const assigned = store
    .assignmentsForRun(run.id)
    .filter((a) => a.staffId)
    .map((a) => ({ staff: store.staffById(a.staffId as string), positionId: a.positionId }))
    .filter((x): x is { staff: NonNullable<typeof x.staff>; positionId: string } => !!x.staff)

  const handleSendAll = async () => {
    setSendingAll(true)
    let ok = 0
    let fail = 0
    let simulated = false
    // Each person gets ONE combined daily digest covering this run plus any
    // other seating or training they have on the same day.
    const seen = new Set<string>()
    for (const { staff } of assigned) {
      if (seen.has(staff.id)) continue
      seen.add(staff.id)
      const ctx = buildDailyContext(staff.id, run.date)
      if (!ctx) {
        fail++
        continue
      }
      try {
        const res = await sendDailyEmail(ctx)
        if (res.simulated) simulated = true
        ok++
      } catch {
        fail++
      }
    }
    setSendingAll(false)
    if (ok > 0) store.markNotified(`run:${run.id}`)
    if (ok > 0 && fail === 0)
      toast.success(
        simulated
          ? `Prepared ${ok} email(s) (demo mode — no key configured)`
          : `Sent ${ok} email(s) to assigned staff`,
      )
    else if (ok > 0) toast.warning(`Sent ${ok}, failed ${fail}`)
    else toast.error("Could not send emails")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm">
              <Send className="size-4" /> Notify staff
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notify assigned staff</DialogTitle>
          <DialogDescription>
            {ex?.code} · {formatDate(run.date)} · {run.slotTime} — &ldquo;Send all&rdquo; emails each person one
            combined schedule for the day, including any training they also have.
          </DialogDescription>
        </DialogHeader>

        {assigned.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <Users className="size-8 opacity-50" />
            No staff are assigned to this run yet.
          </div>
        ) : (
          <div className="space-y-2">
            {assigned.map(({ staff, positionId }) => {
              const pos = store.positionById(positionId)
              return (
                <div
                  key={positionId}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {pos?.code}
                      </Badge>
                      <span className="truncate text-sm font-medium">
                        {staff.firstName} {staff.lastName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" /> {staff.email || "no email"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {staff.phone || "no phone"}
                      </span>
                    </div>
                  </div>
                  <NotifyStaffButton run={run} staffId={staff.id} positionId={positionId} />
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={handleSendAll} disabled={sendingAll || assigned.length === 0}>
            {sendingAll ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send all emails
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
