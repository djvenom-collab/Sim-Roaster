import { put, get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

// The whole app's data is stored as ONE JSON snapshot in Vercel Blob (private
// store). This is the single source of truth that survives rebuilds — the seed
// only ever fills a brand-new store. GET reads the snapshot, PUT overwrites it.

const PATHNAME = "sim-roster/state.json"

// Never cache — we always want the latest saved snapshot.
export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const result = await get(PATHNAME, { access: "private", useCache: false })
    if (!result || result.statusCode === 304 || !result.stream) {
      // No snapshot yet → tell the client to seed from sample data.
      return NextResponse.json({ state: null }, { headers: { "Cache-Control": "no-store" } })
    }
    const text = await new Response(result.stream).text()
    const state = text ? JSON.parse(text) : null
    return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[v0] state GET error:", error)
    // On read failure, return null so the app still boots from the seed rather
    // than crashing. It will not overwrite an existing snapshot (see the store).
    return NextResponse.json({ state: null, error: "read_failed" }, { status: 200 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.text()
    if (!body) {
      return NextResponse.json({ error: "empty_body" }, { status: 400 })
    }
    await put(PATHNAME, body, {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      // Snapshot changes constantly; don't let the CDN cache it.
      cacheControlMaxAge: 0,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[v0] state PUT error:", error)
    return NextResponse.json({ error: "write_failed" }, { status: 500 })
  }
}
