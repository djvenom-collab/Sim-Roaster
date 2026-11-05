import "server-only"
import { isDeepStrictEqual } from "node:util"
import type { Pool, PoolClient } from "pg"

// Transitional record-oriented repository. JSONB preserves the full current
// model; domain/key/order columns avoid rewriting unchanged entities. Not a
// normalized/FK-complete operational schema, never production-selected here.
export const candidateDDL = `
CREATE SCHEMA IF NOT EXISTS roster_candidate;
CREATE TABLE IF NOT EXISTS roster_candidate.meta(id integer PRIMARY KEY CHECK(id=1), revision bigint NOT NULL, initialized boolean NOT NULL);
INSERT INTO roster_candidate.meta VALUES(1,0,false) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS roster_candidate.slice(name text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('array','object','value')));
CREATE TABLE IF NOT EXISTS roster_candidate.record(slice text NOT NULL REFERENCES roster_candidate.slice(name), key text NOT NULL, ordinal integer NOT NULL, payload jsonb NOT NULL, archived boolean NOT NULL DEFAULT false, PRIMARY KEY(slice,key));
CREATE INDEX IF NOT EXISTS record_order ON roster_candidate.record(slice,archived,ordinal);
CREATE TABLE IF NOT EXISTS roster_candidate.change(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, occurred_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, revision bigint NOT NULL, changed integer NOT NULL);
CREATE TABLE IF NOT EXISTS roster_candidate.backup(id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL);
`
export type CandidateSnapshot = Record<string, unknown>
export class CandidateConflict extends Error {}

function records(state: CandidateSnapshot) {
  const result: { slice: string; kind: string; key: string; ordinal: number; payload: unknown }[] = []
  for (const [slice,value] of Object.entries(state)) {
    if (Array.isArray(value)) {
      const used = new Set<string>()
      value.forEach((payload,ordinal) => {
        const id = payload && typeof payload === "object" && "id" in payload ? payload.id : undefined
        const key = typeof id === "string" || typeof id === "number" ? `id:${id}` : `index:${ordinal}`
        if (used.has(key)) throw new Error("Duplicate entity ID")
        used.add(key)
        result.push({slice,kind:"array",key,ordinal,payload})
      })
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key,payload],ordinal)=>result.push({slice,kind:"object",key,ordinal,payload}))
    } else result.push({slice,kind:"value",key:"value",ordinal:0,payload:value})
  }
  return result
}
async function readFrom(client: PoolClient, includeArchive = false) {
  const meta = (await client.query("SELECT revision,initialized FROM roster_candidate.meta WHERE id=1")).rows[0]
  if (!meta?.initialized) return {state:null,revision:String(meta?.revision ?? 0)}
  const slices = (await client.query("SELECT name,kind FROM roster_candidate.slice")).rows
  const rows = (await client.query("SELECT slice,key,payload FROM roster_candidate.record WHERE ($1::boolean OR NOT archived) ORDER BY slice,ordinal,key",[includeArchive])).rows
  const state: CandidateSnapshot = Object.fromEntries(slices.map(s=>[s.name,s.kind==="array"?[]:s.kind==="object"?{}:null]))
  const kinds=new Map(slices.map(s=>[s.name,s.kind]))
  for(const row of rows){ const kind=kinds.get(row.slice); if(kind==="array") (state[row.slice] as unknown[]).push(row.payload); else if(kind==="object") (state[row.slice] as Record<string,unknown>)[row.key]=row.payload; else state[row.slice]=row.payload }
  return {state,revision:String(meta.revision)}
}

