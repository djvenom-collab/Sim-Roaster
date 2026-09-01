"use client"

/* ===========================================================================
 * TRAINING TREND CHART — training sessions per month, RADAR vs TOWER
 * ===========================================================================
 * A line chart with one line per department showing how many training sessions
 * ran in each month of the selected year. A session's program is taken from its
 * simulator, else its instructor; unresolved sessions count on both lines.
 *
 * SLICER: follows the global slicer. The year dropdown is constrained to the
 * selected year range, and only the active program's line is drawn (Radar-only
 * when Radar is selected, Tower-only when Tower, both when ALL).
 * =========================================================================== */
import { useMemo } from "react"
import { GraduationCap } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useStore } from "@/lib/store"
import { applyRange, trainingTrendByMonth } from "@/lib/analytics"
import { PROGRAMS, type Program } from "@/lib/program"
import { ChartShell } from "./chart-shell"
import { useChartRange, useSlicerYears } from "./use-chart-range"

const config = {
  RADAR: { label: "Radar", color: "var(--chart-1)" },
  TOWER: { label: "Tower", color: "var(--chart-2)" },
} satisfies ChartConfig

export function TrainingTrendChart({ className, href }: { className?: string; href?: string }) {
  const store = useStore()
  const years = useSlicerYears()
  const { value, setValue, range } = useChartRange(years)

  // Which program series to draw, per the global program slicer.
  const shown: Program[] = store.activeProgram === "ALL" ? [...PROGRAMS] : [store.activeProgram]

  const data = useMemo(
    () => applyRange(trainingTrendByMonth(store.trainingSessions, store.simulatorById, store.staffById, range.year), range),
    [store.trainingSessions, store.simulatorById, store.staffById, range],
  )
  const total = useMemo(
    () => data.reduce((sum, r) => sum + shown.reduce((s, p) => s + r[p], 0), 0),
    [data, shown],
  )
  const shownLabel = shown.map((p) => config[p].label).join(" & ")
  const description = range.ytd
    ? `${total} sessions (${shownLabel}) YTD ${range.year}`
    : `${total} sessions (${shownLabel}) in ${range.year}`

  return (
    <ChartShell
      title="Training Sessions"
      description={description}
      icon={GraduationCap}
      years={years}
      value={value}
      onValueChange={setValue}
      href={href}
      className={className}
    >
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {shown.includes("RADAR") && (
            <Line dataKey="RADAR" type="monotone" stroke="var(--color-RADAR)" strokeWidth={2} dot={false} />
          )}
          {shown.includes("TOWER") && (
            <Line dataKey="TOWER" type="monotone" stroke="var(--color-TOWER)" strokeWidth={2} dot={false} />
          )}
        </LineChart>
      </ChartContainer>
    </ChartShell>
  )
}
