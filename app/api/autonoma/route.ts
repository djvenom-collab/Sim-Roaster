/* ===========================================================================
 * AUTONOMA — Test-data endpoint  (POST /api/autonoma)
 * ===========================================================================
 * The Autonoma test runner calls this to `discover` the seedable schema, seed a
 * scenario (`up`), and tear it down (`down`). All protocol work — HMAC signature
 * verification, ordering, and refs-token signing — is done by the SDK's
 * `handleRequest`; this file only supplies the request shape, the config, and a
 * production guard.
 *
 * SECURITY:
 *   - Every request must carry a valid `x-signature` HMAC over the raw body,
 *     verified against AUTONOMA_SHARED_SECRET inside handleRequest. Unsigned or
 *     wrongly-signed requests are rejected.
 *   - PRODUCTION GUARD: the endpoint is dark (404) in production unless it is
 *     running on an Autonoma preview environment (AUTONOMA_PREVIEWKIT set) or a
 *     deliberate override (AUTONOMA_ALLOW_PROD=1) is present. This means the
 *     data-seeding / credential path cannot be reached on the real production
 *     deployment even if the shared secret were to leak.
 * =========================================================================== */
import { type NextRequest, NextResponse } from "next/server"
import { handleRequest } from "@autonoma-ai/sdk"
import { getHandlerConfig } from "@/lib/autonoma/config"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function isEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true
  // In production, only enable on Autonoma preview envs or with explicit opt-in.
  return Boolean(process.env.AUTONOMA_PREVIEWKIT) || process.env.AUTONOMA_ALLOW_PROD === "1"
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  const secretsPresent = Boolean(process.env.AUTONOMA_SHARED_SECRET && process.env.AUTONOMA_SIGNING_SECRET)
  if (!secretsPresent) {
    return NextResponse.json(
      { error: "autonoma_not_configured", detail: "AUTONOMA_SHARED_SECRET / AUTONOMA_SIGNING_SECRET missing" },
      { status: 503 },
    )
  }

  // Raw body is required so the HMAC is computed over the exact bytes signed.
  const body = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  try {
    const result = await handleRequest(getHandlerConfig(), { body, headers })
    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    console.error("[v0] /api/autonoma error:", message)
    // AutonomaError carries an http status + code; surface it when present.
    const status = (error as { status?: number })?.status ?? 500
    const code = (error as { code?: string })?.code ?? "internal_error"
    return NextResponse.json({ error: code, detail: message }, { status })
  }
}
