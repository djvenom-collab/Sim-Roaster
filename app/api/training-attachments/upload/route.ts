/* ===========================================================================
 * API ROUTE: POST /api/training-attachments/upload — store an uploaded file
 * ===========================================================================
 * Receives a file from the Training page and saves it to Vercel Blob storage,
 * returning the stored URL/pathname so it can be linked to a training session.
 * Runs on the server. Needs the Blob integration's token in the environment.
 * =========================================================================== */
import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Namespace uploads under the training folder for tidy storage.
    const safeName = file.name.replace(/[^\w.\-]+/g, "_")
    const blob = await put(`training/${Date.now()}-${safeName}`, file, {
      access: "private",
    })

    return NextResponse.json({
      name: file.name,
      pathname: blob.pathname,
      url: blob.url,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    })
  } catch (error) {
    console.error("[v0] Training attachment upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
