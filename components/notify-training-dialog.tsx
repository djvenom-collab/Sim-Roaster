"use client"

/* ===========================================================================
 * NOTIFY TRAINING DIALOG — message instructor + attendees of a session
 * ===========================================================================
 * Like the run notifier but for a training session: lists the instructor and
 * enrolled attendees and sends each one a combined daily digest (so it also
 * covers any seating they have that day). Uses the useNotify hook
 * (lib/use-notify.ts). Hidden unless the role has the notify_staff permission.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { useNotify } from "@/lib/use-notify"
import { can } from "@/lib/permissions"
import { buildDailyMessage } from "@/lib/notify"
import { deliveryToast, bulkDeliveryToast } from "@/lib/delivery-toast"
import { InboxStatus } from "@/components/inbox-status"
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Send, Inbox, Copy, Loader2, Users, GraduationCap } from "lucide-react"
import { formatDate } from "@/lib/dates"
import type { TrainingSession } from "@/lib/types"

// Per-person quick actions inside the dialog. Sends the combined daily digest
// so the message also covers any seating the person has that same day.
function PersonNotify({ staffId, date }: { staffId: string; date: string }) {
  const { buildDailyContext, sendDailyEmail } = useNotify()
  const ctx = buildDailyContext(staffId, date)
  if (!ctx) return null
  const msg = buildDailyMessage(ctx)

  const send = async () => {
    try {
      const res = await sendDailyEmail(ctx)
      deliveryToast(ctx.staff.firstName, res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send notification")
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${msg.subject}\n\n${msg.body}`)
      toast.success("Message copied to clipboard")
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="size-7" aria-label="Notify person">
            <Send className="size-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          Notify {ctx.staff.firstName} {ctx.staff.lastName}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={send}>
          <Inbox className="text-muted-foreground" /> Send to in-app inbox
        </DropdownMenuItem>
        <DropdownMenuItem onClick={copy}>
          <Copy className="text-muted-foreground" /> Copy message
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NotifyTrainingDialog({
  session,
  trigger,
}: {
  session: TrainingSession
  trigger?: React.ReactElement
}) {
  const store = useStore()
  const { buildDailyContext, sendDailyEmail } = useNotify()
  const [open, setOpen] = useState(false)
  const [sendingAll, setSendingAll] = useState(false)

  // Notifying training attendees requires the notify_staff permission.
  if (!can(store.currentRole, "notify_staff")) return null

  // Recipients = enrolled attendees + the instructor (deduped).
  const attendeeIds = store.trainingAttendance
    .filter((a) => a.sessionId === session.id)
    .map((a) => a.staffId)
  const recipientIds = Array.from(new Set([...attendeeIds, session.instructorId]))
  const recipients = recipientIds
    .map((id) => ({ staff: store.staffById(id), isInstructor: id === session.instructorId }))
    .filter((x): x is { staff: NonNullable<typeof x.staff>; isInstructor: boolean } => !!x.staff)

  const handleSendAll = async () => {
    setSendingAll(true)
    let ok = 0
    let fail = 0
    let noAccount = 0
    for (const { staff } of recipients) {
      const ctx = buildDailyContext(staff.id, session.date)
      if (!ctx) {
        fail++
        continue
      }
      try {
        const res = await sendDailyEmail(ctx)
        if (!res.hasAccount) noAccount++
        ok++
      } catch {
        fail++
      }
    }
    setSendingAll(false)
    if (ok > 0) store.markNotified(`training:${session.id}`)
    bulkDeliveryToast(ok, fail, noAccount)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm">
              <Send className="size-4" /> Notify attendees
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notify training attendees</DialogTitle>
          <DialogDescription>
            {session.title} · {formatDate(session.date)} · {session.slotTime} — each person gets one combined
            schedule for the day, including any seating they also have.
          </DialogDescription>
        </DialogHeader>

        {recipients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <Users className="size-8 opacity-50" />
            No attendees or instructor to notify yet.
          </div>
        ) : (
          <div className="space-y-2">
            {recipients.map(({ staff, isInstructor }) => (
              <div
                key={staff.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    {isInstructor && (
                      <Badge variant="outline" className="gap-1">
                        <GraduationCap className="size-3" /> Instructor
                      </Badge>
                    )}
                    <span className="truncate text-sm font-medium">
                      {staff.firstName} {staff.lastName}
                    </span>
                  </div>
                  <InboxStatus staffId={staff.id} />
                </div>
                <PersonNotify staffId={staff.id} date={session.date} />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={handleSendAll} disabled={sendingAll || recipients.length === 0}>
            {sendingAll ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send all in-app
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
