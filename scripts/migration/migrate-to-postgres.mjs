/* Phases 2, 4, 5, 6 — SCHEMA CREATION, MIGRATION, RECORD-COUNT and INTEGRITY
 * VERIFICATION, all inside ONE PostgreSQL transaction.
 *
 * Default mode is --dry-run: everything runs, every check executes, then the
 * transaction is ROLLED BACK. Nothing is persisted in PostgreSQL and the Blob
 * snapshot is never written in any mode (it is only read).
 *
 * --commit persists the result, and is refused unless ALL of the following hold:
 *   - --backup=<pathname> names an existing verified backup whose SHA-256
 *     equals the live snapshot's (i.e. no edits since the backup);
 *   - --confirm=<first 12 chars of the live snapshot SHA-256>;
 *   - the ops tables are empty (no double-load);
 *   - pre-validation and every post-load verification passed.
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/migration/migrate-to-postgres.mjs            # dry run
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/migration/migrate-to-postgres.mjs --commit \
 *        --backup=sim-roster/backups/<file>.json --confirm=<sha12> [--actor=<name>]
 */
import { readFile } from "node:fs/promises"
import { get } from "@vercel/blob"
import pg from "pg"
import { STATE_PATH, parseArgs, readLiveSnapshot, requireEnv, sha256 } from "./lib.mjs"
import { profileSnapshot } from "./validate-snapshot.mjs"

const RUN_TAG = "__autonomaRunId"
const args = parseArgs()
const mode = args.commit ? "commit" : "dry-run"
const actor = String(args.actor ?? process.env.USER ?? "migration-script")

requireEnv("DATABASE_URL")
const snap = await readLiveSnapshot()
const state = snap.state

// ── Pre-validation (Phase 3 gate) ───────────────────────────────────────────
const profile = profileSnapshot(state)
const blocking = ["duplicateIds", "duplicateKeys", "orphans", "badDates"].filter((k) => Object.keys(profile[k]).length)
if (blocking.length) {
  console.error("Pre-validation failed; fix the source data first:", JSON.stringify(Object.fromEntries(blocking.map((k) => [k, profile[k]])), null, 2))
  process.exit(1)
}

if (mode === "commit") {
  if (!args.backup || !args.confirm) {
    console.error("--commit requires --backup=<pathname> and --confirm=<sha12>")
    process.exit(2)
  }
  if (String(args.confirm) !== snap.sha256.slice(0, 12)) {
    console.error(`--confirm does not match live snapshot sha256 prefix ${snap.sha256.slice(0, 12)}`)
    process.exit(2)
  }
  const b = await get(String(args.backup), { access: "private", useCache: false })
  const backupText = b?.stream ? await new Response(b.stream).text() : ""
  if (sha256(backupText) !== snap.sha256) {
    console.error("Backup does not match the live snapshot (missing, or data changed since). Take a fresh backup.")
    process.exit(2)
  }
}

// ── Value normalisers ───────────────────────────────────────────────────────
const arr = (k) => (Array.isArray(state[k]) ? state[k] : [])
const opt = (v) => (v === undefined || v === "" ? null : v)
const day = (v) => (v ? String(v).slice(0, 10) : null)
const ts = (v) => {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}
const uniq = (xs) => Array.from(new Set((xs ?? []).filter((x) => x != null && x !== "")))

// Test fixtures are quarantined, never loaded as operational data.
const quarantine = []
const live = (slice) =>
  arr(slice).filter((r) => {
    if (r && r[RUN_TAG]) {
      quarantine.push({ slice, record_id: r.id ?? null, reason: "test_fixture", payload: r })
      return false
    }
    return true
  })

// ── Row builders: slice → table rows ────────────────────────────────────────
const plan = [] // { table, cols, rows, idCol?, sourceIds? }
const add = (table, cols, rows, idCol, sourceIds) => plan.push({ table, cols, rows, idCol, sourceIds })

const simulators = live("simulators")
add("simulator", ["id", "code", "name", "location", "active", "program", "simulator_type", "site_airport", "coverage_area", "generation", "transition_status", "replaced_by", "notes", "sort_order"],
  simulators.map((s) => [s.id, s.code, s.name, s.location ?? "", s.active !== false, opt(s.program), opt(s.simulatorType), opt(s.siteAirport), opt(s.coverageArea), opt(s.generation), opt(s.transitionStatus), opt(s.replacedBy), opt(s.notes), s.sortOrder ?? null]), "id", simulators.map((s) => s.id))

