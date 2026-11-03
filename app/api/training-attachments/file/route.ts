/* ===========================================================================
 * API ROUTE: GET /api/training-attachments/file — fetch a stored file
 * ===========================================================================
 * Looks up a previously uploaded training attachment in Vercel Blob by its
 * pathname and streams it back, either inline (view) or as a download when
 * "?download=1" is passed. Runs on the server.
 * =========================================================================== */
import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { authorize, jsonError } from "@/lib/security/authz"
import { trainingPathnameSchema } from "@/lib/security/validation"

// Only these types render inline; anything else (HTML, SVG, scripts…) is
// forced to download so an uploaded file can't run script on our origin.
const INLINE_SAFE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
])

export async function GET(request: NextRequest) {
  const authz = await authorize(request)
  if (!authz.ok) return authz.response

  try {
    const parsed = trainingPathnameSchema.safeParse(request.nextUrl.searchParams.get("pathname"))
    if (!parsed.success) {
      return jsonError(400, "invalid_pathname")
    }
    const pathname = parsed.data
    const download = request.nextUrl.searchParams.get("download") === "1"

    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })

    if (!result) {
      return jsonError(404, "not_found")
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      })
    }

    const filename = (pathname.split("/").pop() ?? "file").replace(/["\\]/g, "_")
    const contentType = (result.blob.contentType || "application/octet-stream").toLowerCase()
    const inline = !download && INLINE_SAFE_TYPES.has(contentType.split(";")[0].trim())
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    }

    return new NextResponse(result.stream, { headers })
  } catch (error) {
    console.error("[attachments] serve error:", (error as Error).message)
    return jsonError(500, "serve_failed")
  }
}
