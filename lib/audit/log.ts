import "server-only"
import { createHash, randomUUID } from "node:crypto"
import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import { clientIp } from "@/lib/security/rate-limit"
import { redact } from "./redact"

export type AuditResult = "success" | "failure"

export interface AuditActor {
  userId: string | null
  email: string | null
  role: string | null
}

export interface AuditRequestContext {
  actor: AuditActor
  correlationId: string
  source: string
  ipAddress: string | null
  userAgent: string | null
}

export interface AuditEventInput {
  action: string
  entityType?: string | null
  entityId?: string | null
  entityLabel?: string | null
  previousValue?: unknown
  newValue?: unknown
  reason?: string | null
  result?: AuditResult
  failureReason?: string | null
}

/** Thrown when the audit trail cannot be written; callers must not proceed with the change. */
export class AuditUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`audit trail unavailable: ${(cause as Error)?.message ?? String(cause)}`)
    this.name = "AuditUnavailableError"
  }
}

const CHAIN_LOCK_KEY = 7_270_015_028
const INSERT_CHUNK = 200
const CORRELATION_ID = /^[A-Za-z0-9._:-]{8,80}$/

export const SYSTEM_ACTOR: AuditActor = { userId: null, email: null, role: "system" }

export function actorFromAuth(ctx: { userId: string; email: string; role: string }): AuditActor {
  return { userId: ctx.userId, email: ctx.email, role: ctx.role }
}

export function auditContext(
  request: Request | Headers,
  actor: AuditActor,
  source: string,
): AuditRequestContext {
  const headers = request instanceof Headers ? request : request.headers
  const supplied = headers.get("x-correlation-id")
  const ip = request instanceof Request ? clientIp(request) : headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return {
    actor,
    correlationId: supplied && CORRELATION_ID.test(supplied) ? supplied : randomUUID(),
    source,
    ipAddress: ip && ip !== "unknown" ? ip.slice(0, 64) : null,
    userAgent: headers.get("user-agent")?.slice(0, 300) ?? null,
  }
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
}

export interface HashableEvent {
  event_id: string
  occurred_at: string
  actor_user_id: string | null
  actor_role: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  previous_value: unknown
  new_value: unknown
  reason: string | null
  correlation_id: string
  result: AuditResult
  failure_reason: string | null
}

export function computeEventHash(prevHash: string | null, e: HashableEvent): string {
  const payload = stableStringify([
    prevHash,
    e.event_id,
    e.occurred_at,
    e.actor_user_id,
    e.actor_role,
    e.action,
    e.entity_type,
    e.entity_id,
    e.previous_value ?? null,
    e.new_value ?? null,
    e.reason,
    e.correlation_id,
    e.result,
    e.failure_reason,
  ])
  return createHash("sha256").update(payload).digest("hex")
}

const COLUMNS = [
  "event_id", "occurred_at", "actor_user_id", "actor_email", "actor_role", "action", "entity_type",
  "entity_id", "entity_label", "previous_value", "new_value", "reason", "correlation_id", "result",
  "failure_reason", "source", "ip_address", "user_agent", "prev_hash", "hash",
] as const

