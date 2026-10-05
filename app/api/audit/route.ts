import { type NextRequest, NextResponse } from "next/server"
import { authorizeAuditAdmin } from "@/lib/audit/admin-guard"
import { auditFacets, parseFilters, queryAudit } from "@/lib/audit/query"
import { jsonError } from "@/lib/security/authz"

export const dynamic = "force-dynamic"

// Read-only by design: there is no POST/PUT/PATCH/DELETE handler for audit records.
export async function GET(request: NextRequest) {
  const authz = await authorizeAuditAdmin(request, "audit-read")
  if (!authz.ok) return authz.response

  const params = request.nextUrl.searchParams
  try {
    if (params.get("facets") === "1") {
      return NextResponse.json(await auditFacets(), { headers: { "Cache-Control": "no-store" } })
    }
    const page = Math.max(1, Math.min(10_000, Number.parseInt(params.get("page") ?? "1", 10) || 1))
    const pageSize = Math.max(10, Math.min(200, Number.parseInt(params.get("pageSize") ?? "50", 10) || 50))
    const { rows, total } = await queryAudit(parseFilters(params), page, pageSize)
    return NextResponse.json(
      { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("[audit] query failed:", (error as Error).message)
    return jsonError(500, "audit_query_failed")
  }
}
