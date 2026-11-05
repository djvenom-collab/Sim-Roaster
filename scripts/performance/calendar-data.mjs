// Focused reproduction; no database, credentials or browser required.
// Run: node scripts/performance/calendar-data.mjs
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import ts from "typescript"

let store
let memo
let daySteps = 0
const compile = (path, require) => {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  })
  const module = { exports: {} }
  new Function("require", "module", "exports", outputText)(require, module, module.exports)
  return module.exports
}
const dates = compile("../../lib/dates.ts", () => { throw Error("Unexpected date dependency") })
const { useCalendarData, emptyFilters } = compile("../../lib/use-calendar-data.ts", (name) => {
  if (name === "react") return { useMemo: (build, deps) => {
    if (memo && deps.every((dep, i) => Object.is(dep, memo.deps[i]))) return memo.value
    memo = { value: build(), deps }
    return memo.value
  } }
  if (name === "@/lib/store") return { useStore: () => store }
  if (name === "@/lib/dates") return { ...dates, addDaysISO: (...args) => {
    daySteps++
    return dates.addDaysISO(...args)
  } }
  throw Error(`Unexpected dependency: ${name}`)
})

store = {
  scopedRuns: [{ id: "r1", date: "2026-11-05", requiredPositions: ["p1"], status: "confirmed" }],
  assignmentsForRun: () => [{ staffId: "s1" }],
  scopedTrainingSessions: [{ id: "t1", date: "2026-11-05", type: "refresher", instructorId: "s2" }],
  trainingAttendance: [{ sessionId: "t1", staffId: "s1" }],
  scopedLeaveRecords: [
    { staffId: "s1", startDate: "2026-10-30", endDate: "2026-11-02", approval: "approved" },
    { staffId: "s1", startDate: "2026-11-30", endDate: "2026-12-03", approval: "approved" },
    { staffId: "s1", startDate: "2026-11-05", endDate: "2026-11-05", approval: "rejected" },
  ],
  publicHolidays: [{ date: "2026-11-05", name: "Holiday" }],
}
const range = { start: "2026-11-01", end: "2026-11-30" }
const all = useCalendarData(emptyFilters)
const visible = useCalendarData(emptyFilters, range)
assert.deepEqual([...visible], [...all].filter(([date]) => date >= range.start && date <= range.end))
assert.equal(visible.get("2026-11-01").leaveCount, 1)
assert.equal(visible.get("2026-11-30").leaveCount, 1)
assert.equal(visible.get("2026-11-05").leaveCount, 0)
store = { ...store, notifications: [{ id: "unrelated" }] }
assert.equal(useCalendarData({ ...emptyFilters }, { ...range }), visible, "Unrelated updates must reuse calendar data")
const filtered = useCalendarData({ ...emptyFilters, staffId: "s1" }, range)
assert.equal(filtered.get("2026-11-05").trainingCount, 1, "Attendees count even when not the instructor")
assert.equal(useCalendarData({ ...emptyFilters, status: "cancelled" }, range).get("2026-11-05").runs.length, 0)

// Every filter must preserve the old visible-day result, not just counts for the unfiltered view.
for (const filter of [
  { staffId: "s1" }, { staffId: "missing" }, { positionId: "p1" },
  { simulatorId: "missing" }, { exerciseId: "missing" },
  { status: "confirmed" }, { trainingType: "refresher" },
]) {
  const filters = { ...emptyFilters, ...filter }
  const unbounded = useCalendarData(filters)
  assert.deepEqual([...useCalendarData(filters, range)], [...unbounded].filter(([date]) => date >= range.start && date <= range.end))
}
const beforeUpdate = useCalendarData(emptyFilters, range)
store = { ...store, scopedRuns: [...store.scopedRuns, { ...store.scopedRuns[0], id: "r2" }] }
const afterUpdate = useCalendarData(emptyFilters, range)
assert.notEqual(afterUpdate, beforeUpdate)
assert.equal(afterUpdate.get("2026-11-05").runs.length, 2, "Real roster updates must invalidate the memo")

// Keep the existing 366-day safety cap, even when a malformed long record overlaps the viewport.
store = { ...store, scopedLeaveRecords: [{ staffId: "s1", startDate: "2020-01-01", endDate: "2030-01-01", approval: "approved" }] }
assert.equal(useCalendarData(emptyFilters, range).get("2026-11-05").leaveCount, 0)
// A week can cross a year boundary.
store = { ...store, scopedLeaveRecords: [{ staffId: "s1", startDate: "2026-12-29", endDate: "2027-01-03", approval: "pending" }] }
const week = useCalendarData(emptyFilters, { start: "2026-12-28", end: "2027-01-03" })
assert.equal(week.get("2027-01-03").leaveCount, 1)
assert.equal(week.size, 6)

// Synthetic retained history: count date expansion work rather than assert fragile timing thresholds.
store = { ...store, scopedLeaveRecords: Array.from({ length: 2000 }, (_, i) => ({
  staffId: `s${i}`, startDate: "2024-01-01", endDate: "2024-12-31", approval: "approved",
})) }
daySteps = 0
let start = performance.now()
useCalendarData(emptyFilters)
const fullMs = performance.now() - start
const fullSteps = daySteps
daySteps = 0
start = performance.now()
useCalendarData(emptyFilters, range)
const boundedMs = performance.now() - start
assert.equal(daySteps, 0, "Off-screen history must not expand into dates")
assert.equal(fullSteps, 734000) // 366 daily steps + one cap calculation per record
console.log(`PASS: visible counts, filters, memo reuse, cross-year week and safety cap`)
console.log(`Synthetic history: ${fullSteps} → ${daySteps} date steps; ${fullMs.toFixed(1)}ms → ${boundedMs.toFixed(1)}ms (not browser timings)`)
