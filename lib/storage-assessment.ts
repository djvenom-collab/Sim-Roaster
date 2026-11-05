// Pure, aggregate-only snapshot profiler. Never return record contents, IDs,
// URLs, field values or arbitrary input keys in this report.
const ARRAY_SLICES = [
  "staff", "positions", "simulators", "exercises", "courses", "exerciseQualRules",
  "qualifications", "assignments", "staffQualifications", "users", "slotTimes",
  "publicHolidays", "trainingGroups", "runs", "runAssignments", "leaveRecords",
  "otherTasks", "trainingSessions", "trainingAttendance", "trainingLogs",
  "staffValidity", "auditLogs", "importHistory", "notifications", "faultLogs",
  "operatorLogs", "firewallLogs", "adminLogs",
] as const
const OBJECT_SLICES = ["courseSimClass", "permissionMatrix", "notifyDirty"] as const
const KNOWN = new Set<string>([...ARRAY_SLICES, ...OBJECT_SLICES, "version"])
type Row = Record<string, unknown>
const isRow = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v)

export function assessStorage(state: Record<string, unknown>) {
  const issues: { code: string; slice: string; count: number }[] = []
  const add = (code: string, slice: string, count: number) => { if (count) issues.push({ code, slice, count }) }
  const rows = (key: string): Row[] => Array.isArray(state[key]) ? state[key].filter(isRow) : []
  const slices: { name: string; records: number; bytes: number; present: boolean }[] = ARRAY_SLICES.map((name) => {
    const value = state[name]
    const records = rows(name)
    if (value !== undefined && !Array.isArray(value)) add("invalid_slice_shape", name, 1)
    if (Array.isArray(value)) add("invalid_rows", name, value.length - records.length)
    const seen = new Set<unknown>()
    let duplicates = 0
    for (const row of records) {
      if (typeof row.id !== "string" && typeof row.id !== "number") continue
      if (seen.has(row.id)) duplicates++
      seen.add(row.id)
    }
    add("duplicate_ids", name, duplicates)
    return { name, records: records.length, bytes: value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value)), present: value !== undefined }
  })
  for (const name of OBJECT_SLICES) {
    const value = state[name]
    if (value !== undefined && !isRow(value)) add("invalid_slice_shape", name, 1)
    slices.push({ name, records: isRow(value) ? Object.keys(value).length : 0, bytes: value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value)), present: value !== undefined })
  }
  add("unknown_top_level_slices", "snapshot", Object.keys(state).filter((key) => !KNOWN.has(key)).length)
  const ids = (slice: string) => new Set<unknown>(rows(slice).map((r) => r.id).filter((id) => typeof id === "string" || typeof id === "number"))
  const references = [
    ["runAssignments", "runId", "runs"], ["runAssignments", "positionId", "positions"], ["runAssignments", "staffId", "staff"],
    ["runs", "exerciseId", "exercises"], ["runs", "simulatorId", "simulators"],
    ["leaveRecords", "staffId", "staff"], ["trainingAttendance", "sessionId", "trainingSessions"], ["trainingAttendance", "staffId", "staff"],
    ["trainingLogs", "ojtiId", "staff"], ["trainingLogs", "traineeId", "staff"], ["trainingLogs", "groupId", "trainingGroups"],
    ["staffQualifications", "staffId", "staff"], ["staffQualifications", "qualificationId", "qualifications"],
    ["staffValidity", "staffId", "staff"], ["staffValidity", "positionId", "positions"], ["notifications", "staffId", "staff"],
  ]
  for (const [slice, field, target] of references) {
    const valid = ids(target)
    add(`orphan_${field}`, slice, rows(slice).filter((r) => r[field] != null && r[field] !== "" && !valid.has(r[field])).length)
  }
  for (const name of ARRAY_SLICES) {
    const fields = ["date", "startDate", "endDate", "joined", "expiry", "lastDateSat"]
    let invalid = 0
    for (const row of rows(name)) for (const field of fields) {
      const v = row[field]
      if (v == null || v === "") continue
      // Import dates may be full timestamps, unlike day-only scheduling dates.
      if (name === "importHistory" && field === "date") { if (typeof v !== "string" || !Number.isFinite(Date.parse(v))) invalid++; continue }
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) { invalid++; continue }
      const parsed = new Date(`${v}T00:00:00Z`)
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v) invalid++
    }
    add("invalid_calendar_dates", name, invalid)
  }
  const notifications = rows("notifications")
  const imports = rows("importHistory")
  // These are blockers in the legacy 0001 DDL/importer, not proof of data corruption.
  add("legacy_schema_rejects_in_app", "notifications", notifications.filter((r) => r.channel === "in_app").length)
  add("legacy_importer_drops_flagged", "notifications", notifications.filter((r) => r.flagged !== undefined).length)
  add("legacy_importer_drops_deletedAt", "notifications", notifications.filter((r) => r.deletedAt !== undefined).length)
  add("legacy_import_history_unmapped", "importHistory", imports.filter((r) => "summary" in r || "when" in r).length)
  return {
    snapshotVersion: typeof state.version === "number" && Number.isSafeInteger(state.version) ? state.version : null,
    slices,
    issues,
    legacyMigrationBlocked: issues.length > 0,
    limitations: [
      "Partial validation, not migration approval or complete schema coverage.",
      "No live database schema, file inventory, attachment availability or content parity checks.",
      "Missing optional slices and missing IDs require mapping review; not all natural keys or relations are checked.",
      "Legacy migration blockers describe the checked-in historical schema/importer, not the live database.",
    ],
  }
}
