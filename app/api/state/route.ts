import { put, get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { SNAPSHOT_VERSION } from "@/lib/persisted-state"
import { RUN_COOKIE, AUTONOMA_MARKER, runSnapshotPath } from "@/lib/autonoma/run-store"

// The whole app's data is stored as ONE JSON snapshot in Vercel Blob (private
// store). This is the single source of truth that survives rebuilds — the seed
// only ever fills a brand-new store. GET reads the snapshot, PUT overwrites it.
//
// AUTONOMA ISOLATION: when a request carries the `autonoma_run` cookie (set by
// the factory's auth callback), the whole app is talking to a PER-RUN snapshot
// instead of the global one. Both the read (seeded data) and every autosave
// (edits made during the test) are redirected to that per-run blob, so a test
// run is fully isolated and never touches the real demo snapshot.

const PATHNAME = "sim-roster/state.json"

// Never cache — we always want the latest saved snapshot.
export const dynamic = "force-dynamic"
export const revalidate = 0

/** The per-run blob path when the autonoma cookie is present, else the global one. */
function pathFor(request: NextRequest): { pathname: string; isRun: boolean } {
  const runId = request.cookies.get(RUN_COOKIE)?.value
  return runId
    ? { pathname: runSnapshotPath(runId), isRun: true }
    : { pathname: PATHNAME, isRun: false }
}

export async function GET(request: NextRequest) {
  const { pathname, isRun } = pathFor(request)
  try {
    const result = await get(pathname, { access: "private", useCache: false })
    if (!result || result.statusCode === 304 || !result.stream) {
      // No snapshot yet → tell the client to seed from sample data.
      return NextResponse.json({ state: null }, { headers: { "Cache-Control": "no-store" } })
    }
    const text = await new Response(result.stream).text()
    const state = text ? JSON.parse(text) : null
    // For a test run, always re-assert the verbatim marker + version so the
    // store applies the seeded slices as-is — even after the app's own autosave
    // rewrote the per-run blob as a plain snapshot mid-test.
    if (isRun && state && typeof state === "object") {
      state[AUTONOMA_MARKER] = true
      state.version = SNAPSHOT_VERSION
    }
    return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[v0] state GET error:", error)
    // On read failure, return null so the app still boots from the seed rather
    // than crashing. It will not overwrite an existing snapshot (see the store).
    return NextResponse.json({ state: null, error: "read_failed" }, { status: 200 })
  }
}

export async function PUT(request: NextRequest) {
  const { pathname } = pathFor(request)
  try {
    const body = await request.text()
    if (!body) {
      return NextResponse.json({ error: "empty_body" }, { status: 400 })
    }
    await put(pathname, body, {
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
