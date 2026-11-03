/* Generates the Autonoma recipe.json from the standard scenario.
 *
 * Usage:  node scripts/autonoma/gen-recipe.mjs [outputPath]
 * Default output: ~/.autonoma/v0-project/recipe.json
 *
 * Every entity is expressed with `_alias` / `_ref` wiring and time fields use
 * the `<field>OffsetDays` / `<field>OffsetHours` convention, which the
 * factories in lib/autonoma resolve to concrete values at seed time. */
import { writeFileSync } from "node:fs"

const ref = (a) => ({ _ref: a })
const refs = (...a) => a.map(ref)

// ---- time offsets: expressed as <field>OffsetDays / <field>OffsetHours -----
// The factory converts these to concrete values at SEED time.
const create = {}
const push = (model, record) => {
  ;(create[model] ??= []).push(record)
}

// ── User (6) ────────────────────────────────────────────────────────────────
const users = [
  ["usr-1", "Alice Admin", "alice", "Admin", -2],
  ["usr-2", "Bob Lead", "bob", "TL", -24],
  ["usr-3", "Charlie Scheduler", "charlie", "STO", -3],
  ["usr-4", "David Pilot", "david", "SP", -120],
  ["usr-5", "Eve Officer", "eve", "SOO", -12],
  ["usr-6", "Frank Sup", "frank", "SUP", -1],
]
for (const [alias, name, local, role, loginH] of users) {
  push("User", {
    _alias: alias,
    name,
    email: `${local}+{{testRunId}}@simops.test`,
    role,
    active: true,
    lastLoginOffsetHours: loginH,
  })
}

// ── Session (2) ──────────────────────────────────────────────────────────────
push("Session", { _alias: "sess-1", userId: ref("usr-1"), expiresAtOffsetHours: 24, token: "sess-token-{{testRunShortId}}-1", ipAddress: "192.168.1.1", userAgent: "Mozilla/5.0" })
push("Session", { _alias: "sess-2", userId: ref("usr-6"), expiresAtOffsetHours: 12, token: "sess-token-{{testRunShortId}}-2", ipAddress: "192.168.1.5", userAgent: "Mozilla/5.0" })

// ── Account (6) ──────────────────────────────────────────────────────────────
for (const [alias, , local] of users) {
  push("Account", { _alias: `acc-${alias}`, userId: ref(alias), accountId: `${local}-auth-{{testRunShortId}}`, providerId: "credentials" })
}

// ── Verification (2) ─────────────────────────────────────────────────────────
push("Verification", { _alias: "vrf-1", identifier: "alice+{{testRunId}}@simops.test", value: "123456", expiresAtOffsetHours: 1 })
push("Verification", { _alias: "vrf-2", identifier: "bob+{{testRunId}}@simops.test", value: "654321", expiresAtOffsetHours: 1 })

// ── Position (6) ─────────────────────────────────────────────────────────────
const positions = [
  ["pos-1", "AMR", "Arrival", 90, "RADAR", "Coordinator"],
  ["pos-2", "DSR", "Departure", 90, "RADAR", "Ground"],
  ["pos-3", "TWR", "Tower Control", 180, "TOWER", "Aerodrome"],
  ["pos-4", "GND", "Ground Control", 180, "TOWER", "Ground"],
  ["pos-5", "APP", "Approach", 90, "TOWER", "Coordinator"],
  ["pos-6", "FLEX-1", "Flexible Support 1", 90, "RADAR", "Support"],
]
for (const [alias, code, name, validityDays, program, category] of positions) {
  push("Position", { _alias: alias, code: `${code}-{{testRunShortId}}`, name, validityDays, program, category })
}

