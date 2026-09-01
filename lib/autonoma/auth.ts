/* ===========================================================================
 * AUTONOMA — real Better Auth user creation, sign-in and teardown
 * ===========================================================================
 * The app authenticates with Better Auth (email + password) backed by Neon
 * Postgres (lib/auth.ts, lib/db). Autonoma must seed users through that SAME
 * path so the runner can log in for real — hashed passwords, a real `account`
 * row, a real signed session cookie. Nothing here is faked.
 * =========================================================================== */
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import type { AuthCookie } from "@autonoma-ai/sdk"

/** Every seeded account uses this password so the auth callback can sign in. */
export const SEED_PASSWORD = "autonoma-test-pw"

export interface CreatedAuthUser {
  id: string
  email: string
  name: string
  appRole: string
  password: string
}

/**
 * Create a real Better Auth user (hashed password + `account` row) and tag it
 * with the app's access level. Mirrors app/api/seed-users/route.ts.
 */
export async function createAuthUser(input: {
  email: string
  name: string
  appRole: string
}): Promise<CreatedAuthUser> {
  await auth.api.signUpEmail({
    body: { email: input.email, password: SEED_PASSWORD, name: input.name },
  })
  await db
    .update(user)
    .set({ appRole: input.appRole, emailVerified: true })
    .where(eq(user.email, input.email))

  const row = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, input.email))
    .limit(1)

  return {
    id: row[0]?.id ?? input.email,
    email: input.email,
    name: input.name,
    appRole: input.appRole,
    password: SEED_PASSWORD,
  }
}

/** Delete a seeded user; session + account rows cascade via their FKs. */
export async function deleteAuthUser(id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id))
}

/** Parse one Set-Cookie header line into an AuthCookie the runner can replay. */
function parseSetCookie(line: string): AuthCookie | null {
  const [pair, ...attrParts] = line.split(";")
  const eq = pair.indexOf("=")
  if (eq < 0) return null
  const name = pair.slice(0, eq).trim()
  const value = pair.slice(eq + 1).trim()
  if (!name) return null
  const attrs = new Map(
    attrParts.map((a) => {
      const i = a.indexOf("=")
      return i < 0
        ? [a.trim().toLowerCase(), ""]
        : [a.slice(0, i).trim().toLowerCase(), a.slice(i + 1).trim()]
    }),
  )
  const sameSiteRaw = (attrs.get("samesite") ?? "").toLowerCase()
  const sameSite =
    sameSiteRaw === "strict" || sameSiteRaw === "lax" || sameSiteRaw === "none"
      ? (sameSiteRaw as "strict" | "lax" | "none")
      : undefined
  const maxAge = attrs.has("max-age") ? Number(attrs.get("max-age")) : undefined
  return {
    name,
    value,
    path: attrs.get("path") || "/",
    httpOnly: attrs.has("httponly"),
    secure: attrs.has("secure"),
    ...(sameSite ? { sameSite } : {}),
    ...(maxAge != null && !Number.isNaN(maxAge) ? { maxAge } : {}),
  }
}

/**
 * Sign the seeded user in through Better Auth and return the real session
 * cookie(s) it issues, ready for the test runner to send back.
 */
export async function sessionCookiesFor(
  email: string,
  password: string,
): Promise<AuthCookie[]> {
  const res = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  })
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : [])
  return setCookies
    .map(parseSetCookie)
    .filter((c): c is AuthCookie => c !== null && c.value.length > 0)
}
