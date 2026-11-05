// No real credentials or database access. Simulates server session outcomes.
// Run: node scripts/quality/session-layout.mjs
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import * as jsx from "react/jsx-runtime"
import { getSessionCookie } from "better-auth/cookies"
import ts from "typescript"

let session = null
let authCalls = 0
const store = () => null
const headers = new Headers({ cookie: "better-auth.session_token=invalid-session-cookie" })
assert.ok(getSessionCookie({ headers }), "Cookie presence passes the optimistic gate even when token is invalid")
const load = (path) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  })
  const resolve = (name) => {
    if (name === "react/jsx-runtime") return jsx
    if (name === "react") return { Suspense: () => null }
    if (name === "next/headers") return { headers: async () => headers }
    if (name === "next/navigation") return { redirect: (path) => { throw Error(`REDIRECT:${path}`) } }
    if (name === "@/lib/auth") return { auth: { api: { getSession: async () => { authCalls++; return session } } } }
    if (name === "@/lib/store") return { StoreProvider: store }
    if (name === "next/font/google") return { Geist: () => ({ variable: "sans" }), Geist_Mono: () => ({ variable: "mono" }) }
    return new Proxy({}, { get: () => () => null })
  }
  const compiled = { exports: {} }
  new Function("require", "module", "exports", outputText)(resolve, compiled, compiled.exports)
  return compiled.exports.default
}
const root = load("../../app/layout.tsx")
let protectedPath = "../../app/(authenticated)/layout.tsx"
try { readFileSync(new URL(protectedPath, import.meta.url)) } catch { protectedPath = "../../app/layout.tsx" }
const protectedLayout = load(protectedPath)
const child = { marker: "private-dashboard" }
await assert.rejects(() => protectedLayout({ children: child }), /REDIRECT:\/login/, "Invalid/expired session must redirect, never render provider-less private children")
for (const invalid of [undefined, {}, { user: null }]) {
  session = invalid
  await assert.rejects(() => protectedLayout({ children: child }), /REDIRECT:\/login/)
}
for (const role of ["SP", "SUP", "SOO", "STO", "TL", "Admin", "unknown"]) {
  session = { user: { name: "Test", email: "test@example.invalid", appRole: role } }
  const tree = await protectedLayout({ children: child })
  assert.equal(tree.type, store, "Private content must always be under StoreProvider")
  assert.equal(tree.props.initialRole, role === "unknown" ? "SP" : role)
  assert.equal(tree.props.authName, "Test")
  assert.equal(tree.props.authEmail, "test@example.invalid")
  const contains = (node) => node === child || (node && typeof node === "object" && (
    Array.isArray(node) ? node.some(contains) : contains(node.props?.children)
  ))
  assert.ok(contains(tree), "Authenticated shell must retain the route content")
}
const callsBeforePublic = authCalls
root({ children: "public-login" })
assert.equal(authCalls, callsBeforePublic, "Public root must not depend on session state")
session = null
const login = load("../../app/login/page.tsx")
assert.ok(await login(), "Signed-out login page stays accessible")
session = { user: { appRole: "Admin" } }
await assert.rejects(() => login(), /REDIRECT:\/$/, "Signed-in login redirects home")
const app = new URL("../../app/", import.meta.url)
assert.ok(readFileSync(new URL("login/page.tsx", app)))
assert.ok(readFileSync(new URL("api/state/route.ts", app)))
const publicPages = readdirSync(app, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !["api", "login", "(authenticated)"].includes(entry.name))
assert.equal(publicPages.length, 0, "No private UI route may bypass the authenticated group")
console.log("PASS: stale cookie reproduced; invalid sessions redirect; valid roles retain provider; public login and API paths unchanged")