const positions = live("positions")
add("position", ["id", "code", "name", "description", "validity_days", "program", "group_name", "category", "simulator_unit", "airport", "active", "sort_order"],
  positions.map((p) => [p.id, p.code, p.name, p.description ?? "", p.validityDays ?? 0, p.program, opt(p.group), opt(p.category), opt(p.simulatorUnit), opt(p.airport), p.active !== false, p.sortOrder ?? null]), "id", positions.map((p) => p.id))

const quals = live("qualifications")
add("qualification", ["id", "code", "name", "effect", "description"], quals.map((q) => [q.id, q.code, q.name, q.effect, q.description ?? ""]), "id", quals.map((q) => q.id))

const codes = live("assignments")
add("assignment_code", ["id", "code", "description", "group_name", "type", "applies_to", "active", "sort_order"],
  codes.map((a) => [a.id, a.code, a.description ?? "", a.group ?? "", a.type ?? "", a.appliesTo ?? "", a.active !== false, a.sortOrder ?? 0]), "id", codes.map((a) => a.id))

const slots = live("slotTimes")
add("slot_time", ["id", "label", "start_time", "end_time"], slots.map((s) => [s.id, s.label, s.startTime, s.endTime]), "id", slots.map((s) => s.id))

const holidays = live("publicHolidays")
add("public_holiday", ["id", "date", "name"], holidays.map((h) => [h.id, day(h.date), h.name]), "id", holidays.map((h) => h.id))

const staff = live("staff")
add("staff", ["id", "initials", "first_name", "last_name", "rank", "email", "phone", "active", "joined", "notes"],
  staff.map((s) => [s.id, s.initials, s.firstName, s.lastName, s.rank ?? "", s.email ?? "", s.phone ?? "", s.active !== false, day(s.joined), opt(s.notes)]), "id", staff.map((s) => s.id))
add("staff_program", ["staff_id", "program"], staff.flatMap((s) => uniq(s.programs).map((p) => [s.id, p])))
add("staff_home_position", ["staff_id", "position_id", "ordinal"], staff.flatMap((s) => uniq(s.homePositions).map((p, i) => [s.id, p, i])))

const staffQuals = live("staffQualifications")
add("staff_qualification", ["id", "staff_id", "qualification_id", "expiry"], staffQuals.map((q) => [q.id, q.staffId, q.qualificationId, day(q.expiry)]), "id", staffQuals.map((q) => q.id))

add("staff_validity", ["staff_id", "position_id", "last_date_sat", "validity_days"], live("staffValidity").map((v) => [v.staffId, v.positionId, day(v.lastDateSat), v.validityDays ?? 0]))

const users = live("users")
add("app_user", ["id", "name", "email", "role", "staff_id", "active", "last_login"], users.map((u) => [u.id, u.name, u.email, u.role, opt(u.staffId), u.active !== false, ts(u.lastLogin)]), "id", users.map((u) => u.id))

const perms = state.permissionMatrix && typeof state.permissionMatrix === "object" ? state.permissionMatrix : {}
add("role_permission", ["role", "permission", "created_by"], Object.entries(perms).flatMap(([role, list]) => uniq(list).map((p) => [role, p, "migration"])))

const exercises = live("exercises")
add("exercise", ["id", "code", "name", "program", "description", "duration_min", "simulator_id", "required_staff", "is_validation", "active"],
  exercises.map((e) => [e.id, e.code, e.name, e.program, e.description ?? "", e.durationMin ?? 0, e.simulatorId, e.requiredStaff ?? 0, !!e.isValidation, e.active !== false]), "id", exercises.map((e) => e.id))
add("exercise_required_position", ["exercise_id", "ordinal", "position_id"], exercises.flatMap((e) => (e.requiredPositions ?? []).map((p, i) => [e.id, i, p])))

const rules = live("exerciseQualRules")
add("exercise_qual_rule", ["id", "exercise_id"], rules.map((r) => [r.id, r.exerciseId]), "id", rules.map((r) => r.id))
add("exercise_qual_rule_item", ["rule_id", "qualification_id", "kind"], rules.flatMap((r) => [
  ...uniq(r.requiredQuals).map((q) => [r.id, q, "required"]),
  ...uniq(r.preferredQuals).map((q) => [r.id, q, "preferred"]),
  ...uniq(r.excludedQuals).map((q) => [r.id, q, "excluded"]),
]))

