import { NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { runHealthChecks } from "@/lib/continuity/health"

export const dynamic = "force-dynamic"

// GET /api/health            → public aggregate status only (for uptime monitors)
// GET /api/health?detail=1   → per-dependency detail, Admin only
export async function GET(request: Request) {
  const detail = new URL(request.url).searchParams.get("detail") === "1"

  if (detail) {
    const authz = await authorize(request, { rateLimit: { bucket: "health", limit: 30, windowSec: 60 } })
    if (!authz.ok) return authz.response
    if (authz.ctx.role !== "Admin") return jsonError(403, "forbidden")
  }

  const report = await runHealthChecks()
  const body = detail ? report : { status: report.status, checkedAt: report.checkedAt }
  return NextResponse.json(body, {
    status: report.status === "down" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  })
}
