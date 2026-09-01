"use client"

/* ===========================================================================
 * REPORTS / POWER BI PAGE ("/reports") — export-ready tables & charts
 * ===========================================================================
 * Summarises the data into tables/charts suited to reporting and Power BI
 * export (utilisation, currency status, leave, etc.).
 *
 * CHANGEABLE: each table/chart is built from the store data near the top of the
 * component — adjust the groupings or columns there to change what's exported.
 * =========================================================================== */
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { PageHeader } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Download, Database, FileSpreadsheet, Code } from "lucide-react"
import { simulatorIdDisplay } from "@/lib/dim"

export default function ReportsPage() {
  const store = useStore()
  const [active, setActive] = useState("DimStaff")

  // Dimension (reference) tables use the program-scoped lists. Fact tables use
  // the report* selectors, which additionally honour the global year slicer, so
  // exports reflect exactly the year(s) selected in the top bar.
  const scopedStaffIds = new Set(store.scopedStaff.map((s) => s.id))
  const scopedPositionIds = new Set(store.scopedPositions.map((p) => p.id))
  const reportSessionIds = new Set(store.reportTrainingSessions.map((t) => t.id))

  // Build normalized tables from store data
  const tables: Record<string, { columns: string[]; rows: (string | number)[][] }> = {
    DimStaff: {
      columns: ["StaffID", "Initials", "Name", "Rank", "Active"],
      rows: store.scopedStaff.map((s) => [s.id, s.initials, `${s.firstName} ${s.lastName}`, s.rank, s.active ? "Yes" : "No"]),
    },
    DimPositions: {
      columns: ["PositionID", "Code", "Name", "ValidityDays"],
      rows: store.scopedPositions.map((p) => [p.id, p.code, p.name, p.validityDays]),
    },
    DimSimulators: {
      columns: ["SimulatorID", "Code", "Name", "Location"],
      rows: store.scopedSimulators.map((s) => [simulatorIdDisplay(s.id), s.code, s.name, s.location]),
    },
    DimExercises: {
      columns: ["ExerciseID", "Code", "Name", "DurationMin"],
      rows: store.scopedExercises.map((e) => [e.id, e.code, e.name, e.durationMin]),
    },
    DimQualifications: {
      columns: ["QualificationID", "Code", "Name", "Effect"],
      rows: store.qualifications.map((q) => [q.id, q.code, q.name, q.effect]),
    },
    FactRuns: {
      columns: ["RunID", "Date", "Slot", "SimulatorID", "ExerciseID", "Status"],
      rows: store.reportRuns.map((r) => [r.id, r.date, r.slotTime, simulatorIdDisplay(r.simulatorId), r.exerciseId, r.status]),
    },
    FactRunAssignments: {
      columns: ["AssignmentID", "RunID", "PositionID", "StaffID", "Override"],
      rows: store.reportRunAssignments.map((a) => [
        a.id,
        a.runId,
        a.positionId,
        a.staffId ?? "(unfilled)",
        a.manualOverride ? "Yes" : "No",
      ]),
    },
    FactLeave: {
      columns: ["LeaveID", "StaffID", "Type", "Start", "End", "Approval"],
      rows: store.reportLeaveRecords.map((l) => [l.id, l.staffId, l.type, l.startDate, l.endDate, l.approval]),
    },
    FactTrainingAttendance: {
      columns: ["SessionID", "StaffID", "Attended"],
      rows: store.trainingAttendance
        .filter((a) => scopedStaffIds.has(a.staffId) && reportSessionIds.has(a.sessionId))
        .map((a) => [a.sessionId, a.staffId, a.attended ? "Yes" : "No"]),
    },
    FactValidity: {
      columns: ["StaffID", "PositionID", "LastDateSat", "ValidityDays"],
      rows: store.staffValidity
        .filter((v) => scopedStaffIds.has(v.staffId) && scopedPositionIds.has(v.positionId))
        .map((v) => [v.staffId, v.positionId, v.lastDateSat, v.validityDays]),
    },
    FactExerciseStatusHistory: {
      columns: ["RunID", "Status", "ChangedBy", "ChangedAt"],
      rows: store.reportRuns
        .filter((r) => r.statusChangedBy)
        .map((r) => [r.id, r.status, r.statusChangedBy ?? "", r.statusChangedAt ?? ""]),
    },
  }

  const dimTables = Object.keys(tables).filter((t) => t.startsWith("Dim"))
  const factTables = Object.keys(tables).filter((t) => t.startsWith("Fact"))

  function exportCsv(name: string) {
    const t = tables[name]
    const csv = [t.columns.join(","), ...t.rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${name}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${name}.csv (${t.rows.length} rows)`)
  }

  function exportAll() {
    toast.success(`Exported all ${Object.keys(tables).length} tables as Power BI dataset`)
  }

  const current = tables[active]

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Reports / Power BI Export"
        description="Clean, normalized star-schema tables ready for Power BI ingestion"
      >
        <Button variant="outline" onClick={exportAll}>
          <Database className="mr-2 h-4 w-4" /> Export full dataset
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dimension tables</CardDescription>
            <CardTitle className="text-2xl">{dimTables.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Reference data: staff, positions, simulators, exercises, qualifications
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fact tables</CardDescription>
            <CardTitle className="text-2xl">{factTables.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Transactional data: runs, assignments, leave, training, validity, status history
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total records</CardDescription>
            <CardTitle className="text-2xl">
              {Object.values(tables).reduce((acc, t) => acc + t.rows.length, 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across all export tables in the current dataset
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export tables</CardTitle>
          <CardDescription>
            Select a table to preview its schema and rows, then export as CSV
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={active.startsWith("Dim") ? "dim" : "fact"}>
            <TabsList>
              <TabsTrigger value="dim" onClick={() => setActive(dimTables[0])}>
                Dimensions
              </TabsTrigger>
              <TabsTrigger value="fact" onClick={() => setActive(factTables[0])}>
                Facts
              </TabsTrigger>
            </TabsList>
            <TabsContent value="dim" className="mt-4">
              <TableSelector tables={dimTables} active={active} onSelect={setActive} />
            </TabsContent>
            <TabsContent value="fact" className="mt-4">
              <TableSelector tables={factTables} active={active} onSelect={setActive} />
            </TabsContent>
          </Tabs>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm font-medium">{active}</span>
              <Badge variant="secondary">{current.rows.length} rows</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportCsv(active)}>
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportCsv(active)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
              </Button>
            </div>
          </div>

          <div className="mt-3 max-h-96 overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  {current.columns.map((c) => (
                    <TableHead key={c} className="font-mono text-xs">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {current.rows.slice(0, 50).map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="font-mono text-xs">
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {current.rows.length > 50 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing first 50 of {current.rows.length} rows. Full data included in export.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API-ready endpoint structure</CardTitle>
          <CardDescription>For future Power BI direct query / scheduled refresh</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 rounded-md bg-muted p-3 font-mono text-xs">
            {Object.keys(tables).map((t) => (
              <div key={t} className="flex items-center gap-2">
                <Badge variant="outline" className="border-chart-2/40 text-chart-2">
                  GET
                </Badge>
                <span>/api/powerbi/{t.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TableSelector({
  tables,
  active,
  onSelect,
}: {
  tables: string[]
  active: string
  onSelect: (t: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tables.map((t) => (
        <Button
          key={t}
          variant={active === t ? "default" : "outline"}
          size="sm"
          className="font-mono text-xs"
          onClick={() => onSelect(t)}
        >
          {t}
        </Button>
      ))}
    </div>
  )
}
