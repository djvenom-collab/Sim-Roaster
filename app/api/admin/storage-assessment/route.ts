import { NextResponse } from "next/server"
import { authorize, jsonError } from "@/lib/security/authz"
import { stateRepository } from "@/lib/repository/state-repository"
import { assessStorage } from "@/lib/storage-assessment"

export const dynamic = "force-dynamic"
const MAX_BYTES = 16 * 1024 * 1024

export async function GET(request: Request) {
  const authz = await authorize(request, { rateLimit: { bucket: "storage-assessment", limit: 3, windowSec: 60 } })
  if (!authz.ok) return authz.response
  if (authz.ctx.role !== "Admin") return jsonError(403, "forbidden")
  // Test-run pages must not accidentally assess the shared operational snapshot.
  if (/(?:^|;\s*)autonoma_run=/.test(request.headers.get("cookie") ?? "")) return jsonError(409, "test_run_not_supported")

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const snapshot = await stateRepository.readStream()
    if (!snapshot) return NextResponse.json({ exists: false, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } })
    reader = snapshot.stream.getReader()
    const decoder = new TextDecoder("utf-8", { fatal: true })
    let bytes = 0
    let text = ""
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BYTES) {
        await reader.cancel()
        return jsonError(413, "snapshot_too_large_for_assessment")
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    const state: unknown = JSON.parse(text)
    if (!state || typeof state !== "object" || Array.isArray(state)) return jsonError(422, "invalid_snapshot")
    const report = assessStorage(state as Record<string, unknown>)
    return NextResponse.json({ exists: true, checkedAt: new Date().toISOString(), bytes, ...report }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    })
  } catch {
    // Upstream errors can include storage URLs; log no raw error/record values.
    console.error("[storage-assessment] Unable to read or assess snapshot")
    return jsonError(503, "assessment_unavailable")
  } finally {
    reader?.releaseLock()
  }
}
