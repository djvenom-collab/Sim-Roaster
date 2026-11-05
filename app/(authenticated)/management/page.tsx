"use client"

/* ===========================================================================
 * MANAGEMENT OVERVIEW PAGE ("/management")
 * ===========================================================================
 * A single boardroom view of the whole operation for upper management (TL and
 * Admin roles). It rolls the program-scoped data up per year so leadership can:
 *   • read lifetime totals across the retained window,
 *   • compare any two years side by side with colour-coded deltas,
 *   • watch the long-term trend of any headline metric, and
 *   • scan every metric across every year in one matrix.
 *
 * It follows the global Program slicer (via the store's scoped* selectors) but
 * deliberately spans ALL live years rather than the top-bar year slicer, since
 * the whole point is year-on-year perspective. Per-year maths lives in
 * lib/management-analytics.ts.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { Building2, MonitorPlay, PlaneTakeoff, GraduationCap, CalendarOff, Info } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useStore } from "@/lib/store"
import { PageHeader } from "@/components/shared"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  programLabel,
  runInProgram,
  trainingInProgram,
  staffInProgram,
  PROGRAMS,
  type Program,
  type ProgramView,
} from "@/lib/program"
import {
  metricsForYears,
  metricsForBuckets,
  simHoursByProgramForBuckets,
  buildBuckets,
  type MetricKey,
  type TimeGranularity,
} from "@/lib/management-analytics"
import { ManagementSlicers } from "@/components/management/management-slicers"
import { ManagementKpiCompare } from "@/components/management/management-kpi-compare"
import { ManagementTrendChart } from "@/components/management/management-trend-chart"
import { ManagementSimHoursChart } from "@/components/management/management-sim-hours-chart"
import { ManagementYearTable } from "@/components/management/management-year-table"

export default function ManagementPage() {
  const store = useStore()
  const { simulatorById, staffById, exerciseById } = store
  // The full retained window (oldest → newest).
  const allYears = store.liveYears

  // ── Page-local slicers (independent of the global top-bar slicers) ──
  const [program, setProgram] = useState<ProgramView>(store.activeProgram)
  const [fromYear, setFromYear] = useState(() => allYears[0])
  const [toYear, setToYear] = useState(() => allYears[allYears.length - 1])

  // The years actually shown, after the From/To range.
  const years = useMemo(
    () => allYears.filter((y) => y >= fromYear && y <= toYear),
    [allYears, fromYear, toYear],
  )
  const yearsDesc = useMemo(() => [...years].sort((a, b) => b - a), [years])

  // Program-scope the LIVE data locally (using the same predicates the global
  // scoped* selectors use) so this page's Program slicer works on its own.
  const programRuns = useMemo(
    () => store.runs.filter((r) => runInProgram(r, simulatorById, program)),
    [store.runs, simulatorById, program],
  )
  const programTraining = useMemo(
    () => store.trainingSessions.filter((t) => trainingInProgram(t, simulatorById, staffById, program)),
    [store.trainingSessions, simulatorById, staffById, program],
  )
  const programLeave = useMemo(
    () =>
      store.leaveRecords.filter((l) => {
        const s = staffById(l.staffId)
        return s ? staffInProgram(s, program) : true
      }),
    [store.leaveRecords, staffById, program],
  )

  const rows = useMemo(
    () => metricsForYears(years, programRuns, store.runAssignments, programTraining, programLeave, exerciseById),
    [years, programRuns, store.runAssignments, programTraining, programLeave, exerciseById],
  )
  const rowByYear = useMemo(() => Object.fromEntries(rows.map((r) => [r.year, r])), [rows])

  // ── Chart timeline granularity (Years vs Months) ──
  // Shared by both line charts so they always cover the same slicer window.
  // Years → one point per year; Months → 12 points per year (e.g. 60 over 5y).
  const [granularity, setGranularity] = useState<TimeGranularity>("year")
  const buckets = useMemo(() => buildBuckets(years, granularity), [years, granularity])

  // Trend chart data at the chosen granularity.
  const trendBuckets = useMemo(
    () => metricsForBuckets(buckets, programRuns, store.runAssignments, programTraining, programLeave, exerciseById),
    [buckets, programRuns, store.runAssignments, programTraining, programLeave, exerciseById],
  )

  // Per-program, per-status sim hours per bucket for the utilization chart.
  // Uses the program-scoped run list so it follows the page Program slicer
  // (seeded from the global slicer) and the year range + granularity.
  const simProgramHours = useMemo(
    () => simHoursByProgramForBuckets(buckets, programRuns, simulatorById, exerciseById),
    [buckets, programRuns, simulatorById, exerciseById],
  )
  // Which program lines to draw: both when viewing ALL, otherwise just the one.
  const chartPrograms: Program[] = program === "ALL" ? PROGRAMS : [program]

  // Default the comparison to the two most recent years; clamp into range below.
  const [baseYear, setBaseYear] = useState(() => yearsDesc[1] ?? yearsDesc[0])
  const [compareYear, setCompareYear] = useState(() => yearsDesc[0])
  const [metrics, setMetrics] = useState<MetricKey[]>(["simHours", "runsDelivered"])
  const toggleMetric = (m: MetricKey) =>
    setMetrics((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  // Keep the comparison years valid when the range shrinks past them.
  const safeBase = years.includes(baseYear) ? baseYear : yearsDesc[1] ?? yearsDesc[0]
  const safeCompare = years.includes(compareYear) ? compareYear : yearsDesc[0]

  // Lifetime totals across the whole retained window.
  const totals = useMemo(
    () => ({
      simHours: rows.reduce((s, r) => s + r.simHours, 0),
      runs: rows.reduce((s, r) => s + r.runsDelivered, 0),
      training: rows.reduce((s, r) => s + r.training, 0),
      leave: rows.reduce((s, r) => s + r.leaveDays, 0),
    }),
    [rows],
  )

  const rangeLabel = years.length ? `${years[0]}–${years[years.length - 1]}` : "—"

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Management Overview"
        description="One-page, multi-year perspective of the SIM operation for leadership review."
        actions={
          <Badge variant="outline" className="gap-1.5">
            <Building2 className="size-3.5" aria-hidden="true" />
            {rangeLabel} · {programLabel(program)}
          </Badge>
        }
      />

      <ManagementSlicers
        program={program}
        onProgram={setProgram}
        years={allYears}
        fromYear={fromYear}
        toYear={toYear}
        onFromYear={setFromYear}
        onToYear={setToYear}
      />

      {/* Lifetime totals across the retained window */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TotalCard icon={MonitorPlay} label="Sim hours delivered" value={`${Math.round(totals.simHours).toLocaleString()} h`} />
        <TotalCard icon={PlaneTakeoff} label="Runs delivered" value={Math.round(totals.runs).toLocaleString()} />
        <TotalCard icon={GraduationCap} label="Training sessions" value={Math.round(totals.training).toLocaleString()} />
        <TotalCard icon={CalendarOff} label="Leave days taken" value={Math.round(totals.leave).toLocaleString()} />
      </div>

      {years.length >= 2 ? (
        <ManagementKpiCompare
          rowByYear={rowByYear}
          years={yearsDesc}
          baseYear={safeBase}
          compareYear={safeCompare}
          onBaseYear={setBaseYear}
          onCompareYear={setCompareYear}
        />
      ) : (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden="true" />
            Year-on-year comparison needs at least two years of data in the current window.
          </CardContent>
        </Card>
      )}

      <ManagementTrendChart
        rows={trendBuckets}
        selected={metrics}
        onToggle={toggleMetric}
        granularity={granularity}
        onGranularity={setGranularity}
      />

      <ManagementSimHoursChart
        rows={simProgramHours}
        programs={chartPrograms}
        granularity={granularity}
        onGranularity={setGranularity}
      />

      <ManagementYearTable rows={rows} />

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Figures respect this page&apos;s Program and year-range slicers (independent of the top-bar view). Sim hours and runs
        count confirmed and completed runs; fill rate is filled position slots over total slots; leave excludes rejected
        requests.
      </p>
    </div>
  )
}

function TotalCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardDescription className="text-xs font-medium">{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
