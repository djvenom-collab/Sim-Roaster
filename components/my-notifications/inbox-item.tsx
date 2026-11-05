"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Flag, Paperclip, Trash2 } from "lucide-react"
import type { NotificationRecord } from "@/lib/types"
import { channelMeta, kindMeta, flaggedClassName, formatSentAt, relativeTime, previewText } from "@/lib/notification-meta"
import { cn } from "@/lib/utils"

export function InboxItem({
  n,
  onOpen,
  onToggleFlag,
  onDelete,
  selected = false,
  onSelect,
}: {
  n: NotificationRecord
  onOpen: () => void
  onToggleFlag: () => void
  onDelete: () => void
  selected?: boolean
  onSelect?: (checked: boolean) => void
}) {
  const meta = channelMeta[n.channel]
  const Icon = meta.icon
  const kind = kindMeta[n.kind] ?? kindMeta.assignment
  const KindIcon = kind.icon
  const unread = !n.readAt

  return (
    <li
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/40 sm:p-4",
        n.flagged && "border-amber-500/40",
      )}
    >
      {onSelect && <Checkbox className="mt-1.5" checked={selected} onCheckedChange={onSelect} aria-label={`Select notification: ${n.subject}`} />}
      <span
        aria-hidden
        className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")}
      />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px]", meta.className)}>
            <Icon className="size-3" /> {meta.label}
          </Badge>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            <KindIcon className="size-3" /> {kind.label}
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
          <time dateTime={n.sentAt} title={formatSentAt(n.sentAt)} className="ml-auto text-xs text-muted-foreground">
            {relativeTime(n.sentAt)}
          </time>
        </div>
        <p className={cn("text-pretty text-sm leading-snug", unread ? "font-semibold" : "font-medium")}>
          {unread && <span className="sr-only">Unread: </span>}
          {n.subject}
        </p>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{previewText(n)}</p>
        <p className="text-xs text-muted-foreground">From {n.sentBy}</p>
      </button>
      <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={onToggleFlag}
                aria-pressed={!!n.flagged}
                aria-label={n.flagged ? "Remove important flag" : "Mark as important"}
              >
                <Flag className={cn("size-4", n.flagged && "fill-current text-amber-500")} />
              </Button>
            }
          />
          <TooltipContent>{n.flagged ? "Remove important" : "Mark important"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
                aria-label="Delete notification"
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </li>
  )
}
