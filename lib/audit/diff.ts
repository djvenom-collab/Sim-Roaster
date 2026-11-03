import type { AuditEventInput } from "./log"
import { stableStringify } from "./log"

type Row = Record<string, unknown>
type Snapshot = Record<string, unknown>

interface SliceConfig {
  entityType: string
  label?: (row: Row) => string | undefined
  ignoreFields?: string[]
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined)

const SLICES: Record<string, SliceConfig> = {
  staff: { entityType: "staff", label: (r) => str(r.initials) ?? [r.firstName, r.lastName].filter(Boolean).join(" ") },
  positions: { entityType: "position", label: (r) => str(r.code) },
  simulators: { entityType: "simulator", label: (r) => str(r.code) },
  exercises: { entityType: "exercise", label: (r) => str(r.code) },
  courses: { entityType: "course", label: (r) => str(r.code) },
  courseSimClass: { entityType: "course_sim_class" },
  exerciseQualRules: { entityType: "eligibility_rule" },
  qualifications: { entityType: "qualification", label: (r) => str(r.code) },
  assignments: { entityType: "assignment" },
  staffQualifications: { entityType: "staff_qualification" },
  users: { entityType: "user", label: (r) => str(r.email), ignoreFields: ["lastLogin"] },
  slotTimes: { entityType: "slot_time" },
  publicHolidays: { entityType: "public_holiday", label: (r) => str(r.name) },
  trainingGroups: { entityType: "training_group", label: (r) => str(r.name) },
  permissionMatrix: { entityType: "role_permissions" },
  runs: { entityType: "run", label: (r) => str(r.date) },
  runAssignments: { entityType: "seating" },
  leaveRecords: { entityType: "leave" },
  otherTasks: { entityType: "task", label: (r) => str(r.title) },
  trainingSessions: { entityType: "training_session", label: (r) => str(r.title) },
  trainingAttendance: { entityType: "training_attendance" },
  trainingLogs: { entityType: "training_log" },
  staffValidity: { entityType: "validity" },
  importHistory: { entityType: "import" },
  faultLogs: { entityType: "fault_log" },
  operatorLogs: { entityType: "operator_log" },
  firewallLogs: { entityType: "firewall_log" },
  adminLogs: { entityType: "admin_log" },
}

/** Client-only feeds and bookkeeping that carry no business change of their own. */
const IGNORED_SLICES = new Set(["version", "auditLogs", "notifications", "notifyDirty"])

/** Above this many row changes in one slice, a single summary event replaces per-row events. */
export const BULK_THRESHOLD = 250
const BULK_ID_SAMPLE = 200

function rowKey(row: Row, index: number): string {
  if (typeof row.id === "string" || typeof row.id === "number") return String(row.id)
  const idFields = Object.keys(row).filter((k) => k.endsWith("Id")).sort()
  if (idFields.length > 0) return idFields.map((k) => String(row[k] ?? "")).join(":")
  return `#${index}:${stableStringify(row).slice(0, 120)}`
}

function changedFields(prev: Row, next: Row, ignore: string[]) {
  const before: Row = {}
  const after: Row = {}
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (ignore.includes(key)) continue
    if (stableStringify(prev[key]) !== stableStringify(next[key])) {
      before[key] = prev[key] ?? null
      after[key] = next[key] ?? null
    }
  }
  return { before, after, keys: Object.keys(after) }
}

function updateEvents(type: string, id: string, label: string | undefined, prev: Row, next: Row, ignore: string[]): AuditEventInput[] {
  const { before, after, keys } = changedFields(prev, next, ignore)
  if (keys.length === 0) return []
  const base = { entityType: type, entityId: id, entityLabel: label }

  if (type === "user") {
    const events: AuditEventInput[] = []
    const rest = keys.filter((k) => k !== "role" && k !== "active")
    if ("role" in after) events.push({ ...base, action: "user.role_change", previousValue: { role: before.role }, newValue: { role: after.role } })
    if ("active" in after) events.push({ ...base, action: after.active ? "user.activate" : "user.deactivate", previousValue: { active: before.active }, newValue: { active: after.active } })
    if (rest.length > 0) events.push({ ...base, action: "user.update", previousValue: pick(before, rest), newValue: pick(after, rest) })
    return events
  }
  if (type === "run" && "status" in after) {
    const cancelled = after.status === "cancelled"
    return [{
      ...base,
      action: cancelled ? "run.cancel" : "run.status_change",
      previousValue: before,
      newValue: after,
      reason: str(next.cancellationReason) ?? null,
    }]
  }
  if (type === "seating" && "staffId" in after) {
    const action = before.staffId == null ? "seating.assign" : after.staffId == null ? "seating.unassign" : "seating.reassign"
    return [{ ...base, action, previousValue: before, newValue: after }]
  }
  if (type === "leave" && "status" in after) {
    const action = after.status === "approved" ? "leave.approve" : after.status === "rejected" ? "leave.reject" : "leave.status_change"
    return [{ ...base, action, previousValue: before, newValue: after }]
  }
  return [{ ...base, action: `${type}.update`, previousValue: before, newValue: after }]
}

