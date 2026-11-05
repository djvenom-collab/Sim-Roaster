import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'
const store=readFileSync(new URL('../../lib/store.tsx',import.meta.url),'utf8')
const start=store.indexOf('  const log = useCallback(')
assert.ok(start>0)
const end=store.indexOf('}, [])',start)
const source=store.slice(start,end+6).replace('const log =','export const log =')
const compiled={exports:{}}
let rows=[]
const before=Date.now
try{
 Date.now=()=>12345
 new Function('exports','useCallback','setAuditLogs','todayISO','currentUserRef','crypto',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(compiled.exports,fn=>fn,update=>{rows=update(rows)},()=> '2026-11-05',{current:{name:'Synthetic demo'}},{randomUUID})
 // Staff save invokes staff.edit and qualification.edit in one event handler.
 for(let i=0;i<50;i++){compiled.exports.log('staff.edit','synthetic');compiled.exports.log('qualification.edit','synthetic')}
 assert.equal(rows.length,100)
 assert.equal(new Set(rows.map(r=>r.id)).size,100,'Same-millisecond audit events must never collide')
}finally{Date.now=before}
console.log('PASS: actual store audit callback generates 100 unique IDs with the clock frozen; paired staff/qualification edits preserved')
