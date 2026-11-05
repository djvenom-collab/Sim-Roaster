// No credentials or database connection: exercise pg's actual TLS parser.
// Run: node scripts/quality/postgres-tls.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import pg from "pg"
import ts from "typescript"

const source = readFileSync(new URL("../../lib/db/connection-string.ts", import.meta.url), "utf8")
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
const compiled = { exports: {} }
new Function("module", "exports", outputText)(compiled, compiled.exports)
const { explicitPostgresTls } = compiled.exports
const require = createRequire(import.meta.url)
const parse = createRequire(require.resolve("pg"))("pg-connection-string").parse
// Entirely synthetic URL, including deliberately encoded credential characters.
const base = "postgresql://test:p%40ss%3Aword@example.invalid:5432/testdb"
const warnings = []
const originalWarning = process.emitWarning
process.emitWarning = (message) => { warnings.push(String(message)) }
try {
  for (const mode of ["require", "prefer", "verify-ca"]) {
    const input = `${base}?channel_binding=require&sslmode=${mode}&application_name=roster%20test`
    const output = explicitPostgresTls(input)
    assert.equal(output, input.replace(`sslmode=${mode}`, "sslmode=verify-full"))
    const before = parse(input)
    const after = parse(output)
    assert.deepEqual(after.ssl, before.ssl, "Must preserve pg 8 TLS validation behavior")
    assert.notEqual(after.ssl.rejectUnauthorized, false)
    assert.equal(after.ssl.checkServerIdentity, undefined, "Must retain default hostname verification")
    assert.equal(after.password, before.password)
    assert.equal(after.host, before.host)
    assert.equal(after.channel_binding, before.channel_binding)
    assert.equal(explicitPostgresTls(output), output)
    const warningCount = warnings.length
    // Constructor parses connection config without making a network connection.
    const client = new pg.Client({ connectionString: output })
    assert.notEqual(client.connectionParameters.ssl.rejectUnauthorized, false)
    assert.equal(warnings.length, warningCount, "Normalized connection must not emit compatibility warnings")
  }
  for (const input of [
    undefined, "", "not a URL", base, `${base}?sslmode=verify-full`,
    `${base}?sslmode=disable`, `${base}?sslmode=no-verify`,
    `${base}?sslmode=require&uselibpqcompat=true`,
    `${base}?sslmode=require&uselibpqcompat=true&sslrootcert=custom.pem`,
    "https://example.invalid/?sslmode=require",
  ]) assert.equal(explicitPostgresTls(input), input, "Explicit/non-Postgres/local config remains unchanged")
  assert.ok(warnings.some((message) => message.includes("SSL modes")), "Reproduce warning on unmodified legacy input")
} finally {
  process.emitWarning = originalWarning
}
console.log("PASS: legacy warning reproduced; normalized pg TLS behavior preserved without warnings; credentials/options unchanged; explicit modes respected")
