"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function MigrationRehearsalPanel() {
  const router=useRouter()
  const [busy,setBusy]=useState(false)
  const [confirmRecovery,setConfirmRecovery]=useState(false)
  const [result,setResult]=useState<string|null>(null)
  async function action(url:string,navigate=false){
    setBusy(true)
    setResult(null)
    try{
      const res=await fetch(url,{method:"POST"})
      setResult(JSON.stringify(await res.json(),null,2))
      if(res.ok&&navigate){router.push("/");router.refresh()}
    }catch{setResult("Action failed; production data unchanged.")}finally{setBusy(false);setConfirmRecovery(false)}
  }
  return <section className="space-y-4">
    <h1 className="text-2xl font-semibold">Isolated migration test</h1>
    <p>Private-copy rehearsal on the separate MIGRATION_TEST database. The operational roster is never modified. No attachment bytes are copied.</p>
    <div className="flex flex-wrap gap-3">
      <Button disabled={busy} onClick={()=>action("/api/admin/migration-rehearsal")}>Run isolated database test</Button>
      <Button disabled={busy} onClick={()=>action("/api/admin/migration-copy")}>Copy private roster into isolated database</Button>
      <Button disabled={busy} onClick={()=>action("/api/admin/candidate-session?action=enter",true)}>Open isolated roster copy</Button>
      <Button disabled={busy} onClick={()=>action("/api/admin/candidate-session?action=exit",true)}>Leave isolated copy</Button>
      <Button disabled={busy} onClick={()=>setConfirmRecovery(true)}>Test isolated backup recovery</Button>
    </div>
    {confirmRecovery&&<div className="space-y-3 rounded border p-4"><p>Restore only the test database to its initial private copy? Current test data will be retained in a candidate backup. Production is not changed.</p><Button disabled={busy} onClick={()=>action("/api/admin/candidate-recovery")}>Confirm isolated recovery</Button><Button disabled={busy} onClick={()=>setConfirmRecovery(false)}>Cancel recovery</Button></div>}
    {busy&&<p role="status">Working on the isolated database…</p>}
    <p>Private copy is one-time and rejects an initialized target. Complete source values are compared before commit; only aggregate results are shown.</p>
    {result&&<pre className="overflow-auto rounded border p-4" role="status">{result}</pre>}
  </section>
}
