"use client"

/* ===========================================================================
 * MANAGEMENT KPI COMPARE — two-year side-by-side headline metrics
 * ===========================================================================
 * Lets management pick a baseline year and a comparison year, then shows every
 * headline metric as a tile: the comparison-year value big, the baseline value
 * beneath, and a colour-coded delta badge that respects each metric's
 * "higher is better" direction (e.g. a rising cancellation rate is red).
 * =========================================================================== */
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MANAGEMENT_METRICS, pctChange, type YearMetrics } from "@/lib/management-analytics"

interface Props {
  rowByYear: Record<number, YearMetrics>
  years: number[] // newest first
  baseYear: number
  compareYear: number
  onBaseYear: (y: number) => void
  onCompareYear: (y: number) => void
}

export function ManagementKpiCompare({ rowByYear, years, baseYear, compareYear, onBaseYear, onCompareYear }: Props) {
  const base = rowByYear[baseYear]
  const compare = rowByYear[compareYear]

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Year-on-year comparison</CardTitle>
          <CardDescription>Headline operational metrics for two selected years, with the change between them.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <YearSelect label="Baseline" value={baseYear} years={years} onChange={onBaseYear} />
          <span className="text-muted-foreground" aria-hidden="true">
            →
          </span>
          <YearSelect label="Compare" value={compareYear} years={years} onChange={onCompareYear} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MANAGEMENT_METRICS.map((m) => {
            const baseVal = base ? m.get(base) : 0
            const compVal = compare ? m.get(compare) : 0
            const delta = pctChange(baseVal, compVal)
            const improved = delta === null ? null : delta === 0 ? "flat" : (delta > 0) === m.higherIsBetter ? "good" : "bad"
            const DeltaIcon = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
            const accent =
              improved === "good" ? "text-emerald-600" : improved === "bad" ? "text-destructive" : "text-muted-foreground"
            return (
              <div key={m.key} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                  <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${accent}`}>
                    <DeltaIcon className="size-3.5" aria-hidden="true" />
                    {delta === null ? "—" : `${delta > 0 ? "+" : ""}${Math.round(delta)}%`}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{baseYear}</p>
                    <span className="text-2xl font-semibold tabular-nums text-muted-foreground">{m.format(baseVal)}</span>
                  </div>
                  <span className="mb-1 text-muted-foreground" aria-hidden="true">
                    →
                  </span>
                  <div className="space-y-0.5 text-right">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{compareYear}</p>
                    <span className="text-2xl font-semibold tabular-nums">{m.format(compVal)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function YearSelect({
  label,
  value,
  years,
  onChange,
}: {
  label: string
  value: number
  years: number[]
  onChange: (y: number) => void
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 w-[92px]" aria-label={`${label} year`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
