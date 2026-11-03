"use client"

/* ===========================================================================
 * MY NOTIFICATIONS PAGE ("/notifications") — the signed-in user's inbox
 * ===========================================================================
 * Unlike the Notification Viewer (/admin/notifications, a TL/Admin log of
 * everything sent), this page shows ONLY the notifications received by the
 * current user. They can open, flag as important, and delete them. Deleting is
 * a soft delete for the recipient — the admin viewer keeps its audit trail.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { PageHeader, EmptyState } from "@/components/shared"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { NotificationDetailDialog } from "@/components/notification-detail-dialog"
import { InboxItem } from "@/components/my-notifications/inbox-item"
import { Inbox, Search, UserX } from "lucide-react"
import type { NotificationRecord } from "@/lib/types"

type Filter = "all" | "unread" | "important"

export default function MyNotificationsPage() {
  const {
    currentUser,
    notifications,
    notificationsForStaff,
    markNotificationRead,
    toggleNotificationFlag,
    deleteNotification,
  } = useStore()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NotificationRecord | null>(null)

  const staffId = currentUser.staffId
  const inbox = useMemo(
    () => (staffId ? notificationsForStaff(staffId).filter((n) => !n.deletedAt) : []),
    [staffId, notificationsForStaff, notifications],
  )

  const counts = useMemo(
    () => ({
      all: inbox.length,
      unread: inbox.filter((n) => !n.readAt).length,
      important: inbox.filter((n) => n.flagged).length,
    }),
    [inbox],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inbox.filter((n) => {
      if (filter === "unread" && n.readAt) return false
      if (filter === "important" && !n.flagged) return false
      if (!q) return true
      return (
        n.subject.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.sentBy.toLowerCase().includes(q)
      )
    })
  }, [inbox, filter, query])

  const opened = openId ? inbox.find((n) => n.id === openId) ?? null : null

  const handleOpen = (n: NotificationRecord) => {
    setOpenId(n.id)
    markNotificationRead(n.id)
  }

  const handleToggleFlag = (n: NotificationRecord) => {
    toggleNotificationFlag(n.id)
    toast.success(n.flagged ? "Removed important flag" : "Marked as important")
  }

  const confirmDelete = () => {
    if (!pendingDelete) return
    deleteNotification(pendingDelete.id)
    if (openId === pendingDelete.id) setOpenId(null)
    setPendingDelete(null)
    toast.success("Notification deleted")
  }

  if (!staffId) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <PageHeader title="My Notifications" description="Notifications sent to you." />
        <EmptyState
          icon={UserX}
          title="No staff profile linked"
          description="Your account isn't linked to a staff member, so there are no personal notifications to show."
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="My Notifications"
        description={`Everything sent to ${currentUser.name}. Open a message to read it, flag what matters, and delete what you don't need.`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="unread">Unread ({counts.unread})</TabsTrigger>
            <TabsTrigger value="important">Important ({counts.important})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notifications"
            aria-label="Search notifications"
            className="pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={inbox.length === 0 ? "No notifications yet" : "Nothing matches"}
          description={
            inbox.length === 0
              ? "Booking, schedule and training notifications sent to you will appear here."
              : "Try another filter or search term."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Notifications">
          {visible.map((n) => (
            <InboxItem
              key={n.id}
              n={n}
              onOpen={() => handleOpen(n)}
              onToggleFlag={() => handleToggleFlag(n)}
              onDelete={() => setPendingDelete(n)}
            />
          ))}
        </ul>
      )}

      <NotificationDetailDialog
        notification={opened}
        onClose={() => setOpenId(null)}
        onToggleFlag={handleToggleFlag}
        onDelete={(n) => setPendingDelete(n)}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete notification?</DialogTitle>
            <DialogDescription className="text-pretty">
              {pendingDelete ? `"${pendingDelete.subject}" will be removed from your inbox.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