const simClass = state.courseSimClass ?? {}
const courses = live("courses")
add("course", ["id", "code", "name", "program", "kind", "start_date", "end_date", "required_people", "notes", "active", "cancelled", "sim_class"],
  courses.map((c) => [c.id, c.code, c.name, c.program, c.kind, day(c.startDate), day(c.endDate), c.requiredPeople ?? 0, opt(c.notes), c.active !== false, !!c.cancelled, simClass[c.id] ?? null]), "id", courses.map((c) => c.id))
add("course_exercise", ["course_id", "exercise_id", "ordinal"], courses.flatMap((c) => uniq(c.exerciseIds).map((e, i) => [c.id, e, i])))
const courseIds = new Set(courses.map((c) => c.id))
const orphanSimClass = Object.keys(simClass).filter((k) => !courseIds.has(k))

const runs = live("runs")
add("run", ["id", "date", "slot_time", "simulator_id", "exercise_id", "status", "required_staff", "notes", "cancellation_reason", "status_changed_by", "status_changed_at"],
  runs.map((r) => [r.id, day(r.date), r.slotTime, r.simulatorId, r.exerciseId, r.status, r.requiredStaff ?? null, opt(r.notes), opt(r.cancellationReason), opt(r.statusChangedBy), ts(r.statusChangedAt)]), "id", runs.map((r) => r.id))
add("run_required_position", ["run_id", "ordinal", "position_id"], runs.flatMap((r) => (r.requiredPositions ?? []).map((p, i) => [r.id, i, p])))
add("run_status_history", ["run_id", "from_status", "to_status", "reason", "changed_by", "changed_at", "source"],
  runs.filter((r) => ts(r.statusChangedAt)).map((r) => [r.id, null, r.status, opt(r.cancellationReason), opt(r.statusChangedBy), ts(r.statusChangedAt), "migration"]))

const ras = live("runAssignments")
add("run_assignment", ["id", "run_id", "position_id", "staff_id", "manual_override", "override_reason", "linked_position_id", "training_mode"],
  ras.map((a) => [a.id, a.runId, a.positionId, a.staffId ?? null, !!a.manualOverride, opt(a.overrideReason), opt(a.linkedPositionId), !!a.trainingMode]), "id", ras.map((a) => a.id))

const leave = live("leaveRecords")
add("leave_record", ["id", "staff_id", "type", "start_date", "end_date", "full_day", "approval", "notes"],
  leave.map((l) => [l.id, l.staffId, l.type, day(l.startDate), day(l.endDate), l.fullDay !== false, l.approval, opt(l.notes)]), "id", leave.map((l) => l.id))

const tasks = live("otherTasks")
add("other_task", ["id", "title", "description", "start_date", "start_time", "end_date", "end_time", "duration_min", "classroom", "program"],
  tasks.map((t) => [t.id, t.title, opt(t.description), day(t.startDate), opt(t.startTime), day(t.endDate), opt(t.endTime), t.durationMin ?? null, opt(t.classroom), opt(t.program)]), "id", tasks.map((t) => t.id))
add("other_task_staff", ["task_id", "staff_id"], tasks.flatMap((t) => uniq(t.staffIds).map((s) => [t.id, s])))

const groups = live("trainingGroups")
add("training_group", ["id", "label", "program"], groups.map((g) => [g.id, g.label, g.program]), "id", groups.map((g) => g.id))
add("training_group_position", ["group_id", "position_id", "ordinal"], groups.flatMap((g) => uniq(g.positionIds).map((p, i) => [g.id, p, i])))

const sessions = live("trainingSessions")
add("training_session", ["id", "title", "type", "date", "slot_time", "instructor_id", "simulator_id", "duration_min", "linked_run_id", "notes", "status"],
  sessions.map((s) => [s.id, s.title, s.type, day(s.date), s.slotTime, s.instructorId, opt(s.simulatorId), s.durationMin ?? null, opt(s.linkedRunId), opt(s.notes), opt(s.status)]), "id", sessions.map((s) => s.id))
add("training_session_position", ["session_id", "ordinal", "position_id"], sessions.flatMap((s) => (s.positionIds ?? []).map((p, i) => [s.id, i, p])))

const attendance = live("trainingAttendance")
add("training_attendance", ["id", "session_id", "staff_id", "attended"], attendance.map((a) => [a.id, a.sessionId, a.staffId, !!a.attended]), "id", attendance.map((a) => a.id))

const logs = live("trainingLogs")
add("training_log", ["id", "date", "program", "group_id", "ojti_id", "trainee_id", "hours", "rating", "strengths", "areas_to_improve", "feedback", "created_at"],
  logs.map((l) => [l.id, day(l.date), l.program, l.groupId, l.ojtiId, l.traineeId, l.hours ?? 0, l.rating ?? null, opt(l.strengths), opt(l.areasToImprove), opt(l.feedback), ts(l.createdAt) ?? new Date().toISOString()]), "id", logs.map((l) => l.id))
