import { NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { migrationTestPool } from "@/lib/repository/migration-test"
import { runNeonRehearsal } from "@/lib/repository/neon-rehearsal"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "storage/migration-candidate") return jsonError(404, "not_found")
  const authz = await authorize(request, { rateLimit: { bucket: "migration-rehearsal", limit: 1, windowSec: 60 } })
  if (!authz.ok) return authz.response
  if (authz.ctx.role !== "Admin") return jsonError(403, "forbidden")
  let pool: ReturnType<typeof migrationTestPool> | undefined
  try {
    pool = migrationTestPool()
    const report = await runNeonRehearsal(pool)
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } })
  } catch {
    console.error("[migration-rehearsal] Isolated test failed")
    return jsonError(503, "rehearsal_failed")
  } finally { await pool?.end() }
}
