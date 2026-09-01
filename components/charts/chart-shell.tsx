"use client"

/* ===========================================================================
 * CHART SHELL — shared card + range selector wrapper for the analytics charts
 * ===========================================================================
 * Every trend chart looks the same: a titled card with an icon, an optional
 * subtitle, and a range <Select> in the top-right corner offering "YTD" plus
 * each available year. This component holds that chrome so the individual
 * charts only supply their title and their chart body.
 *
 * When `href` is provided the card header becomes a link to the matching
 * full-page view (used on the dashboard so a graph clicks through to its page).
 * =========================================================================== */
import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LucideIcon } from "lucide-react"

// Value used by the range <Select> to mean "year to date".
export const YTD_VALUE = "ytd"

interface ChartShellProps {
  title: string
  description?: string
  icon?: LucideIcon
  years: number[]
  /** Current selector value: "ytd" or a year as a string. */
  value: string
  onValueChange: (value: string) => void
  /** When set, the header links through to this page. */
  href?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartShell({
  title,
  description,
  icon: Icon,
  years,
  value,
  onValueChange,
  href,
  action,
  children,
  className,
}: ChartShellProps) {
  const titleNode = (
    <CardTitle className="flex items-center gap-2 text-base">
      {Icon ? <Icon className="size-4 text-primary" /> : null}
      {title}
      {href ? <ArrowUpRight className="size-4 text-muted-foreground" /> : null}
    </CardTitle>
  )

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          {href ? (
            <Link
              href={href}
              className="group inline-block rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${title} — open full page`}
            >
              {titleNode}
            </Link>
          ) : (
            titleNode
          )}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {href ? (
            <Button
              variant="outline"
              size="icon"
              nativeButton={false}
              className="size-9 shrink-0"
              render={
                <Link href={href} aria-label={`Open ${title} page`}>
                  <ArrowUpRight className="size-4" />
                </Link>
              }
            />
          ) : null}
          <Select value={value} onValueChange={(v) => onValueChange(String(v))}>
            <SelectTrigger className="w-[110px]" aria-label="Select range">
              <SelectValue>{(v) => (v === YTD_VALUE ? "YTD" : v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={YTD_VALUE}>YTD</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
