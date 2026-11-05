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
import { Checkbox } from "@/components/ui/checkbox"
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
import { Inbox, Search, UserX, Trash2 } from "lucide-react"
import type { NotificationRecord } from "@/lib/types"

type Filter = "all" | "unread" | "important"

export default function MyNotificationsPage() {
  const {
    currentUser,
    notificationsReady,
    notificationsForStaff,
    markNotificationRead,
    toggleNotificationFlag,
    deleteNotification,
    deleteNotifications,
  } = useStore()
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NotificationRecord | null>(null)

  const [selection, setSelection] = useState<{ scope: string; ids: string[] }>({ scope: "", ids: [] })
  const [pendingBulk, setPendingBulk] = useState<{ scope: string; ids: string[] } | null>(null)

  const staffId = currentUser.staffId
  const inbox = useMemo(
    () => (notificationsReady && staffId ? notificationsForStaff(staffId).filter((n) => !n.deletedAt) : []),
    [notificationsReady, staffId, notificationsForStaff],
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

  // Selection applies only to the current recipient/filter/search results.
  // Hidden rows are never silently included in a bulk delete.
  const scope = JSON.stringify([staffId, filter, query])
  const visibleIds = new Set(visible.map((n) => n.id))
  const selectedIds = selection.scope === scope ? selection.ids.filter((id) => visibleIds.has(id)) : []
  const selectedSet = new Set(selectedIds)
  const bulkIds = pendingBulk?.scope === scope ? pendingBulk.ids.filter((id) => visibleIds.has(id)) : []
  const toggleSelection = (id: string, checked: boolean) => {
    setSelection({ scope, ids: checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((value) => value !== id) })
  }
  const changeFilter = (value: Filter) => {
    setFilter(value)
    setSelection({ scope: "", ids: [] })
    setPendingBulk(null)
  }
  const confirmBulkDelete = () => {
    if (!bulkIds.length) return
    deleteNotifications(bulkIds)
    if (openId && bulkIds.includes(openId)) setOpenId(null)
    setSelection({ scope, ids: [] })
    setPendingBulk(null)
    toast.success(`${bulkIds.length} notifications removed from your inbox`)
  }

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

  if (!notificationsReady) {
    return <div className="p-4 md:p-6"><PageHeader title="My Notifications" description="Notifications sent to you." /><p role="status" className="py-10 text-sm text-muted-foreground">Notifications are not loaded yet. If this persists, reload to retry.</p></div>
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
        <Tabs value={filter} onValueChange={(v) => changeFilter(v as Filter)}>
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
            onChange={(e) => { setQuery(e.target.value); setSelection({ scope: "", ids: [] }); setPendingBulk(null) }}
            placeholder="Search notifications"
            aria-label="Search notifications"
            className="pl-8"
          />
        </div>
      </div>

      {visible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={selectedIds.length === visible.length}
              indeterminate={selectedIds.length > 0 && selectedIds.length < visible.length}
              onCheckedChange={(checked) => setSelection({ scope, ids: checked ? visible.map((n) => n.id) : [] })}
            />
            Select all shown ({visible.length})
          </label>
          <span role="status" className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
          <Button variant="outline" disabled={!selectedIds.length} onClick={() => setSelection({ scope, ids: [] })}>Clear selection</Button>
          <Button variant="destructive" disabled={!selectedIds.length} onClick={() => setPendingBulk({ scope, ids: [...selectedIds] })}>
            <Trash2 className="size-4" /> Delete selected ({selectedIds.length})
          </Button>
        </div>
      )}

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
              selected={selectedSet.has(n.id)}
              onSelect={(checked) => toggleSelection(n.id, checked)}
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

      <Dialog open={bulkIds.length > 0} onOpenChange={(value) => { if (!value) setPendingBulk(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {bulkIds.length} selected notifications?</DialogTitle>
            <DialogDescription>These messages will be removed from your inbox. Their history remains available in the administrator notification viewer.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingBulk(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmBulkDelete}>Delete {bulkIds.length} notifications</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
