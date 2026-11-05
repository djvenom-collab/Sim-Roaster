import { type NextRequest, NextResponse } from "next/server"
import { get, put } from "@vercel/blob"
import { authorize, invalidatePermissionCache, jsonError } from "@/lib/security/authz"
import { reconcilePermissionMatrix, type Permission } from "@/lib/permissions"
import { ConcurrencyConflictError, stateRepository, type Snapshot } from "@/lib/repository/state-repository"
import {
  AuditUnavailableError,
  actorFromAuth,
  auditContext,
  recordAuditSafe,
  stableStringify,
  withAudit,
  type AuditEventInput,
} from "@/lib/audit/log"
import { diffSnapshots } from "@/lib/audit/diff"
import { SNAPSHOT_VERSION } from "@/lib/persisted-state"
import { RUN_COOKIE, AUTONOMA_MARKER, runSnapshotPath } from "@/lib/autonoma/run-store"

const STATE_ENTITY_ID = "sim-roster/state.json"

// The app's data is one JSON snapshot behind lib/repository/state-repository.
// GET returns it with a revision (ETag). PUT requires If-Match with that
// revision once a snapshot exists: a stale revision means another session wrote
// in between, so the write is rejected with 409 instead of silently erasing it.
//
// AUTONOMA ISOLATION: when a request carries the `autonoma_run` cookie (set by
// the Autonoma factory's auth callback), reads and autosaves are redirected to
// that test run's PER-RUN blob instead, so a test run never touches the real
// snapshot. The caller must still pass the normal session + rate-limit checks.

const MAX_BODY_BYTES = 8 * 1024 * 1024

// Slices that grant or describe access. A caller without the listed permission
// cannot change them: any edit is replaced with the currently stored value, so
// a lower role's autosave can never escalate privileges or revert an Admin edit.
const PROTECTED_SLICES: Record<string, Permission> = {
  permissionMatrix: "manage_users",
  users: "manage_users",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

function runPathFor(request: NextRequest): string | null {
  const runId = request.cookies.get(RUN_COOKIE)?.value
  return runId ? runSnapshotPath(runId) : null
}

async function readRunSnapshot(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false })
  if (!result || result.statusCode === 304 || !result.stream) return null
  const text = await new Response(result.stream).text()
  const state = text ? JSON.parse(text) : null
  // Re-assert the verbatim marker + version so the store applies the seeded
  // slices as-is, even after the app's own autosave rewrote the per-run blob.
  if (state && typeof state === "object") {
    state[AUTONOMA_MARKER] = true
    state.version = SNAPSHOT_VERSION
  }
  return state
}

export async function GET(request: NextRequest) {
  const authz = await authorize(request, { rateLimit: { bucket: "state-read", limit: 120, windowSec: 60 } })
  if (!authz.ok) return authz.response

  try {
    const runPath = runPathFor(request)
    if (runPath) {
      const state = await readRunSnapshot(runPath)
      return NextResponse.json({ state, revision: null }, { headers: { "Cache-Control": "no-store" } })
    }

    const { state, revision } = await stateRepository.read()
    const headers: Record<string, string> = { "Cache-Control": "no-store" }
    if (revision) headers.ETag = revision
    // No snapshot yet → tell the client to seed from sample data.
    return NextResponse.json({ state, revision }, { headers })
  } catch (error) {
    console.error("[state] GET error:", (error as Error).message)
    // The client stays read-only on error, so it never overwrites real data.
    return NextResponse.json({ state: null, revision: null, error: "read_failed" }, { status: 200 })
  }
}

