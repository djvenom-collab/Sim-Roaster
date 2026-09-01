"use client"

/* ===========================================================================
 * PROJECTION CHART — history (solid) + forecast (dashed) + confidence band
 * ===========================================================================
 * A single time axis of monthly points. The solid line is real history, the
 * dashed line is the linear-trend projection, and the shaded area is the 95%
 * prediction interval around the projection. The two lines share the last
 * history month so they join without a gap.
 *
 * Presentational only — all maths lives in lib/forecast.ts.
 * =========================================================================== */
import { useMemo } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { ChartRow } from "@/lib/forecast"

export function ProjectionChart({
  rows,
  unit,
  seriesLabel,
  forecastStartLabel,
}: {
  rows: ChartRow[]
  unit?: string
  seriesLabel: string
  forecastStartLabel?: string
}) {
  const config = useMemo<ChartConfig>(
    () => ({
      history: { label: seriesLabel, color: "var(--chart-1)" },
      forecast: { label: "Projection", color: "var(--chart-2)" },
      band: { label: "95% interval", color: "var(--chart-2)" },
    }),
    [seriesLabel],
  )

  return (
    <ChartContainer config={config} className="aspect-auto h-[360px] w-full">
      <ComposedChart data={rows} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={40} unit={unit} allowDecimals={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value, name) => {
                if (name === "band" || value == null) return null
                const label = name === "history" ? seriesLabel : "Projection"
                return (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {Number(value).toLocaleString()}
                      {unit ?? ""}
                    </span>
                  </div>
                )
              }}
            />
          }
        />
        {forecastStartLabel && (
          <ReferenceLine
            x={forecastStartLabel}
            stroke="var(--border)"
            strokeDasharray="4 4"
            label={{ value: "Today", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        )}
        {/* Confidence band (rendered first so lines sit on top). */}
        <Area
          dataKey="band"
          type="monotone"
          stroke="none"
          fill="var(--color-band)"
          fillOpacity={0.15}
          connectNulls
          isAnimationActive={false}
        />
        {/* Historical actuals. */}
        <Line
          dataKey="history"
          type="monotone"
          stroke="var(--color-history)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        {/* Projection. */}
        <Line
          dataKey="forecast"
          type="monotone"
          stroke="var(--color-forecast)"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
