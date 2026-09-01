"use client"

/* ===========================================================================
 * MANAGEMENT SIM-HOURS CHART — utilization by program & status
 * ===========================================================================
 * Simulator hours plotted as ONE LINE PER (program × status) combination across
 * every year in the window. Each selected status is its own line, drawn once per
 * program in view:
 *   - Page Program slicer on ALL  → up to 5 Radar lines + 5 Tower lines.
 *   - Page Program slicer on one  → up to 5 lines for that program only.
 *
 * Lines are NOT summed or combined. Colour encodes the STATUS; line style
 * encodes the PROGRAM (Radar solid, Tower dashed), so a status keeps the same
 * colour across both programs. The status toggle chips choose which statuses
 * are plotted. Every series shares the same unit (hours) → real hours Y-axis.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { Gauge } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { RunStatus } from "@/lib/types"
import { programDisplay, type Program } from "@/lib/program"
import { CHART_RUN_STATUSES, type ProgramStatusBucketHours, type TimeGranularity } from "@/lib/management-analytics"
import { GranularityToggle } from "./management-slicers"

interface Props {
  rows: ProgramStatusBucketHours[] // chronological (oldest → newest), year or month buckets
  programs: Program[] // programs to draw (each contributes its own status lines)
  granularity: TimeGranularity
  onGranularity: (g: TimeGranularity) => void
}

// Colour encodes STATUS (kept consistent across programs).
const STATUS_COLOR: Record<RunStatus, string> = {
  completed: "var(--chart-1)",
  confirmed: "var(--chart-2)",
  tentative: "var(--chart-3)",
  postponed: "var(--chart-4)",
  cancelled: "var(--chart-5)",
} as Record<RunStatus, string>

// Line style encodes PROGRAM.
const PROGRAM_DASH: Record<Program, string | undefined> = {
  RADAR: undefined, // solid
  TOWER: "5 4", // dashed
}

const STATUS_LABEL: Record<RunStatus, string> = {
  completed: "Completed",
  confirmed: "Confirmed",
  tentative: "Tentative",
  postponed: "Postponed",
  cancelled: "Cancelled",
} as Record<RunStatus, string>

// Stable key for a program×status series.
const seriesKey = (p: Program, s: RunStatus) => `${p}::${s}`

export function ManagementSimHoursChart({ rows, programs, granularity, onGranularity }: Props) {
  const [statuses, setStatuses] = useState<RunStatus[]>(["completed", "confirmed"])
  const toggleStatus = (s: RunStatus) =>
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))

  // The full set of lines to draw: every selected status, for every program in view.
  const series = useMemo(
    () =>
      programs.flatMap((p) =>
        statuses.map((s) => ({
          key: seriesKey(p, s),
          program: p,
          status: s,
          // Label omits the program name when only one program is in view.
          label: programs.length > 1 ? `${programDisplay(p)} · ${STATUS_LABEL[s]}` : STATUS_LABEL[s],
          color: STATUS_COLOR[s],
          dash: PROGRAM_DASH[p],
        })),
      ),
    [programs, statuses],
  )

  const data = useMemo(
    () =>
      rows.map((r) => {
        const point: Record<string, number | string> = { label: r.label }
        for (const p of programs) {
          const bucket = r.byProgram[p]
          for (const s of statuses) point[seriesKey(p, s)] = bucket?.[s] ?? 0
        }
        return point
      }),
    [rows, programs, statuses],
  )

  const config: ChartConfig = useMemo(() => {
    const c: ChartConfig = {}
    for (const item of series) c[item.key] = { label: item.label, color: item.color }
    return c
  }, [series])

  const statusSummary =
    statuses.length === 0
      ? "no statuses selected"
      : statuses.length === CHART_RUN_STATUSES.length
        ? "all statuses"
        : statuses.map((s) => STATUS_LABEL[s]).join(" + ")

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-primary" aria-hidden="true" />
              Sim hours utilized by program &amp; status
            </CardTitle>
            <CardDescription>
              One line per status, per program ({statusSummary}), shown {granularity === "month" ? "monthly" : "yearly"}.
              {programs.length > 1 ? " Radar is solid, Tower is dashed." : ""} Toggle statuses below.
            </CardDescription>
          </div>
          <GranularityToggle value={granularity} onChange={onGranularity} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHART_RUN_STATUSES.map((s) => {
            const on = statuses.includes(s)
            return (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => toggleStatus(s)}
                className="h-7 px-2.5 text-xs"
                aria-pressed={on}
                aria-label={`Toggle ${STATUS_LABEL[s]}`}
              >
                {STATUS_LABEL[s]}
              </Button>
            )
          })}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 || series.length === 0 ? (
          <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            {rows.length === 0 ? "No data in the current window." : "Select at least one status to plot."}
          </div>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-[320px] w-full">
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
              <YAxis tickLine={false} axisLine={false} width={52} unit=" h" />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => {
                      const label = config[String(name)]?.label ?? String(name)
                      return (
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {Math.round(Number(value)).toLocaleString()} h
                          </span>
                        </span>
                      )
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {series.map((item) => (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.key}
                  stroke={item.color}
                  strokeWidth={2}
                  strokeDasharray={item.dash}
                  dot={granularity === "month" ? false : { r: 2.5 }}
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
