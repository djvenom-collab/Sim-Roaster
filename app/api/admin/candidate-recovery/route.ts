import { NextResponse } from "next/server"
import { authorize,jsonError } from "@/lib/security/authz"
import { migrationTestPool } from "@/lib/repository/migration-test"
import { candidateStore,CandidateConflict } from "@/lib/repository/candidate-store"
export const dynamic="force-dynamic"
export const maxDuration=120
export async function POST(request:Request){
  if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!=="storage/migration-candidate")return jsonError(404,"not_found")
  const actor=await authorize(request,{rateLimit:{bucket:"candidate-recovery",limit:1,windowSec:60}})
  if(!actor.ok)return actor.response
  if(actor.ctx.role!=="Admin")return jsonError(403,"forbidden")
  let pool:ReturnType<typeof migrationTestPool>|undefined
  try{
    pool=migrationTestPool()
    const repo=candidateStore(pool)
    const current=await repo.read()
    const result=await repo.restoreInitial(current.revision,actor.ctx.userId)
    return NextResponse.json({restored:true,isolatedOnly:true,...result},{headers:{"Cache-Control":"no-store"}})
  }catch(e){return jsonError(e instanceof CandidateConflict?409:503,"candidate_recovery_failed")}finally{await pool?.end()}
}
