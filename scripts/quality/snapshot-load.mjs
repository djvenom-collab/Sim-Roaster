// No external requests or credentials. Test real Web Streams and repository.
// Run: node scripts/quality/snapshot-load.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import ts from "typescript"

function load(path, resolve = () => { throw Error("Unexpected dependency") }) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  const compiled = { exports: {} }
  new Function("require", "module", "exports", outputText)(resolve, compiled, compiled.exports)
  return compiled.exports
}
const { snapshotResponse } = load("../../lib/repository/snapshot-response.ts")
const encoder = new TextEncoder()
const state = { staff: [{ name: "🙂 العربية", notes: "quote \" and newline\n" }], runs: [], version: 11 }
const bytes = encoder.encode(JSON.stringify(state))
// Split every byte, including in the middle of multibyte UTF-8 characters.
const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } })
const response = snapshotResponse(stream, '"r1"')
assert.equal(response.headers.get("etag"), '"r1"')
assert.equal(response.headers.get("cache-control"), "no-store")
assert.deepEqual(await response.json(), { revision: '"r1"', state })
assert.deepEqual(await snapshotResponse(new Response("").body, null).json(), { revision: null, state: null })
for (const malformed of ['{"staff":', 'not-json', '{"staff":[]} trailing']) {
  await assert.rejects(() => snapshotResponse(new Response(malformed).body, "r").json(), SyntaxError, "Malformed snapshots must not become seedable null state")
}
let end
const delayed = new ReadableStream({ start(controller) { end = controller } })
const delayedResponse = snapshotResponse(delayed, "r")
const reader = delayedResponse.body.getReader()
const first = await reader.read()
assert.match(new TextDecoder().decode(first.value), /"revision":"r"/)
end.enqueue(encoder.encode('{"runs":[]}'))
end.close()
const rest = []
while (true) { const chunk = await reader.read(); if (chunk.done) break; rest.push(...chunk.value) }
assert.deepEqual(JSON.parse(new TextDecoder().decode(first.value) + new TextDecoder().decode(new Uint8Array(rest))), { revision: "r", state: { runs: [] } })
let upstreamCancelled = false
const cancelResponse = snapshotResponse(new ReadableStream({ cancel() { upstreamCancelled = true } }), null)
await cancelResponse.body.cancel()
assert.ok(upstreamCancelled, "Client cancellation must cancel upstream Blob reads")
let errors = 0
const originalError = console.error
console.error = () => { errors++ }
try {
  await assert.rejects(() => snapshotResponse(new ReadableStream({ start(controller) { controller.error(Error("upstream")) } }), "r").json(), /Snapshot download interrupted/)
} finally { console.error = originalError }
assert.equal(errors, 1)

let result
let gets = 0
const { stateRepository } = load("../../lib/repository/state-repository.ts", (name) => {
  if (name === "server-only") return {}
  if (name === "@vercel/blob") return {
    BlobPreconditionFailedError: class extends Error {},
    get: async (_path, options) => { gets++; assert.equal(options.access, "private"); assert.equal(options.useCache, false); return result },
  }
  throw Error(name)
})
result = null
assert.equal(await stateRepository.readStream(), null)
for (const status of [304, 200]) {
  result = { statusCode: status, stream: null }
  await assert.rejects(() => stateRepository.readStream(), /Snapshot body unavailable/)
}
result = { statusCode: 200, stream: new Response(JSON.stringify(state)).body, blob: { etag: 'W/"r2"' } }
const raw = await stateRepository.readStream()
assert.equal(raw.revision, '"r2"')
assert.deepEqual(await new Response(raw.stream).json(), state)
result = { statusCode: 200, stream: new Response(JSON.stringify(state)).body, blob: { etag: '"r3"' } }
assert.deepEqual(await stateRepository.read(), { state, revision: '"r3"' }, "PUT/audit read path retains parsed state")
assert.equal(gets, 5)

// Quantify removed work on a synthetic large snapshot. Not an end-to-end or
// network-latency benchmark: streaming still has to transfer all these bytes.
const big = JSON.stringify({ runs: Array.from({ length: 50000 }, (_, id) => ({ id, date: "2026-11-05", notes: "x".repeat(80) })) })
let started = performance.now()
const buffered = JSON.stringify({ state: JSON.parse(big), revision: "r" })
const bufferedMs = performance.now() - started
started = performance.now()
const streaming = snapshotResponse(new Response(big).body, "r")
const headersMs = performance.now() - started
assert.deepEqual(await streaming.json(), JSON.parse(buffered))
console.log(`PASS: UTF-8 boundaries, unchanged payload/ETag, fresh reads, early headers, cancellation, fail-closed stream errors, repository parsed/raw paths`)
console.log(`Synthetic ${(big.length / 1024 / 1024).toFixed(1)}MiB: parse+serialize ${bufferedMs.toFixed(1)}ms; response construction ${headersMs.toFixed(1)}ms (not equivalent full-download timings)`)
