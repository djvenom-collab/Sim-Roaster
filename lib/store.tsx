"use client"

/* ===========================================================================
 * STORE — the app's central "brain" (all live data + every action)
 * ===========================================================================
 * Every page reads from and writes to this one place via the useStore() hook.
 * On startup it loads the sample data (lib/sample-data.ts) into React state;
 * from then on it holds the live, editable copy. When you add leave, fill a
 * seat, cancel a run, etc., a function in here updates the data and the whole
 * UI re-renders.
 *
 * HOW IT'S ORGANISED:
 *   1. StoreState (the interface below) — the catalogue of everything the
 *      store offers: the data arrays, lookup helpers (xById), the filtered
 *      "scoped" lists (limited to the active RADAR/TOWER view), and the action
 *      functions (addLeave, fillPositions, cancelRun, …).
 *   2. The Provider component — holds the actual state and implements every
 *      action. This is where the business rules live.
 *   3. useStore() — the hook pages call to read data or trigger actions.
 *
 * GOOD TO KNOW:
 *   - Data lives only in memory + the browser (localStorage for a few prefs
 *     like the active program and notifications). A refresh reloads the sample
 *     data; there is no backend database in this prototype.
 *   - The eligibility rules for "can this person sit here?" live in
 *     lib/assignment-eval.ts; this file calls into them.
 * =========================================================================== */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import * as seed from "./sample-data"
import type {
  Assignment,
  AuditAction,
  AuditLog,
  Course,
  Exercise,
  LeaveRecord,
  OtherTask,
  Position,
  PublicHoliday,
  Qualification,
  Role,
  RoleCode,
  Run,
  RunAssignment,
  RunStatus,
  NotificationRecord,
  Simulator,
  SlotTime,
  Staff,
  StaffQualification,
  StaffValidity,
  TrainingAttendance,
  TrainingLogEntry,
  TrainingSession,
  User,
  ValidityStatus,
  FaultLog,
  OperatorLog,
  FirewallLog,
  AdminLog,
} from "./types"
import type { TrainingGroup } from "./training-groups"
import { computeValidity, todayISO, addDaysISO } from "./dates"
import {
  DEFAULT_MATRIX,
  setPermissionMatrix,
  reconcilePermissionMatrix,
  type Permission,
} from "./permissions"
import {
  type ProgramView,
  matchesProgram,
  staffInProgram,
  assignmentInProgram,
  runInProgram,
  trainingInProgram,
} from "./program"
import {
  type YearRange,
  liveYearRange,
  liveYears as computeLiveYears,
  isArchivedYear,
  inYearRange,
  yearOfISO,
} from "./retention"
import {
  type PersistedState,
  SNAPSHOT_VERSION,
  dedupeExercises,
  backfillHistory,
  reseedGeneratedSchedule,
} from "./persisted-state"

// Per-viewer UI preference only (which program is in view). ALL real data now
// lives in a single durable Blob snapshot — see /api/state and the load/autosave
// effects below. That snapshot is the source of truth and survives rebuilds.
const ACTIVE_PROGRAM_KEY = "sim.activeProgram"
const YEAR_RANGE_KEY = "sim.yearRange"

interface StoreState {
  // current acting user / role
  currentRole: RoleCode
  setCurrentRole: (r: RoleCode) => void
  currentUser: User

  // active program scope (RADAR / TOWER / ALL)
  activeProgram: ProgramView
  setActiveProgram: (p: ProgramView) => void

  // data
  roles: Role[]
  staff: Staff[]
  users: User[]
  positions: Position[]
  simulators: Simulator[]
  exercises: Exercise[]
  courses: Course[]
  // course id -> which SIM bucket it lives in on the Exercises tree
  courseSimClass: Record<string, "operational" | "non-operational">
  setCourseSimClass: (courseId: string, cls: "operational" | "non-operational" | null) => void
  runs: Run[]
  runAssignments: RunAssignment[]
  leaveRecords: LeaveRecord[]
  otherTasks: OtherTask[]
  trainingSessions: TrainingSession[]
  trainingAttendance: TrainingAttendance[]
  trainingLogs: TrainingLogEntry[]
  qualifications: Qualification[]
  staffQualifications: StaffQualification[]
  staffValidity: StaffValidity[]
  assignments: Assignment[]
  positionQualRules: typeof seed.positionQualRules
  exerciseQualRules: typeof seed.exerciseQualRules
  publicHolidays: PublicHoliday[]
  slotTimes: SlotTime[]
  // Editable OJTI position groups used by the training log + OJT analytics.
  trainingGroups: TrainingGroup[]
  permissionMatrix: Record<RoleCode, Permission[]>
  auditLogs: AuditLog[]
  importHistory: typeof seed.importHistory
  notifications: NotificationRecord[]
  faultLogs: FaultLog[]
  operatorLogs: OperatorLog[]
  firewallLogs: FirewallLog[]
  adminLogs: AdminLog[]

  // program-scoped views (respect activeProgram; ALL = full list). These now
  // also exclude ARCHIVED (past-retention) years so no operational view shows
  // data older than the rolling 5-year window.
  scopedStaff: Staff[]
  scopedPositions: Position[]
  scopedSimulators: Simulator[]
  scopedExercises: Exercise[]
  scopedCourses: Course[]
  scopedRuns: Run[]
  scopedAssignments: Assignment[]
  scopedTrainingSessions: TrainingSession[]
  scopedLeaveRecords: LeaveRecord[]
  scopedOtherTasks: OtherTask[]

  // ── 5-year retention: global year slicer ────────────────────────────────
  // The active year range (inclusive) applied to the report* selectors below.
  // Defaults to the full live window; controlled by the top-bar year slicer.
  yearRange: YearRange
  setYearRange: (r: YearRange) => void
  liveYears: number[] // selectable years, oldest → newest (the live window)
  // Reporting/analytics views: program-scoped, archived-excluded AND filtered
  // to the active yearRange. Use these anywhere a year slicer should apply.
  reportRuns: Run[]
  reportRunAssignments: RunAssignment[]
  reportLeaveRecords: LeaveRecord[]
  reportTrainingSessions: TrainingSession[]
  reportTrainingLogs: TrainingLogEntry[]
  reportOtherTasks: OtherTask[]
  reportCourses: Course[]

  // ── Archive (admin-only) ────────────────────────────────────────────────
  archivedYears: number[] // years present in the store that are past retention
  archiveSummary: ArchiveYearSummary[] // per-archived-year record counts
  getArchive: (years: number[]) => ArchiveBundle // downloadable bundle

  // lookups
  staffById: (id: string | null) => Staff | undefined
  positionById: (id: string) => Position | undefined
  simulatorById: (id: string) => Simulator | undefined
  exerciseById: (id: string) => Exercise | undefined
  courseById: (id: string) => Course | undefined

  // derived
  validityFor: (staffId: string, positionId: string) => {
    expiry: string | null
    daysRemaining: number | null
    status: ValidityStatus
    lastDateSat: string | null
  }
  isOnLeave: (staffId: string, date: string) => LeaveRecord | undefined
  isInTraining: (staffId: string, date: string) => TrainingSession | undefined
  // The other-task (if any) keeping a staff member busy on a given date.
  otherTaskOn: (staffId: string, date: string) => OtherTask | undefined
  assignmentsForRun: (runId: string) => RunAssignment[]
  qualsForStaff: (staffId: string) => Qualification[]

  // mutations
  updateRunStatus: (runId: string, status: RunStatus, reason?: string) => void
  updateRun: (run: Run) => void
  addRun: (run: Run) => void
  deleteRun: (runId: string) => void
  assignStaff: (runId: string, positionId: string, staffId: string | null, override?: boolean, reason?: string) => void
  linkFlexiblePosition: (runId: string, positionId: string, linkedPositionId: string | null) => void
  setFlexibleTraining: (runId: string, positionId: string, training: boolean) => void
  fillPositions: (runIds: string[], allowOverride: boolean) => { filled: number; skipped: number }
  clearPositions: (runIds: string[]) => { cleared: number }
  addLeave: (lv: LeaveRecord) => void
  updateLeave: (lv: LeaveRecord) => void
  deleteLeave: (id: string) => void
  addOtherTask: (t: OtherTask) => void
  updateOtherTask: (t: OtherTask) => void
  deleteOtherTask: (id: string) => void
  addTraining: (t: TrainingSession, attendeeIds?: string[]) => void
  updateTraining: (t: TrainingSession, attendeeIds?: string[]) => void
  deleteTraining: (id: string) => void
  addTrainingLog: (entry: TrainingLogEntry) => void
  updateTrainingLog: (entry: TrainingLogEntry) => void
  deleteTrainingLog: (id: string) => void
  toggleAttendance: (sessionId: string, staffId: string) => void
  // admin CRUD
  addStaff: (s: Staff) => void
  updateStaff: (s: Staff) => void
  deleteStaff: (id: string) => void
  setStaffQualifications: (staffId: string, quals: { qualificationId: string; expiry?: string }[]) => void
  addExercise: (e: Exercise) => void
  updateExercise: (e: Exercise) => void
  deleteExercise: (id: string) => void
  addCourse: (c: Course) => void
  updateCourse: (c: Course) => void
  deleteCourse: (id: string) => void
  setExerciseQualRule: (
    exerciseId: string,
    patch: { requiredQuals?: string[]; preferredQuals?: string[]; excludedQuals?: string[] },
  ) => void
  addSimulator: (s: Simulator) => void
  updateSimulator: (s: Simulator) => void
  deleteSimulator: (id: string) => void
  addPosition: (p: Position) => void
  updatePosition: (p: Position) => void
  deletePosition: (id: string) => void
  addQualification: (q: Qualification) => void
  updateQualification: (q: Qualification) => void
  deleteQualification: (id: string) => void
  addAssignment: (a: Assignment) => void
  updateAssignment: (a: Assignment) => void
  deleteAssignment: (id: string) => void
  // users & roles
  addUser: (u: User) => void
  updateUser: (u: User) => void
  deleteUser: (id: string) => void
  // permission matrix
  togglePermission: (role: RoleCode, perm: Permission) => void
  resetPermissions: () => void
  // slot times
  addSlotTime: (s: SlotTime) => void
  updateSlotTime: (s: SlotTime) => void
  deleteSlotTime: (id: string) => void
  // public holidays
  addPublicHoliday: (h: PublicHoliday) => void
  updatePublicHoliday: (h: PublicHoliday) => void
  deletePublicHoliday: (id: string) => void
  addTrainingGroup: (g: TrainingGroup) => void
  updateTrainingGroup: (g: TrainingGroup) => void
  deleteTrainingGroup: (id: string) => void
  log: (action: AuditAction, detail: string) => void
  logImport: (summary: string) => void
  // notifications
  recordNotification: (n: Omit<NotificationRecord, "id" | "sentAt" | "sentBy">) => NotificationRecord
  notificationsForStaff: (staffId: string) => NotificationRecord[]
  // Marks a notification as opened/read by its recipient (first open wins).
  markNotificationRead: (id: string) => void
  // notify-dirty tracking: flags a run/training whose schedule changed since the
  // affected people were last notified. Key format: `run:<id>` / `training:<id>`.
  markNotifyDirty: (key: string) => void
  markNotified: (key: string) => void
  needsNotify: (key: string) => boolean
}

// A downloadable bundle of archived (past-retention) records for one or more years.
export interface ArchiveBundle {
  years: number[]
  runs: Run[]
  runAssignments: RunAssignment[]
  leaveRecords: LeaveRecord[]
  trainingSessions: TrainingSession[]
  trainingAttendance: TrainingAttendance[]
  otherTasks: OtherTask[]
}

export interface ArchiveYearSummary {
  year: number
  runs: number
  leave: number
  training: number
  tasks: number
  total: number
}

const StoreCtx = createContext<StoreState | null>(null)

const EMPTY_ASSIGNMENTS: RunAssignment[] = []
const EMPTY_QUALS: Qualification[] = []

