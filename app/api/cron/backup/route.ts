import { timingSafeEqual } from "node:crypto"
import { get, put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/security/authz"
import { SYSTEM_ACTOR, auditContext, recordAuditSafe } from "@/lib/audit/log"
import { STATE_PATHNAME } from "@/lib/repository/state-repository"
import { BACKUP_PREFIX, sha256Hex, writeManifest } from "@/lib/continuity/backup-manifest"

export const dynamic = "force-dynamic"
export const maxDuration = 60

function bearerMatches(header: string | null, secret: string): boolean {
  const a = Buffer.from(header ?? "")
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

// GET /api/cron/backup: invoked by Vercel Cron (vercel.json). Creates an
// immutable, verified snapshot backup. Never deletes or overwrites anything.
// Disabled (503) until CRON_SECRET is set in the Vercel project.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return jsonError(503, "cron_disabled")
  if (!bearerMatches(request.headers.get("authorization"), secret)) return jsonError(401, "unauthorized")

  const audit = auditContext(request, SYSTEM_ACTOR, "api/cron/backup")
  try {
    const source = await get(STATE_PATHNAME, { access: "private", useCache: false })
    if (!source?.stream) return jsonError(404, "no_live_state")
    const text = await new Response(source.stream).text()
    JSON.parse(text)
    const hash = sha256Hex(text)

    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = `${BACKUP_PREFIX}${ts}_auto-daily.json`
    await put(backupPath, text, { access: "private", allowOverwrite: false, contentType: "application/json", cacheControlMaxAge: 0 })

    const check = await get(backupPath, { access: "private", useCache: false })
    const readBack = check?.stream ? await new Response(check.stream).text() : ""
    const verified = sha256Hex(readBack) === hash

    await writeManifest({
      backupPath,
      sha256: hash,
      bytes: Buffer.byteLength(text),
      kind: "scheduled",
      createdAt: new Date().toISOString(),
      sourceEtag: source.blob.etag ?? null,
      verifiedAfterWrite: verified,
    })
    await recordAuditSafe(audit, [
      {
        action: "backup.create",
        entityType: "backup",
        entityId: backupPath,
        entityLabel: "auto-daily",
        newValue: { sha256: hash, verified },
        result: verified ? "success" : "failure",
        failureReason: verified ? null : "read_back_mismatch",
      },
    ])

    if (!verified) return jsonError(500, "verification_failed")
    return NextResponse.json({ ok: true, backupPath, sha256: hash })
  } catch (error) {
    console.error("[cron/backup] failed:", (error as Error).message)
    await recordAuditSafe(audit, [
      { action: "backup.create", entityType: "backup", result: "failure", failureReason: (error as Error).message.slice(0, 200) },
    ])
    return jsonError(500, "backup_failed")
  }
}
