import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

// One demo account per access level (1-6). All use the password "admin".
// This is a convenience seeder for the demo; every account is created through
// Better Auth so passwords are properly hashed, then tagged with its appRole.
const SEED_ACCOUNTS: { email: string; name: string; role: string }[] = [
  { email: "sp@sim.local", name: "Sim Pilot", role: "SP" },
  { email: "sup@sim.local", name: "Supervisor", role: "SUP" },
  { email: "soo@sim.local", name: "Simulator Operational Officer", role: "SOO" },
  { email: "sto@sim.local", name: "Simulator Training Officer", role: "STO" },
  { email: "tl@sim.local", name: "Team Lead", role: "TL" },
  { email: "admin@sim.local", name: "Administrator", role: "Admin" },
]

const PASSWORD = "admin"

export async function POST() {
  const results: { email: string; role: string; status: string }[] = []

  for (const acct of SEED_ACCOUNTS) {
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, acct.email))
      .limit(1)

    if (existing.length > 0) {
      // Make sure the role tag is correct even if the account already exists.
      await db.update(user).set({ appRole: acct.role }).where(eq(user.email, acct.email))
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
      results.push({ email: acct.email, role: acct.role, status: "created" })
    } catch (err) {
      console.log("[v0] seed-users error for", acct.email, (err as Error).message)
      results.push({ email: acct.email, role: acct.role, status: "error" })
    }
  }

  return NextResponse.json({ ok: true, results })
}

// Allow a GET as well so it can be triggered easily from the browser/dev.
export async function GET() {
  return POST()
}
