"use client"

/* ===========================================================================
 * ARCHIVE PANEL — admin-only view of past-retention (archived) years
 * ===========================================================================
 * Data older than the rolling 5-year retention window is excluded from every
 * normal view (see lib/retention.ts). It is not deleted — it lives on in the
 * snapshot and is reachable ONLY here, where an Admin can review per-year
 * record counts and download an archive bundle as JSON for cold storage.
 *
 * Rendered inside the Admin page, which already gates on `manage_users`, so no
 * additional role check is strictly required — but we guard defensively anyway.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/shared"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Archive, Download, ShieldAlert, Lock } from "lucide-react"
import { RETENTION_YEARS, liveYearRange } from "@/lib/retention"
import { toast } from "sonner"

export function ArchivePanel() {
  const store = useStore()
  const isAdmin = can(store.currentRole, "manage_users")
  const summary = store.archiveSummary
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const live = liveYearRange()
  const totals = useMemo(
    () =>
      summary.reduce(
        (acc, s) => ({
          runs: acc.runs + s.runs,
          leave: acc.leave + s.leave,
          training: acc.training + s.training,
          tasks: acc.tasks + s.tasks,
          total: acc.total + s.total,
        }),
        { runs: 0, leave: 0, training: 0, tasks: 0, total: 0 },
      ),
    [summary],
  )

  // Only Admins can reach the archive — extra defensive guard.
  if (!isAdmin) {
    return <EmptyState icon={Lock} title="Restricted" description="Administrator access required to view archived data." />
  }

  function toggle(year: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === summary.length ? new Set() : new Set(summary.map((s) => s.year))))
  }

  function download(years: number[]) {
    if (years.length === 0) return
    const bundle = store.getArchive(years)
    const payload = {
      exportedAt: new Date().toISOString(),
      retentionYears: RETENTION_YEARS,
      liveWindow: `${live.start}-${live.end}`,
      archivedYears: bundle.years,
      counts: {
        runs: bundle.runs.length,
        runAssignments: bundle.runAssignments.length,
        leaveRecords: bundle.leaveRecords.length,
        trainingSessions: bundle.trainingSessions.length,
        trainingAttendance: bundle.trainingAttendance.length,
        otherTasks: bundle.otherTasks.length,
      },
      data: bundle,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const name = years.length === 1 ? `archive-${years[0]}` : `archive-${Math.min(...years)}-${Math.max(...years)}`
    a.download = `${name}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded archive for ${years.length === 1 ? years[0] : `${years.length} years`}`)
  }

  if (summary.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data archive</CardTitle>
          <CardDescription>
            Records older than the {RETENTION_YEARS}-year retention window ({live.start}–{live.end}) are archived here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Archive}
            title="Nothing archived yet"
            description={`All data currently falls within the live ${RETENTION_YEARS}-year window. Records will appear here as they age past ${live.start}.`}
          />
        </CardContent>
      </Card>
    )
  }

  const allSelected = selected.size === summary.length
  const selectedYears = Array.from(selected).sort((a, b) => a - b)

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="size-4 text-muted-foreground" aria-hidden="true" />
            Data archive
          </CardTitle>
          <CardDescription>
            {summary.length} year{summary.length === 1 ? "" : "s"} past the {RETENTION_YEARS}-year retention window (
            {live.start}–{live.end}) · {totals.total.toLocaleString()} records. Admin-only, excluded from all live views.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0}
            onClick={() => download(selectedYears)}
          >
            <Download className="mr-2 size-4" />
            Download selected{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Button size="sm" onClick={() => download(summary.map((s) => s.year))}>
            <Download className="mr-2 size-4" />
            Download all
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all archived years" />
              </TableHead>
              <TableHead>Year</TableHead>
              <TableHead className="text-right">Runs</TableHead>
              <TableHead className="text-right">Leave</TableHead>
              <TableHead className="text-right">Training</TableHead>
              <TableHead className="text-right">Other tasks</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-24 text-right">Export</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.map((s) => (
              <TableRow key={s.year}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(s.year)}
                    onCheckedChange={() => toggle(s.year)}
                    aria-label={`Select ${s.year}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {s.year}
                    <Badge variant="outline" className="text-[10px]">
                      Archived
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{s.runs.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{s.leave.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{s.training.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{s.tasks.toLocaleString()}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{s.total.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => download([s.year])}
                    aria-label={`Download ${s.year} archive`}
                  >
                    <Download className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
          Archived data is retained for compliance and is downloadable by administrators only. It never appears in
          planners, reports, or analytics.
        </p>
      </CardContent>
    </Card>
  )
}
