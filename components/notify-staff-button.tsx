"use client"

/* ===========================================================================
 * NOTIFY STAFF BUTTON — message one person about one seat
 * ===========================================================================
 * A small per-seat dropdown button: send the assignment email now, open it in
 * the user's email app, send as SMS, or copy the message. Uses the useNotify
 * hook (lib/use-notify.ts); wording comes from lib/notify.ts. Hidden unless the
 * role has the notify_staff permission.
 * =========================================================================== */
import { useState } from "react"
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
import { Send, Mail, MessageSquare, Copy, Loader2 } from "lucide-react"
import { useNotify } from "@/lib/use-notify"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { buildAssignmentMessage, buildSmsBody, mailtoHref, smsHref } from "@/lib/notify"
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
  const [sending, setSending] = useState(false)
  const ctx = buildContext(run, staffId, positionId)
  if (!ctx) return null
  // Sending staff notifications is gated by the notify_staff permission.
  if (!can(currentRole, "notify_staff")) return null

  const msg = buildAssignmentMessage(ctx)
  const smsBody = buildSmsBody(ctx)

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

  const handleMailto = () => {
    recordHandoff({
      staffId: ctx.staff.id,
      channel: "email",
      kind: "assignment",
      subject: msg.subject,
      body: msg.body,
      to: ctx.staff.email,
    })
  }

  const handleSms = () => {
    recordHandoff({
      staffId: ctx.staff.id,
      channel: "sms",
      kind: "assignment",
      subject: msg.subject,
      body: smsBody,
      to: ctx.staff.phone,
    })
  }

  const handleSend = async () => {
    setSending(true)
    try {
      const res = await sendEmail(ctx)
      toast.success(
        res.simulated
          ? `Email prepared for ${ctx.staff.firstName} (demo mode — no key configured)`
          : `Email sent to ${ctx.staff.firstName}`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send email")
    } finally {
      setSending(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <Button variant="ghost" size="icon" className="size-7" aria-label="Notify staff">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
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
        <DropdownMenuItem onClick={handleSend} disabled={sending}>
          <Send className="text-muted-foreground" /> Send email now
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<a href={mailtoHref(ctx.staff.email, msg)} />}
          disabled={!ctx.staff.email}
          onClick={handleMailto}
        >
          <Mail className="text-muted-foreground" /> Open in email app
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<a href={smsHref(ctx.staff.phone, smsBody)} />}
          disabled={!ctx.staff.phone}
          onClick={handleSms}
        >
          <MessageSquare className="text-muted-foreground" /> Send SMS
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopy}>
          <Copy className="text-muted-foreground" /> Copy message
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
