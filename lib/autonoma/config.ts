/* ===========================================================================
 * AUTONOMA — Handler configuration
 * ===========================================================================
 * Assembles the HandlerConfig the SDK's `handleRequest` runs:
 *   - factories: one per scenario entity (see factories.ts)
 *   - afterUp:   flush all blob-backed domain rows into the snapshot in ONE
 *                write, mapping each model to its PersistedState slice
 *   - beforeDown: remove every row this run added to the snapshot (by run tag)
 *   - auth:      hand the test runner a REAL, usable login for a seeded user
 *
 * Secrets come from the Autonoma-provisioned env vars. `sharedSecret` verifies
 * the inbound HMAC; `signingSecret` signs the refs token the SDK returns.
 * =========================================================================== */
import type { HandlerConfig, AuthResult } from "@autonoma-ai/sdk"
import { factories, SLICE_FOR_MODEL, TEST_PASSWORD } from "./factories"
import { mergeRecords, removeRecords, runIdFromRefs, RUN_TAG } from "./snapshot"

const SHARED_SECRET = process.env.AUTONOMA_SHARED_SECRET ?? ""
const SIGNING_SECRET = process.env.AUTONOMA_SIGNING_SECRET ?? ""

export function getHandlerConfig(): HandlerConfig {
  return {
    // This app has no organization scope; testRunId is the effective scope.
    scopeField: "testRunId",
    sharedSecret: SHARED_SECRET,
    signingSecret: SIGNING_SECRET,
    factories,
    sdk: { language: "typescript", orm: "drizzle+blob", server: "next" },

    // After every entity is created, project the blob-backed models into the
    // app's snapshot in a single read-modify-write.
    afterUp: async (context, authResult) => {
      const runId = runIdFromRefs(context.refs, context.scenarioName)
      const bySlice: Record<string, Record<string, unknown>[]> = {}
      for (const [model, records] of Object.entries(context.refs)) {
        const slice = SLICE_FOR_MODEL[model]
        if (!slice || records.length === 0) continue
        bySlice[slice] = (bySlice[slice] ?? []).concat(records)
      }
      if (Object.keys(bySlice).length > 0) {
        await mergeRecords(bySlice, runId)
      }
      return authResult
    },

    // Remove this run's snapshot rows before per-record (Postgres) teardown.
    beforeDown: async (context) => {
      const runId = runIdFromRefs(context.refs, context.scenarioName)
      await removeRecords(runId)
    },

    // Return credentials for the first seeded user. Every seeded credential
    // account uses TEST_PASSWORD, so the runner can sign in through the normal
    // email+password flow. We do NOT mint a raw session cookie here — issuing a
    // real Better Auth session is done through sign-in, keeping the token
    // format owned by Better Auth.
    auth: (user): AuthResult => {
      const email = user && typeof user.email === "string" ? user.email : undefined
      if (!email) return { credentials: {} }
      return {
        credentials: {
          email,
          password: TEST_PASSWORD,
          loginUrl: "/login",
        },
      }
    },
  }
}

// Re-export for the route so it doesn't need to import the tag separately.
export { RUN_TAG }
