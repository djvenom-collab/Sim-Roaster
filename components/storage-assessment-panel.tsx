"use client"

import { useState } from "react"
import type { assessStorage } from "@/lib/storage-assessment"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type Report = { exists: boolean; checkedAt: string; bytes?: number } & Partial<ReturnType<typeof assessStorage>>

export function StorageAssessmentPanel() {
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run() {
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const res = await fetch("/api/admin/storage-assessment", { cache: "no-store" })
      if (!res.ok) {
        setError(res.status === 403 ? "A signed-in Admin account is required." : res.status === 429 ? "Too many assessments. Wait a minute and try again." : "Assessment unavailable. No data was changed. Try again later.")
        return
      }
      setReport(await res.json())
    } catch {
      setError("Assessment could not be completed. No data was changed.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Storage assessment</CardTitle>
        <CardDescription>Read-only counts, sizes and known migration issues. Does not migrate, repair or delete data. This is a partial assessment, not permission to run the legacy importer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={run} disabled={busy}>{busy ? "Assessing storage…" : "Run storage assessment"}</Button>
        {busy && <p role="status" className="text-sm text-muted-foreground">Reading the current snapshot. No records are being changed.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {report && (
          <div className="space-y-3 text-sm">
            <p>Checked: {report.checkedAt}</p>
            {!report.exists ? <p>No operational snapshot exists. No migration was performed.</p> : <>
              <p>Snapshot version: {report.snapshotVersion ?? "unknown"} · Size: {((report.bytes ?? 0) / 1024 / 1024).toFixed(2)} MiB</p>
              <p className="font-medium">{report.legacyMigrationBlocked ? "Issues found: do not run the legacy migration." : "No issues detected by these checks. Full mapping, integrity and database validation are still required."}</p>
              <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th className="p-2">Slice</th><th className="p-2">Records/keys</th><th className="p-2">Bytes</th></tr></thead><tbody>{report.slices?.map((s) => <tr key={s.name} className="border-t"><td className="p-2">{s.name}{!s.present && " (absent)"}</td><td className="p-2">{s.records}</td><td className="p-2">{s.bytes.toLocaleString()}</td></tr>)}</tbody></table></div>
              <ul className="list-disc pl-5">{report.issues?.map((issue) => <li key={`${issue.slice}:${issue.code}`}>{issue.slice}: {issue.code} ({issue.count})</li>)}</ul>
              <ul className="list-disc pl-5 text-muted-foreground">{report.limitations?.map((item) => <li key={item}>{item}</li>)}</ul>
            </>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