export function candidateStore(pool: Pool) {
  async function read(includeArchive = false) {
    const c=await pool.connect()
    try { await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const result=await readFrom(c,includeArchive); await c.query("COMMIT"); return result } catch(e){await c.query("ROLLBACK");throw e} finally{c.release()}
  }
  async function write(state:CandidateSnapshot, expected:string, actor:string) {
    const c=await pool.connect()
    try {
      await c.query("BEGIN")
      await c.query("SET LOCAL statement_timeout='30s'")
      const meta=(await c.query("SELECT revision FROM roster_candidate.meta WHERE id=1 FOR UPDATE")).rows[0]
      if(String(meta.revision)!==expected) throw new CandidateConflict()
      const next=records(state)
      let changed=0
      const existing=(await c.query("SELECT slice,key,payload,ordinal,archived FROM roster_candidate.record")).rows
      const existingByKey=new Map(existing.map(r=>[JSON.stringify([r.slice,r.key]),r]))
      for(const [name,value] of Object.entries(state)){
        const kind=Array.isArray(value)?"array":value&&typeof value==="object"?"object":"value"
        await c.query("INSERT INTO roster_candidate.slice VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET kind=excluded.kind",[name,kind])
      }
      for(const row of next){
        const old=existingByKey.get(JSON.stringify([row.slice,row.key]))
        // Archived notifications are immutable through the active snapshot bridge.
        if(old?.archived) continue
        if(old && row.slice==="notifications") row.ordinal=old.ordinal
        if(old&&isDeepStrictEqual(old.payload,row.payload)&&old.ordinal===row.ordinal) continue
        await c.query("INSERT INTO roster_candidate.record(slice,key,ordinal,payload) VALUES($1,$2,$3,$4) ON CONFLICT(slice,key) DO UPDATE SET ordinal=excluded.ordinal,payload=excluded.payload",[row.slice,row.key,row.ordinal,JSON.stringify(row.payload)])
        changed++
      }
      const keys=new Set(next.map(r=>JSON.stringify([r.slice,r.key])))
      for(const old of existing){
        if(old.archived||keys.has(JSON.stringify([old.slice,old.key])))continue
        // An omitted notification is archived, never physically discarded.
        if(old.slice==="notifications") await c.query("UPDATE roster_candidate.record SET archived=true WHERE slice=$1 AND key=$2",[old.slice,old.key])
        else await c.query("DELETE FROM roster_candidate.record WHERE slice=$1 AND key=$2",[old.slice,old.key])
        changed++
      }
      // Reject malformed timestamps rather than archive in an arbitrary order.
      await c.query(`WITH ranked AS (SELECT key,row_number() OVER(ORDER BY (payload->>'sentAt')::timestamptz DESC,ordinal,key) AS n FROM roster_candidate.record WHERE slice='notifications' AND NOT archived) UPDATE roster_candidate.record r SET archived=true FROM ranked v WHERE r.slice='notifications' AND r.key=v.key AND v.n>500`)
      const revision=String(BigInt(expected)+BigInt(1))
      await c.query("UPDATE roster_candidate.meta SET revision=$1,initialized=true WHERE id=1",[revision])
      await c.query("INSERT INTO roster_candidate.change(actor,revision,changed) VALUES($1,$2,$3)",[actor,revision,changed])
      await c.query("COMMIT")
      return {revision,changed}
    } catch(e){await c.query("ROLLBACK");throw e} finally{c.release()}
  }
  async function initialize(state: CandidateSnapshot, actor: string) {
    const next = records(state)
    const c = await pool.connect()
    try {
      await c.query("BEGIN")
      await c.query("SET LOCAL statement_timeout='45s'")
      const meta = (await c.query("SELECT initialized FROM roster_candidate.meta WHERE id=1 FOR UPDATE")).rows[0]
      if (meta.initialized) throw new Error("Candidate already initialized")
      for (const [name,value] of Object.entries(state)) await c.query("INSERT INTO roster_candidate.slice VALUES($1,$2)", [name,Array.isArray(value)?"array":value&&typeof value==="object"?"object":"value"])
      for (let i=0;i<next.length;i+=300) {
        const params: unknown[]=[]
        const tuples=next.slice(i,i+300).map(r=>{
          const n=params.length
          params.push(r.slice,r.key,r.ordinal,JSON.stringify(r.payload))
          return `($${n+1},$${n+2},$${n+3},$${n+4}::jsonb)`
        })
        await c.query(`INSERT INTO roster_candidate.record(slice,key,ordinal,payload) VALUES ${tuples.join(",")}`,params)
      }
      await c.query("UPDATE roster_candidate.meta SET initialized=true,revision=1 WHERE id=1")
      const reconstructed=await readFrom(c,true)
      if (!isDeepStrictEqual(reconstructed.state,state)) throw new Error("Private copy value parity failed")
      await c.query(`WITH ranked AS (SELECT key,row_number() OVER(ORDER BY (payload->>'sentAt')::timestamptz DESC,ordinal,key) AS n FROM roster_candidate.record WHERE slice='notifications') UPDATE roster_candidate.record r SET archived=true FROM ranked v WHERE r.slice='notifications' AND r.key=v.key AND v.n>500`)
      // Preserve source evidence independently of subsequent candidate edits.
      await c.query("INSERT INTO roster_candidate.backup(id,payload) VALUES('initial-private-copy',$1)",[JSON.stringify(state)])
      await c.query("INSERT INTO roster_candidate.change(actor,revision,changed) VALUES($1,1,$2)",[actor,next.length])
      await c.query("COMMIT")
      return {revision:"1",records:next.length,slices:Object.keys(state).length,parity:true}
    } catch(e){await c.query("ROLLBACK");throw e} finally{c.release()}
  }
  return {read,write,initialize}
}
