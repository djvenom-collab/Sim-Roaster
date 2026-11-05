import { NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { stateRepository } from "@/lib/repository/state-repository"
import { migrationTestPool } from "@/lib/repository/migration-test"
import { candidateDDL, candidateStore } from "@/lib/repository/candidate-store"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "storage/migration-candidate") return jsonError(404,"not_found")
  const authz=await authorize(request,{rateLimit:{bucket:"migration-copy",limit:1,windowSec:60}})
  if(!authz.ok)return authz.response
  if(authz.ctx.role!=="Admin")return jsonError(403,"forbidden")
  if(/(?:^|;\s*)autonoma_run=/.test(request.headers.get("cookie")??""))return jsonError(409,"test_run_not_supported")
  let pool: ReturnType<typeof migrationTestPool> | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    pool=migrationTestPool() // verify isolation before reading private source
    const raw=await stateRepository.readStream()
    if(!raw)return jsonError(404,"snapshot_missing")
    reader=raw.stream.getReader()
    let bytes=0
    let text=""
    const decoder=new TextDecoder("utf-8",{fatal:true})
    while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>16*1024*1024){await reader.cancel();return jsonError(413,"snapshot_too_large")}text+=decoder.decode(chunk.value,{stream:true})}
    text+=decoder.decode()
    const state:unknown=JSON.parse(text)
    if(!state||typeof state!=="object"||Array.isArray(state)||"__autonoma" in state)return jsonError(422,"invalid_source")
    await pool.query(candidateDDL)
    const report=await candidateStore(pool).initialize(state as Record<string,unknown>,authz.ctx.userId)
    return NextResponse.json({copied:true,private:true,bytes,...report,productionChanged:false},{headers:{"Cache-Control":"no-store"}})
  }catch{
    console.error("[migration-copy] Private rehearsal copy failed; no source writes")
    return jsonError(409,"copy_failed_or_already_initialized")
  }finally{reader?.releaseLock();await pool?.end()}
}
