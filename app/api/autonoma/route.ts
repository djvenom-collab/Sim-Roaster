/* ===========================================================================
 * AUTONOMA — factory endpoint
 * ===========================================================================
 * Autonoma's test runner calls this route to seed (`up`) and tear down
 * (`down`) an isolated copy of the app's data for each test run. The runner
 * signs every request with the shared secret (HMAC); the handler verifies it,
 * so the route is safe to leave reachable without an app session (it is
 * exempted from the auth redirect in middleware.ts).
 *
 * SEEDING MODEL
 *   - Domain data is written to a PER-RUN Blob snapshot keyed by testRunId
 *     (lib/autonoma/run-store.ts) so runs never collide and teardown is a
 *     single blob delete.
 *   - Users are REAL Better Auth accounts in Neon so the runner can log in.
 *   - After entities are created, `auth` signs the scenario's first user in and
 *     returns the real session cookie PLUS the `autonoma_run` cookie that
 *     switches /api/state onto this run's snapshot.
 *   - `beforeDown` deletes the whole per-run snapshot in one call; per-model
 *     teardown then removes the Neon rows (users cascade their sessions).
 * =========================================================================== */
import { createHandler } from "@autonoma-ai/server-web"
import { factories } from "@/lib/autonoma/factories"
import { sessionCookiesFor } from "@/lib/autonoma/auth"
import {
  RUN_COOKIE,
  ensureSnapshot,
  flushRun,
  deleteRunSnapshot,
} from "@/lib/autonoma/run-store"

export const dynamic = "force-dynamic"

const handler = createHandler({
  // The app has no tenant column; scope is the test run itself. With no record
  // carrying this field, the SDK falls back to using testRunId as scopeValue.
  scopeField: "testRunId",
  sharedSecret: process.env.AUTONOMA_SHARED_SECRET as string,
  signingSecret: process.env.AUTONOMA_SIGNING_SECRET as string,
  factories,

  /**
   * Called after all entities are created. `user` is the scenario's first User
   * ref (our factory returns its email + seed password). We sign that user in
   * for a real Better Auth session and pin the run cookie so the app serves
   * this run's isolated snapshot.
   */
  async auth(user, context) {
    // Guarantee an isolated (possibly empty) snapshot exists so the app never
    // falls back to the shared demo data for this run.
    await ensureSnapshot(context.scopeValue)

    const runCookie = {
      name: RUN_COOKIE,
      value: context.scopeValue,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      maxAge: 60 * 60 * 24,
    }

    if (!user?.email) {
      // No User in this scenario — the runner still gets the run cookie so it
      // sees the isolated snapshot; there just isn't a logged-in session.
      return { cookies: [runCookie] }
    }

    const password = (user.password as string) ?? undefined
    let sessionCookies: Awaited<ReturnType<typeof sessionCookiesFor>> = []
    try {
      if (password) {
        sessionCookies = await sessionCookiesFor(String(user.email), password)
      }
    } catch (err) {
      console.log("[v0] autonoma auth sign-in failed:", (err as Error).message)
    }

    return {
      cookies: [...sessionCookies, runCookie],
      credentials: { email: String(user.email), ...(password ? { password } : {}) },
    }
  },

  /**
   * Runs after all creates + auth, before the response. Every factory buffered
   * its writes in-process (lib/autonoma/run-store.ts); this flushes the run's
   * whole snapshot to its blob in ONE write instead of one-per-record.
   */
  async afterUp(context, authResult) {
    if (context.scenarioName) await flushRun(context.scenarioName)
    return authResult
  },

  /**
   * Runs before per-model teardown. One delete removes every domain slice this
   * run wrote (the Neon rows are cleaned up by each model's `teardown`).
   */
  async beforeDown(context) {
    // The SDK passes the testRunId as `scenarioName` on the down hook context.
    if (context.scenarioName) await deleteRunSnapshot(context.scenarioName)
  },
})

export const POST = handler
