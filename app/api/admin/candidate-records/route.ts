import { NextResponse } from "next/server"
import { authorize,jsonError } from "@/lib/security/authz"
import { migrationTestPool } from "@/lib/repository/migration-test"
import { candidateStore,CandidateConflict,CandidateInvalidState } from "@/lib/repository/candidate-store"
export const dynamic="force-dynamic"
export async function GET(request:Request) {
  if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!=="storage/migration-candidate")return jsonError(404,"not_found")
  const actor=await authorize(request,{rateLimit:{bucket:"candidate-records",limit:60,windowSec:60}})
  if(!actor.ok)return actor.response
  if(actor.ctx.role!=="Admin")return jsonError(403,"forbidden")
  const params=new URL(request.url).searchParams
  let pool:ReturnType<typeof migrationTestPool>|undefined
  try {
    pool=migrationTestPool()
    const result=await candidateStore(pool).page({slice:params.get("slice")??"notifications",archived:params.get("archived")==="true",limit:Number(params.get("limit")??25),after:params.get("after")??"",expected:params.get("revision")??undefined})
    return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}})
  }catch(e){return jsonError(e instanceof CandidateConflict?409:e instanceof CandidateInvalidState?400:503,e instanceof CandidateConflict?"page_changed_reload":e instanceof CandidateInvalidState?"invalid_page":"candidate_unavailable")}finally{await pool?.end()}
}
