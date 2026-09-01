"use client"

/* ===========================================================================
 * PROJECTIONS PAGE ("/projections") — 12-month predictive forecasting
 * ===========================================================================
 * Projects four operational metrics forward using a client-side linear-trend
 * model (least squares) with a 95% prediction interval:
 *   • Sim hours delivered   • Runs delivered
 *   • Leave days taken      • Training sessions
 *
 * History respects the global Program and Year-range slicers (it reads the
 * store's report* selectors, which are program-scoped, year-filtered and
 * exclude archived data). The projection always looks 12 months beyond the
 * latest history month.
 *
 * All maths is in lib/forecast.ts; the chart is components/projection-chart.tsx.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { MonitorPlay, PlaneTakeoff, CalendarOff, GraduationCap, TrendingUp, TrendingDown, Minus, Info } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useStore } from "@/lib/store"
import { PageHeader } from "@/components/shared"
import { ProjectionChart } from "@/components/projection-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DEFAULT_HORIZON,
  linearForecast,
  toChartRows,
  monthLabel,
  simHoursSeries,
  runsDeliveredSeries,
  leaveDaysSeries,
  trainingSessionsSeries,
  type MonthPoint,
} from "@/lib/forecast"

type MetricKey = "simHours" | "runs" | "leave" | "training"

interface MetricDef {
  key: MetricKey
  label: string
  short: string
  unit?: string
  icon: LucideIcon
  noun: string
}

const METRICS: MetricDef[] = [
  { key: "simHours", label: "Sim hours delivered", short: "Sim hours", unit: "h", icon: MonitorPlay, noun: "hours" },
  { key: "runs", label: "Runs delivered", short: "Runs", icon: PlaneTakeoff, noun: "runs" },
  { key: "leave", label: "Leave days taken", short: "Leave days", icon: CalendarOff, noun: "days" },
  { key: "training", label: "Training sessions", short: "Training", icon: GraduationCap, noun: "sessions" },
]

function fmt(n: number, unit?: string) {
  return `${Math.round(n).toLocaleString()}${unit ?? ""}`
}

export default function ProjectionsPage() {
  const store = useStore()
  const [metric, setMetric] = useState<MetricKey>("simHours")
  const def = METRICS.find((m) => m.key === metric)!

  // Build the monthly history for every metric from the program/year-scoped,
  // archive-excluded report selectors.
  const historyByMetric = useMemo<Record<MetricKey, MonthPoint[]>>(
    () => ({
      simHours: simHoursSeries(store.reportRuns, store.exerciseById),
      runs: runsDeliveredSeries(store.reportRuns),
      leave: leaveDaysSeries(store.reportLeaveRecords),
      training: trainingSessionsSeries(store.reportTrainingSessions),
    }),
    [store.reportRuns, store.reportLeaveRecords, store.reportTrainingSessions, store.exerciseById],
  )

  const history = historyByMetric[metric]
  const forecast = useMemo(() => linearForecast(history, DEFAULT_HORIZON), [history])
  const rows = useMemo(() => toChartRows(history, forecast.projected), [history, forecast])

  // Stats
  const projectedTotal = forecast.projected.reduce((s, p) => s + p.value, 0)
  const last12 = history.slice(-12).reduce((s, p) => s + p.value, 0)
  const deltaPct = last12 > 0 ? ((projectedTotal - last12) / last12) * 100 : 0
  const slope = forecast.slope
  const trend = slope > 0.05 ? "up" : slope < -0.05 ? "down" : "flat"
  const forecastStartLabel = history.length > 0 ? monthLabel(history[history.length - 1].key) : undefined

  const enoughData = history.length >= 3

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus
  const trendText = trend === "up" ? "Rising" : trend === "down" ? "Falling" : "Flat"

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecasting / Projections"
        description="12-month linear-trend projections with a 95% confidence band. Reflects the current Program and Year-range filters."
      />

      <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
        <TabsList>
          {METRICS.map((m) => (
            <TabsTrigger key={m.key} value={m.key} className="gap-1.5">
              <m.icon className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">{m.short}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={`Projected next ${DEFAULT_HORIZON} months`}
          value={enoughData ? fmt(projectedTotal, def.unit) : "—"}
          hint={enoughData ? `${def.noun} across the forecast window` : "Not enough history"}
          icon={def.icon}
        />
        <StatCard
          title="Trend"
          value={enoughData ? trendText : "—"}
          hint={enoughData ? `${slope > 0 ? "+" : ""}${slope} ${def.noun}/month on average` : "Not enough history"}
          icon={TrendIcon}
          accent={trend === "up" ? "up" : trend === "down" ? "down" : undefined}
        />
        <StatCard
          title="Vs. last 12 months"
          value={enoughData && last12 > 0 ? `${deltaPct >= 0 ? "+" : ""}${Math.round(deltaPct)}%` : "—"}
          hint={enoughData ? `${fmt(last12, def.unit)} actual → ${fmt(projectedTotal, def.unit)} projected` : "Not enough history"}
          icon={TrendIcon}
          accent={deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : undefined}
        />
        <StatCard
          title="Model fit (R²)"
          value={enoughData ? forecast.r2.toFixed(2) : "—"}
          hint={enoughData ? goodnessText(forecast.r2) : "Not enough history"}
          icon={Info}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <def.icon className="size-4 text-primary" aria-hidden="true" />
            {def.label}
          </CardTitle>
          <CardDescription>
            {history.length} months of history{" "}
            {store.activeProgram === "ALL" ? "across all programs" : `for ${store.activeProgram}`} · projecting{" "}
            {DEFAULT_HORIZON} months ahead
          </CardDescription>
        </CardHeader>
        <CardContent>
          {enoughData ? (
            <ProjectionChart
              rows={rows}
              unit={def.unit}
              seriesLabel={def.short}
              forecastStartLabel={forecastStartLabel}
            />
          ) : (
            <div className="flex h-[360px] flex-col items-center justify-center gap-2 text-center">
              <Info className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">Not enough history to project</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                A trend needs at least three months of data. Widen the Year-range filter in the top bar or pick a
                program with more history.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Projections use ordinary least-squares linear regression over monthly history. The shaded band is a 95%
        prediction interval that widens with distance from the data — treat it as a guide, not a guarantee.
      </p>
    </div>
  )
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  title: string
  value: string
  hint: string
  icon: LucideIcon
  accent?: "up" | "down"
}) {
  const accentClass = accent === "up" ? "text-emerald-600" : accent === "down" ? "text-destructive" : "text-foreground"
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardDescription className="text-xs font-medium">{title}</CardDescription>
        <Icon className={`size-4 ${accent ? accentClass : "text-muted-foreground"}`} aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{hint}</p>
      </CardContent>
    </Card>
  )
}

function goodnessText(r2: number): string {
  if (r2 >= 0.75) return "Strong linear fit"
  if (r2 >= 0.4) return "Moderate linear fit"
  if (r2 > 0) return "Weak linear fit"
  return "No clear linear trend"
}
