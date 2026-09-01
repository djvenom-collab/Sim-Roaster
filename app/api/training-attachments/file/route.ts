/* ===========================================================================
 * API ROUTE: GET /api/training-attachments/file — fetch a stored file
 * ===========================================================================
 * Looks up a previously uploaded training attachment in Vercel Blob by its
 * pathname and streams it back, either inline (view) or as a download when
 * "?download=1" is passed. Runs on the server.
 * =========================================================================== */
import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get("pathname")
    const download = request.nextUrl.searchParams.get("download") === "1"

    if (!pathname) {
      return NextResponse.json({ error: "Missing pathname" }, { status: 400 })
    }

    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })

    if (!result) {
      return new NextResponse("Not found", { status: 404 })
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

    const filename = pathname.split("/").pop() ?? "file"
    const headers: Record<string, string> = {
      "Content-Type": result.blob.contentType,
      ETag: result.blob.etag,
      "Cache-Control": "private, no-cache",
    }
    headers["Content-Disposition"] = `${download ? "attachment" : "inline"}; filename="${filename}"`

    return new NextResponse(result.stream, { headers })
  } catch (error) {
    console.error("[v0] Training attachment serve error:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
