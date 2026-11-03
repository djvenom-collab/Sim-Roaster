import "server-only"
import type { PoolClient } from "pg"
import { pool } from "@/lib/db"
import type { Risk, RiskReview } from "./model"

export class RiskVersionConflictError extends Error {
  constructor() {
    super("risk was modified by someone else")
    // withAudit reports this name as failureReason "concurrency_conflict".
    this.name = "ConcurrencyConflictError"
  }
}

const COLS = `id, category, title, description, cause, consequence, assets, basis, evidence,
  likelihood, impact, inherent_score, controls, control_effectiveness,
  residual_likelihood, residual_impact, residual_score, risk_owner, treatment_strategy,
  treatment_plan, treatments, treatment_owner, to_char(target_date, 'YYYY-MM-DD') AS target_date,
  status, acceptance, to_char(review_date, 'YYYY-MM-DD') AS review_date, closed_at, closure_reason,
  version, created_at, created_by, updated_at, updated_by`

type Row = Record<string, unknown>
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v))

function toRisk(r: Row): Risk {
  return {
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    description: r.description as string,
    cause: r.cause as string,
    consequence: r.consequence as string,
    assets: (r.assets as string[]) ?? [],
    basis: r.basis as Risk["basis"],
    evidence: (r.evidence as Risk["evidence"]) ?? [],
    likelihood: Number(r.likelihood),
    impact: Number(r.impact),
    inherentScore: Number(r.inherent_score),
    controls: (r.controls as Risk["controls"]) ?? [],
    controlEffectiveness: r.control_effectiveness as Risk["controlEffectiveness"],
    residualLikelihood: Number(r.residual_likelihood),
    residualImpact: Number(r.residual_impact),
    residualScore: Number(r.residual_score),
    riskOwner: (r.risk_owner as string | null) ?? null,
    treatmentStrategy: r.treatment_strategy as Risk["treatmentStrategy"],
    treatmentPlan: r.treatment_plan as string,
    treatments: (r.treatments as Risk["treatments"]) ?? [],
    treatmentOwner: (r.treatment_owner as string | null) ?? null,
    targetDate: (r.target_date as string | null) ?? null,
    status: r.status as Risk["status"],
    acceptance: (r.acceptance as Risk["acceptance"]) ?? null,
    reviewDate: (r.review_date as string | null) ?? null,
    closedAt: iso(r.closed_at),
    closureReason: (r.closure_reason as string | null) ?? null,
    version: Number(r.version),
    createdAt: iso(r.created_at) as string,
    createdBy: (r.created_by as string | null) ?? null,
    updatedAt: iso(r.updated_at) as string,
    updatedBy: (r.updated_by as string | null) ?? null,
  }
}

export async function listRisks(): Promise<Risk[]> {
  const { rows } = await pool.query(`SELECT ${COLS} FROM risk.risk ORDER BY residual_score DESC, id`)
  return rows.map(toRisk)
}

export async function getRisk(id: string): Promise<Risk | null> {
  const { rows } = await pool.query(`SELECT ${COLS} FROM risk.risk WHERE id = $1`, [id])
  return rows[0] ? toRisk(rows[0]) : null
}

export async function listReviews(riskId: string): Promise<RiskReview[]> {
  const { rows } = await pool.query(
    `SELECT id, risk_id, reviewed_at, reviewer_email, outcome, notes, residual_likelihood, residual_impact,
            to_char(next_review_date, 'YYYY-MM-DD') AS next_review_date
       FROM risk.review WHERE risk_id = $1 ORDER BY reviewed_at DESC`,
    [riskId],
  )
  return rows.map((r) => ({
    id: r.id,
    riskId: r.risk_id,
    reviewedAt: iso(r.reviewed_at) as string,
    reviewerEmail: r.reviewer_email,
    outcome: r.outcome,
    notes: r.notes,
    residualLikelihood: Number(r.residual_likelihood),
    residualImpact: Number(r.residual_impact),
    nextReviewDate: r.next_review_date,
  }))
}

export async function existingIds(): Promise<Set<string>> {
  const { rows } = await pool.query(`SELECT id FROM risk.risk`)
  return new Set(rows.map((r) => r.id as string))
}

/** Sequence-backed so concurrent creates never get the same id. */
export async function allocateRiskId(): Promise<string> {
  const { rows } = await pool.query(
    `SELECT greatest(nextval('risk.risk_number'),
                     (SELECT coalesce(max(substring(id FROM 3)::int), 0) + 1 FROM risk.risk)) AS n`,
  )
  const n = Number(rows[0].n)
  await pool.query(`SELECT setval('risk.risk_number', greatest($1::bigint, (SELECT last_value FROM risk.risk_number)))`, [n])
  return `R-${String(n).padStart(3, "0")}`
}

const WRITE_COLUMNS = [
  "category", "title", "description", "cause", "consequence", "assets", "basis", "evidence",
  "likelihood", "impact", "controls", "control_effectiveness", "residual_likelihood", "residual_impact",
  "risk_owner", "treatment_strategy", "treatment_plan", "treatments", "treatment_owner", "target_date",
  "status", "acceptance", "review_date", "closed_at", "closure_reason",
] as const

function writeValues(r: Risk): unknown[] {
  const json = (v: unknown) => (v == null ? null : JSON.stringify(v))
  return [
    r.category, r.title, r.description, r.cause, r.consequence, r.assets, r.basis, json(r.evidence),
    r.likelihood, r.impact, json(r.controls), r.controlEffectiveness, r.residualLikelihood, r.residualImpact,
    r.riskOwner, r.treatmentStrategy, r.treatmentPlan, json(r.treatments), r.treatmentOwner, r.targetDate,
    r.status, json(r.acceptance), r.reviewDate, r.closedAt, r.closureReason,
  ]
}

async function insertOne(client: PoolClient, r: Risk, actor: string | null) {
  const values = [r.id, ...writeValues(r), actor]
  const placeholders = values.map((_, i) => `$${i + 1}`).join(",")
  const { rows } = await client.query(
    `INSERT INTO risk.risk (id, ${WRITE_COLUMNS.join(",")}, created_by) VALUES (${placeholders}) RETURNING ${COLS}`,
    values,
  )
  return toRisk(rows[0])
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export function insertRisks(risks: Risk[], actor: string | null): Promise<Risk[]> {
  return inTransaction(async (client) => {
    const out: Risk[] = []
    for (const r of risks) out.push(await insertOne(client, r, actor))
    return out
  })
}

export function saveRisk(
  next: Risk,
  expectedVersion: number,
  actor: { userId: string | null; email: string | null },
  review?: Omit<RiskReview, "id" | "riskId" | "reviewedAt" | "reviewerEmail">,
): Promise<Risk> {
  return inTransaction(async (client) => {
    const values = writeValues(next)
    const sets = WRITE_COLUMNS.map((c, i) => `${c} = $${i + 3}`).join(", ")
    const { rows } = await client.query(
      `UPDATE risk.risk SET ${sets}, version = version + 1, updated_at = now(), updated_by = $${values.length + 3}
        WHERE id = $1 AND version = $2 RETURNING ${COLS}`,
      [next.id, expectedVersion, ...values, actor.email],
    )
    if (!rows[0]) throw new RiskVersionConflictError()
    if (review) {
      await client.query(
        `INSERT INTO risk.review (risk_id, reviewer_user_id, reviewer_email, outcome, notes,
           residual_likelihood, residual_impact, next_review_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [next.id, actor.userId, actor.email, review.outcome, review.notes, review.residualLikelihood, review.residualImpact, review.nextReviewDate],
      )
    }
    return toRisk(rows[0])
  })
}
