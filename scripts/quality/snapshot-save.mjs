// Focused async/network doubles. Never touches real roster data or credentials.
// Run: node scripts/quality/snapshot-save.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

function load(path, resolve = () => { throw Error("Unexpected dependency") }) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  const compiled = { exports: {} }
  new Function("require", "module", "exports", outputText)(resolve, compiled, compiled.exports)
  return compiled.exports
}
const tick = () => new Promise((resolve) => setImmediate(resolve))
const { createLatestSaveQueue } = load("../../lib/latest-save-queue.ts")
let release
let revision = "r0"
const sent = []
const queue = createLatestSaveQueue(async (value) => {
  sent.push({ value, revision })
  await new Promise((resolve) => { release = resolve })
  revision = `r${sent.length}`
  return true
}, (error) => { throw error })
queue.enqueue("a")
queue.enqueue("b")
queue.enqueue("c")
assert.deepEqual(sent, [{ value: "a", revision: "r0" }], "Only one request may be in flight")
release()
await tick()
assert.deepEqual(sent, [{ value: "a", revision: "r0" }, { value: "c", revision: "r1" }], "Coalesce edits, then use prior response's revision")
release()
await tick()
let stoppedCalls = 0
let finishStopped
const stoppedQueue = createLatestSaveQueue(async () => { stoppedCalls++; await new Promise((resolve) => { finishStopped = resolve }); return true }, () => {})
stoppedQueue.enqueue(1)
stoppedQueue.enqueue(2)
stoppedQueue.stop()
finishStopped()
await tick()
stoppedQueue.enqueue(3)
assert.equal(stoppedCalls, 1, "Unmount discards pending snapshots without replaying an in-flight request")
let conflictCalls = 0
const conflict = createLatestSaveQueue(async () => { conflictCalls++; await tick(); return false }, () => {})
conflict.enqueue(1)
conflict.enqueue(2)
await tick()
await tick()
conflict.enqueue(3)
assert.equal(conflictCalls, 1, "Conflict must stop all queued/future writes")
let failures = 0
let attempts = 0
const failure = createLatestSaveQueue(async () => { attempts++; throw Error("Network") }, () => { failures++ })
failure.enqueue(1)
failure.enqueue(2)
await tick()
failure.enqueue(3)
assert.equal(attempts, 1, "Unknown write result must not be replayed automatically")
assert.equal(failures, 1)

// Run the real state route against a fake authoritative repository + audit log.
const permissions = load("../../lib/permissions.ts")
let role = "Admin"
let authOk = true
let state
let currentRevision
let reads
let writes
let failAudit
let failWrite
let permissionReads
class Conflict extends Error {}
class AuditUnavailable extends Error {}
const stableStringify = (value) => {
  if (value === undefined) return "undefined"
  if (!value || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
}
const auditModule = {
  AuditUnavailableError: AuditUnavailable, stableStringify,
  actorFromAuth: (ctx) => ctx, auditContext: () => ({ correlationId: "test" }),
  recordAuditSafe: async () => {},
  withAudit: async (_ctx, _events, operation) => { if (failAudit) throw new AuditUnavailable(); return operation() },
}
const diff = load("../../lib/audit/diff.ts", () => auditModule)
const { PUT, GET } = load("../../app/api/state/route.ts", (name) => {
  if (name === "next/server") return { NextResponse: Response }
  if (name === "@vercel/blob") return { get: () => { throw Error("Unexpected run blob read") }, put: () => { throw Error("Unexpected run write") } }
  if (name === "@/lib/security/authz") return {
    authorize: async () => authOk ? { ok: true, ctx: { role } } : { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) },
    hasPermission: async () => { permissionReads++; return false },
    invalidatePermissionCache: () => {},
    jsonError: (status, error, headers) => Response.json({ error }, { status, headers }),
  }
  if (name === "@/lib/permissions") return permissions
  if (name === "@/lib/repository/state-repository") return {
    ConcurrencyConflictError: Conflict,
    stateRepository: {
      read: async () => { reads++; return { state, revision: currentRevision } },
      write: async (next, opts) => {
        writes++
        assert.equal(opts.expectedRevision, currentRevision)
        if (failWrite) throw new Conflict()
        state = next
        currentRevision = "r2"
        return { revision: currentRevision }
      },
    },
  }
  if (name === "@/lib/audit/log") return auditModule
  if (name === "@/lib/audit/diff") return diff
  if (name === "@/lib/persisted-state") return { SNAPSHOT_VERSION: 11 }
  if (name === "@/lib/autonoma/run-store") return { RUN_COOKIE: "run" }
  throw Error(`Unexpected dependency ${name}`)
})
const original = { version: 11, staff: [{ id: "s1", firstName: "Before" }], permissionMatrix: permissions.reconcilePermissionMatrix(null), users: [{ id: "u1", role: "SP" }], notifications: [] }
function reset() {
  state = structuredClone(original)
  currentRevision = "r1"
  reads = writes = permissionReads = 0
  role = "Admin"
  authOk = true
  failAudit = failWrite = false
}
function request(body, revision = "r1") {
  const req = new Request("https://example.invalid/api/state", { method: "PUT", body: JSON.stringify(body), headers: revision ? { "If-Match": revision } : {} })
  req.cookies = { get: () => undefined }
  return req
}
reset()
assert.equal((await PUT(request(state))).status, 200)
assert.equal(writes, 0, "Identical complete state must not upload Blob or rotate revision")
assert.equal(reads, 1)
assert.equal(permissionReads, 0)
reset()
const changed = structuredClone(state)
changed.staff[0].firstName = "After"
assert.equal((await PUT(request(changed))).status, 200)
assert.equal(writes, 1)
assert.equal(reads, 1)
assert.equal(state.staff[0].firstName, "After")
reset()
role = "SP"
const escalated = structuredClone(state)
escalated.permissionMatrix.SP.push("manage_users")
escalated.users[0].role = "Admin"
await PUT(request(escalated))
assert.deepEqual(state.users, original.users, "Incoming permission/user edits cannot authorize themselves")
assert.deepEqual(state.permissionMatrix, original.permissionMatrix)
assert.equal(permissionReads, 0, "Use authoritative snapshot instead of downloading a second full Blob")
reset()
const feedOnly = structuredClone(state)
feedOnly.notifications.push({ id: "new", subject: "Keep this notification" })
await PUT(request(feedOnly))
assert.equal(writes, 1, "Ignored audit feeds are not no-op saves")
reset()
assert.equal((await PUT(request(state, "old"))).status, 409)
assert.equal(writes, 0)
assert.equal((await PUT(request(state, null))).status, 428)
reset()
failAudit = true
const oldError = console.error
console.error = () => {}
try { assert.equal((await PUT(request(changed))).status, 503) } finally { console.error = oldError }
assert.equal(writes, 0, "Audit failure must prevent mutation")
reset()
failWrite = true
assert.equal((await PUT(request(changed))).status, 409, "Conditional write race remains protected")
reset()
authOk = false
assert.equal((await PUT(request(state))).status, 401)
assert.equal(reads, 0)
assert.equal(writes, 0)
reset()
const getRequest = new Request("https://example.invalid/api/state")
getRequest.cookies = { get: () => undefined }
const loaded = await GET(getRequest)
assert.equal(loaded.status, 200)
assert.deepEqual((await loaded.json()).state, original)
assert.equal(loaded.headers.get("cache-control"), "no-store", "Never trade fresh loading for a stale cache")
console.log("PASS: serialized/coalesced saves; correct revisions; no-op write eliminated; authoritative permissions; conflicts, audit fail-closed, feeds and fresh GET preserved")
