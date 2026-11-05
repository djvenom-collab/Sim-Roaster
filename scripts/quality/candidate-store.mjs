import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'
const js=ts.transpileModule(readFileSync(new URL('../../lib/repository/candidate-store.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
const compiled={exports:{}}
new Function('require','module','exports',js)((name)=>{if(name==='server-only')return {};if(name==='node:util')return {isDeepStrictEqual};throw Error(name)},compiled,compiled.exports)
const {candidateDDL,candidateStore,CandidateConflict}=compiled.exports
const db=new PGlite()
const pool={connect:async()=>({query:(...args)=>db.query(...args),release(){}})}
try{
 await db.exec(candidateDDL)
 const repo=candidateStore(pool)
 assert.equal((await repo.read()).state,null)
 const source={version:11,staff:[{id:'s',nested:{z:1,a:'value'}}],empty:[],settings:{key:{x:true}},notifications:Array.from({length:502},(_,i)=>({id:`n${i}`,staffId:'s',sentAt:new Date(Date.UTC(2026,10,5,0,0,i)).toISOString(),readAt:i===0?'read':null,attachments:[{id:'f',pathname:'synthetic/file'}]}))}
 assert.equal((await repo.initialize(source,'test')).revision,'1')
 await assert.rejects(()=>repo.initialize(source,'test'),/already initialized/)
 const active=await repo.read()
 assert.equal(active.state.notifications.length,500)
 const full=await repo.read(true)
 assert.equal(full.state.notifications.length,502)
 assert.deepEqual(full.state.staff,source.staff)
 assert.deepEqual(full.state.settings,source.settings)
 assert.deepEqual(full.state.empty,[])
 assert.equal((await repo.write(active.state,'1','test')).changed,0)
 const modified=structuredClone(active.state)
 modified.staff[0].nested.z=2
 assert.equal((await repo.write(modified,'2','test')).changed,1)
 await assert.rejects(()=>repo.write(modified,'2','test'),CandidateConflict)
 assert.equal((await repo.read()).revision,'3')
 assert.equal((await repo.read(true)).state.notifications.length,502)
 assert.equal((await db.query('SELECT count(*)::int AS n FROM roster_candidate.change')).rows[0].n,3)
 const invalid=structuredClone(modified)
 invalid.staff.push({id:'s'})
 await assert.rejects(()=>repo.write(invalid,'3','test'),/Duplicate/)
 assert.equal((await repo.read()).revision,'3')
 await repo.restoreInitial('3','test')
 assert.deepEqual((await repo.read(true)).state,source)
 assert.equal((await repo.read()).revision,'4')
 await assert.rejects(()=>repo.restoreInitial('3','test'),CandidateConflict)
 assert.equal((await db.query("SELECT count(*)::int AS n FROM roster_candidate.backup WHERE id LIKE 'before-restore-%'")).rows[0].n,1)
 console.log('PASS: record-organized candidate preserves fields/empty slices, archives 502 without loss, updates one changed record, rejects stale revision and rolls back failed writes')
}finally{await db.close()}
