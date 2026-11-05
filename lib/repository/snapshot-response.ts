// Keep the API's {state, revision} contract without buffering, parsing and
// re-serializing the entire stored JSON on the server. The client still uses
// response.json(), so an invalid/truncated/erroring body never hydrates state.
export function snapshotResponse(
  source: ReadableStream<Uint8Array>,
  revision: string | null,
): Response {
  const reader = source.getReader()
  const encoder = new TextEncoder()
  let hasBytes = false
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`{"revision":${JSON.stringify(revision)},"state":`))
    },
    async pull(controller) {
      try {
        const { value, done } = await reader.read()
        if (cancelled) return
        if (done) {
          // Preserve the repository's old empty-body behavior (null).
          if (!hasBytes) controller.enqueue(encoder.encode("null"))
          controller.enqueue(encoder.encode("}"))
          controller.close()
          reader.releaseLock()
        } else if (value.byteLength) {
          hasBytes = true
          controller.enqueue(value)
        }
      } catch {
        if (cancelled) return
        // Headers may already be sent. Error the body rather than return a
        // seedable null snapshot or finish a partial response as a success.
        console.error("[state] snapshot download interrupted")
        controller.error(new Error("Snapshot download interrupted"))
        reader.releaseLock()
      }
    },
    async cancel(reason) {
      cancelled = true
      try {
        await reader.cancel(reason)
      } finally {
        reader.releaseLock()
      }
    },
  })
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  }
  if (revision) headers.ETag = revision
  return new Response(body, { headers })
}
