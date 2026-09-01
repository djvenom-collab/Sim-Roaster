/* ===========================================================================
 * API ROUTE: DELETE /api/training-attachments/delete — remove a stored file
 * ===========================================================================
 * Deletes a training attachment from Vercel Blob given its URL. Called when a
 * user removes an attachment from a training session. Runs on the server.
 * =========================================================================== */
import { del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export async function DELETE(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400 })
    }

    await del(url)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Training attachment delete error:", error)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
