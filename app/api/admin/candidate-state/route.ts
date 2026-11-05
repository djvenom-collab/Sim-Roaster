import { NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { migrationTestPool } from "@/lib/repository/migration-test"
import { candidateStore, CandidateConflict } from "@/lib/repository/candidate-store"

export const dynamic="force-dynamic"
export const maxDuration=120
async function access(request:Request){
  if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!=="storage/migration-candidate")return jsonError(404,"not_found")
  const result=await authorize(request,{rateLimit:{bucket:"candidate-state",limit:60,windowSec:60}})
  if(!result.ok)return result.response
  if(result.ctx.role!=="Admin")return jsonError(403,"forbidden")
  return result.ctx
}
export async function GET(request:Request){
  const actor=await access(request);if(actor instanceof Response)return actor
  let pool:ReturnType<typeof migrationTestPool>|undefined
  try{
    pool=migrationTestPool()
    const result=await candidateStore(pool).read()
    if(!result.state)return jsonError(409,"copy_required")
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}})
  }catch{return jsonError(503,"candidate_unavailable")}finally{await pool?.end()}
}
export async function PUT(request:Request){
  const actor=await access(request);if(actor instanceof Response)return actor
  const expected=request.headers.get("if-match")
  if(!expected||!/^\d+$/.test(expected))return jsonError(428,"revision_required")
  if(Number(request.headers.get("content-length")??0)>8*1024*1024)return jsonError(413,"too_large")
  let pool:ReturnType<typeof migrationTestPool>|undefined
  try{
    const text=await request.text()
    if(new TextEncoder().encode(text).length>8*1024*1024)return jsonError(413,"too_large")
    const state:unknown=JSON.parse(text)
    if(!state||typeof state!=="object"||Array.isArray(state))return jsonError(422,"invalid_state")
    pool=migrationTestPool()
    const report=await candidateStore(pool).write(state as Record<string,unknown>,expected,actor.userId)
    return NextResponse.json({ok:true,...report},{headers:{"Cache-Control":"no-store"}})
  }catch(error){return jsonError(error instanceof CandidateConflict?409:503,error instanceof CandidateConflict?"conflict":"candidate_write_failed")}finally{await pool?.end()}
}
