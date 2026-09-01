"use client"

/* ===========================================================================
 * PERSON ACTIVITY CHART — what one staff member did across a year
 * ===========================================================================
 * A stacked bar chart with one bar per month, broken into the activities the
 * person took part in: exercise runs rostered, training sessions attended,
 * leave days taken and other duties. A year selector switches the year, and the
 * subtitle shows the full-year total plus a year-to-date figure.
 * =========================================================================== */
import { useMemo } from "react"
import { Activity } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useStore } from "@/lib/store"
import { applyRange, personActivityByMonth } from "@/lib/analytics"
import { ChartShell } from "./chart-shell"
import { useChartRange, useSlicerYears } from "./use-chart-range"

const config = {
  runs: { label: "Runs", color: "var(--chart-1)" },
  training: { label: "Training", color: "var(--chart-2)" },
  leave: { label: "Leave days", color: "var(--chart-3)" },
  tasks: { label: "Other duties", color: "var(--chart-4)" },
} satisfies ChartConfig

export function PersonActivityChart({ staffId, className }: { staffId: string; className?: string }) {
  const store = useStore()

  // Year dropdown is constrained to the global year slicer range.
  const years = useSlicerYears()
  const { value, setValue, range } = useChartRange(years)

  const data = useMemo(
    () =>
      applyRange(
        personActivityByMonth({
          staffId,
          runAssignments: store.runAssignments,
          runs: store.runs,
          trainingAttendance: store.trainingAttendance,
          trainingSessions: store.trainingSessions,
          leaveRecords: store.leaveRecords,
          otherTasks: store.otherTasks,
          year: range.year,
        }),
        range,
      ),
    [
      staffId,
      store.runAssignments,
      store.runs,
      store.trainingAttendance,
      store.trainingSessions,
      store.leaveRecords,
      store.otherTasks,
      range,
    ],
  )

  const rowTotal = (r: (typeof data)[number]) => r.runs + r.training + r.leave + r.tasks
  const total = useMemo(() => data.reduce((sum, r) => sum + rowTotal(r), 0), [data])
  const description = range.ytd
    ? `${total} activities YTD ${range.year}`
    : `${total} activities in ${range.year}`

  return (
    <ChartShell
      title="Activity This Year"
      description={description}
      icon={Activity}
      years={years}
      value={value}
      onValueChange={setValue}
      className={className}
    >
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="runs" stackId="a" fill="var(--color-runs)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="training" stackId="a" fill="var(--color-training)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="leave" stackId="a" fill="var(--color-leave)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="tasks" stackId="a" fill="var(--color-tasks)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartShell>
  )
}
