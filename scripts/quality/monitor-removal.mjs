// No network/storage access. Verify removed feature boundaries and retained controls.
// Run: node scripts/quality/monitor-removal.mjs
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import ts from "typescript"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")
for (const path of ["app/(authenticated)/monitor/page.tsx", "app/api/monitor/route.ts", "app/api/monitor/history/route.ts"]) {
  assert.equal(existsSync(new URL(path, root)), false, `${path} must not generate a route or polling/writer code`)
}
assert.doesNotMatch(read("components/app-sidebar.tsx"), /href:\s*["']\/monitor["']/)
const { outputText } = ts.transpileModule(read("lib/permissions.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
const compiled = { exports: {} }
new Function("module", "exports", outputText)(compiled, compiled.exports)
const p = compiled.exports
assert.ok(!p.ALL_PERMISSIONS.includes("page_monitor"))
const persisted = structuredClone(p.DEFAULT_MATRIX)
persisted.SUP = persisted.SUP.filter((permission) => permission !== "page_daily")
for (const role of Object.keys(persisted)) persisted[role].push("page_monitor")
const migrated = p.reconcilePermissionMatrix(persisted)
for (const values of Object.values(migrated)) assert.ok(!values.includes("page_monitor"), "Remove obsolete permission from old snapshots")
assert.ok(!migrated.SUP.includes("page_daily"), "Existing role edits must stay removed")
assert.deepEqual(new Set(migrated.Admin), new Set(p.ALL_PERMISSIONS), "Admin invariant retained")
assert.deepEqual(p.reconcilePermissionMatrix(migrated), migrated, "Permission normalization stays idempotent")
const registry = JSON.parse(read("config/dependencies.json"))
assert.ok(!registry.components.some((item) => item.id === "monitor"))
for (const id of ["health", "backup-restore", "audit-trail", "roster-state", "authentication"]) assert.ok(registry.components.some((item) => item.id === id))
for (const path of ["app/api/health/route.ts", "app/api/cron/backup/route.ts", "app/api/backup/route.ts", "app/api/backup/restore/route.ts", "lib/continuity/health.ts", "app/api/audit/route.ts", "app/api/state/route.ts"]) assert.ok(existsSync(new URL(path, root)))
assert.deepEqual(JSON.parse(read("vercel.json")).crons, [{ path: "/api/cron/backup", schedule: "0 2 * * *" }])
console.log("PASS: monitor page/API/sidebar removed, legacy permission normalized without losing role edits; real health, backup, audit and roster controls retained")
