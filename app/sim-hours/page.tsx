"use client"

/* ===========================================================================
 * SIM HOURS UTILIZATION PAGE ("/sim-hours")
 * ===========================================================================
 * Analytics for how much each simulator is used. Two utilisation line charts
 * (one per program) show hours-used per simulator per month, and a breakdown
 * section totals every simulator's hours by run status (confirmed, completed,
 * cancelled, postponed, tentative) for a chosen year.
 *
 * All figures derive from runs × their exercise duration; nothing is edited
 * here. See lib/analytics.ts for the calculations.
 * =========================================================================== */
import { useStore } from "@/lib/store"
import { PageHeader } from "@/components/shared"
import { SimHoursChart } from "@/components/charts/sim-hours-chart"
import { SimHoursStatusChart } from "@/components/charts/sim-hours-status-chart"
import { SimHoursStatusTable } from "@/components/charts/sim-hours-status-table"
import { useChartRange, useSlicerYears } from "@/components/charts/use-chart-range"
import { YTD_VALUE } from "@/components/charts/chart-shell"
import { PROGRAMS, type Program } from "@/lib/program"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function SimHoursPage() {
  const store = useStore()
  const years = useSlicerYears()
  const { value: breakdownValue, setValue: setBreakdownValue, range: breakdownRange } = useChartRange(years)

  // Follow the global program slicer: show only the active program's charts.
  const shownPrograms: Program[] = store.activeProgram === "ALL" ? [...PROGRAMS] : [store.activeProgram]
  const gridCols = shownPrograms.length > 1 ? "xl:grid-cols-2" : ""

  return (
    <div className="space-y-6">
      <PageHeader
        title="SIM Hours Utilization"
        description="Simulator usage per month and a full breakdown of hours by run status, per program."
      />

      {/* Utilisation charts — one line per simulator, split by program */}
      <div className={`grid gap-4 ${gridCols}`}>
        {shownPrograms.map((program) => (
          <SimHoursChart key={program} program={program} />
        ))}
      </div>

      {/* Hours breakdown by status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Hours by Status</h2>
            <p className="text-sm text-muted-foreground">
              Confirmed, completed, cancelled, postponed and tentative hours per simulator.
            </p>
          </div>
          <Select value={breakdownValue} onValueChange={(v) => setBreakdownValue(String(v))}>
            <SelectTrigger className="w-[110px]" aria-label="Select range for breakdown">
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

        {/* Status bar charts — one per program */}
        <div className={`grid gap-4 ${gridCols}`}>
          {shownPrograms.map((program) => (
            <SimHoursStatusChart key={program} program={program} range={breakdownRange} />
          ))}
        </div>

        {/* Status breakdown tables — one per program */}
        <div className={`grid gap-4 ${gridCols}`}>
          {shownPrograms.map((program) => (
            <SimHoursStatusTable key={program} program={program} range={breakdownRange} />
          ))}
        </div>
      </div>
    </div>
  )
}
