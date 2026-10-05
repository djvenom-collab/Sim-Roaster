import { put, get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"
import { authorize, hasPermission, invalidatePermissionCache, jsonError } from "@/lib/security/authz"
import { reconcilePermissionMatrix, type Permission } from "@/lib/permissions"

// The whole app's data is stored as ONE JSON snapshot in Vercel Blob (private
// store). This is the single source of truth that survives rebuilds — the seed
// only ever fills a brand-new store. GET reads the snapshot, PUT overwrites it.

const PATHNAME = "sim-roster/state.json"
const MAX_BODY_BYTES = 8 * 1024 * 1024

// Slices that grant or describe access. A caller without the listed permission
// cannot change them: any edit is replaced with the currently stored value, so
// a lower role's autosave can never escalate privileges or revert an Admin edit.
const PROTECTED_SLICES: Record<string, Permission> = {
  permissionMatrix: "manage_users",
  users: "manage_users",
}

// Never cache — we always want the latest saved snapshot.
export const dynamic = "force-dynamic"
export const revalidate = 0

async function readCurrentState(): Promise<Record<string, unknown> | null> {
  const result = await get(PATHNAME, { access: "private", useCache: false })
  if (!result || result.statusCode === 304 || !result.stream) return null
  const text = await new Response(result.stream).text()
  return text ? (JSON.parse(text) as Record<string, unknown>) : null
}

export async function GET(request: NextRequest) {
  const authz = await authorize(request, { rateLimit: { bucket: "state-read", limit: 120, windowSec: 60 } })
  if (!authz.ok) return authz.response

  try {
    const state = await readCurrentState()
    // No snapshot yet → tell the client to seed from sample data.
    return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[state] GET error:", (error as Error).message)
    // On read failure, return null so the app still boots from the seed rather
    // than crashing. It will not overwrite an existing snapshot (see the store).
    return NextResponse.json({ state: null, error: "read_failed" }, { status: 200 })
  }
}

export async function PUT(request: NextRequest) {
  const authz = await authorize(request, { rateLimit: { bucket: "state-write", limit: 120, windowSec: 60 } })
  if (!authz.ok) return authz.response

  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_BODY_BYTES) return jsonError(413, "payload_too_large")

  let incoming: Record<string, unknown>
  try {
    const body = await request.text()
    if (!body) return jsonError(400, "empty_body")
    if (body.length > MAX_BODY_BYTES) return jsonError(413, "payload_too_large")
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError(400, "invalid_state")
    incoming = parsed as Record<string, unknown>
  } catch {
    return jsonError(400, "invalid_json")
  }

  try {
    let current: Record<string, unknown> | null | undefined
    for (const [slice, perm] of Object.entries(PROTECTED_SLICES)) {
      if (await hasPermission(authz.ctx.role, perm)) continue
      if (current === undefined) current = await readCurrentState()
      if (current && slice in current) {
        incoming[slice] = current[slice]
      } else if (slice === "permissionMatrix") {
        incoming[slice] = reconcilePermissionMatrix(null)
      }
    }

    await put(PATHNAME, JSON.stringify(incoming), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      // Snapshot changes constantly; don't let the CDN cache it.
      cacheControlMaxAge: 0,
    })
    invalidatePermissionCache()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[state] PUT error:", (error as Error).message)
    return jsonError(500, "write_failed")
  }
}
