"use client"

/* ===========================================================================
 * SIM HOURS STATUS CHART — month-by-month hours per run status (line chart)
 * ===========================================================================
 * For one program and range, draws a line per run status (confirmed,
 * completed, tentative, postponed, cancelled) across every month of the year,
 * summed over all of that program's simulators. Trimmed to the year-to-date
 * window when the range is YTD. Visual companion to the status breakdown table
 * on the SIM Hours Utilization page.
 * =========================================================================== */
import { useMemo } from "react"
import { Layers } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useStore } from "@/lib/store"
import { applyRange, simStatusHoursByMonth, type ChartRange } from "@/lib/analytics"
import type { Program } from "@/lib/program"
import { EmptyState } from "@/components/shared"

// Each status gets its own themed colour.
const config = {
  confirmed: { label: "Confirmed", color: "var(--chart-1)" },
  completed: { label: "Completed", color: "var(--chart-2)" },
  tentative: { label: "Tentative", color: "var(--chart-3)" },
  postponed: { label: "Postponed", color: "var(--chart-4)" },
  cancelled: { label: "Cancelled", color: "var(--chart-5)" },
} satisfies ChartConfig

const STATUSES = ["confirmed", "completed", "tentative", "postponed", "cancelled"] as const

export function SimHoursStatusChart({ program, range }: { program: Program; range: ChartRange }) {
  const store = useStore()
  const data = useMemo(
    () =>
      applyRange(
        simStatusHoursByMonth(store.runs, store.simulators, store.exerciseById, program, range.year),
        range,
      ),
    [store.runs, store.simulators, store.exerciseById, program, range],
  )

  const hasData = useMemo(
    () => data.some((d) => d.confirmed || d.completed || d.tentative || d.postponed || d.cancelled),
    [data],
  )

  const label = program === "RADAR" ? "Radar" : "Tower"
  const scope = range.ytd ? `YTD ${range.year}` : `${range.year}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4 text-primary" />
          {label} Hours by Status ({scope})
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Monthly confirmed, completed, tentative, postponed and cancelled hours.
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState icon={Layers} title={`No ${label} hours in ${scope}`} />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={32} unit="h" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              {STATUSES.map((status) => (
                <Line
                  key={status}
                  type="monotone"
                  dataKey={status}
                  stroke={`var(--color-${status})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
