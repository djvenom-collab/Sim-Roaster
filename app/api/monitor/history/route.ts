import { NextRequest, NextResponse } from "next/server"
import { get, list } from "@vercel/blob"
import type { MetricSnapshot } from "../route"
import { authorize, jsonError } from "@/lib/security/authz"
import { isoDateSchema } from "@/lib/security/validation"

const ARCHIVE_PREFIX = "sim-roster/monitor/"

// ── GET /api/monitor/history ──────────────────────────────────────────────────
// Without params  → returns list of available archive dates
// ?date=YYYY-MM-DD → returns all snapshots from that day's archive file

export async function GET(req: NextRequest) {
  const authz = await authorize(req, { anyPermission: ["page_monitor"] })
  if (!authz.ok) return authz.response

  const rawDate = req.nextUrl.searchParams.get("date")
  if (rawDate !== null && !isoDateSchema.safeParse(rawDate).success) {
    return jsonError(400, "invalid_date")
  }
  const date = rawDate

  try {
    const { blobs } = await list({ prefix: ARCHIVE_PREFIX })
    const files = blobs
      .filter((b) => b.pathname.endsWith(".ndjson"))
      .map((b) => ({
        date: b.pathname.replace(ARCHIVE_PREFIX, "").replace(".ndjson", ""),
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)) // newest first

    // List mode — return available dates (no storage URLs exposed)
    if (!date) {
      return NextResponse.json(
        { files: files.map(({ pathname: _p, ...rest }) => rest) },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    // Read mode — parse NDJSON for the requested date
    const file = files.find((f) => f.date === date)
    if (!file) {
      return jsonError(404, "not_found")
    }

    const result = await get(file.pathname, { access: "private", useCache: false })
    if (!result?.stream) {
      return jsonError(502, "archive_unavailable")
    }

    const text = await new Response(result.stream).text()
    const snapshots: MetricSnapshot[] = text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean) as MetricSnapshot[]

    return NextResponse.json(
      { date, snapshots },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (err) {
    console.error("[monitor] history error:", (err as Error).message)
    return jsonError(500, "archive_unavailable")
  }
}
