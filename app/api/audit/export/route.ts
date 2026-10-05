import { type NextRequest } from "next/server"
import { authorizeAuditAdmin } from "@/lib/audit/admin-guard"
import { AuditUnavailableError, actorFromAuth, auditContext, recordAudit } from "@/lib/audit/log"
import { parseFilters, streamAudit, type AuditRow } from "@/lib/audit/query"
import { jsonError } from "@/lib/security/authz"

export const dynamic = "force-dynamic"

const MAX_EXPORT_ROWS = 100_000
const HEADER = [
  "seq", "eventId", "occurredAt", "actorUserId", "actorEmail", "actorRole", "action", "entityType", "entityId",
  "entityLabel", "result", "failureReason", "reason", "correlationId", "source", "ipAddress", "previousValue",
  "newValue", "hash",
] as const

function cell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let s = typeof value === "string" ? value : JSON.stringify(value)
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: NextRequest) {
  const authz = await authorizeAuditAdmin(request, "audit-export")
  if (!authz.ok) return authz.response

  const filters = parseFilters(request.nextUrl.searchParams)
  try {
    // Exporting the trail is itself a sensitive action; refuse if it cannot be recorded.
    await recordAudit(auditContext(request, actorFromAuth(authz.ctx), "api/audit/export"), [
      { action: "audit.export", entityType: "audit_log", newValue: { filters, format: "csv" } },
    ])
  } catch (error) {
    if (error instanceof AuditUnavailableError) return jsonError(503, "audit_unavailable")
    throw error
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`${HEADER.join(",")}\n`))
      let written = 0
      try {
        for await (const batch of streamAudit(filters)) {
          const lines = batch.map((r: AuditRow) => HEADER.map((h) => cell(r[h])).join(",")).join("\n")
          controller.enqueue(encoder.encode(`${lines}\n`))
          written += batch.length
          if (written >= MAX_EXPORT_ROWS) break
        }
      } catch (error) {
        console.error("[audit] export failed:", (error as Error).message)
        controller.enqueue(encoder.encode("# export interrupted\n"))
      }
      controller.close()
    },
  })

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
