/* ===========================================================================
 * NOTIFICATION META — shared labels, icons and time formatting
 * ===========================================================================
 * Used by the top-bar bell (components/user-notifications-bell.tsx) and the
 * personal inbox page (app/notifications/page.tsx) so both render a
 * notification the same way.
 * =========================================================================== */
import {
  Inbox,
  Mail,
  MessageSquare,
  Copy,
  CalendarRange,
  CalendarClock,
  GraduationCap,
  ClipboardCheck,
  Megaphone,
  type LucideIcon,
} from "lucide-react"
import type { NotificationChannel, NotificationKind, NotificationRecord } from "@/lib/types"

export const channelMeta: Record<NotificationChannel, { icon: LucideIcon; label: string; className: string }> = {
  in_app: { icon: Inbox, label: "In-app", className: "bg-primary/15 text-primary border-primary/30" },
  email: { icon: Mail, label: "Email", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  sms: { icon: MessageSquare, label: "SMS", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  copy: { icon: Copy, label: "Copied", className: "bg-muted text-muted-foreground border-border" },
}

export const kindMeta: Record<NotificationKind, { icon: LucideIcon; short: string; label: string }> = {
  assignment: { icon: ClipboardCheck, short: "Assignment", label: "Assignment" },
  weekly: { icon: CalendarRange, short: "Weekly", label: "Weekly schedule" },
  daily: { icon: CalendarClock, short: "Daily", label: "Daily schedule" },
  training: { icon: GraduationCap, short: "Training", label: "Training" },
  custom: { icon: Megaphone, short: "Message", label: "Message" },
}

export const flaggedClassName = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

export function formatSentAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function previewText(n: NotificationRecord): string {
  return n.body.replace(/\s+/g, " ").trim()
}
