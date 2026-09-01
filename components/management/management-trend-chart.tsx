"use client"

/* ===========================================================================
 * MANAGEMENT TREND CHART — several metrics across every retained year
 * ===========================================================================
 * A multi-line chart of the chosen headline metrics for all years in the
 * window, so the long-term direction of the operation is visible at a glance.
 * Toggle chips add/remove metric lines.
 *
 * WHY INDEXED: the metrics use different units (hours, counts, %), which cannot
 * share one Y-axis honestly. So every line is INDEXED to its own first year in
 * the window (= 100). A value of 120 means "20% above the first year". This is
 * the standard boardroom technique for overlaying different-unit trends. The
 * tooltip still shows each metric's real, formatted value for that year.
 * =========================================================================== */
import { useMemo } from "react"
import { LineChart as LineChartIcon } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart"
import { MANAGEMENT_METRICS, type MetricKey, type BucketMetrics, type TimeGranularity } from "@/lib/management-analytics"
import { GranularityToggle } from "./management-slicers"

interface Props {
  rows: BucketMetrics[] // chronological (oldest → newest), year or month buckets
  selected: MetricKey[]
  onToggle: (m: MetricKey) => void
  granularity: TimeGranularity
  onGranularity: (g: TimeGranularity) => void
}

// The theme's chart palette; lines cycle through these in selection order.
const LINE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export function ManagementTrendChart({ rows, selected, onToggle, granularity, onGranularity }: Props) {
  const defs = useMemo(
    () => MANAGEMENT_METRICS.filter((m) => selected.includes(m.key)),
    [selected],
  )

  // Index each metric to its own first-period value (= 100) so different units
  // can share one axis. Keep the raw value alongside for the tooltip.
  const data = useMemo(() => {
    const baseFor = new Map<MetricKey, number>()
    for (const def of defs) {
      const firstNonZero = rows.map((r) => def.get(r)).find((v) => v !== 0) ?? 0
      baseFor.set(def.key, firstNonZero)
    }
    return rows.map((r) => {
      const point: Record<string, number | string> = { label: r.label }
      for (const def of defs) {
        const raw = def.get(r)
        const base = baseFor.get(def.key) ?? 0
        point[def.key] = base === 0 ? 100 : Math.round((raw / base) * 1000) / 10
        point[`${def.key}__raw`] = raw
      }
      return point
    })
  }, [rows, defs])

  const config: ChartConfig = useMemo(() => {
    const c: ChartConfig = {}
    defs.forEach((def, i) => {
      c[def.key] = { label: def.short, color: LINE_COLORS[i % LINE_COLORS.length] }
    })
    return c
  }, [defs])

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChartIcon className="size-4 text-primary" aria-hidden="true" />
              Long-term trend
            </CardTitle>
            <CardDescription>
              Selected metrics across the window ({granularity === "month" ? "monthly" : "yearly"}), indexed to their first
              {granularity === "month" ? " month" : " year"} (= 100) for comparison.
            </CardDescription>
          </div>
          <GranularityToggle value={granularity} onChange={onGranularity} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MANAGEMENT_METRICS.map((m) => {
            const on = selected.includes(m.key)
            return (
              <Button
                key={m.key}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => onToggle(m.key)}
                className="h-7 px-2.5 text-xs"
                aria-pressed={on}
                aria-label={`Toggle ${m.label}`}
              >
                {m.short}
              </Button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent>
        {defs.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Select at least one metric to plot.
          </div>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={granularity === "month" ? 24 : 8}
                interval="preserveStartEnd"
              />
              <YAxis tickLine={false} axisLine={false} width={44} unit=" idx" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => {
                      const def = MANAGEMENT_METRICS.find((m) => m.key === name)
                      const raw = item?.payload?.[`${String(name)}__raw`]
                      return (
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">{def?.short ?? name}</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {def ? def.format(Number(raw)) : String(raw)}
                            <span className="ml-1 text-xs text-muted-foreground">({Number(value)})</span>
                          </span>
                        </span>
                      )
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {defs.map((def, i) => (
                <Line
                  key={def.key}
                  type="monotone"
                  dataKey={def.key}
                  name={def.key}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={granularity === "month" ? false : { r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
