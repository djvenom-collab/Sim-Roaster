"use client"

/* ===========================================================================
 * SIM HOURS STATUS TABLE — hours per simulator broken down by run status
 * ===========================================================================
 * For one program and year, lists every simulator with its confirmed,
 * completed, cancelled, postponed and tentative hours plus a row total, and a
 * grand-total footer. Powers the "calculation" section of the SIM Hours page.
 * =========================================================================== */
import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useStore } from "@/lib/store"
import { simHoursByStatus, STATUS_ORDER, type ChartRange } from "@/lib/analytics"
import type { Program } from "@/lib/program"

const fmt = (n: number) => `${n}h`

export function SimHoursStatusTable({ program, range }: { program: Program; range: ChartRange }) {
  const store = useStore()
  const rows = useMemo(
    () => simHoursByStatus(store.runs, store.simulators, store.exerciseById, program, range),
    [store.runs, store.simulators, store.exerciseById, program, range],
  )

  const label = program === "RADAR" ? "Radar" : "Tower"
  const scope = range.ytd ? `YTD ${range.year}` : `${range.year}`
  const totals = useMemo(() => {
    const t = { confirmed: 0, completed: 0, tentative: 0, postponed: 0, cancelled: 0, total: 0 }
    for (const r of rows) {
      t.confirmed += r.confirmed
      t.completed += r.completed
      t.tentative += r.tentative
      t.postponed += r.postponed
      t.cancelled += r.cancelled
      t.total += r.total
    }
    return {
      confirmed: Math.round(t.confirmed * 10) / 10,
      completed: Math.round(t.completed * 10) / 10,
      tentative: Math.round(t.tentative * 10) / 10,
      postponed: Math.round(t.postponed * 10) / 10,
      cancelled: Math.round(t.cancelled * 10) / 10,
      total: Math.round(t.total * 10) / 10,
    }
  }, [rows])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label} — Hours by Status ({scope})</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Simulator</TableHead>
                {STATUS_ORDER.map((s) => (
                  <TableHead key={s} className="text-right capitalize">
                    {s}
                  </TableHead>
                ))}
                <TableHead className="text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={STATUS_ORDER.length + 2} className="text-center text-muted-foreground">
                    No {label} simulators.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.sim.id}>
                    <TableCell>
                      <span className="font-mono font-medium">{r.sim.code}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{r.sim.name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.confirmed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.completed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.tentative)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.postponed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(r.cancelled)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmt(r.total)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {rows.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">All {label} simulators</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totals.confirmed)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totals.completed)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totals.tentative)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totals.postponed)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(totals.cancelled)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmt(totals.total)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
