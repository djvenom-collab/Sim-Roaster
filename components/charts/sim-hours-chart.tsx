"use client"

/* ===========================================================================
 * SIM HOURS CHART — simulator utilisation per month, one line per simulator
 * ===========================================================================
 * For a single program (RADAR or TOWER) this draws a line per simulator showing
 * the hours it was used each month (confirmed + completed runs). A year selector
 * switches the year in place.
 *
 * SLICER: follows the global slicer. The year dropdown is constrained to the
 * selected year range. Program scoping is handled by the parent, which only
 * mounts the chart(s) for the active program (Radar-only, Tower-only, or both).
 * =========================================================================== */
import { useMemo } from "react"
import { MonitorPlay } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { useStore } from "@/lib/store"
import { applyRange, simHoursTrendByMonth } from "@/lib/analytics"
import type { Program } from "@/lib/program"
import { EmptyState } from "@/components/shared"
import { ChartShell } from "./chart-shell"
import { useChartRange, useSlicerYears } from "./use-chart-range"

const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export function SimHoursChart({ program, className, href }: { program: Program; className?: string; href?: string }) {
  const store = useStore()
  const years = useSlicerYears()
  const { value, setValue, range } = useChartRange(years)

  const { rows, sims } = useMemo(() => {
    const trend = simHoursTrendByMonth(store.runs, store.simulators, store.exerciseById, program, range.year)
    return { rows: applyRange(trend.rows, range), sims: trend.sims }
  }, [store.runs, store.simulators, store.exerciseById, program, range])

  const config = useMemo(() => {
    const c: ChartConfig = {}
    sims.forEach((s, i) => {
      c[s.id] = { label: s.code, color: PALETTE[i % PALETTE.length] }
    })
    return c
  }, [sims])

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + sims.reduce((s, sim) => s + (row[sim.id] as number), 0), 0),
    [rows, sims],
  )

  const label = program === "RADAR" ? "Radar" : "Tower"
  const scope = range.ytd ? `YTD ${range.year}` : `in ${range.year}`
  const description = `${Math.round(total)} h across ${sims.length} ${label} sim${sims.length === 1 ? "" : "s"} ${scope}`

  return (
    <ChartShell
      title={`${label} Simulator Hours`}
      description={description}
      icon={MonitorPlay}
      years={years}
      value={value}
      onValueChange={setValue}
      href={href}
      className={className}
    >
      {sims.length === 0 ? (
        <EmptyState icon={MonitorPlay} title={`No ${label} simulators`} />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
          <LineChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={32} unit="h" />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            {sims.map((s) => (
              <Line
                key={s.id}
                dataKey={s.id}
                name={s.code}
                type="monotone"
                stroke={`var(--color-${s.id})`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </ChartShell>
  )
}
