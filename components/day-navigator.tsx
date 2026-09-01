"use client"

/* ===========================================================================
 * DAY NAVIGATOR — shared prev / date-picker / next / Today control
 * ===========================================================================
 * A single reusable day-stepper used by the day-scoped pages (Daily Run
 * Planner, Seating, Other Tasks, Dashboard) so they all navigate days the same
 * way: chevron back, a native date input, chevron forward, and a "Today"
 * reset that disables itself when the selected date already is today.
 * =========================================================================== */
import { ChevronLeft, ChevronRight, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addDaysISO, todayISO } from "@/lib/dates"
import { cn } from "@/lib/utils"

interface DayNavigatorProps {
  /** Currently selected date, ISO (yyyy-mm-dd). */
  date: string
  /** Called with the new ISO date when the user steps or picks a day. */
  onDateChange: (date: string) => void
  /**
   * When defined, renders a "View all" toggle alongside the day controls.
   * `viewAll` is the current mode; `onViewAllChange` flips it. In view-all mode
   * the per-day controls are disabled since they no longer scope the list.
   */
  viewAll?: boolean
  onViewAllChange?: (viewAll: boolean) => void
  className?: string
}

export function DayNavigator({ date, onDateChange, viewAll, onViewAllChange, className }: DayNavigatorProps) {
  const isToday = date === todayISO()
  const hasViewAll = typeof onViewAllChange === "function"
  // In view-all mode the day stepper doesn't scope anything, so dim/disable it.
  const dayDisabled = hasViewAll && viewAll === true
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Button
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        disabled={dayDisabled}
        onClick={() => onDateChange(addDaysISO(date, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Input
        type="date"
        value={date}
        disabled={dayDisabled}
        onChange={(e) => e.target.value && onDateChange(e.target.value)}
        className="h-8 w-auto shrink-0"
        aria-label="Selected date"
      />
      <Button
        variant="outline"
        size="icon"
        className="size-8 shrink-0"
        disabled={dayDisabled}
        onClick={() => onDateChange(addDaysISO(date, 1))}
        aria-label="Next day"
      >
        <ChevronRight className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        disabled={dayDisabled || isToday}
        onClick={() => onDateChange(todayISO())}
      >
        Today
      </Button>
      {hasViewAll && (
        <Button
          variant={viewAll ? "default" : "outline"}
          size="sm"
          className="shrink-0 gap-1.5"
          aria-pressed={viewAll}
          onClick={() => onViewAllChange!(!viewAll)}
        >
          <List className="size-4" />
          {viewAll ? "Viewing all" : "View all"}
        </Button>
      )}
    </div>
  )
}
