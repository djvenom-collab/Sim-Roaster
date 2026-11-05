import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source=readFileSync(new URL('../../lib/security/authz.ts',import.meta.url),'utf8')
const compiled={exports:{}}
let authCalls=0
new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{
 if(name==='server-only')return {}
 if(name==='next/server')return {NextResponse:{json:(body,opts)=>Response.json(body,opts)}}
 if(name==='@vercel/blob')return {get:()=>{throw Error('Must not read shared Blob')}}
 if(name==='@/lib/auth')return {auth:{api:{getSession:async()=>{authCalls++;return {user:{id:'synthetic-admin',email:'test@example.invalid',appRole:'Admin'}}}}}}
 if(name==='@/lib/permissions')return {reconcilePermissionMatrix:()=>({})}
 if(name==='./rate-limit')return {checkRateLimit:()=>({allowed:true}),clientIp:()=>''}
 throw Error(name)
},compiled,compiled.exports)
const saved={VERCEL_ENV:process.env.VERCEL_ENV,VERCEL_GIT_COMMIT_REF:process.env.VERCEL_GIT_COMMIT_REF}
try{
 process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='storage/migration-candidate'
 for(const cookie of ['', 'migration_candidate=1'])for(const method of ['PUT','POST','PATCH','DELETE'])for(const path of ['/api/state','/api/notifications/send','/api/backup/restore','/api/admin/candidate-state/extra']){
  const result=await compiled.exports.authorize(new Request('https://preview.invalid'+path,{method,headers:{cookie}}))
  assert.equal(result.ok,false);assert.equal(result.response.status,409)
 }
 assert.equal(authCalls,0,'Blocked mutations must not reach auth or source storage')
 for(const path of ['/api/admin/candidate-state','/api/admin/candidate-session','/api/admin/candidate-recovery','/api/admin/migration-copy','/api/admin/migration-rehearsal']){
  assert.equal((await compiled.exports.authorize(new Request('https://preview.invalid'+path,{method:'POST'}))).ok,true)
 }
 assert.equal((await compiled.exports.authorize(new Request('https://preview.invalid/api/state'))).ok,true)
 process.env.VERCEL_ENV='production'
 assert.equal((await compiled.exports.authorize(new Request('https://production.invalid/api/state',{method:'PUT'}))).ok,true,'Production policy remains unchanged')
}finally{for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
console.log('PASS: branch-wide shared mutations blocked before/after opt-in; only exact isolated controls allowed; production unchanged')
