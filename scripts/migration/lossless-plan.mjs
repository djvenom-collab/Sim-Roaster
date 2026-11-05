// Offline preparation only. No Blob, pg, environment credentials or writes.
import { createHash } from "node:crypto"

export const ACTIVE_NOTIFICATION_LIMIT = 500
const ARRAY_SLICES = ["staff", "positions", "simulators", "exercises", "courses", "exerciseQualRules", "qualifications", "assignments", "staffQualifications", "users", "slotTimes", "publicHolidays", "trainingGroups", "runs", "runAssignments", "leaveRecords", "otherTasks", "trainingSessions", "trainingAttendance", "trainingLogs", "staffValidity", "auditLogs", "importHistory", "notifications", "faultLogs", "operatorLogs", "firewallLogs", "adminLogs"]
const OBJECT_SLICES = ["courseSimClass", "permissionMatrix", "notifyDirty"]
const KNOWN = new Set([...ARRAY_SLICES, ...OBJECT_SLICES, "version"])
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v)

// Restrict inputs to real JSON. JSON.stringify must not silently drop fields,
// normalize NaN/undefined, evaluate getters or lose sparse array entries.
function assertJson(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (typeof value !== "object" || seen.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw Error("Input must be finite, acyclic JSON")
  seen.add(value)
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw Error("Sparse or extended arrays are not JSON")
    for (const v of value) assertJson(v, seen)
  } else {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (typeof key !== "string" || !descriptor.enumerable || !("value" in descriptor)) throw Error("Non-JSON object property")
      assertJson(descriptor.value, seen)
    }
  }
  seen.delete(value)
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
}
export function valueDigest(value) {
  assertJson(value)
  return createHash("sha256").update(canonical(value)).digest("hex")
}
function requireId(row) {
  if (!object(row) || typeof row.id !== "string" || !row.id) throw Error("Notification requires a stable string ID")
}
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error("Notification timestamp requires explicit timezone")
  const date = value.slice(0, 10)
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw Error("Invalid calendar date")
  return Date.parse(value)
}

export function mapNotification(row) {
  assertJson(row)
  requireId(row)
  if (!["in_app", "email", "sms", "copy"].includes(row.channel)) throw Error("Unknown notification channel")
  if (!["assignment", "weekly", "daily", "training", "custom"].includes(row.kind)) throw Error("Unknown notification kind")
  for (const key of ["staffId", "subject", "body", "to", "sentAt", "sentBy"]) if (typeof row[key] !== "string") throw Error("Missing notification field")
  instant(row.sentAt)
  for (const field of ["readAt", "deletedAt"]) if (field in row) instant(row[field])
  if (typeof row.simulated !== "boolean" || ("flagged" in row && typeof row.flagged !== "boolean")) throw Error("Invalid notification boolean")
  if ("attachments" in row && (!Array.isArray(row.attachments) || !row.attachments.every(object))) throw Error("Invalid attachment metadata")
  return {
    id: row.id, staff_id: row.staffId, channel: row.channel, kind: row.kind,
    subject: row.subject, body: row.body, recipient: row.to, sent_at: row.sentAt,
    sent_by: row.sentBy, simulated: row.simulated,
    read_at: row.readAt ?? null, flagged: row.flagged ?? null, deleted_at: row.deletedAt ?? null,
    // Preserve absent-vs-null/false, future fields and complete file references.
    source_payload: structuredClone(row), source_hash: valueDigest(row),
  }
}

export function mapImport(row, sourceIndex, snapshotHash) {
  assertJson(row)
  if (!object(row)) throw Error("Invalid import record")
  const legacy = "summary" in row || "when" in row
  if (legacy) {
    if (typeof row.summary !== "string" || typeof row.when !== "string" || "filename" in row) throw Error("Ambiguous legacy import")
    // Position + source digest is migration provenance, not a fabricated source ID.
    return { migration_key: `legacy:${snapshotHash}:${sourceIndex}`, source_id: null, format: "legacy", source_payload: structuredClone(row), source_hash: valueDigest(row) }
  }
  if (typeof row.id !== "string" || !row.id || typeof row.filename !== "string" || typeof row.date !== "string" || typeof row.user !== "string") throw Error("Invalid structured import")
  for (const key of ["rowsTotal", "rowsAccepted", "rowsRejected"]) if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw Error("Invalid import counts")
  if (row.rowsAccepted + row.rowsRejected !== row.rowsTotal) throw Error("Import counts do not reconcile")
  return { migration_key: `structured:${row.id}`, source_id: row.id, format: "structured", source_payload: structuredClone(row), source_hash: valueDigest(row) }
}

export function notificationRetentionPlan(notifications) {
  const seen = new Set()
  const ordered = notifications.map((row, index) => {
    const mapped = mapNotification(row)
    if (seen.has(row.id)) throw Error("Duplicate notification IDs")
    seen.add(row.id)
    return { mapped, index, timestamp: instant(row.sentAt) }
  }).sort((a, b) => b.timestamp - a.timestamp || a.index - b.index)
  // Global cap includes soft-deleted rows, matching the existing cap's scope.
  // Keep receipts/deletion state; no physical deletion, reset or attachment move.
  return { active: ordered.slice(0, ACTIVE_NOTIFICATION_LIMIT).map((v) => v.mapped), archived: ordered.slice(ACTIVE_NOTIFICATION_LIMIT).map((v) => v.mapped) }
}

export function prepareLosslessPlan(state) {
  assertJson(state)
  if (!object(state) || !Number.isSafeInteger(state.version)) throw Error("Snapshot version required")
  if (Object.keys(state).some((key) => !KNOWN.has(key))) throw Error("Unmapped top-level slice; review before migration")
  for (const key of ARRAY_SLICES) if (key in state && !Array.isArray(state[key])) throw Error("Invalid array slice")
  for (const key of OBJECT_SLICES) if (key in state && !object(state[key])) throw Error("Invalid object slice")
  const hash = valueDigest(state)
  const notifications = notificationRetentionPlan(state.notifications ?? [])
  const imports = (state.importHistory ?? []).map((row, i) => mapImport(row, i, hash))
  const importKeys = imports.map((row) => row.migration_key)
  if (new Set(importKeys).size !== importKeys.length) throw Error("Duplicate structured import IDs")
  // Evidence envelopes cover all slices, but are not a relational schema or
  // ready-to-run SQL plan. Every nested field survives exactly for later parity.
  const slices = Object.entries(state).map(([name, value]) => ({ name, source_payload: structuredClone(value), source_hash: valueDigest(value) }))
  return { format: 1, executionAllowed: false, source_hash: hash, slices, notifications, imports }
}

export function reconstructSource(plan) {
  const source = Object.fromEntries(plan.slices.map((slice) => {
    if (valueDigest(slice.source_payload) !== slice.source_hash) throw Error("Slice value mismatch")
    return [slice.name, structuredClone(slice.source_payload)]
  }))
  if (valueDigest(source) !== plan.source_hash) throw Error("Snapshot value mismatch")
  return source
}
