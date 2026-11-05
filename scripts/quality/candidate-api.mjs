import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
let actor=null,poolCalls=0,sourceReads=0,pageOptions
class CandidateConflict extends Error{}
class CandidateInvalidState extends Error{}
const jsonError=(status,error)=>Response.json({error},{status})
function load(path){
 const compiled={exports:{}}
 new Function('require','module','exports',ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{
  if(name==='next/server')return {NextResponse:{json:Response.json}}
  if(name==='@/lib/security/authz')return {authorize:async()=>actor?{ok:true,ctx:{role:actor}}:{ok:false,response:jsonError(401,'unauthorized')},jsonError}
  if(name==='@/lib/repository/migration-test')return {migrationTestPool:()=>{poolCalls++;return {end:async()=>{}}}}
  if(name==='@/lib/repository/state-repository')return {stateRepository:{read:async()=>{sourceReads++;return {state:{privateText:'never return or log'}}}}}
  if(name==='@/lib/repository/candidate-store')return {CandidateConflict,CandidateInvalidState,candidateStore:()=>({page:async options=>{pageOptions=options;return {records:[],total:0}},compareSource:async()=>({matchesInitialCopy:true,sourceChangedByCheck:false})})}
  throw Error(name)
 },compiled,compiled.exports)
 return compiled.exports
}
const saved=[process.env.VERCEL_ENV,process.env.VERCEL_GIT_COMMIT_REF]
try{
 const records=load('../../app/api/admin/candidate-records/route.ts').GET
 const check=load('../../app/api/admin/candidate-source-check/route.ts').POST
 const request=new Request('https://preview.invalid/api/admin/candidate-records?archived=true&limit=10&after=key&revision=2')
 process.env.VERCEL_ENV='production';process.env.VERCEL_GIT_COMMIT_REF='storage/migration-candidate'
 assert.equal((await records(request)).status,404)
 process.env.VERCEL_ENV='preview'
 for(const role of [null,'SP','SUP','SOO','STO','TL']){
  actor=role
  assert.equal((await records(request)).status,role?403:401)
  assert.equal((await check(request)).status,role?403:401)
 }
 assert.equal(poolCalls,0);assert.equal(sourceReads,0)
 actor='Admin'
 assert.equal((await records(request)).status,200)
 assert.deepEqual(pageOptions,{slice:'notifications',archived:true,limit:10,after:'key',expected:'2'})
 const response=await check(request)
 assert.equal(response.status,200)
 assert.deepEqual(await response.json(),{matchesInitialCopy:true,sourceChangedByCheck:false})
 assert.equal(sourceReads,1)
}finally{for(const [i,key] of ['VERCEL_ENV','VERCEL_GIT_COMMIT_REF'].entries()){if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i]}}
console.log('PASS: archive/source checks deny production, signed-out and all lower roles before storage; Admin pagination and aggregate-only source report verified')