add("training_log_position", ["log_id", "position_id"], logs.flatMap((l) => uniq(l.positionIds).map((p) => [l.id, p])))

const notifications = live("notifications")
add("notification", ["id", "staff_id", "channel", "kind", "subject", "body", "recipient", "sent_at", "sent_by", "simulated", "read_at"],
  notifications.map((n) => [n.id, opt(n.staffId), n.channel, n.kind, n.subject ?? "", n.body ?? "", n.to ?? "", ts(n.sentAt), n.sentBy ?? "", !!n.simulated, ts(n.readAt)]), "id", notifications.map((n) => n.id))

const attRow = (a, sessionId, notificationId) => [a.id, sessionId, notificationId, a.name, a.pathname, a.url, a.contentType, a.size ?? 0, ts(a.uploadedAt) ?? new Date().toISOString()]
const dedupeAtt = (list) => [...new Map((list ?? []).map((a) => [a.id, a])).values()]
add("attachment", ["id", "session_id", "notification_id", "name", "pathname", "url", "content_type", "size_bytes", "uploaded_at"], [
  ...sessions.flatMap((s) => dedupeAtt(s.attachments).map((a) => attRow(a, s.id, null))),
  ...notifications.flatMap((n) => dedupeAtt(n.attachments).map((a) => attRow(a, null, n.id))),
])

const dirty = state.notifyDirty && typeof state.notifyDirty === "object" ? state.notifyDirty : {}
add("notify_dirty", ["key", "changed_at", "notified_at"], Object.entries(dirty).map(([k, v]) => [k, ts(v?.changedAt) ?? new Date().toISOString(), ts(v?.notifiedAt)]))

const audits = live("auditLogs")
add("audit_event", ["id", "occurred_at", "actor", "action", "detail", "entity_type"],
  audits.map((a) => [a.id, ts(a.timestamp), a.user ?? "", a.action, a.detail ?? "", String(a.action ?? "").split(".")[0] || null]), "id", audits.map((a) => a.id))

const admin = live("adminLogs")
add("admin_log", ["id", "occurred_at", "actor", "action", "target", "detail", "ip_address"],
  admin.map((a) => [a.id, ts(a.timestamp), a.user ?? "", a.action, opt(a.target), a.detail ?? "", a.ipAddress ?? ""]), "id", admin.map((a) => a.id))

const faults = live("faultLogs")
add("fault_log", ["id", "occurred_at", "severity", "status", "system", "description", "reported_by", "resolved_at", "resolution"],
  faults.map((f) => [f.id, ts(f.timestamp), f.severity, f.status, f.system, f.description ?? "", f.reportedBy ?? "", ts(f.resolvedAt), opt(f.resolution)]), "id", faults.map((f) => f.id))

const ops = live("operatorLogs")
add("operator_log", ["id", "occurred_at", "shift", "operator", "category", "entry", "linked_run_id"],
  ops.map((o) => [o.id, ts(o.timestamp), o.shift, o.operator ?? "", o.category, o.entry ?? "", opt(o.linkedRunId)]), "id", ops.map((o) => o.id))

const fw = live("firewallLogs")
add("firewall_log", ["id", "occurred_at", "action", "source_ip", "destination_ip", "port", "protocol", "rule", "description"],
  fw.map((f) => [f.id, ts(f.timestamp), f.action, f.sourceIp, f.destinationIp, f.port, f.protocol, f.rule, f.description ?? ""]), "id", fw.map((f) => f.id))

const imports = live("importHistory")
add("import_history", ["id", "filename", "imported_at", "actor", "rows_total", "rows_accepted", "rows_rejected"],
  imports.map((i) => [i.id, i.filename, ts(i.date), i.user ?? "", i.rowsTotal ?? 0, i.rowsAccepted ?? 0, i.rowsRejected ?? 0]), "id", imports.map((i) => i.id))