// ── Staff (8) ────────────────────────────────────────────────────────────────
const staff = [
  ["stf-1", "AA", "Alice", "Admin", "Senior", "alice", ["RADAR"], "2020-01-15", ["pos-1", "pos-2"]],
  ["stf-2", "BL", "Bob", "Lead", "Captain", "bob", ["RADAR", "TOWER"], "2019-05-10", ["pos-1", "pos-3"]],
  ["stf-3", "DP", "David", "Pilot", "FO", "david", ["TOWER"], "2021-08-20", ["pos-3", "pos-4"]],
  ["stf-4", "EH", "Emma", "Hill", "Captain", "emma", ["RADAR"], "2018-03-12", ["pos-1"]],
  ["stf-5", "GH", "George", "Harris", "Senior", "george", ["RADAR"], "2022-02-14", ["pos-2"]],
  ["stf-6", "IF", "Ian", "Ford", "Captain", "ian", ["TOWER"], "2020-11-30", ["pos-4"]],
  ["stf-7", "JK", "Jane", "King", "FO", "jane", ["TOWER"], "2023-01-05", ["pos-5"]],
  ["stf-8", "LM", "Larry", "Miller", "Senior", "larry", ["RADAR"], "2021-06-18", ["pos-1"]],
]
for (const [alias, initials, firstName, lastName, rank, local, programs, joined, home] of staff) {
  push("Staff", {
    _alias: alias,
    initials,
    firstName,
    lastName,
    rank,
    email: `${local}+{{testRunId}}@simops.test`,
    programs,
    active: true,
    joined,
    homePositions: refs(...home),
  })
}

// ── Simulator (3) ────────────────────────────────────────────────────────────
const sims = [
  ["sim-1", "RS1", "Radar Sim 1", "Hall A", "RADAR", "Radar"],
  ["sim-2", "TS1", "Tower Sim 1", "Hall B", "TOWER", "Tower"],
  ["sim-3", "RS2", "Radar Sim 2", "Hall A", "RADAR", "Radar"],
]
for (const [alias, code, name, location, program, simulatorType] of sims) {
  push("Simulator", { _alias: alias, code: `${code}-{{testRunShortId}}`, name, location, active: true, program, simulatorType })
}

// ── Exercise (5) ─────────────────────────────────────────────────────────────
const exercises = [
  ["ex-1", "RAD-01", "Basic Arrival", "RADAR", "sim-1", ["pos-1", "pos-2"], false, 180],
  ["ex-2", "RAD-02V", "Arrival Validation", "RADAR", "sim-1", ["pos-1", "pos-2"], true, 240],
  ["ex-3", "TWR-01", "Basic Tower", "TOWER", "sim-2", ["pos-3", "pos-4"], false, 180],
  ["ex-4", "TWR-02", "Ground Procedures", "TOWER", "sim-2", ["pos-4"], false, 120],
  ["ex-5", "RAD-03", "Mixed Traffic", "RADAR", "sim-3", ["pos-1", "pos-2", "pos-6"], false, 180],
]
for (const [alias, code, name, program, sim, reqPos, isValidation, durationMin] of exercises) {
  push("Exercise", { _alias: alias, code: `${code}-{{testRunShortId}}`, name, program, simulatorId: ref(sim), requiredPositions: refs(...reqPos), isValidation, durationMin })
}

// ── Course (3) ───────────────────────────────────────────────────────────────
push("Course", { _alias: "crs-1", code: "CR-2024-01-{{testRunShortId}}", name: "Radar Foundation", kind: "exercise", exerciseIds: refs("ex-1", "ex-2"), startDateOffsetDays: -7, endDateOffsetDays: 21 })
push("Course", { _alias: "crs-2", code: "CR-2024-02-{{testRunShortId}}", name: "Tower Basic", kind: "exercise", exerciseIds: refs("ex-3", "ex-4"), startDateOffsetDays: -14, endDateOffsetDays: 14 })
push("Course", { _alias: "crs-3", code: "TR-2024-OJTI-{{testRunShortId}}", name: "OJTI Workshop", kind: "training", exerciseIds: [], startDateOffsetDays: -1, endDateOffsetDays: 2 })

// ── SlotTime (3) ─────────────────────────────────────────────────────────────
push("SlotTime", { _alias: "slot-1", label: "Morning", startTime: "08:00", endTime: "12:00" })
push("SlotTime", { _alias: "slot-2", label: "Afternoon", startTime: "13:00", endTime: "17:00" })
push("SlotTime", { _alias: "slot-3", label: "Night", startTime: "18:00", endTime: "22:00" })

