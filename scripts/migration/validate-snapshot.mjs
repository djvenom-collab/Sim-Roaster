/* Phase 3 — DATA VALIDATION (read-only).
 * Profiles the live Blob snapshot: record counts per slice, duplicate primary
 * keys, candidate unique keys, malformed dates, and orphaned references that
 * would violate the PostgreSQL foreign keys. Never writes anything.
 *
 * Usage:  node --env-file-if-exists=/vercel/share/.env.project scripts/migration/validate-snapshot.mjs [--json]
 */
import { readLiveSnapshot, parseArgs } from "./lib.mjs"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function profileSnapshot(state) {
  const arr = (k) => (Array.isArray(state[k]) ? state[k] : [])
  const ids = (k) => new Set(arr(k).map((r) => r?.id))
  const report = { counts: {}, duplicateIds: {}, duplicateKeys: {}, orphans: {}, badDates: {} }

  for (const [k, v] of Object.entries(state)) {
    if (Array.isArray(v)) report.counts[k] = v.length
    else if (v && typeof v === "object") report.counts[k] = Object.keys(v).length
  }

  for (const [k, v] of Object.entries(state)) {
    if (!Array.isArray(v) || !v.length || !("id" in (v[0] ?? {}))) continue
    const seen = new Set()
    const dups = []
    for (const r of v) {
      if (seen.has(r.id)) dups.push(r.id)
      seen.add(r.id)
    }
    if (dups.length) report.duplicateIds[k] = { count: dups.length, sample: dups.slice(0, 5) }
  }

  const uniq = (label, slice, keyFn) => {
    const seen = new Map()
    let n = 0
    const sample = []
    for (const r of arr(slice)) {
      const key = keyFn(r)
      if (key == null || key === "") continue
      if (seen.has(key)) {
        n++
        if (sample.length < 5) sample.push(key)
      } else seen.set(key, r.id)
    }
    if (n) report.duplicateKeys[label] = { count: n, sample }
  }
  uniq("staff.initials", "staff", (r) => r.initials?.trim().toUpperCase())
  uniq("staff.email", "staff", (r) => r.email?.trim().toLowerCase())
  uniq("simulators.code", "simulators", (r) => r.code?.trim().toUpperCase())
  uniq("positions.program+code", "positions", (r) => `${r.program}|${r.code?.trim().toUpperCase()}`)
  uniq("exercises.name", "exercises", (r) => r.name?.trim().toLowerCase())
  uniq("qualifications.code", "qualifications", (r) => r.code?.trim().toUpperCase())
  uniq("assignments.code", "assignments", (r) => r.code?.trim().toUpperCase())
  uniq("users.email", "users", (r) => r.email?.trim().toLowerCase())
  uniq("staffValidity.staff+position", "staffValidity", (r) => `${r.staffId}|${r.positionId}`)
  uniq("trainingAttendance.session+staff", "trainingAttendance", (r) => `${r.sessionId}|${r.staffId}`)
  uniq("staffQualifications.staff+qual", "staffQualifications", (r) => `${r.staffId}|${r.qualificationId}`)
  uniq("runAssignments.run+position+linked", "runAssignments", (r) => `${r.runId}|${r.positionId}|${r.linkedPositionId ?? ""}`)

  const S = {
    staff: ids("staff"),
    positions: ids("positions"),
    simulators: ids("simulators"),
    exercises: ids("exercises"),
    runs: ids("runs"),
    qualifications: ids("qualifications"),
    trainingSessions: ids("trainingSessions"),
    trainingGroups: ids("trainingGroups"),
  }
  const orphan = (label, slice, getRefs, target) => {
    let n = 0
    const sample = []
    for (const r of arr(slice)) {
      for (const ref of [getRefs(r)].flat()) {
        if (ref == null || ref === "") continue
        if (!S[target].has(ref)) {
          n++
          if (sample.length < 5) sample.push(`${r.id ?? "?"}→${ref}`)
        }
      }
    }
    if (n) report.orphans[label] = { count: n, sample }
  }
  orphan("staff.homePositions→positions", "staff", (r) => r.homePositions, "positions")
  orphan("exercises.simulatorId→simulators", "exercises", (r) => r.simulatorId, "simulators")
  orphan("exercises.requiredPositions→positions", "exercises", (r) => r.requiredPositions, "positions")
  orphan("courses.exerciseIds→exercises", "courses", (r) => r.exerciseIds, "exercises")
  orphan("runs.simulatorId→simulators", "runs", (r) => r.simulatorId, "simulators")
  orphan("runs.exerciseId→exercises", "runs", (r) => r.exerciseId, "exercises")
  orphan("runs.requiredPositions→positions", "runs", (r) => r.requiredPositions, "positions")
  orphan("runAssignments.runId→runs", "runAssignments", (r) => r.runId, "runs")
  orphan("runAssignments.positionId→positions", "runAssignments", (r) => r.positionId, "positions")
  orphan("runAssignments.linkedPositionId→positions", "runAssignments", (r) => r.linkedPositionId, "positions")
  orphan("runAssignments.staffId→staff", "runAssignments", (r) => r.staffId, "staff")
  orphan("leaveRecords.staffId→staff", "leaveRecords", (r) => r.staffId, "staff")
  orphan("otherTasks.staffIds→staff", "otherTasks", (r) => r.staffIds, "staff")
  orphan("trainingSessions.instructorId→staff", "trainingSessions", (r) => r.instructorId, "staff")
  orphan("trainingSessions.simulatorId→simulators", "trainingSessions", (r) => r.simulatorId, "simulators")
  orphan("trainingSessions.linkedRunId→runs", "trainingSessions", (r) => r.linkedRunId, "runs")
  orphan("trainingSessions.positionIds→positions", "trainingSessions", (r) => r.positionIds, "positions")
  orphan("trainingAttendance.sessionId→trainingSessions", "trainingAttendance", (r) => r.sessionId, "trainingSessions")
  orphan("trainingAttendance.staffId→staff", "trainingAttendance", (r) => r.staffId, "staff")
  orphan("trainingLogs.ojtiId→staff", "trainingLogs", (r) => r.ojtiId, "staff")
  orphan("trainingLogs.traineeId→staff", "trainingLogs", (r) => r.traineeId, "staff")
  orphan("trainingLogs.groupId→trainingGroups", "trainingLogs", (r) => r.groupId, "trainingGroups")
  orphan("trainingLogs.positionIds→positions", "trainingLogs", (r) => r.positionIds, "positions")
  orphan("trainingGroups.positionIds→positions", "trainingGroups", (r) => r.positionIds, "positions")
  orphan("staffValidity.staffId→staff", "staffValidity", (r) => r.staffId, "staff")
  orphan("staffValidity.positionId→positions", "staffValidity", (r) => r.positionId, "positions")
  orphan("staffQualifications.staffId→staff", "staffQualifications", (r) => r.staffId, "staff")
  orphan("staffQualifications.qualificationId→qualifications", "staffQualifications", (r) => r.qualificationId, "qualifications")
  orphan("exerciseQualRules.exerciseId→exercises", "exerciseQualRules", (r) => r.exerciseId, "exercises")
  orphan("exerciseQualRules.quals→qualifications", "exerciseQualRules", (r) => [...(r.requiredQuals ?? []), ...(r.preferredQuals ?? []), ...(r.excludedQuals ?? [])], "qualifications")
  orphan("users.staffId→staff", "users", (r) => r.staffId, "staff")
  orphan("notifications.staffId→staff", "notifications", (r) => r.staffId, "staff")
  orphan("operatorLogs.linkedRunId→runs", "operatorLogs", (r) => r.linkedRunId, "runs")

  const dateCheck = (label, slice, fields) => {
    let n = 0
    const sample = []
    for (const r of arr(slice)) {
      for (const f of fields) {
        const v = r[f]
        if (v == null || v === "") continue
        if (!DATE_RE.test(String(v).slice(0, 10)) || Number.isNaN(Date.parse(String(v).slice(0, 10)))) {
          n++
          if (sample.length < 5) sample.push(`${r.id}.${f}=${v}`)
        }
      }
    }
    if (n) report.badDates[label] = { count: n, sample }
  }
  dateCheck("runs", "runs", ["date"])
  dateCheck("leaveRecords", "leaveRecords", ["startDate", "endDate"])
  dateCheck("courses", "courses", ["startDate", "endDate"])
  dateCheck("otherTasks", "otherTasks", ["startDate", "endDate"])
  dateCheck("trainingSessions", "trainingSessions", ["date"])
  dateCheck("staff.joined", "staff", ["joined"])
  dateCheck("publicHolidays", "publicHolidays", ["date"])

  let inverted = 0
  for (const k of ["leaveRecords", "courses", "otherTasks"]) {
    for (const r of arr(k)) if (r.startDate && r.endDate && r.endDate < r.startDate) inverted++
  }
  if (inverted) report.badDates["endDate<startDate"] = { count: inverted, sample: [] }

  report.courseSimClassKeys = Object.keys(state.courseSimClass ?? {}).slice(0, 5)
  report.unknownSlices = Object.keys(state).filter((k) => !(k in report.counts) && k !== "version")
  report.version = state.version
  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs()
  const snap = await readLiveSnapshot()
  const report = profileSnapshot(snap.state)
  const meta = { etag: snap.etag, sha256: snap.sha256, bytes: snap.bytes, uploadedAt: snap.uploadedAt }
  if (args.json) {
    console.log(JSON.stringify({ meta, ...report }, null, 2))
  } else {
    console.log("Snapshot", meta)
    console.log("Version", report.version)
    console.table(report.counts)
    for (const section of ["duplicateIds", "duplicateKeys", "orphans", "badDates"]) {
      const entries = Object.entries(report[section])
      console.log(`\n${section}: ${entries.length ? "" : "none"}`)
      for (const [k, v] of entries) console.log(`  ${k}: ${v.count}  e.g. ${v.sample.join(", ")}`)
    }
    console.log("\ncourseSimClass key sample:", report.courseSimClassKeys)
  }
}
