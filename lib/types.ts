/* ===========================================================================
 * TYPES — the "shape" of every piece of data in the app
 * ===========================================================================
 * This file does NOT contain real data or logic. It only describes what fields
 * each kind of record has (a Staff member, a Run, a Leave record, etc.) so the
 * rest of the app stays consistent and the editor can catch mistakes.
 *
 * HOW TO READ IT: each `interface X { ... }` is one record type. Each line
 * inside is one field, written as `fieldName: fieldType`. A `?` after the name
 * (e.g. `notes?: string`) means the field is optional.
 *
 * SAFE TO CHANGE:
 *   - Adding a new optional field (e.g. `room?: string`) is low-risk.
 * BE CAREFUL:
 *   - Renaming or removing a field will break every file that uses it.
 *   - The string options in unions (e.g. LeaveType) must match what the rest
 *     of the app and the sample data use.
 * =========================================================================== */

// ── Roles & access control ──────────────────────────────────────────────
// The six access levels. RoleLevel is the numeric rank (higher = more power),
// RoleCode is the short label shown in the UI. See lib/permissions.ts for what
// each role is actually allowed to do.
//   1 SP · 2 SUP · 3 SOO · 4 STO · 5 TL · 6 Admin
// SOO (Simulator Operational Officer) and STO (Simulator Training Officer) are
// mid-level officer roles that sit above Supervisor and just below Team Lead.
export type RoleLevel = 1 | 2 | 3 | 4 | 5 | 6
export type RoleCode = "SP" | "SUP" | "SOO" | "STO" | "TL" | "Admin"

export interface Role {
  code: RoleCode
  level: RoleLevel
  name: string
  description: string
}

export interface User {
  id: string
  name: string
  email: string
  role: RoleCode
  staffId?: string
  active: boolean
  lastLogin: string
}

// ── Core domain ─────────────────────────────────────────────────────────
export interface Staff {
  id: string
  initials: string
  firstName: string
  lastName: string
  rank: string
  email: string
  phone: string
  homePositions: string[] // position ids
  programs: string[] // RADAR, TOWER, or both — which departments this person belongs to
  active: boolean
  joined: string
  notes?: string
}

export interface Simulator {
  id: string
  code: string
  name: string
  location: string
  active: boolean
  program?: string // RADAR or TOWER (SimulatorGroup)
  simulatorType?: string // Radar, Tower
  siteAirport?: string // physical site airport, e.g. DWC
  coverageArea?: string // simulated coverage, e.g. Dubai Airspace, DXB
  generation?: string // Legacy, Current, Future
  transitionStatus?: string // Current, Legacy / Transition, Installation
  replacedBy?: string // successor sim codes
  notes?: string
  sortOrder?: number
}

export interface Position {
  id: string
  code: string // AMR, DSR ...
  name: string
  description: string
  validityDays: number
  program: string // RADAR or TOWER
  group?: string // e.g. "Group 1"
  category?: string // e.g. Coordinator, Ground, Aerodrome
  simulatorUnit?: string // e.g. "Tower Sim 1", "Tower Sim 2"
  airport?: string // simulated airport, e.g. DXB, DWC/EFTA
  active?: boolean // operational status
  sortOrder?: number
}

export type ExerciseStatus =
  | "tentative"
  | "confirmed"
  | "cancelled"
  | "postponed"
  | "completed"

export interface Exercise {
  id: string
  code: string
  name: string
  program: string // delivery program / category (e.g. "RADAR")
  description: string
  durationMin: number
  simulatorId: string // simulator that delivers this course
  requiredStaff: number // total headcount / resources required
  isValidation?: boolean // "V" courses are validation deliveries
  requiredPositions: string[] // position ids (named-seat model, kept alongside headcount)
  active: boolean
}

// ── Courses ─────────────────────────────────────────────────────────────
// A Course groups several exercises into one delivery that runs over a date
// range (typically several weeks) and needs a fixed number of people for its
// whole duration. Courses may overlap; that is expected and shown on the Gantt.
//   - kind "exercise" = a normal simulator course made of exercises.
//   - kind "training" = a training course/programme (often shorter, days/weeks).
export type CourseKind = "exercise" | "training"

export interface Course {
  id: string
  code: string
  name: string
  program: string // RADAR or TOWER
  kind: CourseKind
  exerciseIds: string[] // exercises that make up this course
  startDate: string // yyyy-mm-dd
  endDate: string // yyyy-mm-dd
  requiredPeople: number // headcount needed for the whole course
  notes?: string
  active: boolean
  cancelled?: boolean // whole course called off (still shown, marked cancelled)
}

export type RunStatus = ExerciseStatus