// ── Run (10) ─────────────────────────────────────────────────────────────────
const runs = [
  ["run-1", -2, "08:00", "sim-1", "ex-1", "completed", ["pos-1", "pos-2"]],
  ["run-2", -1, "13:00", "sim-1", "ex-2", "completed", ["pos-1", "pos-2"]],
  ["run-3", 0, "08:00", "sim-2", "ex-3", "confirmed", ["pos-3", "pos-4"]],
  ["run-4", 0, "13:00", "sim-3", "ex-5", "tentative", ["pos-1", "pos-2", "pos-6"]],
  ["run-5", 1, "08:00", "sim-1", "ex-1", "confirmed", ["pos-1", "pos-2"]],
  ["run-6", 2, "08:00", "sim-2", "ex-4", "tentative", ["pos-4"]],
  ["run-7", -7, "08:00", "sim-1", "ex-1", "cancelled", ["pos-1", "pos-2"]],
  ["run-8", 7, "08:00", "sim-1", "ex-1", "postponed", ["pos-1", "pos-2"]],
  ["run-9", -30, "08:00", "sim-1", "ex-1", "completed", ["pos-1", "pos-2"]],
  ["run-10", -60, "08:00", "sim-1", "ex-1", "completed", ["pos-1", "pos-2"]],
]
for (const [alias, dOff, slotTime, sim, ex, status, reqPos] of runs) {
  push("Run", { _alias: alias, dateOffsetDays: dOff, slotTime, simulatorId: ref(sim), exerciseId: ref(ex), status, requiredPositions: refs(...reqPos) })
}

// ── RunAssignment (24) ───────────────────────────────────────────────────────
const asg = [
  ["asg-1", "run-1", "pos-1", "stf-1", false, null, null],
  ["asg-2", "run-1", "pos-2", "stf-5", false, null, null],
  ["asg-3", "run-2", "pos-1", "stf-4", false, null, null],
  ["asg-4", "run-2", "pos-2", "stf-1", true, null, null],
  ["asg-5", "run-3", "pos-3", "stf-2", false, null, null],
  ["asg-6", "run-3", "pos-4", "stf-3", false, null, null],
  ["asg-7", "run-4", "pos-1", "stf-8", false, null, null],
  ["asg-8", "run-4", "pos-2", "stf-5", false, null, null],
  ["asg-9", "run-4", "pos-6", "stf-4", false, "pos-1", null],
  ["asg-10", "run-5", "pos-1", "stf-1", false, null, null],
  ["asg-11", "run-5", "pos-2", "stf-5", false, null, null],
  ["asg-12", "run-6", "pos-4", "stf-6", false, null, null],
  ["asg-13", "run-9", "pos-1", "stf-1", false, null, null],
  ["asg-14", "run-9", "pos-2", "stf-5", false, null, null],
  ["asg-15", "run-10", "pos-1", "stf-1", false, null, null],
  ["asg-16", "run-10", "pos-2", "stf-5", false, null, null],
  ["asg-17", "run-4", "pos-6", "stf-7", false, null, true],
  ["asg-18", "run-3", "pos-3", null, null, null, null],
  ["asg-19", "run-3", "pos-4", null, null, null, null],
  ["asg-20", "run-1", "pos-1", null, null, null, null],
  ["asg-21", "run-1", "pos-2", null, null, null, null],
  ["asg-22", "run-2", "pos-1", null, null, null, null],
  ["asg-23", "run-2", "pos-2", null, null, null, null],
  ["asg-24", "run-4", "pos-1", null, null, null, null],
]
for (const [alias, run, pos, stf, manual, linked, training] of asg) {
  const rec = { _alias: alias, runId: ref(run), positionId: ref(pos) }
  if (stf) rec.staffId = ref(stf)
  if (manual !== null) rec.manualOverride = manual
  if (linked) rec.linkedPositionId = ref(linked)
  if (training !== null) rec.trainingMode = training
  push("RunAssignment", rec)
}

