"use client"

/* ===========================================================================
 * SIM EXCEL IMPORT PAGE ("/import") — bulk-load a schedule from a spreadsheet
 * ===========================================================================
 * Lets a manager upload an Excel/CSV schedule, preview the parsed rows, see
 * which were accepted vs rejected, and import them. A history of past imports
 * is kept for reference.
 *
 * This is a demo importer: the column mapping and accept/reject checks live in
 * this file — edit them to match your own spreadsheet layout.
 * =========================================================================== */
import { useState } from "react"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { programDisplay } from "@/lib/program"
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, FileSpreadsheet, Check, X, AlertTriangle, Download } from "lucide-react"
import { toast } from "sonner"

// Simulated "uploaded" Excel rows
const SAMPLE_ROWS = [
  { row: 1, date: "2025-06-12", slot: "08:00", sim: "FFS-A320", exercise: "LOFT-04", status: "Confirmed", detect: "new" },
  { row: 2, date: "2025-06-12", slot: "13:00", sim: "FFS-B738", exercise: "ENG-FIRE", status: "Tentative", detect: "duplicate" },
  { row: 3, date: "2025-06-13", slot: "08:00", sim: "FFS-A320", exercise: "RTO-02", status: "Confirmed", detect: "changed" },
  { row: 4, date: "2025-06-13", slot: "13:00", sim: "FNPT-DA42", exercise: "NAV-XX", status: "Cancelled", detect: "cancelled" },
  { row: 5, date: "2025-06-14", slot: "08:00", sim: "FFS-B738", exercise: "", status: "Confirmed", detect: "error" },
]

const APP_FIELDS = ["date", "slot", "simulator", "exercise", "status", "(ignore)"]

const DETECT_META: Record<string, { label: string; tone: string }> = {
  new: { label: "New exercise", tone: "bg-chart-2/15 text-chart-2 border-chart-2/30" },
  changed: { label: "Changed", tone: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  cancelled: { label: "Cancelled", tone: "bg-destructive/15 text-destructive border-destructive/30" },
  duplicate: { label: "Duplicate run", tone: "bg-muted text-muted-foreground border-border" },
  error: { label: "Error: missing exercise", tone: "bg-destructive/15 text-destructive border-destructive/30" },
}

export default function ImportPage() {
  const store = useStore()
  const allowed = can(store.currentRole, "import_excel")
  const [stage, setStage] = useState<"upload" | "map" | "preview">("upload")
  const [decisions, setDecisions] = useState<Record<number, "accept" | "reject">>({})
  const [mapping, setMapping] = useState<Record<string, string>>({
    "Column A": "date",
    "Column B": "slot",
    "Column C": "simulator",
    "Column D": "exercise",
    "Column E": "status",
  })

  function decide(row: number, d: "accept" | "reject") {
    setDecisions((prev) => ({ ...prev, [row]: d }))
  }

  function acceptAllValid() {
    const next: Record<number, "accept" | "reject"> = {}
    SAMPLE_ROWS.forEach((r) => {
      next[r.row] = r.detect === "error" ? "reject" : "accept"
    })
    setDecisions(next)
  }

  function saveImport() {
    const accepted = SAMPLE_ROWS.filter((r) => decisions[r.row] === "accept").length
    const scopeTag = store.activeProgram === "ALL" ? "all programs" : programDisplay(store.activeProgram)
    store.logImport(`Imported sim_schedule_june.xlsx — ${accepted} rows accepted (${scopeTag})`)
    toast.success(`Import saved: ${accepted} rows committed to schedule`)
    setStage("upload")
    setDecisions({})
  }

  if (!allowed) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Excel Import" description="Import simulator schedules from Excel" />
        <EmptyState
          icon={X}
          title="Access restricted"
          description="You need TL (Level 3) or Admin permissions to import schedule data."
        />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Excel Import"
        description="Upload, map, preview, and reconcile simulator schedule data"
      >
        {stage !== "upload" && (
          <Button variant="outline" onClick={() => setStage("upload")}>
            Start over
          </Button>
        )}
      </PageHeader>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {["upload", "map", "preview"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                stage === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className={stage === s ? "font-medium" : "text-muted-foreground"}>
              {s === "upload" ? "Upload" : s === "map" ? "Map columns" : "Preview & reconcile"}
            </span>
            {i < 2 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>

      {stage === "upload" && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">Drop your Excel file here</p>
                <p className="text-sm text-muted-foreground">
                  Supports .xlsx and .csv — schedule exports up to 5MB
                </p>
              </div>
              <Button onClick={() => setStage("map")}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Select sample file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "map" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Map Excel columns to app fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(mapping).map((col) => (
              <div key={col} className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium">{col}</span>
                <Select
                  value={mapping[col]}
                  onValueChange={(v) => setMapping((p) => ({ ...p, [col]: v }))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_FIELDS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={() => setStage("preview")}>Preview rows</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {stage === "preview" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Preview & reconcile (5 rows)</CardTitle>
            <Button variant="outline" size="sm" onClick={acceptAllValid}>
              Accept all valid
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Simulator</TableHead>
                  <TableHead>Exercise</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detection</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SAMPLE_ROWS.map((r) => {
                  const meta = DETECT_META[r.detect]
                  const d = decisions[r.row]
                  return (
                    <TableRow key={r.row} className={r.detect === "error" ? "bg-destructive/5" : ""}>
                      <TableCell className="text-muted-foreground">{r.row}</TableCell>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{r.slot}</TableCell>
                      <TableCell className="font-mono text-xs">{r.sim}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.exercise || <span className="text-destructive">— missing —</span>}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status.toLowerCase()} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.tone}>
                          {r.detect === "error" && <AlertTriangle className="mr-1 h-3 w-3" />}
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant={d === "accept" ? "default" : "outline"}
                            className="h-7 w-7"
                            disabled={r.detect === "error"}
                            onClick={() => decide(r.row, "accept")}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant={d === "reject" ? "destructive" : "outline"}
                            className="h-7 w-7"
                            onClick={() => decide(r.row, "reject")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {Object.values(decisions).filter((d) => d === "accept").length} accepted ·{" "}
                {Object.values(decisions).filter((d) => d === "reject").length} rejected
              </p>
              <div className="flex gap-2">
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" /> Export cleaned CSV
                </Button>
                <Button
                  onClick={saveImport}
                  disabled={!Object.values(decisions).some((d) => d === "accept")}
                >
                  Save import
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import history</CardTitle>
        </CardHeader>
        <CardContent>
          {store.importHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="space-y-2">
              {store.importHistory.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>{h.summary}</span>
                  <span className="text-xs text-muted-foreground">{h.when}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
