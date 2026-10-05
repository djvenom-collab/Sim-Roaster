import "server-only"
import { head, list } from "@vercel/blob"
import { pool } from "@/lib/db"
import { STATE_PATHNAME } from "@/lib/repository/state-repository"
import { BACKUP_PREFIX } from "./backup-manifest"
import { objectiveFor } from "./objectives"

export type CheckStatus = "ok" | "degraded" | "down" | "not_configured"

export interface DependencyCheck {
  id: string
  tier: number
  status: CheckStatus
  latencyMs: number
  detail?: string
}

export interface HealthReport {
  status: "ok" | "degraded" | "down"
  checkedAt: string
  checks: DependencyCheck[]
  backup: { latestAt: string | null; ageMinutes: number | null; rpoMinutes: number | null; rpoBasis: string }
}

const TIMEOUT_MS = 3_000
const CACHE_MS = 15_000
let cached: { at: number; report: HealthReport } | null = null

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS))])
}

async function timed(id: string, tier: number, fn: () => Promise<CheckStatus | { status: CheckStatus; detail: string }>): Promise<DependencyCheck> {
  const start = Date.now()
  try {
    const r = await withTimeout(fn())
    const { status, detail } = typeof r === "string" ? { status: r, detail: undefined } : r
    return { id, tier, status, latencyMs: Date.now() - start, detail }
  } catch (error) {
    return { id, tier, status: "down", latencyMs: Date.now() - start, detail: (error as Error).message.slice(0, 120) }
  }
}

async function latestBackupAt(): Promise<Date | null> {
  let latest: Date | null = null
  let cursor: string | undefined
  do {
    const page = await list({ prefix: BACKUP_PREFIX, cursor, limit: 1000 })
    for (const b of page.blobs) if (!latest || b.uploadedAt > latest) latest = b.uploadedAt
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
  return latest
}

export async function runHealthChecks(): Promise<HealthReport> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.report

  const tier1 = objectiveFor("1")
  let backupAt: Date | null = null

  const checks = await Promise.all([
    timed("neon-postgres", 1, async () => {
      await pool.query("select 1")
      return "ok"
    }),
    timed("audit-trail", 2, async () => {
      const { rows } = await pool.query<{ t: string | null }>("select to_regclass('audit.event')::text as t")
      return rows[0]?.t ? "ok" : { status: "degraded", detail: "audit.event missing" }
    }),
    timed("vercel-blob", 1, async () => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return "not_configured"
      await head(STATE_PATHNAME)
      return "ok"
    }),
    timed("better-auth", 1, async () => (process.env.BETTER_AUTH_SECRET ? "ok" : { status: "down", detail: "BETTER_AUTH_SECRET unset" })),
    timed("resend-email", 3, async () => (process.env.RESEND_API_KEY ? "ok" : "not_configured")),
    timed("backups", 1, async () => {
      backupAt = await latestBackupAt()
      if (!backupAt) return { status: "degraded", detail: "no backups found" }
      const age = (Date.now() - backupAt.getTime()) / 60_000
      if (tier1.rpoMinutes !== null && age > tier1.rpoMinutes) return { status: "degraded", detail: "latest backup older than RPO" }
      return "ok"
    }),
  ])

  const criticalDown = checks.some((c) => c.tier === 1 && c.id !== "backups" && c.status === "down")
  const anyDegraded = checks.some((c) => c.status === "down" || c.status === "degraded")
  const latest = backupAt as Date | null

  const report: HealthReport = {
    status: criticalDown ? "down" : anyDegraded ? "degraded" : "ok",
    checkedAt: new Date().toISOString(),
    checks,
    backup: {
      latestAt: latest ? latest.toISOString() : null,
      ageMinutes: latest ? Math.round((Date.now() - latest.getTime()) / 60_000) : null,
      rpoMinutes: tier1.rpoMinutes,
      rpoBasis: tier1.basis,
    },
  }
  cached = { at: Date.now(), report }
  return report
}
