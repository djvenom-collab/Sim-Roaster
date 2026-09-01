"use client"

/* ===========================================================================
 * MANAGEMENT YEAR TABLE — every metric × every year, one matrix
 * ===========================================================================
 * The full-perspective grid: one row per headline metric, one column per year
 * (chronological). The strongest year for each metric is highlighted using the
 * metric's own "higher is better" direction, so management can spot peaks and
 * troughs without reading every number.
 * =========================================================================== */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { MANAGEMENT_METRICS, type YearMetrics } from "@/lib/management-analytics"

export function ManagementYearTable({ rows }: { rows: YearMetrics[] }) {
  // rows arrive oldest → newest; render columns the same way.
  const years = rows.map((r) => r.year)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">All years at a glance</CardTitle>
        <CardDescription>Every headline metric across the retained window. The best year per metric is highlighted.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card">Metric</TableHead>
                {years.map((y) => (
                  <TableHead key={y} className="text-right tabular-nums">
                    {y}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MANAGEMENT_METRICS.map((m) => {
                const values = rows.map((r) => m.get(r))
                const best = m.higherIsBetter ? Math.max(...values) : Math.min(...values)
                const hasSpread = Math.max(...values) !== Math.min(...values)
                return (
                  <TableRow key={m.key}>
                    <TableCell className="sticky left-0 bg-card font-medium">{m.label}</TableCell>
                    {rows.map((r) => {
                      const v = m.get(r)
                      const isBest = hasSpread && v === best
                      return (
                        <TableCell
                          key={r.year}
                          className={`text-right tabular-nums ${isBest ? "font-semibold text-emerald-600" : ""}`}
                        >
                          {m.format(v)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
