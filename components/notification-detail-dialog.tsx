"use client"

/* ===========================================================================
 * NOTIFICATION DETAIL DIALOG — full message view for the recipient
 * ===========================================================================
 * Shared by the top-bar bell and the My Notifications page. When onToggleFlag /
 * onDelete are passed, the footer offers "Mark important" and "Delete".
 * =========================================================================== */
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { TrainingAttachmentsList } from "@/components/training-attachments"
import { Flag, Mail, ClipboardCheck, Trash2 } from "lucide-react"
import type { NotificationRecord } from "@/lib/types"
import { channelMeta, kindMeta, flaggedClassName, formatSentAt } from "@/lib/notification-meta"
import { cn } from "@/lib/utils"

export function NotificationDetailDialog({
  notification,
  onClose,
  onToggleFlag,
  onDelete,
}: {
  notification: NotificationRecord | null
  onClose: () => void
  onToggleFlag?: (n: NotificationRecord) => void
  onDelete?: (n: NotificationRecord) => void
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
                {notification.flagged && (
                  <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", flaggedClassName)}>
                    <Flag className="size-3" /> Important
                  </Badge>
                )}
                {notification.simulated && (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    Demo
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-base leading-snug">{notification.subject}</DialogTitle>
              <DialogDescription className="text-xs">
                Sent to {notification.to} · {formatSentAt(notification.sentAt)} · by {notification.sentBy}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[55vh] overflow-y-auto pr-1">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{notification.body}</p>
              {notification.attachments && notification.attachments.length > 0 && (
                <div className="mt-4">
                  <TrainingAttachmentsList attachments={notification.attachments} />
                </div>
              )}
            </div>
            {(onToggleFlag || onDelete) && (
              <DialogFooter className="gap-2 sm:justify-between">
                {onToggleFlag && (
                  <Button variant="outline" size="sm" onClick={() => onToggleFlag(notification)}>
                    <Flag className={cn("size-4", notification.flagged && "fill-current text-amber-500")} />
                    {notification.flagged ? "Remove important" : "Mark important"}
                  </Button>
                )}
                {onDelete && (
                  <Button variant="destructive" size="sm" onClick={() => onDelete(notification)}>
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                )}
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
