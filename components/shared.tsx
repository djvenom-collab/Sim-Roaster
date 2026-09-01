/* ===========================================================================
 * SHARED UI BITS — small building blocks reused across pages
 * ===========================================================================
 * Three little components used everywhere so pages look consistent:
 *   - PageHeader: the title + description + action-buttons row at the top.
 *   - StatusBadge: a coloured pill for a status word (colours from lib/dates).
 *   - EmptyState: the centred "nothing here yet" placeholder with an icon.
 * These are presentation-only; they hold no data of their own.
 * =========================================================================== */
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { statusColor } from "@/lib/dates"
import type { ReactNode } from "react"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-pretty text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("capitalize", statusColor(status), className)}
    >
      {status}
    </Badge>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
