/* ===========================================================================
 * API ROUTE: POST /api/training-attachments/upload — store an uploaded file
 * ===========================================================================
 * Receives a file from the Training page and saves it to Vercel Blob storage,
 * returning the stored URL/pathname so it can be linked to a training session.
 * Runs on the server. Needs the Blob integration's token in the environment.
 * =========================================================================== */
import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { actorFromAuth, auditContext, recordAuditSafe } from "@/lib/audit/log"

// Vercel Functions cap request bodies at 4.5 MB.
const MAX_FILE_BYTES = 4.5 * 1024 * 1024
const BLOCKED_EXTENSIONS = /\.(exe|bat|cmd|com|msi|scr|ps1|sh|dll|jar|vbs|js|mjs|html?|svg|php)$/i

export async function POST(request: NextRequest) {
  const authz = await authorize(request, {
    anyPermission: ["notify_staff", "push_notifications", "manage_training"],
    rateLimit: { bucket: "attachment-upload", limit: 20, windowSec: 60 },
  })
  if (!authz.ok) return authz.response

  try {
    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File) || file.size === 0) {
      return jsonError(400, "no_file")
    }
    if (file.size > MAX_FILE_BYTES) {
      return jsonError(413, "file_too_large")
    }
    if (BLOCKED_EXTENSIONS.test(file.name)) {
      return jsonError(415, "file_type_not_allowed")
    }

    // Namespace uploads under the training folder for tidy storage.
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120)
    const blob = await put(`training/${Date.now()}-${safeName}`, file, {
      access: "private",
    })

    await recordAuditSafe(auditContext(request, actorFromAuth(authz.ctx), "api/training-attachments/upload"), [
      {
        action: "attachment.upload",
        entityType: "training_attachment",
        entityId: blob.pathname,
        entityLabel: file.name.slice(0, 200),
        newValue: { size: file.size, contentType: file.type || "application/octet-stream" },
      },
    ])

    return NextResponse.json({
      name: file.name.slice(0, 200),
      pathname: blob.pathname,
      url: blob.url,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    })
  } catch (error) {
    console.error("[attachments] upload error:", (error as Error).message)
    return jsonError(500, "upload_failed")
  }
}