export function StoreProvider({
  children,
  initialRole,
  authName,
  authEmail,
}: {
  children: ReactNode
  // The role of the signed-in account. Drives the whole permission system.
  initialRole?: RoleCode
  // The signed-in account's identity, shown in the top bar.
  authName?: string
  authEmail?: string
}) {
  const [currentRole, setCurrentRole] = useState<RoleCode>(initialRole ?? "Admin")
  const [activeProgram, setActiveProgramState] = useState<ProgramView>("ALL")
  // Flips true once the Blob snapshot has been loaded (or confirmed empty). The
  // autosave effect stays idle until then so it can never overwrite saved data
  // with the seed during the initial load.
  const hydratedRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  // Only allow saving once we've SAFELY established the snapshot state (loaded an
  // existing one, or confirmed the store is empty). If the load errors, we stay
  // read-only for the session rather than risk clobbering good data on Blob.
  const canSaveRef = useRef(false)

  // Hydrate the persisted program scope on the client (avoids SSR mismatch).
  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_PROGRAM_KEY) : null
    if (stored === "RADAR" || stored === "TOWER" || stored === "ALL") setActiveProgramState(stored)
  }, [])

  // Hydrate the persisted year-range slicer on the client. Clamped to the live
  // window below so a stale saved range can never point at archived/future years.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(YEAR_RANGE_KEY) : null
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as { start?: unknown; end?: unknown }
      if (typeof parsed.start === "number" && typeof parsed.end === "number") {
        setYearRange({ start: parsed.start, end: parsed.end })
      }
    } catch {
      /* ignore malformed value */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Assign a course to a SIM bucket (or pass null to unassign it back to the
  // pickable course list). The snapshot autosave persists this automatically.
  const setCourseSimClass = useCallback(
    (courseId: string, cls: "operational" | "non-operational" | null) => {
      setCourseSimClassState((prev) => {
        const next = { ...prev }
        if (cls === null) delete next[courseId]
        else next[courseId] = cls
        return next
      })
    },
    [],
  )

  const setActiveProgram = useCallback((p: ProgramView) => {
    setActiveProgramState(p)
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_PROGRAM_KEY, p)
  }, [])

  // Global year slicer (view-only; not persisted to the data snapshot). Defaults
  // to the full live retention window. The setter clamps to the live years so
  // the slicer can never select an archived or future year.
  const liveYears = useMemo(() => computeLiveYears(), [])
  const [yearRange, setYearRangeState] = useState<YearRange>(() => liveYearRange())
  const setYearRange = useCallback(
    (r: YearRange) => {
      const lo = liveYears[0]
      const hi = liveYears[liveYears.length - 1]
      const start = Math.min(Math.max(r.start, lo), hi)
      const end = Math.min(Math.max(r.end, lo), hi)
      const next = start <= end ? { start, end } : { start: end, end: start }
      setYearRangeState(next)
      // Persist so the slicer survives reloads/navigation like the program scope.
      if (typeof window !== "undefined") window.localStorage.setItem(YEAR_RANGE_KEY, JSON.stringify(next))
    },
    [liveYears],
  )

  const [staffData, setStaffData] = useState<Staff[]>(seed.staff)
  const [positionsData, setPositionsData] = useState<Position[]>(seed.positions)
  const [simulatorsData, setSimulatorsData] = useState<Simulator[]>(seed.simulators)
  const [exercisesData, setExercisesData] = useState<Exercise[]>(seed.exercises)
  const [coursesData, setCoursesData] = useState<Course[]>(seed.courses)
  const [courseSimClass, setCourseSimClassState] = useState<Record<string, "operational" | "non-operational">>(
    seed.courseSimClass,
  )
  const [exerciseQualRulesData, setExerciseQualRulesData] = useState<typeof seed.exerciseQualRules>(
    seed.exerciseQualRules,
  )
  const [qualificationsData, setQualificationsData] = useState<Qualification[]>(seed.qualifications)
  const [assignmentsData, setAssignmentsData] = useState<Assignment[]>(seed.assignments)
  const [staffQualificationsData, setStaffQualificationsData] = useState<StaffQualification[]>(seed.staffQualifications)
  const [users, setUsers] = useState<User[]>(seed.users)
  const [slotTimesData, setSlotTimesData] = useState<SlotTime[]>(seed.slotTimes)
  const [publicHolidaysData, setPublicHolidaysData] = useState<PublicHoliday[]>(seed.publicHolidays)
  const [trainingGroupsData, setTrainingGroupsData] = useState<TrainingGroup[]>(seed.trainingGroups)
  const [permissionMatrix, setPermissionMatrixState] = useState<Record<RoleCode, Permission[]>>(() => ({
    SP: [...DEFAULT_MATRIX.SP],
    SUP: [...DEFAULT_MATRIX.SUP],
    SOO: [...DEFAULT_MATRIX.SOO],
    STO: [...DEFAULT_MATRIX.STO],
    TL: [...DEFAULT_MATRIX.TL],
    Admin: [...DEFAULT_MATRIX.Admin],
  }))
  const [runs, setRuns] = useState<Run[]>(seed.runs)
  const [runAssignments, setRunAssignments] = useState<RunAssignment[]>(seed.runAssignments)
  const [leaveRecords, setLeaveRecords] = useState<LeaveRecord[]>(seed.leaveRecords)
  const [otherTasksData, setOtherTasksData] = useState<OtherTask[]>(seed.otherTasks)
  const [trainingSessions, setTrainingSessions] = useState<TrainingSession[]>(seed.trainingSessions)
  const [trainingAttendance, setTrainingAttendance] = useState<TrainingAttendance[]>(seed.trainingAttendance)
  const [trainingLogs, setTrainingLogs] = useState<TrainingLogEntry[]>(seed.trainingLogs)
  const [staffValidity, setStaffValidity] = useState<StaffValidity[]>(seed.staffValidity)

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(seed.auditLogs)
  const [importHistory, setImportHistory] = useState(seed.importHistory)
  const [notifications, setNotifications] = useState<NotificationRecord[]>(seed.notifications)
  const [notifyDirty, setNotifyDirty] = useState<Record<string, { changedAt: string; notifiedAt?: string }>>({})
  const [faultLogs, setFaultLogs] = useState<FaultLog[]>(seed.faultLogs)
  const [operatorLogs, setOperatorLogs] = useState<OperatorLog[]>(seed.operatorLogs)
  const [firewallLogs, setFirewallLogs] = useState<FirewallLog[]>(seed.firewallLogs)
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>(seed.adminLogs)

  // ── Durable snapshot: LOAD ────────────────────────────────────────────────
  // On mount, pull the single JSON snapshot from Blob (via /api/state) and apply
  // every saved slice over the seed. Seed-once: if no snapshot exists yet we keep
  // the seed and let the autosave create the first snapshot. If the load errors,
  // we stay read-only for the session so we never clobber good saved data.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" })
        const json = (await res.json()) as { state: Partial<PersistedState> | null; error?: string }
        if (cancelled) return
        const snap = json?.state
        if (snap && (snap as { __autonoma?: boolean }).__autonoma === true) {
          // ── AUTONOMA test-run snapshot ────────────────────────────────────
          // An isolated per-run snapshot (lib/autonoma/run-store.ts). Apply it
          // VERBATIM: no dedupe / version-reseed / history-backfill, which would
          // otherwise inject demo + multi-year data and bury the clean scenario.
          // Reference/config slices are pre-seeded into the run blob, so "apply
          // if present, else keep seed default" gives seed + factory additions.
          // Transactional slices apply if present, else reset EMPTY so a run
          // shows exactly what its factories seeded (a clean slate).
          const arr = <T,>(v: unknown): T[] | null => (Array.isArray(v) ? (v as T[]) : null)
          // reference / config (keep the seed default when absent)
          if (arr(snap.positions)) setPositionsData(snap.positions!)
          if (arr(snap.simulators)) setSimulatorsData(snap.simulators!)
          if (arr(snap.exercises)) setExercisesData(snap.exercises!)
          if (arr(snap.courses)) setCoursesData(snap.courses!)
          if (snap.courseSimClass && typeof snap.courseSimClass === "object")
            setCourseSimClassState(snap.courseSimClass)
          if (arr(snap.exerciseQualRules)) setExerciseQualRulesData(snap.exerciseQualRules!)
          if (arr(snap.qualifications)) setQualificationsData(snap.qualifications!)
          if (arr(snap.slotTimes)) setSlotTimesData(snap.slotTimes!)
          if (arr(snap.publicHolidays)) setPublicHolidaysData(snap.publicHolidays!)
          if (arr(snap.trainingGroups)) setTrainingGroupsData(snap.trainingGroups!)
          if (snap.permissionMatrix && typeof snap.permissionMatrix === "object") {
            const reconciled = reconcilePermissionMatrix(snap.permissionMatrix)
            setPermissionMatrixState(reconciled)
            setPermissionMatrix(reconciled)
          }
          // transactional / entity (empty when absent — clean per-run slate)
          setStaffData(arr<Staff>(snap.staff) ?? [])
          setUsers(arr<User>(snap.users) ?? [])
          setAssignmentsData(arr<Assignment>(snap.assignments) ?? [])
          setStaffQualificationsData(arr<StaffQualification>(snap.staffQualifications) ?? [])
          setRuns(arr<Run>(snap.runs) ?? [])
          setRunAssignments(arr<RunAssignment>(snap.runAssignments) ?? [])
          setLeaveRecords(arr<LeaveRecord>(snap.leaveRecords) ?? [])
          setOtherTasksData(arr<OtherTask>(snap.otherTasks) ?? [])
          setTrainingSessions(arr<TrainingSession>(snap.trainingSessions) ?? [])
          setTrainingAttendance(arr<TrainingAttendance>(snap.trainingAttendance) ?? [])
          setTrainingLogs(arr<TrainingLogEntry>(snap.trainingLogs) ?? [])
          setStaffValidity(arr<StaffValidity>(snap.staffValidity) ?? [])
          setAuditLogs(arr<AuditLog>(snap.auditLogs) ?? [])
          setImportHistory(arr(snap.importHistory) ?? [])
          setNotifications(arr<NotificationRecord>(snap.notifications) ?? [])
          setFaultLogs(arr<FaultLog>(snap.faultLogs) ?? [])
          setOperatorLogs(arr<OperatorLog>(snap.operatorLogs) ?? [])
          setFirewallLogs(arr<FirewallLog>(snap.firewallLogs) ?? [])
          setAdminLogs(arr<AdminLog>(snap.adminLogs) ?? [])
          if (snap.notifyDirty && typeof snap.notifyDirty === "object") setNotifyDirty(snap.notifyDirty)
          canSaveRef.current = true
        } else if (snap && typeof snap === "object") {
          // Apply each slice only if present, so newly-added slices in a later
          // version simply fall back to the seed instead of wiping anything.
          if (Array.isArray(snap.staff) && snap.staff.length) setStaffData(snap.staff)
          if (Array.isArray(snap.positions)) {
            // Guarantee the spare flex positions (2 per program) exist even for
            // older snapshots saved before they were introduced. Idempotent:
            // append only the ones whose stable id is missing, preserving any
            // user edits to ones already present.
            const have = new Set(snap.positions.map((p) => p.id))
            const missing = seed.flexPositions.filter((p) => !have.has(p.id))
            setPositionsData(missing.length ? [...snap.positions, ...missing] : snap.positions)
          }
          if (Array.isArray(snap.simulators)) setSimulatorsData(snap.simulators)
          // Exercises + everything that references them: collapse duplicate-named
          // exercises from older snapshots into one survivor and remap all course
          // exerciseIds, run exerciseIds, and qual rules. Idempotent, so clean
          // snapshots pass through untouched. `nextRuns` carries the post-dedupe
          // runs into the history-backfill step below.
          let nextRuns = Array.isArray(snap.runs) ? snap.runs : runs
          if (Array.isArray(snap.exercises)) {
            const deduped = dedupeExercises(
              snap.exercises,
              Array.isArray(snap.courses) ? snap.courses : coursesData,
              nextRuns,
              Array.isArray(snap.exerciseQualRules) ? snap.exerciseQualRules : exerciseQualRulesData,
            )
            setExercisesData(deduped.exercises)
            setCoursesData(deduped.courses)
            nextRuns = deduped.runs
            setExerciseQualRulesData(deduped.exerciseQualRules)
          } else {
            if (Array.isArray(snap.courses)) setCoursesData(snap.courses)
            if (Array.isArray(snap.exerciseQualRules)) setExerciseQualRulesData(snap.exerciseQualRules)
          }
          if (snap.courseSimClass && typeof snap.courseSimClass === "object") setCourseSimClassState(snap.courseSimClass)
          if (Array.isArray(snap.qualifications)) setQualificationsData(snap.qualifications)
          if (Array.isArray(snap.assignments)) setAssignmentsData(snap.assignments)
          if (Array.isArray(snap.staffQualifications)) setStaffQualificationsData(snap.staffQualifications)
          if (Array.isArray(snap.users) && snap.users.length) setUsers(snap.users)
          if (Array.isArray(snap.slotTimes)) setSlotTimesData(snap.slotTimes)
          if (Array.isArray(snap.publicHolidays)) setPublicHolidaysData(snap.publicHolidays)
          // New optional slice: older snapshots lack it and keep the seed groups.
          // Migration: earlier snapshots labelled these "Group N" — rename any
          // leading "Group" to "Pool" so persisted state matches the new wording.
          if (Array.isArray(snap.trainingGroups))
            setTrainingGroupsData(
              snap.trainingGroups.map((g: TrainingGroup) => ({
                ...g,
                label: g.label.replace(/^Group(\b|\s)/, "Pool$1"),
              })),
            )
          if (snap.permissionMatrix && typeof snap.permissionMatrix === "object") {
            // Reconcile against the current permission set so older snapshots
            // don't lock out newly-added permissions (Admin always gets all;
            // brand-new keys are granted per DEFAULT_MATRIX).
            const reconciled = reconcilePermissionMatrix(snap.permissionMatrix)
            setPermissionMatrixState(reconciled)
            setPermissionMatrix(reconciled)
          }
          // v2 migration: a pre-v2 snapshot holds the old flat-volume schedule
          // (and its stale currency/conflicts). Re-seed the fully-generated demo
          // scheduling slices so the seasonal volume curve and the reduced
          // conflict / currency-warning counts take effect. The autosave then
          // rewrites the snapshot at the current version, so this runs once.
          const needsScheduleReseed =
            typeof snap.version !== "number" || snap.version < SNAPSHOT_VERSION
          if (needsScheduleReseed) {
            const rs = reseedGeneratedSchedule()
            setRuns(rs.runs)
            setRunAssignments(rs.runAssignments)
            setLeaveRecords(rs.leaveRecords)
            setOtherTasksData(rs.otherTasks)
            setTrainingSessions(rs.trainingSessions)
            setTrainingAttendance(rs.trainingAttendance)
            setStaffValidity(rs.staffValidity)
            // v3: also replace the structural slices reworked in this version so
            // the quarterly schedule, the validation-vs-normal course split, and
            // the pre-assigned SIM buckets override any pre-v3 saved structure.
            // These run AFTER the snapshot's exercises/courses/courseSimClass
            // were applied above, so the seed values win on a version bump.
            setExercisesData(rs.exercises)
            setCoursesData(rs.courses)
            setCourseSimClassState(rs.courseSimClass)
            setExerciseQualRulesData(rs.exerciseQualRules)
            // v5: replace the multi-year reference/log tables too, so pre-v5
            // snapshots (single-year holidays/audit/import, empty notifications)
            // pick up the full-coverage data. Set here so they win over the
            // snapshot values applied above.
            setPublicHolidaysData(rs.publicHolidays)
            setAuditLogs(rs.auditLogs)
            setImportHistory(rs.importHistory)
            setNotifications(rs.notifications)
            // v8: replace the OJTI training log and staff qualifications so the
            // corrected seed (every instructor OJTI-qualified, every trainee with
            // full per-group hours) wins over a pre-v8 snapshot. Set here so they
            // override the snapshot values applied above and below.
            setTrainingLogs(rs.trainingLogs)
            setStaffQualificationsData(rs.staffQualifications)
            // v7: the SOO/STO roles were added along with a couple of seeded
            // users for each. Users are otherwise preserved across versions, so
            // MERGE IN only the seeded users that a pre-v7 snapshot is missing
            // (matched by id) — this surfaces the new roles without clobbering
            // any users an admin created or edited.
            setUsers((prev) => {
              const have = new Set(prev.map((u) => u.id))
              const missing = seed.users.filter((u) => !have.has(u.id))
              return missing.length ? [...prev, ...missing] : prev
            })
          } else {
            // 5-year history backfill: inject the multi-year historical records
            // into a snapshot that only had current-year data. Runs and every
            // slice that tracks them flow through together so references stay
            // intact. Idempotent — clean snapshots are untouched.
            const bf = backfillHistory(
              nextRuns,
              Array.isArray(snap.runAssignments) ? snap.runAssignments : runAssignments,
              Array.isArray(snap.leaveRecords) ? snap.leaveRecords : leaveRecords,
              Array.isArray(snap.trainingSessions) ? snap.trainingSessions : trainingSessions,
              Array.isArray(snap.trainingAttendance) ? snap.trainingAttendance : trainingAttendance,
              Array.isArray(snap.otherTasks) ? snap.otherTasks : otherTasksData,
            )
            setRuns(bf.runs)
            setRunAssignments(bf.runAssignments)
            setLeaveRecords(bf.leaveRecords)
            setTrainingSessions(bf.trainingSessions)
            setTrainingAttendance(bf.trainingAttendance)
            setOtherTasksData(bf.otherTasks)
            if (Array.isArray(snap.staffValidity)) setStaffValidity(snap.staffValidity)
          }
          // Apply the snapshot's audit/import/notifications ONLY when we did not
          // just reseed — on a version bump the reseed above provides the fresh
          // full-coverage tables and must not be clobbered by the old snapshot.
          if (!needsScheduleReseed) {
            if (Array.isArray(snap.auditLogs)) setAuditLogs(snap.auditLogs)
            if (Array.isArray(snap.importHistory)) setImportHistory(snap.importHistory)
            if (Array.isArray(snap.notifications)) setNotifications(snap.notifications)
          }
          // On a v8 reseed the fresh training logs are set above and must not be
          // clobbered by the old snapshot; otherwise apply the saved logs.
          if (!needsScheduleReseed && Array.isArray(snap.trainingLogs)) setTrainingLogs(snap.trainingLogs)
          if (Array.isArray(snap.faultLogs)) setFaultLogs(snap.faultLogs)
          if (Array.isArray(snap.operatorLogs)) setOperatorLogs(snap.operatorLogs)
          if (Array.isArray(snap.firewallLogs)) setFirewallLogs(snap.firewallLogs)
          if (Array.isArray(snap.adminLogs)) setAdminLogs(snap.adminLogs)
          if (snap.notifyDirty && typeof snap.notifyDirty === "object") setNotifyDirty(snap.notifyDirty)
          canSaveRef.current = true
        } else if (!json?.error) {
          // Clean "no snapshot yet" → safe to seed + create the first snapshot.
          canSaveRef.current = true
        } else {
          console.error("[v0] snapshot load returned error; staying read-only this session")
        }
      } catch (e) {
        console.error("[v0] snapshot load failed; staying read-only this session", e)
      } finally {
        if (!cancelled) {
          hydratedRef.current = true
          setHydrated(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Durable snapshot: SAVE ────────────────────────────────────────────────
  // Any change to any persisted slice schedules a debounced write of the WHOLE
  // snapshot to Blob. Because every mutation already flows through these state
  // setters, this single effect captures every edit on every page — no per-page
  // wiring needed. Idle until hydration is done and saving is deemed safe.
  useEffect(() => {
    if (!hydrated || !hydratedRef.current || !canSaveRef.current) return
    const snapshot: PersistedState = {
      version: SNAPSHOT_VERSION,
      staff: staffData,
      positions: positionsData,
      simulators: simulatorsData,
      exercises: exercisesData,
      courses: coursesData,
      courseSimClass,
      exerciseQualRules: exerciseQualRulesData,
      qualifications: qualificationsData,
      assignments: assignmentsData,
      staffQualifications: staffQualificationsData,
      users,
      slotTimes: slotTimesData,
      publicHolidays: publicHolidaysData,
      trainingGroups: trainingGroupsData,
      permissionMatrix,
      runs,
      runAssignments,
      leaveRecords,
      otherTasks: otherTasksData,
      trainingSessions,
      trainingAttendance,
      trainingLogs,
      staffValidity,
      auditLogs,
      importHistory,
      notifications,
      notifyDirty,
      faultLogs,
      operatorLogs,
      firewallLogs,
      adminLogs,
    }
    const id = setTimeout(() => {
      // NOTE: no `keepalive` — the snapshot can exceed the 64KB keepalive body
      // limit, which throws "Failed to fetch". Debounced saves cover every edit.
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      }).catch((e) => console.error("[v0] snapshot save failed", e))
    }, 800)
    return () => clearTimeout(id)
  }, [
    hydrated,
    staffData,
    positionsData,
    simulatorsData,
    exercisesData,
    coursesData,
    courseSimClass,
    exerciseQualRulesData,
    qualificationsData,
    assignmentsData,
    staffQualificationsData,
    users,
    slotTimesData,
    publicHolidaysData,
    trainingGroupsData,
    permissionMatrix,
    runs,
    runAssignments,
    leaveRecords,
    otherTasksData,
    trainingSessions,
    trainingAttendance,
    trainingLogs,
    staffValidity,
    auditLogs,
    importHistory,
    notifications,
    faultLogs,
    operatorLogs,
    firewallLogs,
    adminLogs,
    notifyDirty,
  ])

  // ── O(1) lookup maps ──────────────────────────────────────────────────
  const staffMap = useMemo(() => new Map(staffData.map((s) => [s.id, s])), [staffData])
  const positionMap = useMemo(() => new Map(positionsData.map((p) => [p.id, p])), [positionsData])
  const simulatorMap = useMemo(() => new Map(simulatorsData.map((s) => [s.id, s])), [simulatorsData])
  const exerciseMap = useMemo(() => new Map(exercisesData.map((e) => [e.id, e])), [exercisesData])
  const courseMap = useMemo(() => new Map(coursesData.map((c) => [c.id, c])), [coursesData])

  // assignments grouped by runId — rebuilt only when assignments change
  const assignmentsByRun = useMemo(() => {
    const m = new Map<string, RunAssignment[]>()
    for (const a of runAssignments) {
      const arr = m.get(a.runId)
      if (arr) arr.push(a)
      else m.set(a.runId, [a])
    }
    return m
  }, [runAssignments])

  // Authoritative "last date sat" per staff+position, derived from the ACTUAL
  // completed runs (on or before today). Because validity, Run History, the
  // seating plan and every dashboard all read from this same runAssignments +
  // runs source, a person's currency can never disagree with their run history.
  const lastSatMap = useMemo(() => {
    const today = todayISO()
    const m = new Map<string, string>() // `${staffId}:${positionId}` -> most recent completed run date
    const credit = (staffId: string, positionId: string, date: string) => {
      const key = `${staffId}:${positionId}`
      const prev = m.get(key)
      if (!prev || date > prev) m.set(key, date)
    }
    for (const a of runAssignments) {
      if (!a.staffId) continue
      const run = runs.find((r) => r.id === a.runId)
      if (!run || run.status !== "completed" || run.date > today) continue
      // A flexible seat flagged as training records NO currency — the occupant
      // is a trainee, so the shift does not count toward validity anywhere.
      if (a.trainingMode) continue
      // Credit the seat's own position.
      credit(a.staffId, a.positionId, run.date)
      // A flexible support seat linked to a primary position ALSO refreshes the
      // person's currency on that primary — a support shift counts toward the
      // linked position's validity exactly as if they had sat it directly.
      if (a.linkedPositionId && a.linkedPositionId !== a.positionId) {
        credit(a.staffId, a.linkedPositionId, run.date)
      }
    }
    return m
  }, [runAssignments, runs])

  // validity keyed by `${staffId}:${positionId}`
  const validityMap = useMemo(() => {
    const m = new Map<string, StaffValidity>()
    for (const v of staffValidity) {
      // "Last date sat" is ALWAYS the real most-recent completed run for that
      // staff+position. If there is no such run, it is genuinely null ("never
      // sat") — we never fabricate a date, so the Validity tab can never show a
      // date that isn't backed by an actual entry in Run History.
      const derived = lastSatMap.get(`${v.staffId}:${v.positionId}`) ?? null
      m.set(`${v.staffId}:${v.positionId}`, { ...v, lastDateSat: derived })
    }
    // Every operational (home) position a person holds should carry a validity
    // record, including positions added by editing a profile. Their currency is
    // derived from real runs too — null (never sat) when there is no run history.
    for (const s of staffData) {
      for (const posId of s.homePositions) {
        const key = `${s.id}:${posId}`
        if (m.has(key)) continue
        const p = positionMap.get(posId)
        if (!p) continue
        m.set(key, { staffId: s.id, positionId: posId, lastDateSat: lastSatMap.get(key) ?? null, validityDays: p.validityDays })
      }
    }
    return m
  }, [staffValidity, staffData, positionMap, lastSatMap])

  // staff qualifications grouped by staffId (live state)
  const qualsByStaff = useMemo(() => {
    const m = new Map<string, Qualification[]>()
    const qMap = new Map(qualificationsData.map((q) => [q.id, q]))
    for (const sq of staffQualificationsData) {
      const q = qMap.get(sq.qualificationId)
      if (!q) continue
      const arr = m.get(sq.staffId)
      if (arr) arr.push(q)
      else m.set(sq.staffId, [q])
    }
    return m
  }, [qualificationsData, staffQualificationsData])

  const currentUser = useMemo(() => {
    const base = users.find((u) => u.role === currentRole) ?? users[0]
    // When signed in via Better Auth, show that account's real identity while
    // keeping the role-derived permissions/user record as the base.
    if (authName || authEmail) {
      return {
        ...base,
        name: authName ?? base.name,
        email: authEmail ?? base.email,
        role: currentRole,
      }
    }
    return base
  }, [users, currentRole, authName, authEmail])

  const staffById = useCallback((id: string | null) => (id ? staffMap.get(id) : undefined), [staffMap])
  const positionById = useCallback((id: string) => positionMap.get(id), [positionMap])
  const simulatorById = useCallback((id: string) => simulatorMap.get(id), [simulatorMap])
  const exerciseById = useCallback((id: string) => exerciseMap.get(id), [exerciseMap])
  const courseById = useCallback((id: string) => courseMap.get(id), [courseMap])

  // ── Retention: live (non-archived) data ───────────────────────────────
  // Everything OLDER than the rolling 5-year window is excluded here so no
  // normal view ever surfaces archived data (it is reachable only via the
  // admin archive). Internal currency derivations above intentionally keep the
  // FULL history so a person's "last date sat" stays correct.
  const liveRuns = useMemo(() => runs.filter((r) => !isArchivedYear(yearOfISO(r.date))), [runs])
  const liveRunIds = useMemo(() => new Set(liveRuns.map((r) => r.id)), [liveRuns])
  const liveRunAssignments = useMemo(
    () => runAssignments.filter((a) => liveRunIds.has(a.runId)),
    [runAssignments, liveRunIds],
  )
  const liveLeaveRecords = useMemo(
    () => leaveRecords.filter((l) => !isArchivedYear(yearOfISO(l.startDate))),
    [leaveRecords],
  )
  const liveTrainingSessions = useMemo(
    () => trainingSessions.filter((t) => !isArchivedYear(yearOfISO(t.date))),
    [trainingSessions],
  )
  const liveSessionIds = useMemo(() => new Set(liveTrainingSessions.map((t) => t.id)), [liveTrainingSessions])
  const liveTrainingAttendance = useMemo(
    () => trainingAttendance.filter((a) => liveSessionIds.has(a.sessionId)),
    [trainingAttendance, liveSessionIds],
  )
  const liveOtherTasks = useMemo(
    () => otherTasksData.filter((t) => !isArchivedYear(yearOfISO(t.startDate))),
    [otherTasksData],
  )

  // ── Program-scoped views ──────────────────────────────────────────────
  // Each respects activeProgram AND excludes archived years (they derive from
  // the live* arrays above); ALL returns the full live list. Lookups and
  // mutations stay unscoped so cross-program references still resolve.
  const scopedStaff = useMemo(
    () => staffData.filter((s) => staffInProgram(s, activeProgram)),
    [staffData, activeProgram],
  )
  const scopedPositions = useMemo(
    () => positionsData.filter((p) => matchesProgram(p.program, activeProgram)),
    [positionsData, activeProgram],
  )
  const scopedSimulators = useMemo(
    () => simulatorsData.filter((s) => matchesProgram(s.program, activeProgram)),
    [simulatorsData, activeProgram],
  )
  const scopedExercises = useMemo(
    () => exercisesData.filter((e) => matchesProgram(e.program, activeProgram)),
    [exercisesData, activeProgram],
  )
  const scopedCourses = useMemo(
    () => coursesData.filter((c) => matchesProgram(c.program, activeProgram)),
    [coursesData, activeProgram],
  )
  const scopedRuns = useMemo(
    () => liveRuns.filter((r) => runInProgram(r, (id) => simulatorMap.get(id), activeProgram)),
    [liveRuns, simulatorMap, activeProgram],
  )
  const scopedAssignments = useMemo(
    () => assignmentsData.filter((a) => assignmentInProgram(a, activeProgram)),
    [assignmentsData, activeProgram],
  )
  const scopedTrainingSessions = useMemo(
    () =>
      liveTrainingSessions.filter((t) =>
        trainingInProgram(t, (id) => simulatorMap.get(id), (id) => staffMap.get(id), activeProgram),
      ),
    [liveTrainingSessions, simulatorMap, staffMap, activeProgram],
  )
  const scopedLeaveRecords = useMemo(
    () =>
      liveLeaveRecords.filter((l) => {
        const s = staffMap.get(l.staffId)
        return s ? staffInProgram(s, activeProgram) : true
      }),
    [liveLeaveRecords, staffMap, activeProgram],
  )
  // Show a task when its own program matches, or when any assigned person is in
  // the active program (so cross-program detachments still surface).
  const scopedOtherTasks = useMemo(
    () =>
      liveOtherTasks.filter((t) => {
        if (activeProgram === "ALL") return true
        if (t.program && matchesProgram(t.program, activeProgram)) return true
        return t.staffIds.some((id) => {
          const s = staffMap.get(id)
          return s ? staffInProgram(s, activeProgram) : false
        })
      }),
    [liveOtherTasks, staffMap, activeProgram],
  )

  // ── Report views: program-scoped + archived-excluded + year-range slicer ──
  // These add the active yearRange filter on top of the scoped (live) views, so
  // any analytics/report surface that reads them respects the year slicer.
  const reportRuns = useMemo(() => scopedRuns.filter((r) => inYearRange(r.date, yearRange)), [scopedRuns, yearRange])
  const reportRunIds = useMemo(() => new Set(reportRuns.map((r) => r.id)), [reportRuns])
  const reportRunAssignments = useMemo(
    () => liveRunAssignments.filter((a) => reportRunIds.has(a.runId)),
    [liveRunAssignments, reportRunIds],
  )
  const reportLeaveRecords = useMemo(
    () => scopedLeaveRecords.filter((l) => inYearRange(l.startDate, yearRange)),
    [scopedLeaveRecords, yearRange],
  )
  const reportTrainingSessions = useMemo(
    () => scopedTrainingSessions.filter((t) => inYearRange(t.date, yearRange)),
    [scopedTrainingSessions, yearRange],
  )
  // OJTI training log scoped to the year slicer (by entry date). Accumulated OJT
  // hours on the Trainers tab and staff OJT progress read this so they respect
  // the global top-bar year filter like every other reporting surface.
  const reportTrainingLogs = useMemo(
    () => trainingLogs.filter((l) => inYearRange(l.date, yearRange)),
    [trainingLogs, yearRange],
  )
  const reportOtherTasks = useMemo(
    () => scopedOtherTasks.filter((t) => inYearRange(t.startDate, yearRange)),
    [scopedOtherTasks, yearRange],
  )
  // Courses span a start→end window, so a course belongs to the slicer when its
  // [startYear, endYear] overlaps the selected [yearRange.start, yearRange.end].
  // Program scoping is already applied by scopedCourses.
  const reportCourses = useMemo(
    () =>
      scopedCourses.filter((c) => {
        const startY = yearOfISO(c.startDate)
        const endY = yearOfISO(c.endDate)
        return startY <= yearRange.end && endY >= yearRange.start
      }),
    [scopedCourses, yearRange],
  )

  // ── Archive (admin-only): past-retention data + downloadable bundles ──────
  const archivedYears = useMemo(() => {
    const set = new Set<number>()
    for (const r of runs) { const y = yearOfISO(r.date); if (isArchivedYear(y)) set.add(y) }
    for (const l of leaveRecords) { const y = yearOfISO(l.startDate); if (isArchivedYear(y)) set.add(y) }
    for (const t of trainingSessions) { const y = yearOfISO(t.date); if (isArchivedYear(y)) set.add(y) }
    for (const t of otherTasksData) { const y = yearOfISO(t.startDate); if (isArchivedYear(y)) set.add(y) }
    return Array.from(set).sort((a, b) => a - b)
  }, [runs, leaveRecords, trainingSessions, otherTasksData])

  const getArchive = useCallback(
    (years: number[]): ArchiveBundle => {
      const want = new Set(years)
      const inWanted = (iso: string) => want.has(yearOfISO(iso))
      const aRuns = runs.filter((r) => inWanted(r.date))
      const aRunIds = new Set(aRuns.map((r) => r.id))
      const aSessions = trainingSessions.filter((t) => inWanted(t.date))
      const aSessionIds = new Set(aSessions.map((t) => t.id))
      return {
        years: Array.from(want).sort((a, b) => a - b),
        runs: aRuns,
        runAssignments: runAssignments.filter((a) => aRunIds.has(a.runId)),
        leaveRecords: leaveRecords.filter((l) => inWanted(l.startDate)),
        trainingSessions: aSessions,
        trainingAttendance: trainingAttendance.filter((a) => aSessionIds.has(a.sessionId)),
        otherTasks: otherTasksData.filter((t) => inWanted(t.startDate)),
      }
    },
    [runs, runAssignments, leaveRecords, trainingSessions, trainingAttendance, otherTasksData],
  )

  const archiveSummary = useMemo<ArchiveYearSummary[]>(
    () =>
      archivedYears.map((year) => {
        const runsN = runs.filter((r) => yearOfISO(r.date) === year).length
        const leaveN = leaveRecords.filter((l) => yearOfISO(l.startDate) === year).length
        const trainingN = trainingSessions.filter((t) => yearOfISO(t.date) === year).length
        const tasksN = otherTasksData.filter((t) => yearOfISO(t.startDate) === year).length
        return { year, runs: runsN, leave: leaveN, training: trainingN, tasks: tasksN, total: runsN + leaveN + trainingN + tasksN }
      }),
    [archivedYears, runs, leaveRecords, trainingSessions, otherTasksData],
  )

  const currentUserRef = useRef(currentUser)
  currentUserRef.current = currentUser

  const runsRef = useRef(runs)
  runsRef.current = runs
  const assignmentsRef = useRef(runAssignments)
  assignmentsRef.current = runAssignments

  const log = useCallback((action: AuditAction, detail: string) => {
    setAuditLogs((prev) => [
      {
        id: `al-${Date.now()}`,
        timestamp: `${todayISO()} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
        user: currentUserRef.current.name,
        action,
        detail,
      },
      ...prev,
    ])
  }, [])

  const logImport = useCallback((summary: string) => {
    setImportHistory((prev) => [
      { summary, when: `${todayISO()} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` },
      ...prev,
    ])
    log("excel.import", summary)
  }, [log])

  // Records a notification "received" by a staff member (for the admin viewer).
  const recordNotification = useCallback(
    (n: Omit<NotificationRecord, "id" | "sentAt" | "sentBy">): NotificationRecord => {
      const rec: NotificationRecord = {
        ...n,
        id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sentAt: new Date().toISOString(),
        sentBy: currentUserRef.current.name,
      }
      // Keep the log bounded so the snapshot doesn't grow without limit; the
      // autosave effect persists this to Blob automatically.
      setNotifications((prev) => [rec, ...prev].slice(0, 500))
      return rec
    },
    [],
  )

  const notificationsForStaff = useCallback(
    (staffId: string) =>
      notifications
        .filter((n) => n.staffId === staffId)
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [notifications],
  )

  // Stamp readAt the first time a recipient opens a notification. Persisted so
  // TL/Admin can see read receipts in the Notification Viewer.
  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => {
      let changed = false
      const next = prev.map((n) => {
        if (n.id === id && !n.readAt) {
          changed = true
          return { ...n, readAt: new Date().toISOString() }
        }
        return n
      })
      if (!changed) return prev
      return next
    })
  }, [])

  // Flag a run/training as having changed since affected people were last notified.
  // The autosave effect persists notifyDirty to Blob automatically.
  const markNotifyDirty = useCallback((key: string) => {
    setNotifyDirty((prev) => ({ ...prev, [key]: { ...prev[key], changedAt: new Date().toISOString() } }))
  }, [])

  // Clear the flag once the affected people have been (re-)notified.
  const markNotified = useCallback((key: string) => {
    setNotifyDirty((prev) => {
      if (!prev[key]) return prev
      return { ...prev, [key]: { ...prev[key], notifiedAt: new Date().toISOString() } }
    })
  }, [])

  // True only when a tracked change is newer than the last notification.
  const needsNotify = useCallback(
    (key: string) => {
      const s = notifyDirty[key]
      if (!s) return false
      return !s.notifiedAt || s.changedAt > s.notifiedAt
    },
    [notifyDirty],
  )

  const validityFor = useCallback((staffId: string, positionId: string) => {
    const v = validityMap.get(`${staffId}:${positionId}`)
    if (!v) return { expiry: null, daysRemaining: null, status: "never" as ValidityStatus, lastDateSat: null }
    const c = computeValidity(v.lastDateSat, v.validityDays)
    return { ...c, lastDateSat: v.lastDateSat }
  }, [validityMap])

  const isOnLeave = useCallback((staffId: string, date: string) =>
    leaveRecords.find(
      (l) => l.staffId === staffId && l.approval !== "rejected" && date >= l.startDate && date <= l.endDate,
    ), [leaveRecords])

  const isInTraining = useCallback((staffId: string, date: string) => {
    const sessionIds = trainingAttendance.filter((a) => a.staffId === staffId).map((a) => a.sessionId)
    return trainingSessions.find((t) => sessionIds.includes(t.id) && t.date === date)
  }, [trainingAttendance, trainingSessions])

  const otherTaskOn = useCallback(
    (staffId: string, date: string) =>
      otherTasksData.find(
        (t) => t.staffIds.includes(staffId) && date >= t.startDate && date <= t.endDate,
      ),
    [otherTasksData],
  )

  const assignmentsForRun = useCallback((runId: string) => assignmentsByRun.get(runId) ?? EMPTY_ASSIGNMENTS, [assignmentsByRun])

  const qualsForStaff = useCallback((staffId: string) => qualsByStaff.get(staffId) ?? EMPTY_QUALS, [qualsByStaff])

  const updateRunStatus = useCallback((runId: string, status: RunStatus, reason?: string) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              status,
              cancellationReason: status === "cancelled" ? reason : undefined,
              statusChangedBy: currentUserRef.current.name,
              statusChangedAt: `${todayISO()} ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`,
            }
          : r,
      ),
    )
    if (status === "confirmed") log("exercise.confirm", `Confirmed ${runId.toUpperCase()}`)
    else if (status === "cancelled") log("exercise.cancel", `Cancelled ${runId.toUpperCase()} – reason: ${reason}`)
    else log("run.edit", `Set ${runId.toUpperCase()} status to ${status}`)
    // No manual validity update needed: "last date sat" is derived from completed
    // runs (see lastSatMap), so marking a run completed refreshes currency
    // automatically and keeps the Validity tab in sync with Run History.
  }, [log])

  const updateRun = useCallback((run: Run) => {
    setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)))
    log("run.edit", `Edited ${run.id.toUpperCase()}`)
  }, [log])

  const addRun = useCallback((run: Run) => {
    setRuns((prev) => [...prev, run])
    setRunAssignments((prev) => [
      ...prev,
      ...run.requiredPositions.map((posId, i) => ({
        id: `asg-${Date.now()}-${i}`,
        runId: run.id,
        positionId: posId,
        staffId: null,
      })),
    ])
    log("run.create", `Created ${run.id.toUpperCase()}`)
  }, [log])

  const deleteRun = useCallback((runId: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== runId))
    setRunAssignments((prev) => prev.filter((a) => a.runId !== runId))
    log("run.delete", `Deleted ${runId.toUpperCase()}`)
  }, [log])

  const assignStaff = useCallback((
    runId: string,
    positionId: string,
    staffId: string | null,
    override?: boolean,
    reason?: string,
  ) => {
    // Capture the "before" state so the audit log can name exactly who was
    // switched (incoming, displaced, or moved) and at which position.
    const runLabel = runId.toUpperCase()
    const nameOf = (id: string | null | undefined) => {
      const s = id ? staffMap.get(id) : undefined
      return s ? `${s.firstName} ${s.lastName}` : null
    }
    const posCode = positionMap.get(positionId)?.code ?? positionId
    const prevAssignments = assignmentsRef.current.filter((a) => a.runId === runId)
    const displacedName = nameOf(prevAssignments.find((a) => a.positionId === positionId)?.staffId)
    const movedFromCode = staffId
      ? positionMap.get(
          prevAssignments.find((a) => a.positionId !== positionId && a.staffId === staffId)?.positionId ?? "",
        )?.code ?? null
      : null
    const incomingName = nameOf(staffId)

    setRunAssignments((prev) => {
      // A person can occupy only one position per run: clear them from any other
      // position in this run before seating them at the target position.
      const cleared =
        staffId == null
          ? prev
          : prev.map((a) =>
              a.runId === runId && a.positionId !== positionId && a.staffId === staffId
                ? { ...a, staffId: null, manualOverride: undefined, overrideReason: undefined }
                : a,
            )
      const existing = cleared.find((a) => a.runId === runId && a.positionId === positionId)
      if (existing) {
        return cleared.map((a) =>
          a.runId === runId && a.positionId === positionId
            ? { ...a, staffId, manualOverride: override, overrideReason: reason }
            : a,
        )
      }
      return [
        ...cleared,
        { id: `asg-${Date.now()}`, runId, positionId, staffId, manualOverride: override, overrideReason: reason },
      ]
    })

    // Build a human-readable description of the switch.
    let detail: string
    if (staffId == null) {
      detail = displacedName
        ? `Removed ${displacedName} from ${posCode} on ${runLabel}`
        : `Cleared ${posCode} on ${runLabel}`
    } else if (displacedName && displacedName !== incomingName) {
      detail = `Replaced ${displacedName} with ${incomingName} at ${posCode} on ${runLabel}`
    } else if (movedFromCode) {
      detail = `Reassigned ${incomingName} from ${movedFromCode} to ${posCode} on ${runLabel}`
    } else {
      detail = `Assigned ${incomingName} to ${posCode} on ${runLabel}`
    }
    if (override) detail += ` – override: ${reason ?? "no reason given"}`

    log(override ? "assignment.override" : "assignment.change", detail)
    // Seating changed — affected people need re-notifying.
    markNotifyDirty(`run:${runId}`)
  }, [log, staffMap, positionMap, markNotifyDirty])

  // Tie a FLEXIBLE support seat to the PRIMARY position it is backing up in a
  // run. Once linked, whoever sits the flexible seat earns currency for the
  // linked primary position on a completed run (see lastSatMap). Pass null to
  // unlink. Creates the seat's assignment row if it does not exist yet.
  const linkFlexiblePosition = useCallback((
    runId: string,
    positionId: string,
    linkedPositionId: string | null,
  ) => {
    setRunAssignments((prev) => {
      const existing = prev.find((a) => a.runId === runId && a.positionId === positionId)
      if (existing) {
        return prev.map((a) =>
          a.runId === runId && a.positionId === positionId
            ? { ...a, linkedPositionId: linkedPositionId ?? undefined }
            : a,
        )
      }
      return [
        ...prev,
        {
          id: `asg-${Date.now()}`,
          runId,
          positionId,
          staffId: null,
          linkedPositionId: linkedPositionId ?? undefined,
        },
      ]
    })
    const flexCode = positionMap.get(positionId)?.code ?? positionId
    const primeCode = linkedPositionId ? positionMap.get(linkedPositionId)?.code ?? linkedPositionId : null
    log(
      "assignment.change",
      primeCode
        ? `Linked flexible seat ${flexCode} to support ${primeCode} on ${runId.toUpperCase()}`
        : `Unlinked flexible seat ${flexCode} on ${runId.toUpperCase()}`,
    )
    markNotifyDirty(`run:${runId}`)
  }, [log, positionMap, markNotifyDirty])

  // Flag/unflag a FLEXIBLE seat as a training seat. When on, the occupant is a
  // trainee: no currency is recorded (see lastSatMap) and the validation
  // requirement is waived in the seating UI. Creates the row if it is missing.
  const setFlexibleTraining = useCallback((
    runId: string,
    positionId: string,
    training: boolean,
  ) => {
    setRunAssignments((prev) => {
      const existing = prev.find((a) => a.runId === runId && a.positionId === positionId)
      if (existing) {
        return prev.map((a) =>
          a.runId === runId && a.positionId === positionId
            ? { ...a, trainingMode: training || undefined }
            : a,
        )
      }
      return [
        ...prev,
        { id: `asg-${Date.now()}`, runId, positionId, staffId: null, trainingMode: training || undefined },
      ]
    })
    const flexCode = positionMap.get(positionId)?.code ?? positionId
    log(
      "assignment.change",
      training
        ? `Flexible seat ${flexCode} set to TRAINING (no currency) on ${runId.toUpperCase()}`
        : `Flexible seat ${flexCode} training cleared on ${runId.toUpperCase()}`,
    )
    markNotifyDirty(`run:${runId}`)
  }, [log, positionMap, markNotifyDirty])

  // ── Fill Positions algorithm ──────────────────────────────────────────
  const scoreCandidate = useCallback((staffId: string, positionId: string, date: string) => {
    const v = validityFor(staffId, positionId)
    if (v.status === "expired" || v.status === "never") return null
    if (isOnLeave(staffId, date)) return null
    if (isInTraining(staffId, date)) return null
    if (otherTaskOn(staffId, date)) return null // committed to another task that day
    // qualification rule: excluded quals
    const rule = seed.positionQualRules.find((r) => r.positionId === positionId)
    const staffQuals = staffQualificationsData.filter((sq) => sq.staffId === staffId).map((sq) => sq.qualificationId)
    if (rule) {
      if (rule.excludedQuals.some((q) => staffQuals.includes(q))) return null
      if (rule.requiredQuals.some((q) => !staffQuals.includes(q))) return null
    }
    // priority (lower score = higher priority):
    //  • People whose currency on THIS position is expiring soon get a dominant
    //    boost so the next Fill Positions seats them here to refresh validity
    //    before it lapses. The fewer days remaining, the higher the priority.
    //  • Otherwise rank by remaining currency (those closer to expiry first).
    const days = v.daysRemaining ?? 999
    let score = days
    if (v.status === "expiring") score = days - 1000 // expiring always outranks merely-valid
    // preferred-qual nudge acts only as a tiebreaker within the same tier
    if (rule?.preferredQuals.some((q) => staffQuals.includes(q))) score -= 5
    return score
  }, [validityFor, isOnLeave, isInTraining, otherTaskOn, staffQualificationsData])

  const fillPositions = useCallback((runIds: string[], _allowOverride: boolean) => {
    let filled = 0
    let skipped = 0
    // Per-seat detail of who was auto-selected and for which exercise/run.
    const picks: string[] = []
    setRunAssignments((prev) => {
      const next = [...prev]
      const runById = new Map(runsRef.current.map((r) => [r.id, r]))

      // track total assignments per staff to spread workload fairly
      const dayLoad = new Map<string, number>()
      next.forEach((a) => {
        if (a.staffId) dayLoad.set(a.staffId, (dayLoad.get(a.staffId) ?? 0) + 1)
      })

      // ── Rotation history (built from the EXISTING schedule) ───────────────
      // These maps drive the rotation rule so people cycle through the
      // positions they are validated for instead of getting stuck on one:
      //   • posCount   — how many times a person has sat a given position, so
      //                  each position is spread evenly across its people and
      //                  every person gets variety across their positions.
      //   • lastPosDate��� the most recent date a person sat a position, used to
      //                  discourage repeating yesterday's position (daily move).
      //   • dayPos     — the positions a person already holds on a given date,
      //                  used to keep them on ONE position for the whole day.
      const posCount = new Map<string, number>() // `${staffId}|${posId}` -> count
      const lastPosDate = new Map<string, string>() // `${staffId}|${posId}` -> latest ISO date
      const dayPos = new Map<string, Set<string>>() // `${staffId}|${date}` -> posIds that day
      const remember = (staffId: string, posId: string, date: string) => {
        const pk = `${staffId}|${posId}`
        posCount.set(pk, (posCount.get(pk) ?? 0) + 1)
        const prevDate = lastPosDate.get(pk)
        if (!prevDate || date > prevDate) lastPosDate.set(pk, date)
        const dk = `${staffId}|${date}`
        let set = dayPos.get(dk)
        if (!set) { set = new Set(); dayPos.set(dk, set) }
        set.add(posId)
      }
      next.forEach((a) => {
        const r = a.staffId ? runById.get(a.runId) : undefined
        if (a.staffId && r) remember(a.staffId, a.positionId, r.date)
      })

      // Fill runs in chronological order so day-to-day rotation history builds
      // up correctly as we go (yesterday is decided before today).
      const orderedRunIds = [...runIds].sort((x, y) => {
        const rx = runById.get(x)
        const ry = runById.get(y)
        if (!rx || !ry) return 0
        return rx.date.localeCompare(ry.date) || rx.slotTime.localeCompare(ry.slotTime)
      })

      for (const runId of orderedRunIds) {
        const run = runById.get(runId)
        if (!run || run.status === "cancelled") continue
        const prevDay = addDaysISO(run.date, -1)
        const assignedThisRun = new Set(
          next.filter((a) => a.runId === runId && a.staffId).map((a) => a.staffId as string),
        )
        for (const posId of run.requiredPositions) {
          const idx = next.findIndex((a) => a.runId === runId && a.positionId === posId)
          if (idx >= 0 && next[idx].staffId) continue // already filled
          // candidates: validated for this position (home position) + eligible
          const candidates = staffData
            .filter((s) => s.active && s.homePositions.includes(posId) && !assignedThisRun.has(s.id))
            .map((s) => {
              const currency = scoreCandidate(s.id, posId, run.date)
              if (currency === null) return null
              const todaySet = dayPos.get(`${s.id}|${run.date}`)
              return {
                id: s.id,
                // expiring currency must still refresh first (safety > rotation)
                expiring: currency <= -900 ? 0 : 1,
                // day stickiness: keep someone on the SAME position all day and
                // avoid pulling someone already busy on a DIFFERENT position.
                onOtherToday: todaySet && todaySet.size > 0 && !todaySet.has(posId) ? 1 : 0,
                onThisToday: todaySet?.has(posId) ? 0 : 1,
                // across-day rotation: don't repeat yesterday's position, and
                // prefer whoever has sat this position the fewest times.
                satYesterday: lastPosDate.get(`${s.id}|${posId}`) === prevDay ? 1 : 0,
                timesOnPos: posCount.get(`${s.id}|${posId}`) ?? 0,
                currency,
              }
            })
            .filter((c): c is NonNullable<typeof c> => c !== null)
            .sort(
              (a, b) =>
                a.expiring - b.expiring ||
                a.onOtherToday - b.onOtherToday ||
                a.onThisToday - b.onThisToday ||
                a.satYesterday - b.satYesterday ||
                a.timesOnPos - b.timesOnPos ||
                (dayLoad.get(a.id) ?? 0) - (dayLoad.get(b.id) ?? 0) ||
                a.currency - b.currency ||
                a.id.localeCompare(b.id),
            )
          const pick = candidates[0]
          if (pick) {
            assignedThisRun.add(pick.id)
            dayLoad.set(pick.id, (dayLoad.get(pick.id) ?? 0) + 1)
            remember(pick.id, posId, run.date)
            if (idx >= 0) next[idx] = { ...next[idx], staffId: pick.id }
            else next.push({ id: `asg-${Date.now()}-${posId}`, runId, positionId: posId, staffId: pick.id })
            filled++
            const who = staffMap.get(pick.id)
            const ex = exerciseMap.get(run.exerciseId)
            const pos = positionMap.get(posId)
            picks.push(
              `${who ? `${who.firstName} ${who.lastName}` : pick.id} → ${pos?.code ?? posId} for ${ex?.code ?? "exercise"} (${ex?.name ?? run.exerciseId}) on ${run.id.toUpperCase()} ${run.date}`,
            )
          } else {
            skipped++
          }
        }
      }
      return next
    })
    const summary = `Fill Positions filled ${filled} position(s) across ${runIds.length} run(s)`
    log("assignment.change", picks.length ? `${summary}: ${picks.join("; ")}` : summary)
    // Any run that gained an assignment needs its staff (re-)notified.
    if (filled > 0) runIds.forEach((id) => markNotifyDirty(`run:${id}`))
    return { filled, skipped }
  }, [log, scoreCandidate, staffData, staffMap, exerciseMap, positionMap, markNotifyDirty])

  // The opposite of Fill Positions: unseat every staff member from the given
  // runs, leaving the seats empty. Cancelled runs are left untouched (their
  // seats are irrelevant). Returns how many seats were emptied.
  const clearPositions = useCallback((runIds: string[]) => {
    let cleared = 0
    const runIdSet = new Set(runIds)
    setRunAssignments((prev) => {
      const next = prev.map((a) => {
        const run = runsRef.current.find((r) => r.id === a.runId)
        if (runIdSet.has(a.runId) && a.staffId && run && run.status !== "cancelled") {
          cleared++
          return { ...a, staffId: null }
        }
        return a
      })
      return next
    })
    const summary = `Clear Positions emptied ${cleared} seat(s) across ${runIds.length} run(s)`
    log("assignment.change", summary)
    // Any run that lost an assignment needs its staff (re-)notified.
    if (cleared > 0) runIds.forEach((id) => markNotifyDirty(`run:${id}`))
    return { cleared }
  }, [log, markNotifyDirty])

  // When leave is approved, the person must be removed from every position they
  // hold on their leave days, and each vacated seat is back-filled with an
  // available, qualified, valid replacement if one exists — otherwise left open.
  const reconcileLeaveAssignments = useCallback((staffId: string, startDate: string, endDate: string) => {
    let vacated = 0
    let backfilled = 0
    setRunAssignments((prev) => {
      const next = [...prev]
      const affectedRuns = runsRef.current.filter(
        (r) => r.status !== "cancelled" && r.date >= startDate && r.date <= endDate,
      )
      for (const run of affectedRuns) {
        for (let i = 0; i < next.length; i++) {
          const a = next[i]
          if (a.runId !== run.id || a.staffId !== staffId) continue
          // vacate the seat (also drop any manual override that placed them here)
          next[i] = { ...a, staffId: null, manualOverride: undefined, overrideReason: undefined }
          vacated++
          // attempt to back-fill with a qualified, available replacement
          const assignedThisRun = new Set(
            next.filter((x) => x.runId === run.id && x.staffId).map((x) => x.staffId as string),
          )
          const pick = staffData
            .filter(
              (s) =>
                s.active &&
                s.id !== staffId &&
                s.homePositions.includes(a.positionId) &&
                !assignedThisRun.has(s.id),
            )
            .map((s) => ({ id: s.id, score: scoreCandidate(s.id, a.positionId, run.date) }))
            .filter((c) => c.score !== null)
            .sort((x, y) => (x.score as number) - (y.score as number))[0]
          if (pick) {
            next[i] = { ...next[i], staffId: pick.id }
            backfilled++
          }
        }
      }
      return next
    })
    if (vacated > 0) {
      log(
        "assignment.change",
        `Leave approved for ${staffMap.get(staffId)?.firstName ?? "staff"}: vacated ${vacated} seat(s), back-filled ${backfilled}, left ${vacated - backfilled} open`,
      )
    }
  }, [log, scoreCandidate, staffData, staffMap])

  const addLeave = useCallback((lv: LeaveRecord) => {
    setLeaveRecords((prev) => [...prev, lv])
    log("leave.edit", `Added ${lv.type} leave for ${staffMap.get(lv.staffId)?.firstName ?? "staff"}`)
    if (lv.approval === "approved") reconcileLeaveAssignments(lv.staffId, lv.startDate, lv.endDate)
  }, [log, staffMap, reconcileLeaveAssignments])

  const updateLeave = useCallback((lv: LeaveRecord) => {
    setLeaveRecords((prev) => prev.map((l) => (l.id === lv.id ? lv : l)))
    log("leave.edit", `Updated leave ${lv.id}`)
    if (lv.approval === "approved") reconcileLeaveAssignments(lv.staffId, lv.startDate, lv.endDate)
  }, [log, reconcileLeaveAssignments])

  const addTraining = useCallback((t: TrainingSession, attendeeIds: string[] = []) => {
    setTrainingSessions((prev) => [...prev, t])
    if (attendeeIds.length) {
      setTrainingAttendance((prev) => [
        ...prev,
        ...attendeeIds.map((staffId, i) => ({
          id: `ta-${Date.now()}-${i}`,
          sessionId: t.id,
          staffId,
          attended: false,
        })),
      ])
    }
    log("run.create", `Created training session ${t.title}${attendeeIds.length ? ` with ${attendeeIds.length} trainee(s)` : ""}`)
    // New training — attendees need notifying.
    markNotifyDirty(`training:${t.id}`)
  }, [log, markNotifyDirty])

  const toggleAttendance = useCallback((sessionId: string, staffId: string) => {
    setTrainingAttendance((prev) =>
      prev.map((a) =>
        a.sessionId === sessionId && a.staffId === staffId ? { ...a, attended: !a.attended } : a,
      ),
    )
  }, [])

  const updateTraining = useCallback((t: TrainingSession, attendeeIds?: string[]) => {
    setTrainingSessions((prev) => prev.map((s) => (s.id === t.id ? t : s)))
    if (attendeeIds) {
      setTrainingAttendance((prev) => {
        // Preserve existing attendance (attended flags) for staff who remain enrolled.
        const existing = prev.filter((a) => a.sessionId === t.id)
        const others = prev.filter((a) => a.sessionId !== t.id)
        const next = attendeeIds.map((staffId, i) => {
          const prior = existing.find((a) => a.staffId === staffId)
          return prior ?? { id: `ta-${Date.now()}-${i}`, sessionId: t.id, staffId, attended: false }
        })
        return [...others, ...next]
      })
    }
    log("run.create", `Updated training session ${t.title}`)
    // Training changed — attendees need re-notifying.
    markNotifyDirty(`training:${t.id}`)
  }, [log, markNotifyDirty])

  const deleteTraining = useCallback((id: string) => {
    setTrainingSessions((prev) => prev.filter((s) => s.id !== id))
    setTrainingAttendance((prev) => prev.filter((a) => a.sessionId !== id))
    log("run.create", `Deleted training session ${id}`)
  }, [log])

  // ── OJTI training log ──────────────────────────────────────────────────
  const addTrainingLog = useCallback((entry: TrainingLogEntry) => {
    setTrainingLogs((prev) => [...prev, entry])
    log("run.create", `Added OJT log entry for ${entry.date} (${entry.hours}h)`)
  }, [log])

  const updateTrainingLog = useCallback((entry: TrainingLogEntry) => {
    setTrainingLogs((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
    log("run.edit", `Updated OJT log entry ${entry.id}`)
  }, [log])

  const deleteTrainingLog = useCallback((id: string) => {
    setTrainingLogs((prev) => prev.filter((e) => e.id !== id))
    log("run.delete", `Deleted OJT log entry ${id}`)
  }, [log])

  const deleteLeave = useCallback((id: string) => {
    setLeaveRecords((prev) => prev.filter((l) => l.id !== id))
    log("leave.edit", `Deleted leave ${id}`)
  }, [log])

  // When staff are committed to a non-sim task, they must be removed from every
  // seat they hold on the task's days (they are now busy). Each vacated seat is
  // back-filled with an available, qualified replacement if one exists.
  const reconcileOtherTaskAssignments = useCallback(
    (staffIds: string[], startDate: string, endDate: string, taskTitle: string) => {
      if (staffIds.length === 0) return
      const busy = new Set(staffIds)
      const nameOf = (id: string) => {
        const s = staffMap.get(id)
        return s ? `${s.firstName} ${s.lastName}` : id
      }
      // Per-seat detail of who was unseated, from where, and who replaced them.
      const details: string[] = []
      setRunAssignments((prev) => {
        const next = [...prev]
        const affectedRuns = runsRef.current.filter(
          (r) => r.status !== "cancelled" && r.date >= startDate && r.date <= endDate,
        )
        for (const run of affectedRuns) {
          const ex = exerciseMap.get(run.exerciseId)
          for (let i = 0; i < next.length; i++) {
            const a = next[i]
            if (a.runId !== run.id || !a.staffId || !busy.has(a.staffId)) continue
            const removedName = nameOf(a.staffId)
            const posCode = positionMap.get(a.positionId)?.code ?? a.positionId
            // vacate the seat (drop any manual override that placed them here)
            next[i] = { ...a, staffId: null, manualOverride: undefined, overrideReason: undefined }
            const assignedThisRun = new Set(
              next.filter((x) => x.runId === run.id && x.staffId).map((x) => x.staffId as string),
            )
            const pick = staffData
              .filter(
                (s) =>
                  s.active &&
                  !busy.has(s.id) &&
                  s.homePositions.includes(a.positionId) &&
                  !assignedThisRun.has(s.id),
              )
              .map((s) => ({ id: s.id, score: scoreCandidate(s.id, a.positionId, run.date) }))
              .filter((c) => c.score !== null)
              .sort((x, y) => (x.score as number) - (y.score as number))[0]
            const runLabel = `${run.id.toUpperCase()} (${ex?.code ?? run.exerciseId}, ${run.date} ${run.slotTime})`
            if (pick) {
              next[i] = { ...next[i], staffId: pick.id }
              details.push(`${removedName} removed from ${posCode} on ${runLabel} — replaced by ${nameOf(pick.id)}`)
            } else {
              details.push(`${removedName} removed from ${posCode} on ${runLabel} — seat left open`)
            }
          }
        }
        return next
      })
      if (details.length > 0) {
        runsRef.current
          .filter((r) => r.status !== "cancelled" && r.date >= startDate && r.date <= endDate)
          .forEach((r) => markNotifyDirty(`run:${r.id}`))
        log("assignment.change", `Task "${taskTitle}" freed ${details.length} assignment(s): ${details.join("; ")}`)
      }
    },
    [log, scoreCandidate, staffData, staffMap, exerciseMap, positionMap, markNotifyDirty],
  )

  const addOtherTask = useCallback((t: OtherTask) => {
    setOtherTasksData((prev) => [...prev, t])
    log("othertask.create", `Created task "${t.title}" for ${t.staffIds.length} staff (${t.startDate}–${t.endDate})`)
    reconcileOtherTaskAssignments(t.staffIds, t.startDate, t.endDate, t.title)
  }, [log, reconcileOtherTaskAssignments])

  const updateOtherTask = useCallback((t: OtherTask) => {
    setOtherTasksData((prev) => prev.map((x) => (x.id === t.id ? t : x)))
    log("othertask.edit", `Updated task "${t.title}"`)
    reconcileOtherTaskAssignments(t.staffIds, t.startDate, t.endDate, t.title)
  }, [log, reconcileOtherTaskAssignments])

  const deleteOtherTask = useCallback((id: string) => {
    setOtherTasksData((prev) => prev.filter((x) => x.id !== id))
    log("othertask.delete", `Deleted task ${id}`)
  }, [log])

  // ── Admin CRUD ───────────────────────────────────────────────────────��
  const addStaff = useCallback((s: Staff) => {
    setStaffData((prev) => [...prev, s])
    // Register a validity record for each operational position. Its currency is
    // derived from real runs (see lastSatMap), so a brand-new position starts as
    // "never sat" until the person is actually seated on it — no fabricated date.
    setStaffValidity((prev) => {
      const additions: StaffValidity[] = []
      for (const posId of s.homePositions) {
        const p = positionMap.get(posId)
        if (!p) continue
        additions.push({ staffId: s.id, positionId: posId, lastDateSat: null, validityDays: p.validityDays })
      }
      return additions.length > 0 ? [...prev, ...additions] : prev
    })
    log("staff.create", `Added staff ${s.firstName} ${s.lastName}`)
  }, [log, positionMap])

  const updateStaff = useCallback((s: Staff) => {
    setStaffData((prev) => prev.map((x) => (x.id === s.id ? s : x)))
    // Keep validity records in sync with the person's operational positions so
    // edits are fully persisted: add a fresh (valid) sample record for any
    // newly-added position, and drop records for positions that were removed.
    setStaffValidity((prev) => {
      const held = new Set(s.homePositions)
      const kept = prev.filter((v) => v.staffId !== s.id || held.has(v.positionId))
      const existing = new Set(kept.filter((v) => v.staffId === s.id).map((v) => v.positionId))
      const additions: StaffValidity[] = []
      for (const posId of s.homePositions) {
        if (existing.has(posId)) continue
        const p = positionMap.get(posId)
        if (!p) continue
        // Currency is derived from real runs; a newly-added position is "never
        // sat" until the person is actually seated on it — no fabricated date.
        additions.push({ staffId: s.id, positionId: posId, lastDateSat: null, validityDays: p.validityDays })
      }
      return additions.length > 0 ? [...kept, ...additions] : kept
    })
    log("staff.edit", `Edited staff ${s.firstName} ${s.lastName}`)
  }, [log, positionMap])

  const deleteStaff = useCallback((id: string) => {
    setStaffData((prev) => prev.filter((x) => x.id !== id))
    setRunAssignments((prev) => prev.map((a) => (a.staffId === id ? { ...a, staffId: null } : a)))
    setStaffValidity((prev) => prev.filter((v) => v.staffId !== id))
    log("staff.delete", `Removed staff ${id}`)
  }, [log])

  const addExercise = useCallback((e: Exercise) => {
    setExercisesData((prev) => [...prev, e])
    log("exercise.create", `Added exercise ${e.code}`)
  }, [log])

  const updateExercise = useCallback((e: Exercise) => {
    setExercisesData((prev) => prev.map((x) => (x.id === e.id ? e : x)))
    log("exercise.edit", `Edited exercise ${e.code}`)
  }, [log])

  const deleteExercise = useCallback((id: string) => {
    setExercisesData((prev) => prev.filter((x) => x.id !== id))
    setExerciseQualRulesData((prev) => prev.filter((r) => r.exerciseId !== id))
    log("exercise.delete", `Removed exercise ${id}`)
  }, [log])

  // Course/exercise/etc. edits just update state — the snapshot autosave effect
  // persists every slice to Blob automatically (see the autosave effect below).
  const addCourse = useCallback((c: Course) => {
    setCoursesData((prev) => [...prev, c])
    log("course.create", `Added course ${c.code} — ${c.name}`)
  }, [log])

  const updateCourse = useCallback((c: Course) => {
    setCoursesData((prev) => prev.map((x) => (x.id === c.id ? c : x)))
    log("course.edit", `Edited course ${c.code} — ${c.name}`)
  }, [log])

  const deleteCourse = useCallback((id: string) => {
    setCoursesData((prev) => prev.filter((x) => x.id !== id))
    log("course.delete", `Removed course ${id}`)
  }, [log])

  const setExerciseQualRule = useCallback((
    exerciseId: string,
    patch: { requiredQuals?: string[]; preferredQuals?: string[]; excludedQuals?: string[] },
  ) => {
    setExerciseQualRulesData((prev) => {
      const existing = prev.find((r) => r.exerciseId === exerciseId)
      const next = {
        id: existing?.id ?? `eqr-${exerciseId}`,
        exerciseId,
        requiredQuals: patch.requiredQuals ?? existing?.requiredQuals ?? [],
        preferredQuals: patch.preferredQuals ?? existing?.preferredQuals ?? [],
        excludedQuals: patch.excludedQuals ?? existing?.excludedQuals ?? [],
      }
      return existing
        ? prev.map((r) => (r.exerciseId === exerciseId ? next : r))
        : [...prev, next]
    })
  }, [])

  const addSimulator = useCallback((s: Simulator) => {
    setSimulatorsData((prev) => [...prev, s])
    log("sim.create", `Added simulator ${s.code}`)
  }, [log])

  const updateSimulator = useCallback((s: Simulator) => {
    setSimulatorsData((prev) => prev.map((x) => (x.id === s.id ? s : x)))
    log("sim.edit", `Edited simulator ${s.code}`)
  }, [log])

  const deleteSimulator = useCallback((id: string) => {
    setSimulatorsData((prev) => prev.filter((x) => x.id !== id))
    log("sim.delete", `Removed simulator ${id}`)
  }, [log])

  const addPosition = useCallback((p: Position) => {
    setPositionsData((prev) => [...prev, p])
    log("position.create", `Added position ${p.code}`)
  }, [log])

  const updatePosition = useCallback((p: Position) => {
    setPositionsData((prev) => prev.map((x) => (x.id === p.id ? p : x)))
    log("position.edit", `Edited position ${p.code}`)
  }, [log])

  const deletePosition = useCallback((id: string) => {
    setPositionsData((prev) => prev.filter((x) => x.id !== id))
    setStaffData((prev) => prev.map((s) => ({ ...s, homePositions: s.homePositions.filter((p) => p !== id) })))
    // Drop the seat from any exercise that required it, so no dangling ids remain.
    setExercisesData((prev) =>
      prev.map((e) =>
        e.requiredPositions?.includes(id)
          ? { ...e, requiredPositions: e.requiredPositions.filter((p) => p !== id) }
          : e,
      ),
    )
    log("position.delete", `Removed position ${id}`)
  }, [log])

  const addQualification = useCallback((q: Qualification) => {
    setQualificationsData((prev) => [...prev, q])
    log("qualification.edit", `Added qualification ${q.code}`)
  }, [log])

  const updateQualification = useCallback((q: Qualification) => {
    setQualificationsData((prev) => prev.map((x) => (x.id === q.id ? q : x)))
    log("qualification.edit", `Edited qualification ${q.code}`)
  }, [log])

  const deleteQualification = useCallback((id: string) => {
    setQualificationsData((prev) => prev.filter((x) => x.id !== id))
    setStaffQualificationsData((prev) => prev.filter((sq) => sq.qualificationId !== id))
    log("qualification.edit", `Removed qualification ${id}`)
  }, [log])

  const addAssignment = useCallback((a: Assignment) => {
    setAssignmentsData((prev) => [...prev, a].sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0)))
    log("position.edit", `Added assignment ${a.code} (${a.description})`)
  }, [log])

  const updateAssignment = useCallback((a: Assignment) => {
    setAssignmentsData((prev) =>
      prev.map((x) => (x.id === a.id ? a : x)).sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0)),
    )
    log("position.edit", `Edited assignment ${a.code}`)
  }, [log])

  const deleteAssignment = useCallback((id: string) => {
    setAssignmentsData((prev) => prev.filter((x) => x.id !== id))
    log("position.delete", `Removed assignment ${id}`)
  }, [log])

  const setStaffQualifications = useCallback(
    (staffId: string, quals: { qualificationId: string; expiry?: string }[]) => {
      setStaffQualificationsData((prev) => [
        ...prev.filter((sq) => sq.staffId !== staffId),
        ...quals.map((q, i) => ({
          id: `sq-${staffId}-${q.qualificationId}-${i}`,
          staffId,
          qualificationId: q.qualificationId,
          expiry: q.expiry,
        })),
      ])
      log("qualification.edit", `Updated qualifications for ${staffMap.get(staffId)?.firstName ?? staffId}`)
    },
    [log, staffMap],
  )

  // ── Users & roles ───────────────────────��─────────────────────────────
  const addUser = useCallback((u: User) => {
    setUsers((prev) => [...prev, u])
    log("permission.change", `Added user ${u.name} (${u.role})`)
  }, [log])

  const updateUser = useCallback((u: User) => {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)))
    log("permission.change", `Updated user ${u.name} (${u.role})`)
  }, [log])

  const deleteUser = useCallback((id: string) => {
    setUsers((prev) => prev.filter((x) => x.id !== id))
    log("permission.change", `Removed user ${id}`)
  }, [log])

  // ── Permission matrix ──────────────────────────────���──────────────────
  const togglePermission = useCallback((role: RoleCode, perm: Permission) => {
    setPermissionMatrixState((prev) => {
      const has = prev[role].includes(perm)
      const nextPerms = has ? prev[role].filter((p) => p !== perm) : [...prev[role], perm]
      const next = { ...prev, [role]: nextPerms }
      setPermissionMatrix(next)
      return next
    })
    log("permission.change", `${role}: toggled "${perm}"`)
  }, [log])

  const resetPermissions = useCallback(() => {
    const next: Record<RoleCode, Permission[]> = {
      SP: [...DEFAULT_MATRIX.SP],
      SUP: [...DEFAULT_MATRIX.SUP],
      SOO: [...DEFAULT_MATRIX.SOO],
      STO: [...DEFAULT_MATRIX.STO],
      TL: [...DEFAULT_MATRIX.TL],
      Admin: [...DEFAULT_MATRIX.Admin],
    }
    setPermissionMatrixState(next)
    setPermissionMatrix(next)
    log("permission.change", "Reset permission matrix to defaults")
  }, [log])

  // ── Slot times ─────────────────────────────────────���──────────────────
  const addSlotTime = useCallback((s: SlotTime) => {
    setSlotTimesData((prev) => [...prev, s].sort((a, b) => a.startTime.localeCompare(b.startTime)))
    log("position.edit", `Added slot time ${s.label} (${s.startTime}–${s.endTime})`)
  }, [log])

  const updateSlotTime = useCallback((s: SlotTime) => {
    setSlotTimesData((prev) => prev.map((x) => (x.id === s.id ? s : x)).sort((a, b) => a.startTime.localeCompare(b.startTime)))
    log("position.edit", `Edited slot time ${s.label}`)
  }, [log])

  const deleteSlotTime = useCallback((id: string) => {
    setSlotTimesData((prev) => prev.filter((x) => x.id !== id))
    log("position.delete", `Removed slot time ${id}`)
  }, [log])

  // ── Public holidays ───────────────────────────────────────────────────
  const addPublicHoliday = useCallback((h: PublicHoliday) => {
    setPublicHolidaysData((prev) => [...prev, h].sort((a, b) => a.date.localeCompare(b.date)))
    log("position.edit", `Added public holiday ${h.name} (${h.date})`)
  }, [log])

  const updatePublicHoliday = useCallback((h: PublicHoliday) => {
    setPublicHolidaysData((prev) => prev.map((x) => (x.id === h.id ? h : x)).sort((a, b) => a.date.localeCompare(b.date)))
    log("position.edit", `Edited public holiday ${h.name}`)
  }, [log])

  const deletePublicHoliday = useCallback((id: string) => {
    setPublicHolidaysData((prev) => prev.filter((x) => x.id !== id))
    log("position.delete", `Removed public holiday ${id}`)
  }, [log])

  const addTrainingGroup = useCallback((g: TrainingGroup) => {
    setTrainingGroupsData((prev) => [...prev, g])
    log("position.create", `Added training group ${g.label} (${g.program})`)
  }, [log])

  const updateTrainingGroup = useCallback((g: TrainingGroup) => {
    setTrainingGroupsData((prev) => prev.map((x) => (x.id === g.id ? g : x)))
    log("position.edit", `Edited training group ${g.label} (${g.program})`)
  }, [log])

  const deleteTrainingGroup = useCallback((id: string) => {
    setTrainingGroupsData((prev) => prev.filter((x) => x.id !== id))
    log("position.delete", `Removed training group ${id}`)
  }, [log])

  const value = useMemo<StoreState>(() => ({
    currentRole,
    setCurrentRole,
    currentUser,
    activeProgram,
    setActiveProgram,
    roles: seed.roles,
    staff: staffData,
    users,
    positions: positionsData,
    simulators: simulatorsData,
    exercises: exercisesData,
      courses: coursesData,
      courseSimClass,
      setCourseSimClass,
    // Exposed data excludes ARCHIVED (past-retention) years everywhere; archived
    // records are reachable only through the admin archive (getArchive).
    runs: liveRuns,
    runAssignments: liveRunAssignments,
    leaveRecords: liveLeaveRecords,
    otherTasks: liveOtherTasks,
    trainingSessions: liveTrainingSessions,
    trainingAttendance: liveTrainingAttendance,
    qualifications: qualificationsData,
    staffQualifications: staffQualificationsData,
    staffValidity,
    assignments: assignmentsData,
    positionQualRules: seed.positionQualRules,
    exerciseQualRules: exerciseQualRulesData,
    publicHolidays: publicHolidaysData,
    slotTimes: slotTimesData,
    trainingGroups: trainingGroupsData,
    permissionMatrix,
    auditLogs,
    importHistory: importHistory,
    faultLogs,
    operatorLogs,
    firewallLogs,
    adminLogs,
    scopedStaff,
    scopedPositions,
    scopedSimulators,
    scopedExercises,
    scopedCourses,
    scopedRuns,
    scopedAssignments,
    scopedTrainingSessions,
    scopedLeaveRecords,
    scopedOtherTasks,
    yearRange,
    setYearRange,
    liveYears,
    reportRuns,
    reportRunAssignments,
    reportLeaveRecords,
    reportTrainingSessions,
    reportTrainingLogs,
    reportOtherTasks,
    reportCourses,
    archivedYears,
    archiveSummary,
    getArchive,
    staffById,
    positionById,
    simulatorById,
    exerciseById,
    courseById,
    validityFor,
    isOnLeave,
    isInTraining,
    otherTaskOn,
    assignmentsForRun,
    qualsForStaff,
    updateRunStatus,
    updateRun,
    addRun,
    deleteRun,
    assignStaff,
    linkFlexiblePosition,
    setFlexibleTraining,
    fillPositions,
    clearPositions,
    addLeave,
    updateLeave,
    deleteLeave,
    addOtherTask,
    updateOtherTask,
    deleteOtherTask,
    addTraining,
    updateTraining,
    deleteTraining,
    toggleAttendance,
    trainingLogs,
    addTrainingLog,
    updateTrainingLog,
    deleteTrainingLog,
    addStaff,
    updateStaff,
    deleteStaff,
    addExercise,
    updateExercise,
    deleteExercise,
    addCourse,
    updateCourse,
    deleteCourse,
    setExerciseQualRule,
    addSimulator,
    updateSimulator,
    deleteSimulator,
    addPosition,
    updatePosition,
    deletePosition,
    addQualification,
    updateQualification,
    deleteQualification,
    addAssignment,
    updateAssignment,
    deleteAssignment,
    setStaffQualifications,
    addUser,
    updateUser,
    deleteUser,
    togglePermission,
    resetPermissions,
    addSlotTime,
    updateSlotTime,
    deleteSlotTime,
    addPublicHoliday,
    updatePublicHoliday,
    deletePublicHoliday,
    addTrainingGroup,
    updateTrainingGroup,
    deleteTrainingGroup,
    log,
    logImport,
    notifications,
    recordNotification,
    notificationsForStaff,
    markNotificationRead,
    markNotifyDirty,
    markNotified,
    needsNotify,
  }), [
    currentRole, currentUser, activeProgram, setActiveProgram, staffData, positionsData, simulatorsData, exercisesData,
    coursesData, courseById, addCourse, updateCourse, deleteCourse, courseSimClass, setCourseSimClass,
    exerciseQualRulesData, setExerciseQualRule,
    qualificationsData, staffQualificationsData, users, runs, runAssignments, leaveRecords,
    otherTasksData, trainingSessions, trainingAttendance, trainingLogs, staffValidity, auditLogs, importHistory, faultLogs, operatorLogs, firewallLogs, adminLogs,
    slotTimesData, publicHolidaysData, permissionMatrix, assignmentsData,
    scopedStaff, scopedPositions, scopedSimulators, scopedExercises, scopedCourses, scopedRuns,
    scopedAssignments, scopedTrainingSessions, scopedLeaveRecords, scopedOtherTasks,
    liveRuns, liveRunAssignments, liveLeaveRecords, liveOtherTasks, liveTrainingSessions, liveTrainingAttendance,
    yearRange, setYearRange, liveYears, reportRuns, reportRunAssignments, reportLeaveRecords,
    reportTrainingSessions, reportTrainingLogs, reportOtherTasks, reportCourses, archivedYears, archiveSummary, getArchive,
    staffById, positionById, simulatorById, exerciseById, validityFor, isOnLeave,
    isInTraining, otherTaskOn, assignmentsForRun, qualsForStaff, updateRunStatus, updateRun, addRun,
    deleteRun, assignStaff, linkFlexiblePosition, setFlexibleTraining, fillPositions, clearPositions, addLeave, updateLeave, deleteLeave,
    addOtherTask, updateOtherTask, deleteOtherTask, addTraining,
    updateTraining, deleteTraining,
    addTrainingLog, updateTrainingLog, deleteTrainingLog,
    toggleAttendance, addStaff, updateStaff, deleteStaff, addExercise, updateExercise,
    deleteExercise, setExerciseQualRule, addSimulator, updateSimulator, deleteSimulator, addPosition,
    updatePosition, deletePosition, addQualification, updateQualification, deleteQualification,
    addAssignment, updateAssignment, deleteAssignment,
    setStaffQualifications, addUser, updateUser, deleteUser, togglePermission, resetPermissions,
    addSlotTime, updateSlotTime, deleteSlotTime, addPublicHoliday, updatePublicHoliday, deletePublicHoliday,
    trainingGroupsData, addTrainingGroup, updateTrainingGroup, deleteTrainingGroup,
    log, logImport, notifications, recordNotification, notificationsForStaff, markNotificationRead,
    notifyDirty, markNotifyDirty, markNotified, needsNotify,
  ])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}
