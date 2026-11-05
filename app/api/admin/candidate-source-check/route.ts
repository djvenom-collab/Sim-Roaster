import { NextResponse } from "next/server"
import { authorize,jsonError } from "@/lib/security/authz"
import { stateRepository } from "@/lib/repository/state-repository"
import { migrationTestPool } from "@/lib/repository/migration-test"
import { candidateStore } from "@/lib/repository/candidate-store"
export const dynamic="force-dynamic"
export const maxDuration=120
export async function POST(request:Request){
  if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!=="storage/migration-candidate")return jsonError(404,"not_found")
  const actor=await authorize(request,{rateLimit:{bucket:"candidate-source-check",limit:2,windowSec:60}})
  if(!actor.ok)return actor.response
  if(actor.ctx.role!=="Admin")return jsonError(403,"forbidden")
  let pool:ReturnType<typeof migrationTestPool>|undefined
  try{
    pool=migrationTestPool()
    const current=await stateRepository.read()
    if(!current.state)return jsonError(404,"source_missing")
    const report=await candidateStore(pool).compareSource(current.state)
    return NextResponse.json(report,{headers:{"Cache-Control":"no-store"}})
  }catch{return jsonError(503,"source_check_unavailable")}finally{await pool?.end()}
}
