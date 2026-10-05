import { put, get, list } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { authorize, jsonError } from "@/lib/security/authz"
import { actorFromAuth, auditContext, recordAuditSafe } from "@/lib/audit/log"
import { sha256Hex, writeManifest } from "@/lib/continuity/backup-manifest"

export const dynamic = "force-dynamic"
export const revalidate = 0

const STATE_PATH = "sim-roster/state.json"
const BACKUP_PREFIX = "sim-roster/backups/"

export interface BackupMeta {
  id: string        // the unique blob pathname, used as stable key
  label: string     // human name supplied at creation time
  createdAt: string // ISO timestamp from the blob store
  size: number      // bytes
}

const createSchema = z.object({ label: z.string().max(200).optional() })

// GET /api/backup — list all backups, newest first.
export async function GET(request: NextRequest) {
  const authz = await authorize(request, { anyPermission: ["page_backup"] })
  if (!authz.ok) return authz.response

  try {
    const { blobs } = await list({ prefix: BACKUP_PREFIX, mode: "expanded" })
    const backups: BackupMeta[] = blobs
      .filter((b) => b.pathname.endsWith(".json"))
      .map((b) => {
        // Pathname pattern: sim-roster/backups/{isoTimestamp}_{label}.json
        const base = b.pathname.slice(BACKUP_PREFIX.length).replace(/\.json$/, "")
        const underIdx = base.indexOf("_")
        const label = underIdx >= 0 ? base.slice(underIdx + 1).replace(/_/g, " ") : base
        return {
          id: b.pathname,
          label,
          createdAt: b.uploadedAt.toISOString(),
          size: b.size,
        }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return NextResponse.json({ backups }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[backup] list error:", (error as Error).message)
    return jsonError(500, "list_failed")
  }
}

// POST /api/backup — create a new named backup of the current live state.
// Body: { label: string }
export async function POST(request: NextRequest) {
  const authz = await authorize(request, {
    anyPermission: ["page_backup"],
    rateLimit: { bucket: "backup-create", limit: 10, windowSec: 60 },
  })
  if (!authz.ok) return authz.response

  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return jsonError(400, "invalid_label")
    const safeName = (parsed.data.label ?? "manual")
      .trim()
      .slice(0, 60)
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
    if (!safeName) {
      return jsonError(400, "invalid_label")
    }

    // Read the live snapshot.
    const current = await get(STATE_PATH, { access: "private", useCache: false })
    if (!current || !current.stream) {
      return jsonError(404, "no_live_state")
    }
    const stateText = await new Response(current.stream).text()
    if (!stateText) {
      return jsonError(404, "empty_live_state")
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = `${BACKUP_PREFIX}${ts}_${safeName}.json`

    await put(backupPath, stateText, {
      access: "private",
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    })

    await writeManifest({
      backupPath,
      sha256: sha256Hex(stateText),
      bytes: Buffer.byteLength(stateText),
      kind: "manual",
      createdAt: new Date().toISOString(),
      sourceEtag: current.blob.etag ?? null,
      verifiedAfterWrite: false,
    })

    const backup: BackupMeta = {
      id: backupPath,
      label: safeName.replace(/_/g, " "),
      createdAt: new Date().toISOString(),
      size: new TextEncoder().encode(stateText).byteLength,
    }

    await recordAuditSafe(auditContext(request, actorFromAuth(authz.ctx), "api/backup"), [
      { action: "backup.create", entityType: "backup", entityId: backup.id, entityLabel: backup.label, newValue: { size: backup.size } },
    ])

    return NextResponse.json({ ok: true, backup }, { status: 201 })
  } catch (error) {
    console.error("[backup] create error:", (error as Error).message)
    return jsonError(500, "create_failed")
  }
}