// ── StaffValidity (16) ───────────────────────────────────────────────────────
const sv = [
  ["stf-1", "pos-1", -2, 90],
  ["stf-1", "pos-2", -1, 90],
  ["stf-2", "pos-1", -90, 90],
  ["stf-2", "pos-3", -1, 180],
  ["stf-3", "pos-3", -7, 180],
  ["stf-3", "pos-4", -7, 180],
  ["stf-4", "pos-1", -1, 90],
  ["stf-5", "pos-2", -2, 90],
  ["stf-6", "pos-4", null, 180],
  ["stf-7", "pos-5", null, 90],
  ["stf-8", "pos-1", 0, 90],
  ["stf-1", "pos-3", null, 180],
  ["stf-2", "pos-2", null, 90],
  ["stf-3", "pos-5", null, 90],
  ["stf-5", "pos-1", null, 90],
  ["stf-8", "pos-2", null, 90],
]
let svi = 0
for (const [stf, pos, lastOff, validityDays] of sv) {
  svi += 1
  const rec = { _alias: `sv-${svi}`, staffId: ref(stf), positionId: ref(pos), validityDays }
  if (lastOff !== null) rec.lastDateSatOffsetDays = lastOff
  else rec.lastDateSat = null
  push("StaffValidity", rec)
}

// ── LeaveRecord (4) ──────────────────────────────────────────────────────────
push("LeaveRecord", { _alias: "lv-1", staffId: ref("stf-1"), type: "Annual", startDateOffsetDays: 2, endDateOffsetDays: 5, approval: "approved" })
push("LeaveRecord", { _alias: "lv-2", staffId: ref("stf-2"), type: "Sick", startDateOffsetDays: -1, endDateOffsetDays: 0, approval: "approved" })
push("LeaveRecord", { _alias: "lv-3", staffId: ref("stf-3"), type: "Training", startDateOffsetDays: 3, endDateOffsetDays: 4, approval: "pending" })
push("LeaveRecord", { _alias: "lv-4", staffId: ref("stf-6"), type: "Other", startDateOffsetDays: 1, endDateOffsetDays: 1, approval: "rejected" })