// ── Execution ───────────────────────────────────────────────────────────────
async function insertBatched(client, table, cols, rows) {
  const per = Math.max(1, Math.floor(60000 / cols.length))
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    const values = []
    const tuples = chunk.map((row, r) => `(${row.map((v, c) => { values.push(v); return `$${r * cols.length + c + 1}` }).join(",")})`)
    await client.query(`INSERT INTO ops.${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, values)
  }
}

const idDigest = (ids) => sha256([...ids].sort().join("\n"))

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, max: 1 })
const client = await pool.connect()
const report = { mode, source: { path: STATE_PATH, etag: snap.etag, sha256: snap.sha256, bytes: snap.bytes, version: state.version }, tables: {}, checks: [], quarantined: quarantine.length, orphanCourseSimClassKeys: orphanSimClass.length }
let ok = false
try {
  await client.query("BEGIN")
  await client.query("SET LOCAL statement_timeout = '120s'")
  await client.query("SELECT pg_advisory_xact_lock(hashtext('sim-roster-ops-migration'))")
  await client.query(await readFile(new URL("../../db/migrations/0001_ops_schema.up.sql", import.meta.url), "utf8"))

  for (const { table } of plan) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ops.${table}`)
    if (rows[0].n !== 0) throw new Error(`ops.${table} already contains ${rows[0].n} rows; refusing to double-load`)
  }

  const { rows: [run] } = await client.query(
    `INSERT INTO ops.migration_run (mode, source_path, source_etag, source_sha256, source_version, backup_path, status, executed_by)
     VALUES ($1,$2,$3,$4,$5,$6,'running',$7) RETURNING id`,
    [mode, STATE_PATH, snap.etag, snap.sha256, state.version ?? null, args.backup ?? null, actor],
  )

  for (const { table, cols, rows } of plan) await insertBatched(client, table, cols, rows)
  if (quarantine.length) {
    await insertBatched(client, "migration_quarantine", ["migration_run_id", "slice", "record_id", "reason", "payload"],
      quarantine.map((q) => [run.id, q.slice, q.record_id, q.reason, JSON.stringify(q.payload)]))
  }

  // Phase 5: record counts. Phase 6: id-set digests + deferred FK/unique checks.
  await client.query("SET CONSTRAINTS ALL IMMEDIATE")
  for (const { table, rows, idCol, sourceIds } of plan) {
    const { rows: [c] } = await client.query(`SELECT count(*)::int AS n FROM ops.${table}`)
    const entry = { expected: rows.length, actual: c.n, countOk: c.n === rows.length }
    if (idCol) {
      const { rows: idRows } = await client.query(`SELECT ${idCol} AS id FROM ops.${table}`)
      entry.idDigestOk = idDigest(idRows.map((r) => r.id)) === idDigest(sourceIds)
    }
    report.tables[table] = entry
    if (!entry.countOk || entry.idDigestOk === false) report.checks.push(`MISMATCH ops.${table}`)
  }

  // Source-to-target reconciliation for slices that fan out to child tables.
  const sumLen = (list, key) => list.reduce((n, r) => n + (r[key]?.length ?? 0), 0)
  const reconcile = [
    ["runs.requiredPositions", sumLen(runs, "requiredPositions"), "run_required_position"],
    ["exercises.requiredPositions", sumLen(exercises, "requiredPositions"), "exercise_required_position"],
    ["trainingSessions.positionIds", sumLen(sessions, "positionIds"), "training_session_position"],
  ]
  for (const [label, expected, table] of reconcile) {
    if (report.tables[table].actual !== expected) report.checks.push(`MISMATCH ${label}: ${expected} vs ops.${table}`)
  }
  const { rows: [{ n: invalidFks }] } = await client.query(
    `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'ops' AND NOT c.convalidated`,
  )
  if (invalidFks) report.checks.push(`${invalidFks} unvalidated constraints in ops`)

  ok = report.checks.length === 0
  await client.query(`UPDATE ops.migration_run SET finished_at = now(), counts = $2, status = $3 WHERE id = $1`, [
    run.id, JSON.stringify(Object.fromEntries(Object.entries(report.tables).map(([t, v]) => [t, v.actual]))), ok ? "verified" : "failed",
  ])

  if (mode === "commit" && ok) {
    await client.query("COMMIT")
    report.result = "COMMITTED"
  } else {
    await client.query("ROLLBACK")
    report.result = ok ? "VERIFIED (dry-run, rolled back — nothing persisted)" : "FAILED (rolled back — nothing persisted)"
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {})
  report.result = `ERROR (rolled back — nothing persisted): ${error.message}`
  ok = false
} finally {
  client.release()
  await pool.end()
}

console.table(Object.fromEntries(Object.entries(report.tables).map(([t, v]) => [t, { expected: v.expected, actual: v.actual, ids: v.idDigestOk ?? "-" }])))
console.log(JSON.stringify({ ...report, tables: undefined, totalRows: Object.values(report.tables).reduce((n, v) => n + v.actual, 0) }, null, 2))
process.exit(ok ? 0 : 1)
