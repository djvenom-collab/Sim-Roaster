import "server-only"
import { NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { auth } from "@/lib/auth"
import { reconcilePermissionMatrix, type Permission } from "@/lib/permissions"
import type { RoleCode } from "@/lib/types"
import { checkRateLimit, clientIp, type RateLimitRule } from "./rate-limit"

/* ===========================================================================
 * CENTRALIZED SERVER-SIDE AUTHORIZATION
 * ===========================================================================
 * Every protected API route calls `authorize()` instead of re-implementing
 * checks. It performs, in order:
 *   1. CSRF origin check for state-changing methods
 *   2. Rate limiting (optional, per user or IP)
 *   3. Session validation (Better Auth, server-side)
 *   4. Role-level and/or permission checks
 * UI hiding in the client is a convenience only; this module is the control.
 *
 * Role hierarchy (security tiers). SOO and STO share the Supervisor baseline
 * permission set, so they sit at the Supervisor tier.
 * =========================================================================== */

export const ROLE_TIER: Record<RoleCode, number> = {
  SP: 1,
  SUP: 2,
  SOO: 2,
  STO: 2,
  TL: 3,
  Admin: 4,
}

const VALID_ROLES = Object.keys(ROLE_TIER) as RoleCode[]

export function normalizeRole(value: unknown): RoleCode {
  return VALID_ROLES.includes(value as RoleCode) ? (value as RoleCode) : "SP"
}

export interface AuthContext {
  userId: string
  email: string
  role: RoleCode
  tier: number
}

export interface AuthorizeOptions {
  /** Minimum role tier (1 = SP … 4 = Admin). */
  minTier?: number
  /** Caller must hold at least one of these permissions. */
  anyPermission?: Permission[]
  /** Rate limit bucket name + rule. */
  rateLimit?: { bucket: string } & RateLimitRule
}

export type AuthorizeResult = { ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }

export function jsonError(status: number, code: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { error: code },
    { status, headers: { "Cache-Control": "no-store", ...extraHeaders } },
  )
}

// ── Permission matrix (runtime, Admin-editable) ─────────────────────────────
// The matrix lives in the state snapshot. Cache briefly to avoid a blob read
// on every request; fall back to the shipped defaults if unreadable.
const STATE_PATH = "sim-roster/state.json"
const MATRIX_TTL_MS = 15_000
let matrixCache: { value: Record<RoleCode, Permission[]>; expiresAt: number } | null = null

export function invalidatePermissionCache() {
  matrixCache = null
}

async function loadPermissionMatrix(): Promise<Record<RoleCode, Permission[]>> {
  const now = Date.now()
  if (matrixCache && matrixCache.expiresAt > now) return matrixCache.value
  let value = reconcilePermissionMatrix(null)
  try {
    const result = await get(STATE_PATH, { access: "private", useCache: false })
    if (result?.stream) {
      const text = await new Response(result.stream).text()
      const parsed = text ? (JSON.parse(text) as { permissionMatrix?: Record<RoleCode, Permission[]> }) : null
      if (parsed?.permissionMatrix && typeof parsed.permissionMatrix === "object") {
        value = reconcilePermissionMatrix(parsed.permissionMatrix)
      }
    }
  } catch (error) {
    console.error("[security] permission matrix load failed; using defaults:", (error as Error).message)
  }
  matrixCache = { value, expiresAt: now + MATRIX_TTL_MS }
  return value
}

export async function hasPermission(role: RoleCode, perm: Permission): Promise<boolean> {
  if (role === "Admin") return true
  const matrix = await loadPermissionMatrix()
  return matrix[role]?.includes(perm) ?? false
}

// ── Session ─────────────────────────────────────────────────────────────────
export async function getAuthContext(requestHeaders: Headers): Promise<AuthContext | null> {
  try {
    const session = await auth.api.getSession({ headers: requestHeaders })
    if (!session?.user?.id) return null
    const role = normalizeRole((session.user as { appRole?: unknown }).appRole)
    return { userId: session.user.id, email: session.user.email, role, tier: ROLE_TIER[role] }
  } catch (error) {
    console.error("[security] session lookup failed:", (error as Error).message)
    return null
  }
}

// ── CSRF ────────────────────────────────────────────────────────────────────
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function extraTrustedOrigins(): string[] {
  return [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    ...(process.env.NODE_ENV === "development"
      ? [process.env.V0_RUNTIME_URL, process.env.V0_DEV_APP_URL, process.env.V0_SANDBOX_URL, "http://localhost:3000"]
      : []),
  ].filter((v): v is string => Boolean(v))
}

/** Rejects cross-site browser requests for state-changing methods. Requests
 * with no Origin (non-browser clients) cannot carry ambient cookies via CSRF. */
export function isSameOriginRequest(request: Request): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return true
  if (request.headers.get("sec-fetch-site") === "cross-site") return false
  const origin = request.headers.get("origin")
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const hosts = [request.headers.get("x-forwarded-host"), request.headers.get("host")].filter(Boolean)
  if (hosts.includes(originHost)) return true
  return extraTrustedOrigins().some((o) => {
    try {
      return new URL(o).host === originHost
    } catch {
      return false
    }
  })
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function authorize(request: Request, options: AuthorizeOptions = {}): Promise<AuthorizeResult> {
  if (!isSameOriginRequest(request)) {
    return { ok: false, response: jsonError(403, "forbidden") }
  }

  const ctx = await getAuthContext(request.headers)

  if (options.rateLimit) {
    const { bucket, limit, windowSec } = options.rateLimit
    const key = `${bucket}:${ctx?.userId ?? clientIp(request)}`
    const rl = checkRateLimit(key, { limit, windowSec })
    if (!rl.allowed) {
      return { ok: false, response: jsonError(429, "rate_limited", { "Retry-After": String(rl.retryAfterSec) }) }
    }
  }

  if (!ctx) return { ok: false, response: jsonError(401, "unauthorized") }

  if (options.minTier && ctx.tier < options.minTier) {
    return { ok: false, response: jsonError(403, "forbidden") }
  }

  if (options.anyPermission?.length) {
    const checks = await Promise.all(options.anyPermission.map((p) => hasPermission(ctx.role, p)))
    if (!checks.some(Boolean)) return { ok: false, response: jsonError(403, "forbidden") }
  }

  return { ok: true, ctx }
}