async function insertEvents(client: PoolClient, ctx: AuditRequestContext, events: AuditEventInput[]) {
  if (events.length === 0) return
  await client.query("SELECT pg_advisory_xact_lock($1)", [CHAIN_LOCK_KEY])
  const last = await client.query<{ hash: string }>("SELECT hash FROM audit.event ORDER BY seq DESC LIMIT 1")
  let prevHash: string | null = last.rows[0]?.hash ?? null
  const occurredAt = new Date().toISOString()

  const rows = events.map((input) => {
    const hashable: HashableEvent = {
      event_id: randomUUID(),
      occurred_at: occurredAt,
      actor_user_id: ctx.actor.userId,
      actor_role: ctx.actor.role,
      action: input.action.slice(0, 120),
      entity_type: input.entityType?.slice(0, 80) ?? null,
      entity_id: input.entityId?.slice(0, 200) ?? null,
      previous_value: input.previousValue === undefined ? null : redact(input.previousValue),
      new_value: input.newValue === undefined ? null : redact(input.newValue),
      reason: input.reason?.slice(0, 2000) ?? null,
      correlation_id: ctx.correlationId,
      result: input.result ?? "success",
      failure_reason: input.failureReason?.slice(0, 500) ?? null,
    }
    const hash = computeEventHash(prevHash, hashable)
    const row = [
      hashable.event_id, hashable.occurred_at, hashable.actor_user_id, ctx.actor.email, hashable.actor_role,
      hashable.action, hashable.entity_type, hashable.entity_id, input.entityLabel?.slice(0, 200) ?? null,
      hashable.previous_value === null ? null : JSON.stringify(hashable.previous_value),
      hashable.new_value === null ? null : JSON.stringify(hashable.new_value),
      hashable.reason, hashable.correlation_id, hashable.result, hashable.failure_reason,
      ctx.source, ctx.ipAddress, ctx.userAgent, prevHash, hash,
    ]
    prevHash = hash
    return row
  })

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK)
    const params: unknown[] = []
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        params.push(value)
        return `$${params.length}`
      })
      return `(${placeholders.join(",")})`
    })
    await client.query(`INSERT INTO audit.event (${COLUMNS.join(",")}) VALUES ${tuples.join(",")}`, params)
  }
}

/** Writes events in their own transaction. Throws AuditUnavailableError on failure. */
export async function recordAudit(ctx: AuditRequestContext, events: AuditEventInput[]): Promise<void> {
  if (events.length === 0) return
  let client: PoolClient | null = null
  try {
    client = await pool.connect()
    await client.query("BEGIN")
    await insertEvents(client, ctx, events)
    await client.query("COMMIT")
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {})
    throw new AuditUnavailableError(error)
  } finally {
    client?.release()
  }
}

/** For events that must never block the user flow (e.g. login telemetry). Logs on failure. */
export async function recordAuditSafe(ctx: AuditRequestContext, events: AuditEventInput[]): Promise<void> {
  try {
    await recordAudit(ctx, events)
  } catch (error) {
    console.error("[audit] CRITICAL: event not recorded", {
      correlationId: ctx.correlationId,
      actions: events.map((e) => e.action),
      error: (error as Error).message,
    })
  }
}

/**
 * Fail-closed wrapper: the audit rows are inserted inside an open transaction
 * before `operation` runs and committed only after it succeeds. If the audit
 * insert fails the operation never runs; if the operation fails the rows are
 * rolled back and `failureEvents` are recorded instead.
 */
export async function withAudit<T>(
  ctx: AuditRequestContext,
  events: AuditEventInput[],
  operation: () => Promise<T>,
  options: { failureEvents?: AuditEventInput[] } = {},
): Promise<T> {
  let client: PoolClient
  try {
    client = await pool.connect()
  } catch (error) {
    throw new AuditUnavailableError(error)
  }

  try {
    try {
      await client.query("BEGIN")
      await insertEvents(client, ctx, events)
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw new AuditUnavailableError(error)
    }

    let result: T
    try {
      result = await operation()
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      const failureReason = (error as Error)?.name === "ConcurrencyConflictError" ? "concurrency_conflict" : (error as Error)?.message ?? "operation_failed"
      await recordAuditSafe(
        ctx,
        (options.failureEvents ?? events).map((e) => ({ ...e, result: "failure" as const, failureReason })),
      )
      throw error
    }

    try {
      await client.query("COMMIT")
    } catch (error) {
      // The change is applied but its audit rows were lost; leave a recovery marker.
      console.error("[audit] CRITICAL: commit failed after operation succeeded", ctx.correlationId, (error as Error).message)
      await recordAuditSafe(ctx, [
        {
          action: "audit.commit_failed",
          reason: `Recovery marker: ${events.length} event(s) for this correlation id were applied but not committed`,
          newValue: { actions: events.slice(0, 50).map((e) => e.action) },
          result: "failure",
          failureReason: (error as Error).message,
        },
      ])
    }
    return result
  } finally {
    client.release()
  }
}
