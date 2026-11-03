"use client"

import { Inbox, UserX } from "lucide-react"
import { useStore } from "@/lib/store"

/** Shows whether a staff member can read in-app notifications (has an active login). */
export function InboxStatus({ staffId }: { staffId: string }) {
  const { users } = useStore()
  const account = users.find((u) => u.staffId === staffId && u.active)
  if (account) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Inbox className="size-3" aria-hidden="true" /> In-app inbox
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
      <UserX className="size-3" aria-hidden="true" /> No app login — saved for later
    </span>
  )
}
