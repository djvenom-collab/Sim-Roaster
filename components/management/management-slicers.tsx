"use client"

/* ===========================================================================
 * MANAGEMENT SLICERS — page-local filter toolbar
 * ===========================================================================
 * A single row of slicers that scope the WHOLE Management Overview page without
 * touching the global top-bar slicers:
 *   • Program — RADAR / TOWER / ALL, independent of the global program view so
 *     leadership can compare departments right here.
 *   • Year range — a From/To window that narrows the totals, comparison,
 *     trend chart and matrix to a stretch of years.
 * All state lives in the page; this component is presentational.
 * =========================================================================== */
import { SlidersHorizontal } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PROGRAM_VIEWS, programLabel, type ProgramView } from "@/lib/program"
import type { TimeGranularity } from "@/lib/management-analytics"

interface Props {
  program: ProgramView
  onProgram: (p: ProgramView) => void
  years: number[] // full window, oldest → newest
  fromYear: number
  toYear: number
  onFromYear: (y: number) => void
  onToYear: (y: number) => void
}

export function ManagementSlicers({ program, onProgram, years, fromYear, toYear, onFromYear, onToYear }: Props) {
  // From cannot exceed To, and To cannot precede From.
  const fromOptions = years.filter((y) => y <= toYear)
  const toOptions = years.filter((y) => y >= fromYear)

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground sm:h-9">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Slicers
        </div>

        <Field label="Program">
          <Select value={program} onValueChange={(v) => onProgram(v as ProgramView)}>
            <SelectTrigger className="h-9 w-[150px]" aria-label="Program">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROGRAM_VIEWS.map((p) => (
                <SelectItem key={p} value={p}>
                  {programLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="From year">
          <Select value={String(fromYear)} onValueChange={(v) => onFromYear(Number(v))}>
            <SelectTrigger className="h-9 w-[100px]" aria-label="From year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fromOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="To year">
          <Select value={String(toYear)} onValueChange={(v) => onToYear(Number(v))}>
            <SelectTrigger className="h-9 w-[100px]" aria-label="To year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {toOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </CardContent>
    </Card>
  )
}

/**
 * A compact Months / Years switch used in each chart header so leadership can
 * flip the timeline between one point per year and one point per month across
 * the same slicer window. Controlled — state lives in the page.
 */
export function GranularityToggle({
  value,
  onChange,
}: {
  value: TimeGranularity
  onChange: (g: TimeGranularity) => void
}) {
  const options: { key: TimeGranularity; label: string }[] = [
    { key: "year", label: "Years" },
    { key: "month", label: "Months" },
  ]
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Timeline granularity">
      {options.map((o) => {
        const on = value === o.key
        return (
          <Button
            key={o.key}
            type="button"
            size="sm"
            variant={on ? "default" : "ghost"}
            onClick={() => onChange(o.key)}
            className="h-7 px-3 text-xs"
            aria-pressed={on}
          >
            {o.label}
          </Button>
        )
      })}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
