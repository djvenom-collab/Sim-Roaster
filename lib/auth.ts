import { betterAuth } from "better-auth"
import { createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api"
import { pool } from "@/lib/db"
import { assertServerEnv, isDemoSeedEnabled } from "@/lib/security/env"
import { SYSTEM_ACTOR, auditContext, recordAuditSafe, type AuditActor } from "@/lib/audit/log"

// Paths whose outcome is a security event. Successful sign-ins are detected via
// ctx.context.newSession so the email and social (callback) flows share one path.
const LOGIN_PATHS = new Set(["/sign-in/email", "/sign-in/social", "/sign-up/email"])

type HookCtx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

function hookAudit(ctx: HookCtx, actor: AuditActor) {
  return auditContext(ctx.headers ?? ctx.request?.headers ?? new Headers(), actor, `auth${ctx.path}`)
}

function failureCode(returned: unknown): string {
  if (!isAPIError(returned)) return "unknown"
  const body = returned.body as { code?: string } | undefined
  return body?.code ?? String(returned.status)
}

function userActor(user: { id: string; email: string; appRole?: unknown }): AuditActor {
  return { userId: user.id, email: user.email, role: typeof user.appRole === "string" ? user.appRole : null }
}

const authAuditHooks = {
  before: createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-out") return
    const session = await getSessionFromCtx(ctx).catch(() => null)
    if (!session) return
    await recordAuditSafe(hookAudit(ctx, userActor(session.user)), [
      { action: "auth.logout", entityType: "session", entityId: session.session.id },
    ])
  }),
  after: createAuthMiddleware(async (ctx) => {
    const returned = ctx.context.returned
    const failed = isAPIError(returned)
    const newSession = ctx.context.newSession
    const body = (ctx.body ?? {}) as { email?: unknown }
    const claimedEmail = typeof body.email === "string" ? body.email.slice(0, 200).toLowerCase() : null

    if (!failed && newSession && (LOGIN_PATHS.has(ctx.path) || ctx.path.startsWith("/callback/"))) {
      await recordAuditSafe(hookAudit(ctx, userActor(newSession.user)), [
        {
          action: "auth.login",
          entityType: "session",
          entityId: newSession.session.id,
          newValue: { method: ctx.path.startsWith("/callback/") ? `oauth:${ctx.params?.id ?? "unknown"}` : ctx.path },
        },
      ])
      return
    }
    if (failed && (ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email")) {
      // The actor is unauthenticated: only the claimed email is stored, never the password.
      await recordAuditSafe(hookAudit(ctx, { userId: null, email: claimedEmail, role: null }), [
        {
          action: ctx.path === "/sign-in/email" ? "auth.login" : "auth.signup",
          entityType: "session",
          result: "failure",
          failureReason: failureCode(returned),
        },
      ])
      return
    }
    if (ctx.path === "/change-password" || ctx.path === "/set-password" || ctx.path === "/reset-password") {
      const session = await getSessionFromCtx(ctx).catch(() => null)
      await recordAuditSafe(hookAudit(ctx, session ? userActor(session.user) : { ...SYSTEM_ACTOR, role: null }), [
        {
          action: "auth.password_change",
          entityType: "user",
          entityId: session?.user.id ?? null,
          result: failed ? "failure" : "success",
          failureReason: failed ? failureCode(returned) : null,
        },
      ])
      return
    }
    if (ctx.path === "/revoke-session" || ctx.path === "/revoke-sessions" || ctx.path === "/revoke-other-sessions") {
      const session = await getSessionFromCtx(ctx).catch(() => null)
      if (!session) return
      await recordAuditSafe(hookAudit(ctx, userActor(session.user)), [
        {
          action: "auth.session_revoke",
          entityType: "session",
          newValue: { scope: ctx.path.slice(1) },
          result: failed ? "failure" : "success",
          failureReason: failed ? failureCode(returned) : null,
        },
      ])
    }
  }),
}

assertServerEnv()

const isProduction = process.env.NODE_ENV === "production"

// Demo seeding needs open sign-up and the 5-char "admin" password. Outside of
// demo mode, self-registration is closed and new passwords must be strong.
// Existing accounts can still sign in — length is only enforced on set/change.
const demoSeed = isDemoSeedEnabled()

// Microsoft (Entra ID) OAuth is wired up but stays inert until real Azure
// credentials are supplied via MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET.
const microsoftConfigured = Boolean(
  process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET,
)

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    disableSignUp: !demoSeed,
    // Demo requirement: the seeded accounts use the password "admin" (5 chars).
    minPasswordLength: demoSeed ? 5 : 12,
    maxPasswordLength: 128,
  },
  socialProviders: microsoftConfigured
    ? {
        microsoft: {
          clientId: process.env.MICROSOFT_CLIENT_ID as string,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
          // "common" lets both work + personal Microsoft accounts sign in.
          tenantId: process.env.MICROSOFT_TENANT_ID ?? "common",
          // Only pre-provisioned users may sign in unless explicitly opened up.
          disableImplicitSignUp: process.env.MICROSOFT_ALLOW_SIGNUP !== "true",
        },
      }
    : undefined,
  hooks: authAuditHooks,
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await recordAuditSafe(auditContext(new Headers(), SYSTEM_ACTOR, "auth/user.create"), [
            {
              action: "user.create",
              entityType: "auth_user",
              entityId: user.id,
              entityLabel: user.email,
              newValue: { email: user.email, appRole: (user as { appRole?: unknown }).appRole ?? null },
            },
          ])
        },
      },
    },
  },
  user: {
    additionalFields: {
      // This app's access level (SP, SUP, SOO, STO, TL, ADMIN).
      appRole: {
        type: "string",
        required: false,
        defaultValue: "SP",
        input: false,
      },
    },
  },
  trustedOrigins: [
    ...(process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
          ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
          ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
          ...(process.env.V0_SANDBOX_URL ? [process.env.V0_SANDBOX_URL] : []),
        ]
      : []),
    ...(isProduction
      ? [
          ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
          ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
            : []),
          ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
        ]
      : []),
  ],
  session: {
    // Sliding session: expires after 24h of inactivity, refreshed hourly while in use.
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/sign-in/social": { window: 60, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {
        advanced: {
          useSecureCookies: isProduction,
          defaultCookieAttributes: {
            httpOnly: true,
            sameSite: "lax" as const,
            secure: isProduction,
          },
        },
      }),
})
