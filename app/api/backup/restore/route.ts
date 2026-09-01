import { put, get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const STATE_PATH = "sim-roster/state.json"

// POST /api/backup/restore
// Body: { id: string }  — the backup pathname to restore.
// Copies the backup blob content back over the live state.json so the next
// store load (or browser refresh) picks up the restored snapshot.
export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id?: string }
    if (!id || !id.startsWith("sim-roster/backups/") || !id.endsWith(".json")) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    // Read the chosen backup blob.
    const backup = await get(id, { access: "private", useCache: false })
    if (!backup || !backup.stream) {
      return NextResponse.json({ error: "backup_not_found" }, { status: 404 })
    }
    const snapshotText = await new Response(backup.stream).text()
    if (!snapshotText) {
      return NextResponse.json({ error: "empty_backup" }, { status: 404 })
    }

    // Validate that it is parseable JSON before overwriting live state.
    try {
      JSON.parse(snapshotText)
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 422 })
    }

    // Overwrite the live state with the backup content.
    await put(STATE_PATH, snapshotText, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[backup] restore error:", error)
    return NextResponse.json({ error: "restore_failed" }, { status: 500 })
  }
}
