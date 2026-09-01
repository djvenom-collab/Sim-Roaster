"use client"

/* ===========================================================================
 * USER NOTIFICATIONS BELL — the personal inbox in the top bar
 * ===========================================================================
 * The bell icon with an unread count. Opening it lists the notifications sent
 * to the currently acting user (assignment + weekly digests); clicking one
 * opens the full message and marks it read. The "last seen" marker is kept in
 * the browser's localStorage (SEEN_KEY) so the unread badge persists per user.
 * =========================================================================== */
import { useEffect, useMemo, useState } from "react"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { TrainingAttachmentsList } from "@/components/training-attachments"
import { Bell, Mail, MessageSquare, Copy, Inbox, CalendarRange, CalendarClock, GraduationCap, ClipboardCheck, Megaphone, Paperclip, ChevronRight } from "lucide-react"
import type { NotificationChannel, NotificationKind, NotificationRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

const channelMeta: Record<NotificationChannel, { icon: typeof Mail; label: string; className: string }> = {
  email: { icon: Mail, label: "Email", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  sms: { icon: MessageSquare, label: "SMS", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  copy: { icon: Copy, label: "Copied", className: "bg-muted text-muted-foreground border-border" },
}

const kindMeta: Record<NotificationKind, { icon: typeof Mail; short: string; label: string }> = {
  assignment: { icon: ClipboardCheck, short: "Assignment", label: "Assignment" },
  weekly: { icon: CalendarRange, short: "Weekly", label: "Weekly schedule" },
  daily: { icon: CalendarClock, short: "Daily", label: "Daily schedule" },
  training: { icon: GraduationCap, short: "Training", label: "Training" },
  custom: { icon: Megaphone, short: "Message", label: "Message" },
}

const SEEN_KEY = "sim.notificationsSeen"

function readSeen(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}") as Record<string, string>
  } catch {
    return {}
  }
}

function relativeTime(iso: string): string {
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

function NotificationRow({ n, onSelect }: { n: NotificationRecord; onSelect: () => void }) {
  const meta = channelMeta[n.channel]
  const Icon = meta.icon
  const kind = kindMeta[n.kind] ?? kindMeta.assignment
  const KindIcon = kind.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full flex-col gap-1.5 rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", meta.className)}>
          <Icon className="size-3" /> {meta.label}
        </Badge>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
          <KindIcon className="size-3" /> {kind.short}
        </Badge>
        {n.attachments && n.attachments.length > 0 && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            <Paperclip className="size-3" /> {n.attachments.length}
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(n.sentAt)}</span>
      </div>
      <p className="line-clamp-1 text-xs font-medium leading-snug">{n.subject}</p>
      <div className="flex items-center gap-1">
        <p className="line-clamp-1 flex-1 text-[11px] leading-relaxed text-muted-foreground">
          {n.body.replace(/\s+/g, " ").trim()}
        </p>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

function NotificationDetailDialog({
  notification,
  onClose,
}: {
  notification: NotificationRecord | null
  onClose: () => void
}) {
  const meta = notification ? channelMeta[notification.channel] : null
  const Icon = meta?.icon ?? Mail
  const kind = notification ? kindMeta[notification.kind] ?? kindMeta.assignment : null
  const KindIcon = kind?.icon ?? ClipboardCheck
  return (
    <Dialog open={!!notification} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        {notification && (
          <>
            <DialogHeader>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", meta?.className)}>
                  <Icon className="size-3" /> {meta?.label}
                </Badge>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  <KindIcon className="size-3" /> {kind?.label}
                </Badge>
                {notification.simulated && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    Demo
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-base leading-snug">{notification.subject}</DialogTitle>
              <DialogDescription className="text-xs">
                Sent to {notification.to} · {relativeTime(notification.sentAt)} · by {notification.sentBy}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[55vh]">
              <div className="pr-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {notification.body}
                </p>
                {notification.attachments && notification.attachments.length > 0 && (
                  <div className="mt-4">
                    <TrainingAttachmentsList attachments={notification.attachments} />
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function UserNotificationsBell() {
  const { currentUser, notifications, notificationsForStaff, markNotificationRead } = useStore()
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<string>("")
  const [selected, setSelected] = useState<NotificationRecord | null>(null)
  // The unread badge depends on the acting user + a localStorage "last seen"
  // marker, both of which only resolve on the client. Gate the badge on a
  // mounted flag so the first client render matches the server (no badge),
  // avoiding a hydration mismatch, then reveal it after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const staffId = currentUser.staffId
  const received = useMemo(
    () => (staffId ? notificationsForStaff(staffId) : []),
    // notifications dependency ensures the list refreshes as new ones arrive
    [staffId, notificationsForStaff, notifications],
  )

  // Load this user's last-seen marker whenever the acting user changes.
  useEffect(() => {
    if (!staffId) return
    setLastSeen(readSeen()[staffId] ?? "")
  }, [staffId])

  const unread = useMemo(
    () => (lastSeen ? received.filter((n) => n.sentAt > lastSeen).length : received.length),
    [received, lastSeen],
  )

  // When opened, mark the newest notification as seen.
  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && staffId && received.length > 0) {
      const newest = received[0].sentAt
      const map = readSeen()
      map[staffId] = newest
      try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify(map))
      } catch {
        // ignore
      }
      setLastSeen(newest)
    }
  }

  const handleSelect = (n: NotificationRecord) => {
    setSelected(n)
    setOpen(false)
    // Opening the full detail is the "read" event — record a shared read receipt
    // so TL/Admin can see it in the Notification Viewer.
    if (currentUser.staffId === n.staffId) markNotificationRead(n.id)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" className="relative size-8" aria-label="My notifications">
            <Bell className="size-4" />
            {mounted && unread > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
                aria-label={`${unread} unread notifications`}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">My notifications</p>
            <p className="truncate text-xs text-muted-foreground">{currentUser.name}</p>
          </div>
          <Badge variant="outline">{received.length}</Badge>
        </div>
        {received.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Inbox className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No notifications yet</p>
            <p className="text-xs text-muted-foreground">
              Booking and weekly schedule notifications sent to you will appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="flex flex-col gap-2 p-3">
              {received.map((n) => (
                <NotificationRow key={n.id} n={n} onSelect={() => handleSelect(n)} />
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
      <NotificationDetailDialog notification={selected} onClose={() => setSelected(null)} />
    </Popover>
  )
}
