import "server-only"
import { pool } from "@/lib/db"
import { computeEventHash, type AuditResult } from "./log"

export interface AuditFilters {
  from?: string
  to?: string
  actor?: string
  action?: string
  entityType?: string
  entityId?: string
  result?: AuditResult
  correlationId?: string
  q?: string
}

export interface AuditRow {
  seq: number
  eventId: string
  occurredAt: string
  actorUserId: string | null
  actorEmail: string | null
  actorRole: string | null
  action: string
  entityType: string | null
  entityId: string | null
  entityLabel: string | null
  previousValue: unknown
  newValue: unknown
  reason: string | null
  correlationId: string
  result: AuditResult
  failureReason: string | null
  source: string
  ipAddress: string | null
  userAgent: string | null
  hash: string
  prevHash: string | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/
const clean = (v: string | null | undefined, max = 200) => (v ? v.trim().slice(0, max) : undefined) || undefined

export function parseFilters(params: URLSearchParams): AuditFilters {
  const date = (key: string) => {
    const v = clean(params.get(key), 40)
    return v && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined
  }
  const result = params.get("result")
  return {
    from: date("from"),
    to: date("to"),
    actor: clean(params.get("actor")),
    action: clean(params.get("action"), 120),
    entityType: clean(params.get("entityType"), 80),
    entityId: clean(params.get("entityId")),
    correlationId: clean(params.get("correlationId"), 80),
    result: result === "success" || result === "failure" ? result : undefined,
    q: clean(params.get("q")),
  }
}

function whereClause(f: AuditFilters) {
  const conds: string[] = []
  const params: unknown[] = []
  const add = (sql: string, value: unknown) => {
    params.push(value)
    conds.push(sql.replaceAll("?", `$${params.length}`))
  }
  if (f.from) add("occurred_at >= ?::timestamptz", f.from)
  // A bare date for "to" includes the whole day.
  if (f.to) add(f.to.length === 10 ? "occurred_at < (?::date + 1)" : "occurred_at <= ?::timestamptz", f.to)
  if (f.actor) add("(actor_user_id = ? OR actor_email = ?)", f.actor)
  if (f.action) add(f.action.endsWith(".") ? "action LIKE ? || '%'" : "action = ?", f.action)
  if (f.entityType) add("entity_type = ?", f.entityType)
  if (f.entityId) add("entity_id = ?", f.entityId)
  if (f.result) add("result = ?", f.result)
  if (f.correlationId) add("correlation_id = ?", f.correlationId)
  if (f.q) {
    const pattern = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    add(
      `(action ILIKE ? OR entity_id ILIKE ? OR entity_label ILIKE ? OR actor_email ILIKE ? OR reason ILIKE ?
        OR failure_reason ILIKE ? OR correlation_id ILIKE ? OR previous_value::text ILIKE ? OR new_value::text ILIKE ?)`,
      pattern,
    )
  }
  return { sql: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params }
}

const SELECT = `SELECT seq, event_id, occurred_at, actor_user_id, actor_email, actor_role, action, entity_type,
  entity_id, entity_label, previous_value, new_value, reason, correlation_id, result, failure_reason, source,
  ip_address, user_agent, hash, prev_hash FROM audit.event`

function toRow(r: Record<string, unknown>): AuditRow {
  return {
    seq: Number(r.seq),
    eventId: r.event_id as string,
    occurredAt: (r.occurred_at as Date).toISOString(),
    actorUserId: r.actor_user_id as string | null,
    actorEmail: r.actor_email as string | null,
    actorRole: r.actor_role as string | null,
    action: r.action as string,
    entityType: r.entity_type as string | null,
    entityId: r.entity_id as string | null,
    entityLabel: r.entity_label as string | null,
    previousValue: r.previous_value,
    newValue: r.new_value,
    reason: r.reason as string | null,
    correlationId: r.correlation_id as string,
    result: r.result as AuditResult,
    failureReason: r.failure_reason as string | null,
    source: r.source as string,
    ipAddress: r.ip_address as string | null,
    userAgent: r.user_agent as string | null,
    hash: r.hash as string,
    prevHash: r.prev_hash as string | null,
  }
}

export async function queryAudit(f: AuditFilters, page: number, pageSize: number) {
  const { sql, params } = whereClause(f)
  const offset = (page - 1) * pageSize
  const [rows, count] = await Promise.all([
    pool.query(`${SELECT} ${sql} ORDER BY seq DESC LIMIT ${pageSize} OFFSET ${offset}`, params),
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM audit.event ${sql}`, params),
  ])
  return { rows: rows.rows.map(toRow), total: Number(count.rows[0].n) }
}

export async function* streamAudit(f: AuditFilters, batch = 1000): AsyncGenerator<AuditRow[]> {
  const { sql, params } = whereClause(f)
  let beforeSeq: number | null = null
  for (;;) {
    const p = [...params]
    let where = sql
    if (beforeSeq !== null) {
      p.push(beforeSeq)
      where = `${sql ? `${sql} AND` : "WHERE"} seq < $${p.length}`
    }
    const res = await pool.query(`${SELECT} ${where} ORDER BY seq DESC LIMIT ${batch}`, p)
    if (res.rows.length === 0) return
    const rows = res.rows.map(toRow)
    yield rows
    beforeSeq = rows[rows.length - 1].seq
    if (rows.length < batch) return
  }
}

export async function auditFacets() {
  const [actions, entities, actors] = await Promise.all([
    pool.query<{ v: string }>("SELECT DISTINCT action AS v FROM audit.event ORDER BY 1 LIMIT 500"),
    pool.query<{ v: string }>("SELECT DISTINCT entity_type AS v FROM audit.event WHERE entity_type IS NOT NULL ORDER BY 1 LIMIT 200"),
    pool.query<{ id: string | null; email: string | null }>(
      `SELECT DISTINCT ON (coalesce(actor_user_id, actor_email)) actor_user_id AS id, actor_email AS email
       FROM audit.event WHERE actor_user_id IS NOT NULL OR actor_email IS NOT NULL
       ORDER BY coalesce(actor_user_id, actor_email), seq DESC LIMIT 500`,
    ),
  ])
  return {
    actions: actions.rows.map((r) => r.v),
    entityTypes: entities.rows.map((r) => r.v),
    actors: actors.rows.map((r) => ({ id: r.id ?? r.email ?? "", email: r.email })),
  }
}

/** Recomputes the hash chain in order; reports the first broken link. */
export async function verifyChain() {
  let prevHash: string | null = null
  let afterSeq = 0
  let checked = 0
  for (;;) {
    const res = await pool.query(`${SELECT} WHERE seq > $1 ORDER BY seq ASC LIMIT 2000`, [afterSeq])
    if (res.rows.length === 0) break
    for (const raw of res.rows) {
      const r = toRow(raw)
      const expected = computeEventHash(prevHash, {
        event_id: r.eventId,
        occurred_at: r.occurredAt,
        actor_user_id: r.actorUserId,
        actor_role: r.actorRole,
        action: r.action,
        entity_type: r.entityType,
        entity_id: r.entityId,
        previous_value: r.previousValue,
        new_value: r.newValue,
        reason: r.reason,
        correlation_id: r.correlationId,
        result: r.result,
        failure_reason: r.failureReason,
      })
      if (r.prevHash !== prevHash || r.hash !== expected) {
        return { ok: false as const, checked, brokenAtSeq: r.seq, eventId: r.eventId }
      }
      prevHash = r.hash
      afterSeq = r.seq
      checked++
    }
  }
  return { ok: true as const, checked, headHash: prevHash }
}
