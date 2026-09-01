"use client"

/* ===========================================================================
 * LEAVE TREND CHART — total leave days taken per month, RADAR vs TOWER
 * ===========================================================================
 * One grouped bar chart: each month of the selected year gets a RADAR bar and
 * a TOWER bar showing how many leave days were taken. Staff who belong to both
 * departments count on both bars. A year selector switches the year in place.
 *
 * SLICER: follows the global slicer. The year dropdown is constrained to the
 * selected year range, and only the active program's bars are drawn (Radar-only
 * when Radar is selected, Tower-only when Tower, both when ALL).
 * =========================================================================== */
import { useMemo } from "react"
import { CalendarOff } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useStore } from "@/lib/store"
import { applyRange, leaveTrendByMonth } from "@/lib/analytics"
import { PROGRAMS, type Program } from "@/lib/program"
import { ChartShell } from "./chart-shell"
import { useChartRange, useSlicerYears } from "./use-chart-range"

const config = {
  RADAR: { label: "Radar", color: "var(--chart-1)" },
  TOWER: { label: "Tower", color: "var(--chart-2)" },
} satisfies ChartConfig

export function LeaveTrendChart({ className, href }: { className?: string; href?: string }) {
  const store = useStore()
  const years = useSlicerYears()
  const { value, setValue, range } = useChartRange(years)

  // Which program series to draw, per the global program slicer.
  const shown: Program[] = store.activeProgram === "ALL" ? [...PROGRAMS] : [store.activeProgram]

  const data = useMemo(
    () => applyRange(leaveTrendByMonth(store.leaveRecords, store.staffById, range.year), range),
    [store.leaveRecords, store.staffById, range],
  )
  const total = useMemo(
    () => data.reduce((sum, r) => sum + shown.reduce((s, p) => s + r[p], 0), 0),
    [data, shown],
  )
  const shownLabel = shown.map((p) => config[p].label).join(" & ")
  const description = range.ytd
    ? `${total} leave-days (${shownLabel}) YTD ${range.year}`
    : `${total} leave-days (${shownLabel}) in ${range.year}`

  return (
    <ChartShell
      title="Leave Taken"
      description={description}
      icon={CalendarOff}
      years={years}
      value={value}
      onValueChange={setValue}
      href={href}
      className={className}
    >
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {shown.includes("RADAR") && <Bar dataKey="RADAR" fill="var(--color-RADAR)" radius={[3, 3, 0, 0]} />}
          {shown.includes("TOWER") && <Bar dataKey="TOWER" fill="var(--color-TOWER)" radius={[3, 3, 0, 0]} />}
        </BarChart>
      </ChartContainer>
    </ChartShell>
  )
}
