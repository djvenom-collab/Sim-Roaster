"use client"

/* ===========================================================================
 * LEAVE TYPE CHARTS — leave broken down by TYPE (not a bar chart)
 * ===========================================================================
 * Two views, side by side, both driven by the shared range selector (YTD /
 * year):
 *   1. Donut — total leave days per type across the range, with the grand
 *      total in the centre. Answers "what is our leave made of?".
 *   2. Multi-line trend — each leave type as its own line month-by-month,
 *      showing how types rise and fall through the year.
 *
 * SLICER: follows the global slicer — the year dropdown is constrained to the
 * selected year range, and leave records are program-scoped (only the active
 * program's people are counted). Rejected leave is excluded.
 * =========================================================================== */
import { useMemo } from "react"
import { CalendarClock, PieChart as PieChartIcon } from "lucide-react"
import { Cell, Label, Line, LineChart, Pie, PieChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { useStore } from "@/lib/store"
import {
  applyRange,
  leaveDaysByType,
  leaveTypeTrendByMonth,
  LEAVE_TYPE_ORDER,
} from "@/lib/analytics"
import { ChartShell } from "./chart-shell"
import { useChartRange, useSlicerYears } from "./use-chart-range"

// One colour per leave type. Five theme chart colours + a neutral for "Other".
const TYPE_COLOR: Record<(typeof LEAVE_TYPE_ORDER)[number], string> = {
  Annual: "var(--chart-1)",
  Sick: "var(--chart-2)",
  Training: "var(--chart-3)",
  Course: "var(--chart-4)",
  Compassionate: "var(--chart-5)",
  Other: "var(--muted-foreground)",
}

const config = Object.fromEntries(
  LEAVE_TYPE_ORDER.map((t) => [t, { label: t, color: TYPE_COLOR[t] }]),
) satisfies ChartConfig

export function LeaveTypeCharts({ className }: { className?: string }) {
  const store = useStore()
  const years = useSlicerYears()
  const { value, setValue, range } = useChartRange(years)

  const donutData = useMemo(
    // Use `leaveType` (not `type`) as the name key — recharts legend items have
    // a reserved `type` field that would otherwise shadow the label lookup.
    () =>
      leaveDaysByType(store.scopedLeaveRecords, range)
        .filter((d) => d.days > 0)
        .map((d) => ({ leaveType: d.type, days: d.days, fill: TYPE_COLOR[d.type] })),
    [store.scopedLeaveRecords, range],
  )
  const trendData = useMemo(
    () => applyRange(leaveTypeTrendByMonth(store.scopedLeaveRecords, range.year), range),
    [store.scopedLeaveRecords, range],
  )
  const total = useMemo(() => donutData.reduce((sum, d) => sum + d.days, 0), [donutData])

  const rangeLabel = range.ytd ? `YTD ${range.year}` : range.year
  // Which types actually occur in the range, for the trend lines.
  const activeTypes = useMemo(
    () => LEAVE_TYPE_ORDER.filter((t) => trendData.some((r) => r[t] > 0)),
    [trendData],
  )

  return (
    <div className={className}>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartShell
          title="Leave by Type"
          description={`${total} leave-days across ${donutData.length} type(s) · ${rangeLabel}`}
          icon={PieChartIcon}
          years={years}
          value={value}
          onValueChange={setValue}
        >
          {total === 0 ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={config} className="mx-auto aspect-square h-[260px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="leaveType" />} />
                <Pie data={donutData} dataKey="days" nameKey="leaveType" innerRadius={65} outerRadius={100} strokeWidth={2}>
                  {donutData.map((d) => (
                    <Cell key={d.leaveType} fill={d.fill} />
                  ))}
                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !("cx" in viewBox)) return null
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                            {total}
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                            leave-days
                          </tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="leaveType" />} className="flex-wrap gap-2" />
              </PieChart>
            </ChartContainer>
          )}
        </ChartShell>

        <ChartShell
          title="Leave Types Over Time"
          description={`Leave-days per type, month by month · ${rangeLabel}`}
          icon={CalendarClock}
          years={years}
          value={value}
          onValueChange={setValue}
        >
          {activeTypes.length === 0 ? (
            <EmptyChart />
          ) : (
            <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
              <LineChart data={trendData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {activeTypes.map((t) => (
                  <Line
                    key={t}
                    type="monotone"
                    dataKey={t}
                    stroke={TYPE_COLOR[t]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </ChartShell>
      </div>
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      No leave recorded for this range.
    </div>
  )
}
