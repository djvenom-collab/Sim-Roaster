import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"
import { assertServerEnv, isDemoSeedEnabled } from "@/lib/security/env"

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
