import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'
const js=ts.transpileModule(readFileSync(new URL('../../lib/repository/candidate-store.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const compiled={exports:{}}
new Function('require','module','exports',js)((name)=>{if(name==='server-only')return {};if(name==='node:util')return {isDeepStrictEqual};if(name==='node:crypto')return {createHash};throw Error(name)},compiled,compiled.exports)
const {candidateDDL,candidateStore,CandidateConflict}=compiled.exports
const db=new PGlite()
const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})}
try{
 await db.exec(candidateDDL)
 const repo=candidateStore(pool)
 assert.equal((await repo.read()).state,null)
 const source={version:11,staff:[{id:'s',nested:{z:1,a:'value'}}],empty:[],settings:{key:{x:true}},notifications:Array.from({length:502},(_,i)=>({id:`n${i}`,staffId:'s',sentAt:new Date(Date.UTC(2026,10,5,0,0,i)).toISOString(),readAt:i===0?'read':null,attachments:[{id:'f',pathname:'synthetic/file'}]}))}
 assert.equal((await repo.initialize(source,'test')).revision,'1')
 await assert.rejects(()=>repo.initialize(source,'test'),/already initialized/)
 assert.equal((await repo.compareSource(source)).matchesInitialCopy,true)
 const drift=structuredClone(source);drift.staff[0].rank='Isolated persistence check'
 const driftReport=await repo.compareSource(drift)
 assert.equal(driftReport.modified,1);assert.equal(driftReport.testMarkersFound,1)
 assert.equal(driftReport.sourceChangedByCheck,false)
 const active=await repo.read()
 assert.equal(active.state.notifications.length,500)
 const archive1=await repo.page({slice:'notifications',archived:true,limit:1})
 assert.equal(archive1.total,2)
 assert.equal(archive1.records.length,1)
 const archive2=await repo.page({slice:'notifications',archived:true,limit:1,after:archive1.next,expected:archive1.revision})
 assert.notEqual(archive1.records[0].key,archive2.records[0].key)
 assert.equal(archive2.next,null)
 await assert.rejects(()=>repo.page({slice:'notifications',limit:101}),/Invalid page/)
 await assert.rejects(()=>repo.page({slice:'notifications',expected:'stale'}),CandidateConflict)
 const full=await repo.read(true)
 assert.equal(full.state.notifications.length,502)
 assert.deepEqual(full.state.staff,source.staff)
 assert.deepEqual(full.state.settings,source.settings)
 assert.deepEqual(full.state.empty,[])
 assert.equal((await repo.write(active.state,'1','test')).changed,0)
 const modified=structuredClone(active.state)
 modified.staff[0].nested.z=2
 assert.equal((await repo.write(modified,'1','test')).changed,1)
 await assert.rejects(()=>repo.write(modified,'1','test'),CandidateConflict)
 assert.equal((await repo.read()).revision,'2')
 assert.equal((await repo.read(true)).state.notifications.length,502)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM roster_candidate.change')).rows[0].n,2)
 const invalid=structuredClone(modified)
 invalid.staff.push({id:'s'})
 await assert.rejects(()=>repo.write(invalid,'2','test'),/Duplicate/)
 assert.equal((await repo.read()).revision,'2')
 await repo.restoreInitial('2','test')
 assert.deepEqual((await repo.read(true)).state,source)
 assert.equal((await repo.read()).revision,'3')
 await assert.rejects(()=>repo.restoreInitial('2','test'),CandidateConflict)
 assert.equal((await db.query("SELECT count(*)::int AS n FROM roster_candidate.backup WHERE id LIKE 'before-restore-%'")).rows[0].n,1)
 // Partial writes preserve every omitted domain; explicit empty is deletion.
 assert.equal((await repo.write({staff:[{id:'s',nested:{z:3}}]},'3','test')).revision,'4')
 assert.equal((await repo.read(true)).state.notifications.length,502)
 assert.deepEqual((await repo.read()).state.settings,source.settings)
 assert.equal((await repo.write({newEmpty:[]},'4','test')).revision,'5')
 assert.deepEqual((await repo.read()).state.newEmpty,[])
 await assert.rejects(()=>repo.write({staff:{}},'5','test'),/kind change/)
 assert.equal((await repo.read()).revision,'5')
 const audit=(await db.query('SELECT actor,revision,previous_hash,event_hash,event FROM roster_candidate.audit ORDER BY id')).rows
 let previous='genesis'
 const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`:JSON.stringify(v)
 for(const row of audit){
   assert.equal(row.previous_hash,previous)
   assert.equal(row.event_hash,createHash('sha256').update(canonical({actor:row.actor,revision:String(row.revision),previous,event:row.event})).digest('hex'))
   previous=row.event_hash
 }
 const update=audit.find(a=>a.event.action==='state.save').event.changes.find(e=>e.slice==='staff')
 assert.equal(update.before.nested.z,1)
 assert.equal(update.after.nested.z,2)
 // Mandatory audit failure rolls back payloads AND revision.
 await db.exec('ALTER TABLE roster_candidate.audit RENAME TO audit_unavailable')
 await assert.rejects(()=>repo.write({staff:[]},'5','test'))
 assert.equal((await repo.read()).revision,'5')
 assert.equal((await repo.read()).state.staff.length,1)
 await db.exec('ALTER TABLE roster_candidate.audit_unavailable RENAME TO audit')
 console.log('PASS: record-organized candidate preserves fields/empty slices, archives 502 without loss, updates one changed record, rejects stale revision and rolls back failed writes')
}finally{await db.close()}
