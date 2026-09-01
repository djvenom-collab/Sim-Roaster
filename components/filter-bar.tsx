"use client"

/* ===========================================================================
 * FILTER BAR — the shared row of dropdown filters on calendar pages
 * ===========================================================================
 * Renders the staff / position / simulator / exercise / training / status
 * dropdowns used by the Monthly and Weekly planners. It just reports the chosen
 * values back via onChange; the actual filtering happens in
 * lib/use-calendar-data.ts.
 * CHANGEABLE: pass a `hide` list of filter keys to drop filters off a page.
 * =========================================================================== */
import { Filter, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store"
import { emptyFilters, type CalendarFilters } from "@/lib/use-calendar-data"

interface Props {
  filters: CalendarFilters
  onChange: (f: CalendarFilters) => void
  hide?: (keyof CalendarFilters)[]
}

export function FilterBar({ filters, onChange, hide = [] }: Props) {
  const store = useStore()
  const set = (key: keyof CalendarFilters, value: string) => onChange({ ...filters, [key]: value })
  const trainingTypes = Array.from(new Set(store.scopedTrainingSessions.map((t) => t.type)))
  const dirty = JSON.stringify(filters) !== JSON.stringify(emptyFilters)

  const field = (
    key: keyof CalendarFilters,
    label: string,
    options: { value: string; label: string }[],
  ) =>
    hide.includes(key) ? null : (
      <Select value={filters[key]} onValueChange={(v) => set(key, v)}>
        <SelectTrigger size="sm" className="h-8 w-auto min-w-[120px]">
          <SelectValue placeholder={label}>
            {(value) => {
              if (!value || value === "all") return `${label}: All`
              return options.find((o) => o.value === value)?.label ?? `${label}: All`
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{label}: All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
        <Filter className="size-3.5" /> Filters
      </span>
      {field(
        "staffId",
        "Staff",
        store.scopedStaff.map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` })),
      )}
      {field(
        "positionId",
        "Position",
        store.scopedPositions.map((p) => ({ value: p.id, label: p.code })),
      )}
      {field(
        "simulatorId",
        "Simulator",
        store.scopedSimulators.map((s) => ({ value: s.id, label: s.code })),
      )}
      {field(
        "exerciseId",
        "Exercise",
        store.scopedExercises.map((e) => ({ value: e.id, label: e.code })),
      )}
      {field(
        "trainingType",
        "Training",
        trainingTypes.map((t) => ({ value: t, label: t })),
      )}
      {field(
        "status",
        "Status",
        ["tentative", "confirmed", "cancelled", "postponed", "completed"].map((s) => ({
          value: s,
          label: s[0].toUpperCase() + s.slice(1),
        })),
      )}
      {dirty && (
        <Button variant="ghost" size="sm" className="h-8" onClick={() => onChange(emptyFilters)}>
          <X className="size-3.5" /> Clear
        </Button>
      )}
    </div>
  )
}
