import type { NotificationRecord } from "./types"

// Recipient soft-delete: preserve receipts, flags, attachments and admin history.
// Return the original array when nothing changes to avoid unnecessary autosaves.
export function deleteOwnNotifications(
  notifications: NotificationRecord[],
  ids: readonly string[],
  staffId: string | undefined,
  deletedAt: string,
): NotificationRecord[] {
  if (!staffId || ids.length === 0) return notifications
  const selected = new Set(ids)
  let changed = false
  const next = notifications.map((n) => {
    if (!selected.has(n.id) || n.staffId !== staffId || n.deletedAt) return n
    changed = true
    return { ...n, deletedAt }
  })
  return changed ? next : notifications
}
