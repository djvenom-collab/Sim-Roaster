// Synthetic aggregate/privacy and route authorization tests; no live data.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
function load(path, resolve = () => { throw Error("Unexpected dependency") }) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  const compiled = { exports: {} }
  new Function("require", "module", "exports", outputText)(resolve, compiled, compiled.exports)
  return compiled.exports
}
const { assessStorage } = load("../../lib/storage-assessment.ts")
const fixture = {
  version: 11, staff: [{ id: "private-person", email: "private@example.invalid" }, { id: "private-person" }],
  runs: [{ id: "r", exerciseId: "PRIVATE_MISSING_ID", date: "2026-02-30" }],
  notifications: [{ id: "n", staffId: "PRIVATE_MISSING_ID", channel: "in_app", body: "SECRET_BODY", flagged: true, deletedAt: "yesterday" }],
  importHistory: [{ summary: "PRIVATE_FILENAME", when: "yesterday" }],
  SECRET_KEY: { credential: "PASSWORD_VALUE" },
}
const report = assessStorage(fixture)
const serialized = JSON.stringify(report)
for (const secret of ["private-person", "private@example.invalid", "SECRET_BODY", "PRIVATE_FILENAME", "SECRET_KEY", "PASSWORD_VALUE", "PRIVATE_MISSING_ID"]) assert.ok(!serialized.includes(secret), `Do not return input values or unknown keys: ${secret}`)
for (const code of ["duplicate_ids", "orphan_exerciseId", "invalid_calendar_dates", "legacy_schema_rejects_in_app", "legacy_importer_drops_flagged", "legacy_importer_drops_deletedAt", "legacy_import_history_unmapped", "unknown_top_level_slices"]) assert.ok(report.issues.some((item) => item.code === code))
assert.equal(report.slices.find((s) => s.name === "staff").records, 2)
assert.equal(report.legacyMigrationBlocked, true)
assert.ok(assessStorage({ staff: [null, 42, {}], notifyDirty: [] }).issues.some((i) => i.code === "invalid_rows"))
assert.equal(assessStorage({ version: 11 }).issues.length, 0)
assert.ok(assessStorage({}).limitations.length)

let role = "Admin"
let authorized = true
let reads = 0
let cancels = 0
let text = JSON.stringify(fixture)
let exists = true
let failed = false
let rules
const { GET } = load("../../app/api/admin/storage-assessment/route.ts", (name) => {
  if (name === "next/server") return { NextResponse: Response }
  if (name === "@/lib/security/authz") return {
    authorize: async (_request, opts) => { rules = opts; return authorized ? { ok: true, ctx: { role } } : { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) } },
    jsonError: (status, error) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }),
  }
  if (name === "@/lib/storage-assessment") return { assessStorage }
  if (name === "@/lib/repository/state-repository") return { stateRepository: { readStream: async () => {
    reads++
    if (failed) throw Error("SENSITIVE_URL")
    if (!exists) return null
    return { stream: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); if (text.length <= 16 * 1024 * 1024) controller.close() }, cancel() { cancels++ } }), revision: '"private-etag"' }
  } } }
  throw Error(name)
})
const request = (cookie) => new Request("https://example.invalid/api/admin/storage-assessment", { headers: cookie ? { cookie } : {} })
authorized = false
assert.equal((await GET(request())).status, 401)
assert.equal(reads, 0)
authorized = true
for (role of ["SP", "SUP", "SOO", "STO", "TL"]) { assert.equal((await GET(request())).status, 403); assert.equal(reads, 0) }
role = "Admin"
assert.equal((await GET(request("autonoma_run=test"))).status, 409)
assert.equal(reads, 0)
const response = await GET(request())
assert.equal(response.status, 200)
assert.equal(response.headers.get("cache-control"), "no-store")
const result = await response.json()
assert.equal(result.exists, true)
assert.equal(result.bytes, Buffer.byteLength(text))
assert.ok(!JSON.stringify(result).includes("private-etag"))
assert.equal(rules.rateLimit.limit, 3)
exists = false
assert.equal((await (await GET(request())).json()).exists, false)
exists = true
text = '[]'
assert.equal((await GET(request())).status, 422)
const originalError = console.error
console.error = () => {}
try {
  text = '{invalid'
  assert.equal((await GET(request())).status, 503)
  failed = true
  const error = await GET(request())
  assert.equal(error.status, 503)
  assert.ok(!(await error.text()).includes("SENSITIVE_URL"))
} finally { console.error = originalError }
failed = false
text = 'x'.repeat(16 * 1024 * 1024 + 1)
assert.equal((await GET(request())).status, 413)
assert.equal(cancels, 1)
console.log("PASS: aggregates without sensitive values/keys, known mapping issues, Admin-only read, no storage reads before auth, no-cache/error/size/cancellation controls")
