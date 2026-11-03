const SENSITIVE_KEY = /pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|session[-_]?id|otp|credential|private[-_]?key|signature/i
const MAX_STRING = 4000
const MAX_DEPTH = 8
export const REDACTED = "[REDACTED]"

/**
 * Returns a JSON-safe copy with credential-like fields masked, long strings
 * truncated and NUL characters removed (Postgres jsonb rejects \u0000).
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === undefined) return null
  if (value === null || typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "string") {
    const clean = value.replace(/\u0000/g, "")
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…[truncated ${clean.length - MAX_STRING} chars]` : clean
  }
  if (depth >= MAX_DEPTH) return "[depth limit]"
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1)
    }
    return out
  }
  return String(value)
}
