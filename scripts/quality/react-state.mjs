// Focused hook/state reproductions with deterministic React doubles.
// Run: node scripts/quality/react-state.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"

function load(path, resolve) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  })
  const compiled = { exports: {} }
  new Function("require", "module", "exports", outputText)(resolve, compiled, compiled.exports)
  return compiled.exports
}
const dates = load("../../lib/dates.ts", () => { throw Error("Unexpected dependency") })
const retention = load("../../lib/retention.ts", () => dates)
let state
let yearRange = { start: 2022, end: 2026 }
const react = {
  useState: (initial) => {
    if (state === undefined) state = typeof initial === "function" ? initial() : initial
    return [state, (next) => { state = typeof next === "function" ? next(state) : next }]
  },
  useCallback: (fn) => fn,
}
const { useScopedDate: evaluateDate } = load("../../lib/use-scoped-date.ts", (name) => {
  if (name === "react") return react
  if (name === "./store") return { useStore: () => ({ yearRange }) }
  if (name === "./retention") return retention
  return dates
})
assert.equal(evaluateDate("2024-02-29")[0], "2024-02-29")
yearRange = { start: 2025, end: 2025 }
assert.equal(evaluateDate()[0], "2025-02-28", "Leap-day clamping happens before children render")
yearRange = { start: 2022, end: 2026 }
assert.equal(evaluateDate()[0], "2025-02-28", "Widening range must not resurrect an old date")
evaluateDate()[1]((prev) => dates.addDaysISO(prev, 1))
assert.equal(evaluateDate()[0], "2025-03-01")

state = undefined
let years = [2026, 2025, 2024]
const { useChartRange: evaluateChart } = load("../../components/charts/use-chart-range.ts", (name) => {
  if (name === "react") return react
  if (name === "@/lib/analytics") return { defaultYear: (allowed) => allowed[0] }
  if (name === "./chart-shell") return { YTD_VALUE: "ytd" }
  if (name === "@/lib/store") return { useStore: () => ({ yearRange }) }
  throw Error(`Unexpected dependency ${name}`)
})
assert.equal(evaluateChart(years).value, "2026")
evaluateChart(years).setValue("2024")
years = [2026, 2025]
evaluateChart(years) // render adjustment
assert.equal(evaluateChart(years).value, "2026")
evaluateChart(years).setValue("ytd")
assert.equal(evaluateChart([2025]).value, "ytd", "YTD remains anchored to current year")

// Render the actual planner functions with deterministic hook/UI doubles. The
// lower-year January case used to repeatedly clamp back to December's Monday.
for (const planner of ["monthly", "weekly"]) {
  let slots = [new Date(2020, 0, 1), {}]
  let index = 0
  let changed = false
  const { default: renderPlanner } = load(`../../app/(authenticated)/${planner}/page.tsx`, (name) => {
    if (name === "react") return { useState: () => {
      const slot = index++
      return [slots[slot], (next) => { slots[slot] = next; changed = true }]
    } }
    if (name === "react/jsx-runtime") return jsx
    if (name === "next/navigation") return { useRouter: () => ({}) }
    if (name === "@/lib/store") return { useStore: () => ({ yearRange: { start: 2025, end: 2026 } }) }
    if (name === "@/lib/use-calendar-data") return { useCalendarData: () => new Map() }
    if (name === "@/lib/retention") return retention
    if (name === "@/lib/dates") return dates
    if (name === "@/lib/utils") return { cn: () => "" }
    return new Proxy({}, { get: () => () => null })
  })
  let renders = 0
  do {
    changed = false
    index = 0
    renderPlanner()
    assert.ok(++renders < 4, `${planner} must settle without a render loop`)
  } while (changed)
  assert.equal(slots[0].getFullYear(), 2025)
  if (planner === "weekly") assert.equal(slots[0].getDay(), 1, "Week must still start on Monday")
}

// Exercise external-store hydration snapshots, subscriptions and blocked storage.
const browser = new EventTarget()
const saved = new Map()
browser.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
}
globalThis.window = browser
let subscription
let snapshot
let serverSnapshot
const { useBrowserStorage: readStorage, useHydrated: readHydrated, writeBrowserStorage } = load("../../hooks/use-browser-storage.ts", () => ({
  ...react,
  useSyncExternalStore: (subscribe, read, serverRead) => {
    subscription = subscribe
    snapshot = read
    serverSnapshot = serverRead
    return read()
  },
}))
assert.equal(readStorage("scope"), null)
assert.equal(serverSnapshot(), null)
let notifications = 0
const unsubscribe = subscription(() => { notifications++ })
writeBrowserStorage("scope", "RADAR")
assert.equal(notifications, 1, "Same-tab writes notify subscribers")
assert.equal(snapshot(), "RADAR")
assert.equal(snapshot(), snapshot(), "Snapshots are stable primitives")
browser.dispatchEvent(new Event("storage"))
assert.equal(notifications, 2, "Other-tab writes notify subscribers")
unsubscribe()
writeBrowserStorage("scope", "TOWER")
assert.equal(notifications, 2, "Unmount cleans up listeners")
browser.localStorage.getItem = () => { throw Error("Blocked") }
browser.localStorage.setItem = () => { throw Error("Blocked") }
assert.equal(readStorage("scope"), null)
assert.doesNotThrow(() => writeBrowserStorage("scope", "ALL"))
assert.equal(readHydrated(), true)
assert.equal(serverSnapshot(), false)
delete globalThis.window
console.log("PASS: date/year clamping, YTD, SSR hydration snapshots, storage updates/cleanup and denied-storage fallback")
