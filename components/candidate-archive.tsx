"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
type Page={records:{key:string;payload:{subject?:string;sentAt?:string;channel?:string}}[];total:number;revision:string;next:string|null}
export function CandidateArchive(){
  const [page,setPage]=useState<Page|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  async function load(next=false){
    setBusy(true);setError("")
    try{
      const params=new URLSearchParams({slice:"notifications",archived:"true",limit:"25"})
      if(next&&page?.next){params.set("after",page.next);params.set("revision",page.revision)}
      const res=await fetch(`/api/admin/candidate-records?${params}`,{cache:"no-store"})
      if(!res.ok)throw new Error(res.status===409?"Data changed. Reload the archive to restart pagination.":"Archive could not be loaded. No records changed.")
      setPage(await res.json())
    }catch(e){setError(e instanceof Error?e.message:"Archive unavailable")}finally{setBusy(false)}
  }
  return <section className="space-y-3 rounded border p-4" aria-label="Isolated notification archive">
    <h2 className="text-lg font-semibold">Isolated notification archive</h2>
    <p>Read-only archive on the test database. Older messages are retained, not deleted. Files are not downloaded here.</p>
    <Button disabled={busy} onClick={()=>load()}>Load archived notifications</Button>
    {busy&&<p role="status">Loading archive…</p>}
    {error&&<p role="alert">{error}</p>}
    {page&&<><p role="status">{page.total} archived notifications. Showing {page.records.length}.</p>
      <ul className="space-y-2">{page.records.map(r=><li className="rounded border p-2" key={r.key}><strong>{r.payload.subject??"Notification"}</strong><span className="ml-2">{r.payload.sentAt??"No date"} · {r.payload.channel??"Unknown channel"}</span></li>)}</ul>
      {page.next&&<Button disabled={busy} onClick={()=>load(true)}>Next archive page</Button>}
    </>}
  </section>
}
