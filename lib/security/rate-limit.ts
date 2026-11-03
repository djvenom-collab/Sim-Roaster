import "server-only"

/* Fixed-window, in-memory rate limiter. Limits are enforced per serverless
 * instance, so this is a best-effort brake against abuse rather than a global
 * quota. Swap the store for Upstash Redis for cluster-wide limits. */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const MAX_TRACKED_KEYS = 10_000

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number
  /** Window length in seconds. */
  windowSec: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSec: number
}

function prune(now: number) {
  if (buckets.size < MAX_TRACKED_KEYS) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear()
}

export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now()
  prune(now)
  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowSec * 1000 })
    return { allowed: true, retryAfterSec: 0 }
  }
  existing.count += 1
  if (existing.count > rule.limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) }
  }
  return { allowed: true, retryAfterSec: 0 }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown"
  return request.headers.get("x-real-ip") ?? "unknown"
}
