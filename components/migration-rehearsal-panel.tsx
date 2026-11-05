"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function MigrationRehearsalPanel() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  async function action(url: string, navigate = false) {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch(url,{method:"POST"})
      const report = await res.json()
      setResult(JSON.stringify(report,null,2))
      if(res.ok && navigate) { router.push("/"); router.refresh() }
    } catch { setResult("Action failed; production data unchanged.") } finally {setBusy(false)}
  }
  async function run() {
    setBusy(true)
    setResult(null)
    try {
      const response = await fetch("/api/admin/migration-rehearsal", { method: "POST" })
      setResult(JSON.stringify(await response.json(), null, 2))
    } catch { setResult("Test could not be completed.") } finally { setBusy(false) }
  }
  return <section className="space-y-4"><h1 className="text-2xl font-semibold">Isolated migration test</h1><p>Synthetic data only, on the separate MIGRATION_TEST database. Does not import or modify the operational roster. Temporary test schema is removed afterwards.</p><Button disabled={busy} onClick={run}>{busy ? "Testing isolated database…" : "Run isolated database test"}</Button><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => action("/api/admin/migration-copy")}>Copy private roster into isolated database</Button><Button disabled={busy} onClick={() => action("/api/admin/candidate-session?action=enter",true)}>Open isolated roster copy</Button><Button disabled={busy} onClick={() => action("/api/admin/candidate-session?action=exit",true)}>Leave isolated copy</Button></div><p>Copy is one-time and rejects an initialized target. Full source values are compared before commit; only aggregate results are shown. No attachment bytes copied.</p>{result && <pre className="overflow-auto rounded border p-4" role="status">{result}</pre>}</section>
}