export async function PUT(request: NextRequest) {
  const authz = await authorize(request, { rateLimit: { bucket: "state-write", limit: 120, windowSec: 60 } })
  if (!authz.ok) return authz.response

  const declaredLength = Number(request.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_BODY_BYTES) return jsonError(413, "payload_too_large")

  let body: string
  let incoming: Snapshot
  try {
    body = await request.text()
    if (!body) return jsonError(400, "empty_body")
    if (body.length > MAX_BODY_BYTES) return jsonError(413, "payload_too_large")
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError(400, "invalid_state")
    incoming = parsed as Snapshot
  } catch {
    return jsonError(400, "invalid_json")
  }

  // Test-run autosaves go to the isolated per-run blob; the shared snapshot,
  // its revision chain, and its audit trail are never touched.
  const runPath = runPathFor(request)
  if (runPath) {
    try {
      await put(runPath, body, {
        access: "private",
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      })
      return NextResponse.json({ ok: true, revision: null })
    } catch (error) {
      console.error("[state] PUT (autonoma run) error:", (error as Error).message)
      return jsonError(500, "write_failed")
    }
  }

  const expectedRevision = request.headers.get("if-match")
  const audit = auditContext(request, actorFromAuth(authz.ctx), "api/state")
  const traceHeaders = { "X-Correlation-Id": audit.correlationId }
  const saveEvent = (extra: Partial<AuditEventInput> = {}): AuditEventInput => ({
    action: "state.save",
    entityType: "snapshot",
    entityId: STATE_ENTITY_ID,
    ...extra,
  })

  try {
    const current = await stateRepository.read()

    // Once a snapshot exists, a blind overwrite is never allowed.
    if (current.state && !expectedRevision) {
      await recordAuditSafe(audit, [saveEvent({ result: "failure", failureReason: "revision_required" })])
      return jsonError(428, "revision_required", traceHeaders)
    }
    if (current.state && expectedRevision && current.revision !== expectedRevision.replace(/^W\//, "")) {
      await recordAuditSafe(audit, [
        saveEvent({
          result: "failure",
          failureReason: "concurrency_conflict",
          previousValue: { expectedRevision },
          newValue: { currentRevision: current.revision },
        }),
      ])
      return NextResponse.json(
        { error: "concurrency_conflict", revision: current.revision },
        { status: 409, headers: traceHeaders },
      )
    }

    // We already read the authoritative stored snapshot for If-Match and diff.
    // Reuse its matrix instead of downloading/parsing the entire Blob again
    // through the global permission cache. Never authorize from incoming data.
    const storedMatrix = current.state?.permissionMatrix
    const matrix = reconcilePermissionMatrix(
      storedMatrix && typeof storedMatrix === "object" && !Array.isArray(storedMatrix) ? storedMatrix : null,
    )
    const denied: AuditEventInput[] = []
    for (const [slice, perm] of Object.entries(PROTECTED_SLICES)) {
      if (authz.ctx.role === "Admin" || matrix[authz.ctx.role]?.includes(perm)) continue
      if (current.state && slice in current.state) {
        if (slice in incoming && stableStringify(incoming[slice]) !== stableStringify(current.state[slice])) {
          denied.push({
            action: "authz.denied",
            entityType: slice,
            reason: "Change to a protected slice was discarded; the stored value was kept",
            result: "failure",
            failureReason: `missing_permission:${perm}`,
          })
        }
        incoming[slice] = current.state[slice]
      } else if (slice === "permissionMatrix") {
        incoming[slice] = reconcilePermissionMatrix(null)
      }
    }
    if (denied.length > 0) await recordAuditSafe(audit, denied)

    // An unchanged complete snapshot needs neither a Blob write nor a new
    // revision. Compare every slice, including feeds ignored by audit diff.
    // A later concurrent edit will still be rejected by the next If-Match.
    if (current.state && current.revision && JSON.stringify(current.state) === JSON.stringify(incoming)) {
      return NextResponse.json({ ok: true, revision: current.revision }, {
        headers: { ETag: current.revision, ...traceHeaders },
      })
    }

    const diff = diffSnapshots(current.state, incoming)
    // The conditional write closes the race between the read above and here.
    const write = () => stateRepository.write(incoming, { expectedRevision: current.revision })

    let revision: string
    if (diff.changeCount === 0) {
      ;({ revision } = await write())
    } else {
      const summary = saveEvent({
        previousValue: { revision: current.revision },
        newValue: { changes: diff.changeCount, slices: diff.summary },
      })
      ;({ revision } = await withAudit(audit, [summary, ...diff.events], write, { failureEvents: [summary] }))
    }
    invalidatePermissionCache()
    return NextResponse.json({ ok: true, revision }, { headers: { ETag: revision, ...traceHeaders } })
  } catch (error) {
    if (error instanceof AuditUnavailableError) {
      // Fail closed: an unrecorded change is not applied.
      console.error("[state] PUT rejected, audit unavailable:", error.message)
      return jsonError(503, "audit_unavailable", { ...traceHeaders, "Retry-After": "5" })
    }
    if (error instanceof ConcurrencyConflictError) {
      return NextResponse.json({ error: "concurrency_conflict" }, { status: 409, headers: traceHeaders })
    }
    console.error("[state] PUT error:", (error as Error).message)
    return jsonError(500, "write_failed")
  }
}
