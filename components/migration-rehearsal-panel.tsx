"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export function MigrationRehearsalPanel() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  async function run() {
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch("/api/admin/migration-rehearsal", { method: "POST" })
      setResult(JSON.stringify(await response.json(), null, 2))
    } catch { setResult("Test could not be completed.") } finally { setBusy(false) }
  }
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Isolated migration test</h1><p>Synthetic data only, on the separate MIGRATION_TEST database. Does not import or modify the operational roster. Temporary test schema is removed afterwards.</p><Button disabled={busy} onClick={run}>{busy ? "Testing isolated database…" : "Run isolated database test"}</Button>{result && <pre className="overflow-auto rounded border p-4" role="status">{result}</pre>}</section>
}
