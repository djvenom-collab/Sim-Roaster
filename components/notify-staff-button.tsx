"use client"

/* ===========================================================================
 * NOTIFY STAFF BUTTON — message one person about one seat
 * ===========================================================================
 * A small per-seat dropdown button: deliver the assignment notice to the
 * person's in-app inbox (this prototype has no email/SMS provider), or copy
 * the message. Uses the useNotify hook (lib/use-notify.ts); wording comes from
 * lib/notify.ts. Hidden unless the role has the notify_staff permission.
 * =========================================================================== */
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Send, Inbox, Copy } from "lucide-react"
import { useNotify } from "@/lib/use-notify"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { buildAssignmentMessage } from "@/lib/notify"
import { deliveryToast } from "@/lib/delivery-toast"
import type { Run } from "@/lib/types"

export function NotifyStaffButton({
  run,
  staffId,
  positionId,
  trigger,
}: {
  run: Run
  staffId: string
  positionId: string
  trigger?: React.ReactElement
}) {
  const { buildContext, sendEmail, recordHandoff } = useNotify()
  const { currentRole } = useStore()
  const ctx = buildContext(run, staffId, positionId)
  if (!ctx) return null
  // Sending staff notifications is gated by the notify_staff permission.
  if (!can(currentRole, "notify_staff")) return null

  const msg = buildAssignmentMessage(ctx)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${msg.subject}\n\n${msg.body}`)
      recordHandoff({
        staffId: ctx.staff.id,
        channel: "copy",
        kind: "assignment",
        subject: msg.subject,
        body: msg.body,
        to: "clipboard",
      })
      toast.success("Message copied to clipboard")
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }

  const handleSend = async () => {
    try {
      const res = await sendEmail(ctx)
      deliveryToast(ctx.staff.firstName, res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send notification")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon" className="size-7" aria-label="Notify staff">
              <Send className="size-4" />
            </Button>
          )
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">
            Notify {ctx.staff.firstName} {ctx.staff.lastName}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSend}>
          <Inbox className="text-muted-foreground" /> Send to in-app inbox
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopy}>
          <Copy className="text-muted-foreground" /> Copy message
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