// ── TrainingAttachment (2) ───────────────────────────────────────────────────
push("TrainingAttachment", { _alias: "att-1", name: "Syllabus.pdf", contentType: "application/pdf", size: 102400, uploadedAtOffsetDays: -2 })
push("TrainingAttachment", { _alias: "att-2", name: "Guidelines.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 51200, uploadedAtOffsetDays: -1 })

// ── TrainingSession (3) ──────────────────────────────────────────────────────
push("TrainingSession", { _alias: "ts-1", title: "Safety Procedures", type: "Classroom", dateOffsetDays: -1, instructorId: ref("stf-1"), status: "completed" })
push("TrainingSession", { _alias: "ts-2", title: "Advanced Radar Ops", type: "Simulator", dateOffsetDays: 2, instructorId: ref("stf-2"), status: "scheduled" })
push("TrainingSession", { _alias: "ts-3", title: "Radio Compliance", type: "Seminar", dateOffsetDays: 5, instructorId: ref("stf-1"), status: "scheduled" })

// ── TrainingAttendance (6) ───────────────────────────────────────────────────
const tat = [
  ["tat-1", "ts-1", "stf-3", true],
  ["tat-2", "ts-1", "stf-4", true],
  ["tat-3", "ts-2", "stf-5", false],
  ["tat-4", "ts-2", "stf-6", false],
  ["tat-5", "ts-3", "stf-7", false],
  ["tat-6", "ts-3", "stf-8", false],
]
for (const [alias, sess, stf, attended] of tat) {
  push("TrainingAttendance", { _alias: alias, sessionId: ref(sess), staffId: ref(stf), attended })
}

// ── TrainingLogEntry (4) ─────────────────────────────────────────────────────
push("TrainingLogEntry", { _alias: "tlog-1", dateOffsetDays: -2, program: "RADAR", ojtiId: ref("stf-1"), traineeId: ref("stf-5"), hours: 3, rating: 4 })
push("TrainingLogEntry", { _alias: "tlog-2", dateOffsetDays: -2, program: "RADAR", ojtiId: ref("stf-1"), traineeId: ref("stf-4"), hours: 2, rating: 5 })
push("TrainingLogEntry", { _alias: "tlog-3", dateOffsetDays: -1, program: "TOWER", ojtiId: ref("stf-2"), traineeId: ref("stf-3"), hours: 4, rating: 3 })
push("TrainingLogEntry", { _alias: "tlog-4", dateOffsetDays: 0, program: "RADAR", ojtiId: ref("stf-1"), traineeId: ref("stf-8"), hours: 4, rating: 4 })

// ── Qualification (4) ────────────────────────────────────────────────────────
push("Qualification", { _alias: "ql-1", code: "OJTI-{{testRunShortId}}", name: "On-the-Job Training Instructor", effect: "allow", description: "Can instruct trainees" })
push("Qualification", { _alias: "ql-2", code: "EXAM-{{testRunShortId}}", name: "Examiner", effect: "allow", description: "Can conduct validations" })
push("Qualification", { _alias: "ql-3", code: "MED-R-{{testRunShortId}}", name: "Medical Restriction", effect: "restrict", description: "Limited shift duration" })
push("Qualification", { _alias: "ql-4", code: "LVP-{{testRunShortId}}", name: "Low Visibility Ops", effect: "allow", description: "Can operate in fog" })

// ── StaffQualification (10) ──────────────────────────────────────────────────
const sq = [
  ["sq-1", "stf-1", "ql-1", null],
  ["sq-2", "stf-1", "ql-2", null],
  ["sq-3", "stf-2", "ql-1", null],
  ["sq-4", "stf-4", "ql-3", 30],
  ["sq-5", "stf-5", "ql-4", null],
  ["sq-6", "stf-1", "ql-4", null],
  ["sq-7", "stf-2", "ql-4", null],
  ["sq-8", "stf-3", "ql-4", null],
  ["sq-9", "stf-6", "ql-4", null],
  ["sq-10", "stf-8", "ql-4", null],
]
for (const [alias, stf, ql, expOff] of sq) {
  const rec = { _alias: alias, staffId: ref(stf), qualificationId: ref(ql) }
  if (expOff !== null) rec.expiryOffsetDays = expOff
  else rec.expiry = null
  push("StaffQualification", rec)
}

// ── PositionQualRule (6) ─────────────────────────────────────────────────────
const pqr = [
  ["pqr-1", "pos-1", [], ["ql-4"], ["ql-3"]],
  ["pqr-2", "pos-2", [], [], []],
  ["pqr-3", "pos-3", ["ql-4"], [], []],
  ["pqr-4", "pos-4", [], [], []],
  ["pqr-5", "pos-5", [], [], []],
  ["pqr-6", "pos-6", [], [], []],
]
for (const [alias, pos, req, pref, excl] of pqr) {
  push("PositionQualRule", { _alias: alias, positionId: ref(pos), requiredQuals: refs(...req), preferredQuals: refs(...pref), excludedQuals: refs(...excl) })
}

// ── ExerciseQualRule (5) ─────────────────────────────────────────────────────
const eqr = [
  ["eqr-1", "ex-1", [], [], []],
  ["eqr-2", "ex-2", ["ql-2"], [], []],
  ["eqr-3", "ex-3", [], [], []],
  ["eqr-4", "ex-4", [], [], []],
  ["eqr-5", "ex-5", [], ["ql-4"], []],
]
for (const [alias, ex, req, pref, excl] of eqr) {
  push("ExerciseQualRule", { _alias: alias, exerciseId: ref(ex), requiredQuals: refs(...req), preferredQuals: refs(...pref), excludedQuals: refs(...excl) })
}

// ── Assignment (4) ───────────────────────────────────────────────────────────
push("Assignment", { _alias: "asgn-1", code: "L-{{testRunShortId}}", description: "Annual Leave", group: "Leave", type: "Leave", appliesTo: "RADAR / TOWER", sortOrder: 1 })
push("Assignment", { _alias: "asgn-2", code: "WR-{{testRunShortId}}", description: "Remote Work", group: "Roster", type: "Remote Work", appliesTo: "RADAR", sortOrder: 2 })
push("Assignment", { _alias: "asgn-3", code: "OJTI-A-{{testRunShortId}}", description: "Instruction", group: "Training", type: "Instructor", appliesTo: "TOWER", sortOrder: 3 })
push("Assignment", { _alias: "asgn-4", code: "SL-{{testRunShortId}}", description: "Sick Leave", group: "Sick Leave", type: "Leave", appliesTo: "RADAR / TOWER", sortOrder: 4 })

// ── OtherTask (2) ────────────────────────────────────────────────────────────
push("OtherTask", { _alias: "task-1", title: "Safety Committee", staffIds: refs("stf-1", "stf-2"), startDateOffsetDays: 0, endDateOffsetDays: 0, program: "RADAR" })
push("OtherTask", { _alias: "task-2", title: "System Upgrade Testing", staffIds: refs("stf-3", "stf-4"), startDateOffsetDays: 1, endDateOffsetDays: 2, program: "TOWER" })

// ── PublicHoliday (1) ────────────────────────────────────────────────────────
push("PublicHoliday", { _alias: "hol-1", date: "2024-12-25", name: "Christmas Day" })

// ── AuditLog (5) ─────────────────────────────────────────────────────────────
push("AuditLog", { _alias: "aud-1", timestampOffsetHours: -1, user: "Alice Admin", action: "run.create", detail: "Created RUN-005" })
push("AuditLog", { _alias: "aud-2", timestampOffsetHours: -1, user: "Alice Admin", action: "assignment.change", detail: "Assigned AA to Arrival on RUN-005" })
push("AuditLog", { _alias: "aud-3", timestampOffsetHours: -1, user: "Alice Admin", action: "exercise.confirm", detail: "Confirmed RUN-005" })
push("AuditLog", { _alias: "aud-4", timestampOffsetHours: -1, user: "Bob Lead", action: "staff.edit", detail: "Updated Bob Lead profile" })
push("AuditLog", { _alias: "aud-5", timestampOffsetHours: -1, user: "Charlie Scheduler", action: "excel.import", detail: "Imported 50 staff records" })

// ── FaultLog (3) ─────────────────────────────────────────────────────────────
push("FaultLog", { _alias: "flt-1", timestampOffsetHours: -24, severity: "major", status: "resolved", system: "TS1 Motion", description: "Hydralics leakage", reportedBy: "Bob" })
push("FaultLog", { _alias: "flt-2", timestampOffsetHours: -5, severity: "minor", status: "open", system: "RS1 Console", description: "Sticky button on ASR", reportedBy: "Alice" })
push("FaultLog", { _alias: "flt-3", timestampOffsetHours: -2, severity: "critical", status: "in-progress", system: "Network", description: "Intermittent link between Sim and Server", reportedBy: "Dave" })

// ── OperatorLog (3) ──────────────────────────────────────────────────────────
push("OperatorLog", { _alias: "op-1", timestampOffsetHours: -24, shift: "morning", operator: "Alice", category: "briefing", entry: "Morning briefing completed, all sims up" })
push("OperatorLog", { _alias: "op-2", timestampOffsetHours: -24, shift: "afternoon", operator: "Bob", category: "run", entry: "RUN-001 completed without issues" })
push("OperatorLog", { _alias: "op-3", timestampOffsetHours: -1, shift: "morning", operator: "Charlie", category: "incident", entry: "Sim pilot arrived 10 mins late for briefing" })

// ── FirewallLog (3) ──────────────────────────────────────────────────────────
push("FirewallLog", { _alias: "fw-1", timestampOffsetHours: -1, action: "allow", sourceIp: "10.0.0.5", destinationIp: "10.0.0.10", rule: "Rule 1", description: "HTTP access to Store API" })
push("FirewallLog", { _alias: "fw-2", timestampOffsetHours: -1, action: "deny", sourceIp: "192.168.5.1", destinationIp: "10.0.0.10", rule: "Rule 99", description: "Unauthorized external access attempt" })
push("FirewallLog", { _alias: "fw-3", timestampOffsetHours: -1, action: "drop", sourceIp: "172.16.0.4", destinationIp: "10.0.0.1", rule: "Rule 5", description: "SSH brute force detected" })

// ── AdminLog (3) ─────────────────────────────────────────────────────────────
push("AdminLog", { _alias: "adm-1", timestampOffsetHours: -2, user: "Alice Admin", action: "user.create", target: "usr-5", detail: "Created user Eve Officer" })
push("AdminLog", { _alias: "adm-2", timestampOffsetHours: -1, user: "Alice Admin", action: "config.change", target: "System", detail: "Updated retention policy to 5 years" })
push("AdminLog", { _alias: "adm-3", timestampOffsetHours: -1, user: "Alice Admin", action: "backup.create", target: "Database", detail: "Scheduled weekly backup" })

// ── ImportHistory (2) ────────────────────────────────────────────────────────
push("ImportHistory", { _alias: "imp-1", filename: "staff_2024.xlsx", dateOffsetDays: -1, user: "Alice Admin", rowsTotal: 100, rowsAccepted: 95 })
push("ImportHistory", { _alias: "imp-2", filename: "runs_may.xlsx", dateOffsetDays: 0, user: "Charlie Scheduler", rowsTotal: 50, rowsAccepted: 50 })

// ── NotificationRecord (5) ───────────────────────────────────────────────────
push("NotificationRecord", { _alias: "ntf-1", staffId: ref("stf-1"), channel: "email", kind: "assignment", subject: "New Assignment: Arrival", sentAtOffsetHours: -1, sentBy: "Alice Admin" })
push("NotificationRecord", { _alias: "ntf-2", staffId: ref("stf-2"), channel: "sms", kind: "custom", subject: "Schedule Reminder", sentAtOffsetHours: -2, sentBy: "Bob Lead" })
push("NotificationRecord", { _alias: "ntf-3", staffId: ref("stf-3"), channel: "email", kind: "training", subject: "Training Invitation", sentAtOffsetHours: -24, sentBy: "Alice Admin" })
push("NotificationRecord", { _alias: "ntf-4", staffId: ref("stf-4"), channel: "copy", kind: "weekly", subject: "Weekly Roster Release", sentAtOffsetHours: -72, sentBy: "Alice Admin" })
push("NotificationRecord", { _alias: "ntf-5", staffId: ref("stf-5"), channel: "email", kind: "assignment", subject: "Assignment Update", sentAtOffsetHours: -4, sentBy: "Charlie Scheduler" })

// ── RunStatus (5) — pure enum, no relations ──────────────────────────────────
for (const [i, v] of ["tentative", "confirmed", "cancelled", "postponed", "completed"].entries()) {
  push("RunStatus", { _alias: `rst-${i + 1}`, value: v })
}

const recipeFile = {
  version: 1,
  source: {
    discoverPath: ".autonoma/v0-project/discover.json",
    scenariosPath: ".autonoma/v0-project/scenarios.md",
  },
  validationMode: "endpoint-lifecycle",
  recipes: [
    {
      name: "standard",
      description: "Realistic simulator operation state with diverse staff, qualifications, and operational logs.",
      create,
      validation: { method: "endpoint-up-down" },
    },
  ],
}

const out = process.argv[2] || "/home/vercel-sandbox/.autonoma/v0-project/recipe.json"
writeFileSync(out, JSON.stringify(recipeFile, null, 2))
const total = Object.values(create).reduce((n, arr) => n + arr.length, 0)
console.log(`wrote ${out}: ${Object.keys(create).length} entities, ${total} records`)
