"use client"

/* ===========================================================================
 * USER NOTIFICATIONS BELL — the personal inbox in the top bar
 * ===========================================================================
 * The bell icon with an unread count. Opening it lists the 7 most recent
 * notifications sent to the currently acting user, with a "View all" link to
 * the full inbox at /notifications. Clicking one opens the full message and
 * marks it read. The "last seen" marker is kept in the browser's localStorage
 * (SEEN_KEY) so the unread badge persists per user.
 * =========================================================================== */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { NotificationDetailDialog } from "@/components/notification-detail-dialog"
import { Bell, Inbox, Paperclip, ChevronRight, Flag, ArrowRight } from "lucide-react"
import type { NotificationRecord } from "@/lib/types"
import { channelMeta, kindMeta, flaggedClassName, relativeTime, previewText } from "@/lib/notification-meta"
import { cn } from "@/lib/utils"

const SEEN_KEY = "sim.notificationsSeen"
const BELL_LIMIT = 7

function readSeen(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}") as Record<string, string>
  } catch {
    return {}
  }
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
      className={cn(
        "group flex w-full flex-col gap-1.5 rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
        n.flagged && "border-amber-500/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", meta.className)}>
          <Icon className="size-3" /> {meta.label}
        </Badge>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
          <KindIcon className="size-3" /> {kind.short}
        </Badge>
        {n.flagged && (
          <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", flaggedClassName)}>
            <Flag className="size-3" /> Important
          </Badge>
        )}
        {n.attachments && n.attachments.length > 0 && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            <Paperclip className="size-3" /> {n.attachments.length}
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(n.sentAt)}</span>
      </div>
      <p className={cn("line-clamp-1 text-xs leading-snug", n.readAt ? "font-medium" : "font-semibold")}>
        {n.subject}
      </p>
      <div className="flex items-center gap-1">
        <p className="line-clamp-1 flex-1 text-[11px] leading-relaxed text-muted-foreground">{previewText(n)}</p>
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  )
}

export function UserNotificationsBell() {
  const {
    currentUser,
    notifications,
    notificationsForStaff,
    markNotificationRead,
    toggleNotificationFlag,
    deleteNotification,
  } = useStore()
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<string>("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The unread badge depends on the acting user + a localStorage "last seen"
  // marker, both of which only resolve on the client. Gate the badge on a
  // mounted flag so the first client render matches the server (no badge),
  // avoiding a hydration mismatch, then reveal it after mount.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const staffId = currentUser.staffId
  const received = useMemo(
    () => (staffId ? notificationsForStaff(staffId).filter((n) => !n.deletedAt) : []),
    // notifications dependency ensures the list refreshes as new ones arrive
    [staffId, notificationsForStaff, notifications],
  )
  const recent = received.slice(0, BELL_LIMIT)
  // Resolve from the live list so flag changes made in the dialog show at once.
  const selected = selectedId ? received.find((n) => n.id === selectedId) ?? null : null

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
    setSelectedId(n.id)
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
      {/* gap-0 + a plain overflow container (not ScrollArea) so the popup's
          background always wraps exactly the rows it shows. */}
      <PopoverContent align="end" className="w-[22rem] gap-0 overflow-hidden p-0">
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
          <div className="flex max-h-[min(65vh,36rem)] flex-col gap-2 overflow-y-auto p-3">
            {recent.map((n) => (
              <NotificationRow key={n.id} n={n} onSelect={() => handleSelect(n)} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {received.length > BELL_LIMIT ? `Showing ${BELL_LIMIT} of ${received.length}` : "Showing all"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setOpen(false)}
            render={<Link href="/notifications" />}
            nativeButton={false}
          >
            View more
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </PopoverContent>
      <NotificationDetailDialog
        notification={selected}
        onClose={() => setSelectedId(null)}
        onToggleFlag={(n) => toggleNotificationFlag(n.id)}
        onDelete={(n) => {
          deleteNotification(n.id)
          setSelectedId(null)
        }}
      />
    </Popover>
  )
}
