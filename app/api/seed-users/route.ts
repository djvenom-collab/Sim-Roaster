import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { isDemoSeedEnabled } from "@/lib/security/env"
import { isSameOriginRequest, jsonError } from "@/lib/security/authz"
import { checkRateLimit, clientIp } from "@/lib/security/rate-limit"
import { AuditUnavailableError, SYSTEM_ACTOR, auditContext, recordAuditSafe, withAudit } from "@/lib/audit/log"

// One demo account per access level (1-6). All use the password "admin".
// This is a convenience seeder for the demo; every account is created through
// Better Auth so passwords are properly hashed, then tagged with its appRole.
// Disabled in production unless ENABLE_DEMO_SEED=true.
const SEED_ACCOUNTS: { email: string; name: string; role: string }[] = [
  { email: "sp@sim.local", name: "Sim Pilot", role: "SP" },
  { email: "sup@sim.local", name: "Supervisor", role: "SUP" },
  { email: "soo@sim.local", name: "Simulator Operational Officer", role: "SOO" },
  { email: "sto@sim.local", name: "Simulator Training Officer", role: "STO" },
  { email: "tl@sim.local", name: "Team Lead", role: "TL" },
  { email: "admin@sim.local", name: "Administrator", role: "Admin" },
]

const PASSWORD = "admin"

export async function POST(request: Request) {
  if (!isDemoSeedEnabled()) return jsonError(404, "not_found")
  if (!isSameOriginRequest(request)) return jsonError(403, "forbidden")
  const rl = checkRateLimit(`seed-users:${clientIp(request)}`, { limit: 5, windowSec: 60 })
  if (!rl.allowed) return jsonError(429, "rate_limited", { "Retry-After": String(rl.retryAfterSec) })

  const results: { email: string; role: string; status: string }[] = []
  const audit = auditContext(request, { ...SYSTEM_ACTOR, role: "demo-seed" }, "api/seed-users")

  for (const acct of SEED_ACCOUNTS) {
    const existing = await db
      .select({ id: user.id, appRole: user.appRole })
      .from(user)
      .where(eq(user.email, acct.email))
      .limit(1)

    if (existing.length > 0) {
      // Make sure the role tag is correct even if the account already exists.
      const [row] = existing
      if (row.appRole !== acct.role) {
        try {
          await withAudit(
            audit,
            [
              {
                action: "user.role_change",
                entityType: "auth_user",
                entityId: row.id,
                entityLabel: acct.email,
                previousValue: { appRole: row.appRole },
                newValue: { appRole: acct.role },
                reason: "demo seed",
              },
            ],
            () => db.update(user).set({ appRole: acct.role }).where(eq(user.email, acct.email)),
          )
        } catch (err) {
          if (!(err instanceof AuditUnavailableError)) throw err
          results.push({ email: acct.email, role: acct.role, status: "audit_unavailable" })
          continue
        }
      }
      results.push({ email: acct.email, role: acct.role, status: "exists" })
      continue
    }

    try {
      await auth.api.signUpEmail({
        body: { email: acct.email, password: PASSWORD, name: acct.name },
      })
      // Tag the freshly created user with its access level + mark verified.
      await db
        .update(user)
        .set({ appRole: acct.role, emailVerified: true })
        .where(eq(user.email, acct.email))
      await recordAuditSafe(audit, [
        {
          action: "user.role_change",
          entityType: "auth_user",
          entityLabel: acct.email,
          previousValue: { appRole: null },
          newValue: { appRole: acct.role },
          reason: "demo seed",
        },
      ])
      results.push({ email: acct.email, role: acct.role, status: "created" })
    } catch (err) {
      console.error("[seed-users] error for", acct.email, (err as Error).message)
      results.push({ email: acct.email, role: acct.role, status: "error" })
    }
  }

  return NextResponse.json({ ok: true, results })
}

// GET is a dev-only convenience trigger.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return jsonError(405, "method_not_allowed")
  return POST(request)
}