export interface Run {
  id: string
  date: string // yyyy-mm-dd
  slotTime: string // e.g. 08:00
  simulatorId: string
  exerciseId: string
  status: RunStatus
  requiredPositions: string[] // position ids
  requiredStaff?: number // headcount required for this run (from course)
  notes?: string
  cancellationReason?: string
  statusChangedBy?: string
  statusChangedAt?: string
}

export interface RunAssignment {
  id: string
  runId: string
  positionId: string
  staffId: string | null
  manualOverride?: boolean
  overrideReason?: string
  // When this seat is a FLEXIBLE support position, linkedPositionId names the
  // PRIMARY position it is backing up in this run (e.g. a flexible seat helping
  // out "Arrival"). On a completed run the person seated here earns currency for
  // the linked primary position exactly as if they had sat it directly, so a
  // support shift still counts toward their validity. Ignored for normal seats.
  linkedPositionId?: string
  // FLEXIBLE seat used for TRAINING. When true the occupant is a trainee: NO
  // currency is recorded for this seat or its linked position (the shift does
  // not count toward validity), and the "must be validated" requirement is
  // waived so an un-validated person may be seated. Ignored for normal seats.
  trainingMode?: boolean
}

// ── Validity / currency ─────────────────────────────────────────────────
export type ValidityStatus = "valid" | "expiring" | "expired" | "never"

export interface StaffValidity {
  staffId: string
  positionId: string
  lastDateSat: string | null
  validityDays: number
}

// ── Leave ───────────────────────────────────────────────────────────────
export type LeaveType =
  | "Annual"
  | "Sick"
  | "Training"
  | "Course"
  | "Compassionate"
  | "Other"
export type ApprovalStatus = "pending" | "approved" | "rejected"

export interface LeaveRecord {
  id: string
  staffId: string
  type: LeaveType
  startDate: string
  endDate: string
  fullDay: boolean
  approval: ApprovalStatus
  notes?: string
}

// ── Training ────────────────────────────────────────────────────────────
export interface TrainingAttachment {
  id: string
  name: string
  pathname: string // private blob pathname, used to stream via the file route
  url: string // private blob url, used for deletion
  contentType: string
  size: number
  uploadedAt: string
}

export interface TrainingSession {
  id: string
  title: string
  type: string
  date: string
  slotTime: string
  instructorId: string
  simulatorId?: string
  durationMin?: number
  positionIds?: string[]
  linkedRunId?: string
  notes?: string
  status?: "scheduled" | "completed"
  attachments?: TrainingAttachment[]
}

export interface TrainingAttendance {
  id: string
  sessionId: string
  staffId: string
  attended: boolean
}

// ── OJTI training log ─────────────────────────────────────────────────────
// A daily on-the-job training record written by an OJTI (instructor) for a
// single trainee: which position group was worked, how many hours were trained
// that day, a performance rating, and free-text feedback for the trainee.
export interface TrainingLogEntry {
  id: string
  date: string            // day of training (ISO)
  program: "RADAR" | "TOWER"
  groupId: string         // training-group id (see lib/training-groups.ts)
  positionIds: string[]   // positions within the group actually trained
  ojtiId: string          // instructor (OJTI) staff id
  traineeId: string       // trainee staff id
  hours: number           // hours trained that day
  rating?: number         // optional 1–5 overall performance rating
  strengths?: string      // what went well
  areasToImprove?: string // development points
  feedback?: string       // general remarks / debrief notes
  createdAt: string        // ISO datetime the entry was written
}

// ── Qualifications ────────────────────────────���─────────────────────────
export type QualEffect = "allow" | "restrict"
export interface Qualification {
  id: string
  code: string
  name: string
  effect: QualEffect
  description: string
}

export interface StaffQualification {
  id: string
  staffId: string
  qualificationId: string
  expiry?: string // optional expiry for temporary restrictions/quals
}

export interface PositionQualRule {
  id: string
  positionId: string
  requiredQuals: string[]
  preferredQuals: string[]
  excludedQuals: string[]
  allowExpiredWithWarning: boolean
  allowManualOverride: boolean
}

export interface ExerciseQualRule {
  id: string
  exerciseId: string
  requiredQuals: string[]
  preferredQuals: string[]
  excludedQuals: string[]
}

// ── Assignment categories (leave, duties, training, roster codes) ────────
// These are non-simulator allocations a staff member can be given on a day.
export interface Assignment {
  id: string
  code: string // L, LP, WR, OJTI ...
  description: string // human-readable label
  group: string // Leave, Training, Roster, Sick Leave ...
  type: string // Leave, Remote Work, Instructor ...
  appliesTo: string // "RADAR / TOWER", "RADAR", "TOWER"
  active: boolean
  sortOrder: number
}

