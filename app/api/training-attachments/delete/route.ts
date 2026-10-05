/* ===========================================================================
 * API ROUTE: DELETE /api/training-attachments/delete — remove a stored file
 * ===========================================================================
 * Deletes a training attachment from Vercel Blob given its URL. Called when a
 * user removes an attachment from a training session. Runs on the server.
 * Only blobs under the `training/` prefix can be deleted here.
 * =========================================================================== */
import { del } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { isTrainingBlobUrl } from "@/lib/security/validation"

export async function DELETE(request: NextRequest) {
  const authz = await authorize(request, {
    anyPermission: ["notify_staff", "push_notifications", "manage_training"],
    rateLimit: { bucket: "attachment-delete", limit: 30, windowSec: 60 },
  })
  if (!authz.ok) return authz.response

  try {
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null
    if (!isTrainingBlobUrl(body?.url)) {
      return jsonError(400, "invalid_url")
    }

    await del(body.url as string)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[attachments] delete error:", (error as Error).message)
    return jsonError(500, "delete_failed")
  }
}
