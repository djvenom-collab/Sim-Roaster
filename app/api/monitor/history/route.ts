import { NextRequest, NextResponse } from "next/server"
import { list } from "@vercel/blob"
import type { MetricSnapshot } from "../route"

const ARCHIVE_PREFIX = "sim-roster/monitor/"

// ── GET /api/monitor/history ──────────────────────────────────────────────────
// Without params  → returns list of available archive dates
// ?date=YYYY-MM-DD → returns all snapshots from that day's archive file

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date")

  try {
    const { blobs } = await list({ prefix: ARCHIVE_PREFIX })
    const files = blobs
      .filter((b) => b.pathname.endsWith(".ndjson"))
      .map((b) => ({
        date: b.pathname.replace(ARCHIVE_PREFIX, "").replace(".ndjson", ""),
        size: b.size,
        url:  b.url,
        uploadedAt: b.uploadedAt,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)) // newest first

    // List mode — return available dates
    if (!date) {
      return NextResponse.json({ files }, { headers: { "Cache-Control": "no-store" } })
    }

    // Read mode — parse NDJSON for the requested date
    const file = files.find((f) => f.date === date)
    if (!file) {
      return NextResponse.json({ error: "No archive for that date" }, { status: 404 })
    }

    const res = await fetch(file.url, { cache: "no-store" })
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch archive" }, { status: 502 })
    }

    const text = await res.text()
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
    return NextResponse.json({ error: "Archive unavailable", detail: String(err) }, { status: 500 })
  }
}
