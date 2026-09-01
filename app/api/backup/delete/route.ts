import { del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// DELETE /api/backup/delete
// Body: { id: string }  — the backup pathname to permanently remove.
export async function DELETE(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id?: string }
    if (!id || !id.startsWith("sim-roster/backups/") || !id.endsWith(".json")) {
      return NextResponse.json({ error: "invalid_id" }, { status: 400 })
    }

    await del(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[backup] delete error:", error)
    return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  }
}
