import { z } from "zod"

/* ===========================================================================
 * SERVER ENVIRONMENT VALIDATION
 * ===========================================================================
 * Validates server-side configuration once per instance. Missing CRITICAL
 * values fail closed at runtime in production (never during `next build`, so
 * a build without runtime secrets still succeeds). Weak-but-present values
 * only log a warning so an existing deployment is never taken down by this.
 * Values are never logged — only variable names.
 * =========================================================================== */

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(1, "BETTER_AUTH_SECRET is required"),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  NOTIFY_FROM_EMAIL: z.string().min(1).optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  ENABLE_DEMO_SEED: z.enum(["true", "false"]).optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

const SECRET_NAME_PATTERN = /(SECRET|TOKEN|PASSWORD|PRIVATE|API_KEY|_KEY$)/i

let validated = false

function isBuildPhase() {
  return process.env.NEXT_PHASE === "phase-production-build"
}

export function assertServerEnv(): void {
  if (validated || isBuildPhase()) return
  validated = true

  const result = serverEnvSchema.safeParse(process.env)
  if (!result.success) {
    const names = result.error.issues.map((i) => i.path.join(".")).join(", ")
    console.error(`[security] Invalid or missing server environment variables: ${names}`)
    if (process.env.NODE_ENV === "production") {
      throw new Error("Server misconfiguration")
    }
  }

  const secret = process.env.BETTER_AUTH_SECRET ?? ""
  if (secret && secret.length < 32) {
    console.warn("[security] BETTER_AUTH_SECRET is shorter than 32 characters; rotate it to a stronger value.")
  }

  const leaked = Object.keys(process.env).filter(
    (k) => k.startsWith("NEXT_PUBLIC_") && SECRET_NAME_PATTERN.test(k.slice("NEXT_PUBLIC_".length)),
  )
  if (leaked.length) {
    console.warn(`[security] Public env vars with secret-like names are exposed to the browser: ${leaked.join(", ")}`)
  }
}

/** Demo account seeding (and the weak demo password it needs) is on in
 * development and off in production unless explicitly enabled. */
export function isDemoSeedEnabled(): boolean {
  if (process.env.ENABLE_DEMO_SEED === "true") return true
  if (process.env.ENABLE_DEMO_SEED === "false") return false
  return process.env.NODE_ENV !== "production"
}