function pick(row: Row, keys: string[]): Row {
  return Object.fromEntries(keys.map((k) => [k, row[k]]))
}

function diffArray(type: string, cfg: SliceConfig, prev: Row[], next: Row[]) {
  const ignore = cfg.ignoreFields ?? []
  const before = new Map(prev.map((r, i) => [rowKey(r, i), r]))
  const after = new Map(next.map((r, i) => [rowKey(r, i), r]))
  const events: AuditEventInput[] = []
  const ids = { created: [] as string[], updated: [] as string[], deleted: [] as string[] }

  for (const [id, row] of after) {
    const old = before.get(id)
    const label = cfg.label?.(row)
    if (!old) {
      ids.created.push(id)
      events.push({ action: `${type}.create`, entityType: type, entityId: id, entityLabel: label, newValue: row })
    } else {
      const updates = updateEvents(type, id, label, old, row, ignore)
      if (updates.length > 0) ids.updated.push(id)
      events.push(...updates)
    }
  }
  for (const [id, row] of before) {
    if (after.has(id)) continue
    ids.deleted.push(id)
    events.push({ action: `${type}.delete`, entityType: type, entityId: id, entityLabel: cfg.label?.(row), previousValue: row })
  }
  return { events, ids }
}

function diffRecord(type: string, prev: Row, next: Row) {
  const events: AuditEventInput[] = []
  const ids = { created: [] as string[], updated: [] as string[], deleted: [] as string[] }
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[key]
    const b = next[key]
    if (stableStringify(a) === stableStringify(b)) continue

    if (type === "role_permissions" && (Array.isArray(a) || Array.isArray(b))) {
      const was = new Set((a as string[] | undefined) ?? [])
      const now = new Set((b as string[] | undefined) ?? [])
      const granted = [...now].filter((p) => !was.has(p))
      const revoked = [...was].filter((p) => !now.has(p))
      ids.updated.push(key)
      if (granted.length) events.push({ action: "permission.grant", entityType: type, entityId: key, previousValue: null, newValue: { granted } })
      if (revoked.length) events.push({ action: "permission.revoke", entityType: type, entityId: key, previousValue: { revoked }, newValue: null })
      continue
    }
    const action = a === undefined ? "create" : b === undefined ? "delete" : "update"
    ids[action === "create" ? "created" : action === "delete" ? "deleted" : "updated"].push(key)
    events.push({ action: `${type}.${action}`, entityType: type, entityId: key, previousValue: a ?? null, newValue: b ?? null })
  }
  return { events, ids }
}

export interface StateDiff {
  events: AuditEventInput[]
  summary: Record<string, { created: number; updated: number; deleted: number }>
  changeCount: number
}

/** Translates a whole-snapshot overwrite into per-entity audit events. */
export function diffSnapshots(prev: Snapshot | null, next: Snapshot): StateDiff {
  const events: AuditEventInput[] = []
  const summary: StateDiff["summary"] = {}
  let changeCount = 0

  for (const slice of new Set([...Object.keys(prev ?? {}), ...Object.keys(next)])) {
    if (IGNORED_SLICES.has(slice)) continue
    const a = prev?.[slice]
    const b = next[slice]
    if (stableStringify(a) === stableStringify(b)) continue
    const cfg = SLICES[slice] ?? { entityType: slice }
    const type = cfg.entityType

    let result: { events: AuditEventInput[]; ids: { created: string[]; updated: string[]; deleted: string[] } }
    if (Array.isArray(a ?? []) && Array.isArray(b ?? [])) {
      result = diffArray(type, cfg, (a as Row[] | undefined) ?? [], (b as Row[] | undefined) ?? [])
    } else if (isObject(a ?? {}) && isObject(b ?? {})) {
      result = diffRecord(type, (a as Row | undefined) ?? {}, (b as Row | undefined) ?? {})
    } else {
      result = {
        events: [{ action: `${type}.update`, entityType: type, previousValue: a ?? null, newValue: b ?? null }],
        ids: { created: [], updated: [slice], deleted: [] },
      }
    }

    const { ids } = result
    const count = ids.created.length + ids.updated.length + ids.deleted.length
    if (count === 0) continue
    changeCount += count
    summary[type] = { created: ids.created.length, updated: ids.updated.length, deleted: ids.deleted.length }

    if (result.events.length > BULK_THRESHOLD) {
      events.push({
        action: `${type}.bulk_change`,
        entityType: type,
        reason: `${count} ${type} rows changed in one save; per-row values omitted above ${BULK_THRESHOLD}`,
        newValue: {
          ...summary[type],
          createdIds: ids.created.slice(0, BULK_ID_SAMPLE),
          updatedIds: ids.updated.slice(0, BULK_ID_SAMPLE),
          deletedIds: ids.deleted.slice(0, BULK_ID_SAMPLE),
        },
      })
    } else {
      events.push(...result.events)
    }
  }
  return { events, summary, changeCount }
}

function isObject(v: unknown): v is Row {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
