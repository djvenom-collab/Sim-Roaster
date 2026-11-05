// Focused, in-memory reproduction. No database or real import/save requests.
// Run: node scripts/quality/import-page.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const require = createRequire(import.meta.url)
const load = (path, resolve) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const compiled = { exports: {} }
  new Function("require", "module", "exports", outputText)(resolve, compiled, compiled.exports)
  return compiled.exports
}
const passthrough = ({ children }) => React.createElement("div", null, children)
const ui = new Proxy({}, { get: () => passthrough })
const shared = load("../../components/shared.tsx", (name) => {
  if (name === "@/components/ui/badge") return ui
  if (name === "@/lib/utils") return { cn: (...args) => args.filter(Boolean).join(" ") }
  if (name === "@/lib/dates") return { statusColor: () => "" }
  return require(name)
})
let states
let stateIndex
let selects
let buttons
let saved
const store = {
  currentRole: "Admin", activeProgram: "ALL",
  importHistory: [
    { id: "seed", filename: "seed.xlsx", date: "2026-11-01", user: "Tester", rowsTotal: 5, rowsAccepted: 4, rowsRejected: 1 },
    { summary: "Legacy import", when: "2026-10-01 12:00" },
  ],
  logImport: (...args) => { saved = args },
}
const { default: ImportPage } = load("../../app/(authenticated)/import/page.tsx", (name) => {
  if (name === "react") return { useState: () => {
    const index = stateIndex++
    return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next }]
  } }
  if (name === "@/lib/store") return { useStore: () => store }
  if (name === "@/lib/permissions") return { can: () => true }
  if (name === "@/lib/program") return { programDisplay: (value) => value }
  if (name === "@/components/shared") return shared
  if (name === "@/components/ui/select") return { ...Object.fromEntries(["SelectContent", "SelectItem", "SelectTrigger", "SelectValue"].map((key) => [key, passthrough])), Select: (props) => {
    selects.push(props)
    return React.createElement(passthrough, props)
  } }
  if (name === "@/components/ui/button") return { Button: (props) => {
    buttons.push(props)
    return React.createElement("button", null, props.children)
  } }
  if (name.startsWith("@/components/ui/")) return ui
  if (name === "sonner") return { toast: { success() {} } }
  return require(name)
})
const render = (stage, decisions = {}) => {
  states = [stage, decisions, { "Column A": "date" }]
  stateIndex = 0
  selects = []
  buttons = []
  return renderToStaticMarkup(React.createElement(ImportPage))
}
const html = render("map")
assert.match(html, /Start over/, "Header actions must render")
assert.match(html, /seed.xlsx — 4\/5 rows accepted/, "Structured seed/history rows must display")
assert.match(html, /Legacy import/, "Existing legacy history must remain readable")
assert.match(html, /2026-10-01 12:00/)
selects[0].onValueChange(null)
assert.equal(states[2]["Column A"], "date", "Null selection must not corrupt the mapping")
selects[0].onValueChange("slot")
assert.equal(states[2]["Column A"], "slot")
const text = (node) => Array.isArray(node) ? node.map(text).join("") : React.isValidElement(node) ? text(node.props.children) : String(node ?? "")
buttons.find((button) => text(button.children) === "Start over").onClick()
assert.equal(states[0], "upload")
render("preview", { 1: "accept", 2: "reject", 3: "accept" })
const save = buttons.find((button) => /Save import/.test(text(button.children)))
assert.ok(save, "Save action must be reachable")
save.onClick()
assert.deepEqual(saved[0], { filename: "sim_schedule_june.xlsx", rowsTotal: 5, rowsAccepted: 2, rowsRejected: 3 })
assert.match(saved[1], /2 rows accepted/)
console.log("PASS: header actions, structured + legacy history, nullable mapping and structured import details")
