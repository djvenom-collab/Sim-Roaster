import { NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { migrationTestPool } from "@/lib/repository/migration-test"
import { candidateStore } from "@/lib/repository/candidate-store"
export async function POST(request:Request){
  if(process.env.VERCEL_ENV!=="preview"||process.env.VERCEL_GIT_COMMIT_REF!=="storage/migration-candidate")return jsonError(404,"not_found")
  const authz=await authorize(request)
  if(!authz.ok)return authz.response
  if(authz.ctx.role!=="Admin")return jsonError(403,"forbidden")
  const action=new URL(request.url).searchParams.get("action")
  if(!["enter","exit"].includes(action??""))return jsonError(400,"invalid_action")
  let pool:ReturnType<typeof migrationTestPool>|undefined
  try{
    if(action==="enter"){pool=migrationTestPool();if(!(await candidateStore(pool).read()).state)return jsonError(409,"copy_required")}
    const res=NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}})
    res.cookies.set("migration_candidate",action==="enter"?"1":"",{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:action==="enter"?3600:0})
    return res
  }catch{return jsonError(503,"candidate_unavailable")}finally{await pool?.end()}
}