// ── Other tasks ───────────────────────────────────────────────────────────
// Non-simulator commitments (meetings, projects, detachments, etc). While a
// task runs, every assigned person is considered busy and is excluded from
// exercises and the Fill Positions auto-assigner for its date range.
export interface OtherTask {
  id: string
  title: string
  description?: string // the free-text "area" describing what the task is
  staffIds: string[] // people committed to this task
  startDate: string // yyyy-mm-dd
  startTime?: string // HH:mm
  endDate: string // yyyy-mm-dd
  endTime?: string // HH:mm
  durationMin?: number // optional duration alternative to an explicit end time
  classroom?: string // optional room / venue
  program?: string // RADAR / TOWER — optional scoping
}

// ���─ Misc ────────────────────────────────────────────────────────────────
export interface PublicHoliday {
  id: string
  date: string
  name: string
}

export interface SlotTime {
  id: string
  label: string
  startTime: string // e.g. 08:00
  endTime: string // e.g. 11:00
}

export type AuditAction =
  | "run.create"
  | "run.edit"
  | "run.delete"
  | "exercise.confirm"
  | "exercise.cancel"
  | "exercise.create"
  | "exercise.edit"
  | "exercise.delete"
  | "course.create"
  | "course.edit"
  | "course.delete"
  | "excel.import"
  | "assignment.change"
  | "assignment.override"
  | "qualification.edit"
  | "leave.edit"
  | "permission.change"
  | "staff.create"
  | "staff.edit"
  | "staff.delete"
  | "sim.create"
  | "sim.edit"
  | "sim.delete"
  | "position.create"
  | "position.edit"
  | "position.delete"
  | "othertask.create"
  | "othertask.edit"
  | "othertask.delete"
  | "message.send"

export interface AuditLog {
  id: string
  timestamp: string
  user: string
  action: AuditAction
  detail: string
}

// ── Operational logs ────────────────────────────────────────────────────────
// Five distinct log categories. AuditLog (above) covers the audit trail.
// The four below cover operational, security and fault domains.

export type FaultSeverity = "critical" | "major" | "minor" | "info"
export type FaultStatus   = "open" | "in-progress" | "resolved" | "closed"

export interface FaultLog {
  id: string
  timestamp: string       // ISO datetime
  severity: FaultSeverity
  status: FaultStatus
  system: string          // e.g. "TS1 Motion Platform", "Instructor Station"
  description: string
  reportedBy: string      // user name / initials
  resolvedAt?: string     // ISO datetime when closed
  resolution?: string     // free-text close notes
}

export type OperatorLogCategory = "briefing" | "run" | "handover" | "incident" | "maintenance" | "note"

export interface OperatorLog {
  id: string
  timestamp: string
  shift: "morning" | "afternoon" | "night"
  operator: string        // name / initials
  category: OperatorLogCategory
  entry: string           // free-text narrative
  linkedRunId?: string
}

export type FirewallAction = "allow" | "deny" | "drop" | "alert"

export interface FirewallLog {
  id: string
  timestamp: string
  action: FirewallAction
  sourceIp: string
  destinationIp: string
  port: number
  protocol: string        // TCP / UDP / ICMP
  rule: string            // rule name or ID that matched
  description: string
}

export type AdminLogAction =
  | "user.create"
  | "user.edit"
  | "user.delete"
  | "role.change"
  | "permission.change"
  | "config.change"
  | "backup.create"
  | "backup.restore"
  | "system.restart"
  | "session.login"
  | "session.logout"
  | "session.timeout"

export interface AdminLog {
  id: string
  timestamp: string
  user: string
  action: AdminLogAction
  target?: string         // user / resource affected
  detail: string
  ipAddress: string
}

export interface ImportHistory {
  id: string
  filename: string
  date: string
  user: string
  rowsTotal: number
  rowsAccepted: number
  rowsRejected: number
}

// ── Notifications ───────────────────────────────────────────────────────
export type NotificationChannel = "email" | "sms" | "copy"
// "custom" = a free-text message composed on the Send Message page.
export type NotificationKind = "assignment" | "weekly" | "daily" | "training" | "custom"

export interface NotificationRecord {
  id: string
  staffId: string
  channel: NotificationChannel
  kind: NotificationKind
  subject: string
  body: string
  to: string // email address or phone number used
  sentAt: string // ISO timestamp
  sentBy: string // acting user name
  simulated: boolean // true when no email provider key configured (demo mode)
  readAt?: string // ISO timestamp when the recipient first opened/read it
  attachments?: TrainingAttachment[] // openable files included with a custom message
}
