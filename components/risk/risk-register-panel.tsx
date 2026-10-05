"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Download, Plus, Search, ShieldAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/shared"
import { cn } from "@/lib/utils"
import { BASES, RISK_CATEGORIES, STATUSES, type Risk } from "@/lib/risk/model"
import { RiskHeatMap, type Cell } from "./risk-heat-map"
import { RiskCreateDialog } from "./risk-create-dialog"
import { RiskDetailSheet } from "./risk-detail-sheet"
import { ERROR_TEXT, NativeSelect, riskFetcher, riskRequest, ScoreChip, STATUS_LABEL, toOptions } from "./risk-ui"

const ALL = { value: "", label: "All" }

export function RiskRegisterPanel() {
  const { data, error, isLoading, mutate } = useSWR<{ risks: Risk[] }>("/api/risks", riskFetcher)
  const [mode, setMode] = useState<"inherent" | "residual">("residual")
  const [cell, setCell] = useState<Cell>(null)
  const [status, setStatus] = useState("")
  const [basis, setBasis] = useState("")
  const [category, setCategory] = useState("")
  const [q, setQ] = useState("")
  const [showClosed, setShowClosed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const risks = data?.risks ?? []
  const live = useMemo(() => risks.filter((r) => showClosed || r.status !== "closed"), [risks, showClosed])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return live.filter((r) => {
      if (status && r.status !== status) return false
      if (basis && r.basis !== basis) return false
      if (category && r.category !== category) return false
      if (cell) {
        const [l, i] = mode === "inherent" ? [r.likelihood, r.impact] : [r.residualLikelihood, r.residualImpact]
        if (l !== cell.likelihood || i !== cell.impact) return false
      }
      return !needle || `${r.id} ${r.title} ${r.description} ${r.riskOwner ?? ""}`.toLowerCase().includes(needle)
    })
  }, [live, status, basis, category, cell, mode, q])

  const today = new Date().toISOString().slice(0, 10)
  const overdue = live.filter((r) => r.reviewDate && r.reviewDate < today && r.status !== "closed").length

  async function importBaseline() {
    setImporting(true)
    try {
      const { imported } = await riskRequest<{ imported: number }>("/api/risks", "POST", { op: "import_baseline" })
      toast.success(imported ? `Imported ${imported} baseline risks` : "Baseline already imported")
      await mutate()
    } catch (e) {
      toast.error(ERROR_TEXT[(e as Error).message] ?? "Import failed")
    } finally {
      setImporting(false)
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), risks }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `risk-register-${today}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            icon={ShieldAlert}
            title={error.message === "forbidden" ? "Admin access required" : "Risk register unavailable"}
            description={error.message === "forbidden" ? "Only administrators can view the risk register." : "Check that the risk schema has been applied (scripts/risk/apply-risk-schema.mjs)."}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Risk register</CardTitle>
            <CardDescription className="text-pretty">
              ISO 31000-aligned. Score = likelihood × impact. Every change is written to the audit trail before it is saved.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={importBaseline} disabled={importing}>
              {importing ? "Importing…" : "Import baseline"}
            </Button>
            <Button variant="outline" size="sm" onClick={exportJson} disabled={risks.length === 0}>
              <Download className="size-4" /> Export
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New risk
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div role="group" aria-label="Heat map basis" className="inline-flex rounded-md border border-border p-0.5">
                {(["residual", "inherent"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m)
                      setCell(null)
                    }}
                    className={cn("rounded px-3 py-1 text-xs capitalize", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {cell ? (
                <Button variant="ghost" size="sm" onClick={() => setCell(null)}>
                  Clear cell filter
                </Button>
              ) : null}
            </div>
            <RiskHeatMap risks={live} mode={mode} selected={cell} onSelect={setCell} />
          </div>
          <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-4 text-sm">
            {(["open", "treating", "mitigated", "accepted"] as const).map((s) => (
              <div key={s} className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">{STATUS_LABEL[s]}</dt>
                <dd className="font-mono text-2xl tabular-nums">{risks.filter((r) => r.status === s).length}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Observed / potential</dt>
              <dd className="font-mono text-2xl tabular-nums">
                {live.filter((r) => r.basis === "observed").length} / {live.filter((r) => r.basis === "potential").length}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Reviews overdue</dt>
              <dd className={cn("font-mono text-2xl tabular-nums", overdue > 0 && "text-destructive")}>{overdue}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input aria-label="Search risks" placeholder="Search ID, title, owner" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <NativeSelect aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ ...ALL, label: "All statuses" }, ...toOptions(STATUSES, STATUS_LABEL)]} />
            <NativeSelect aria-label="Filter by basis" value={basis} onChange={(e) => setBasis(e.target.value)} options={[{ ...ALL, label: "Observed + potential" }, ...toOptions(BASES)]} />
            <NativeSelect aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)} options={[{ ...ALL, label: "All categories" }, ...toOptions(RISK_CATEGORIES)]} />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="size-4 accent-primary" />
              Closed
            </label>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading risk register…</p>
          ) : risks.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No risks recorded" description="Import the baseline register identified from the codebase, or create a risk." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">ID</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead>Inherent</TableHead>
                    <TableHead>Residual</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r.id)}>
                      <TableCell className="font-mono text-xs">
                        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSelected(r.id)}>
                          {r.id}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-sm">
                        <div className="truncate font-medium">{r.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.category}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.basis === "observed" ? "default" : "outline"} className="capitalize">{r.basis}</Badge>
                      </TableCell>
                      <TableCell><ScoreChip value={r.inherentScore} /></TableCell>
                      <TableCell><ScoreChip value={r.residualScore} /></TableCell>
                      <TableCell className="text-sm">{r.riskOwner ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                      <TableCell><Badge variant="secondary">{STATUS_LABEL[r.status]}</Badge></TableCell>
                      <TableCell className={cn("font-mono text-xs", r.reviewDate && r.reviewDate < today && r.status !== "closed" && "text-destructive")}>
                        {r.reviewDate ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                        No risks match these filters.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RiskCreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(r) => {
          setCreating(false)
          void mutate()
          setSelected(r.id)
        }}
      />
      <RiskDetailSheet riskId={selected} onClose={() => setSelected(null)} onChanged={() => void mutate()} />
    </div>
  )
}
