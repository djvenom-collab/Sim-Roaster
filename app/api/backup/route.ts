import { put, get, list } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

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

// GET /api/backup — list all backups, newest first.
export async function GET() {
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
    console.error("[backup] list error:", error)
    return NextResponse.json({ error: "list_failed" }, { status: 500 })
  }
}

// POST /api/backup — create a new named backup of the current live state.
// Body: { label: string }
export async function POST(request: NextRequest) {
  try {
    const { label } = (await request.json()) as { label?: string }
    const safeName = (label ?? "manual")
      .trim()
      .slice(0, 60)
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "_")
    if (!safeName) {
      return NextResponse.json({ error: "invalid_label" }, { status: 400 })
    }

    // Read the live snapshot.
    const current = await get(STATE_PATH, { access: "private", useCache: false })
    if (!current || !current.stream) {
      return NextResponse.json({ error: "no_live_state" }, { status: 404 })
    }
    const stateText = await new Response(current.stream).text()
    if (!stateText) {
      return NextResponse.json({ error: "empty_live_state" }, { status: 404 })
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    const backupPath = `${BACKUP_PREFIX}${ts}_${safeName}.json`

    await put(backupPath, stateText, {
      access: "private",
      allowOverwrite: false,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    })

    const backup: BackupMeta = {
      id: backupPath,
      label: safeName.replace(/_/g, " "),
      createdAt: new Date().toISOString(),
      size: new TextEncoder().encode(stateText).byteLength,
    }

    return NextResponse.json({ ok: true, backup }, { status: 201 })
  } catch (error) {
    console.error("[backup] create error:", error)
    return NextResponse.json({ error: "create_failed" }, { status: 500 })
  }
}
