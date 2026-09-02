/* ===========================================================================
 * AUTONOMA — Entity factories
 * ===========================================================================
 * One factory per entity the test scenarios create. Two backends are involved
 * because that is how this app actually stores data:
 *
 *   1. AUTH entities (User, Session, Account, Verification) are REAL Postgres
 *      rows in the Better Auth tables. The User factory uses Better Auth's own
 *      sign-up path so the credential account is hashed exactly like a normal
 *      account — that is what lets the auth callback hand back a usable login.
 *
 *   2. DOMAIN entities (Staff, Simulator, Run, ...) live only inside the app's
 *      single Vercel Blob snapshot (see lib/persisted-state.ts). Their factories
 *      just shape + return the record; the handler's `afterUp` hook flushes them
 *      into the snapshot in ONE write, and `beforeDown` removes them by run tag.
 *
 * Ref resolution: the SDK resolves every `_ref` in the create payload to the
 * `id` returned by the referenced factory BEFORE calling `create`, so by the
 * time a factory runs, fields like `userId` / `runId` / `staffId` are already
 * concrete ids (or null).
 * =========================================================================== */
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { defineFactory, type FactoryRegistry } from "@autonoma-ai/sdk"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { user as userTable, session as sessionTable, account as accountTable, verification as verificationTable } from "@/lib/db/schema"
import { RUN_TAG } from "./snapshot"

// Known password given to every seeded credential account so the auth callback
// (and a human debugging a run) can actually sign in as a seeded user.
export const TEST_PASSWORD = "Autonoma!Test-8f3k"

// Map an entity/model name to the PersistedState slice it belongs in. Models
// that write to Postgres (Session/Account/Verification) or that are pure enums
// (RunStatus) are intentionally absent — afterUp skips anything not listed here.
export const SLICE_FOR_MODEL: Record<string, string> = {
  User: "users",
  Staff: "staff",
  Simulator: "simulators",
  Position: "positions",
  Exercise: "exercises",
  Course: "courses",
  Run: "runs",
  RunAssignment: "runAssignments",
  StaffValidity: "staffValidity",
  LeaveRecord: "leaveRecords",
  TrainingSession: "trainingSessions",
  TrainingAttendance: "trainingAttendance",
  TrainingLogEntry: "trainingLogs",
  Qualification: "qualifications",
  StaffQualification: "staffQualifications",
  ExerciseQualRule: "exerciseQualRules",
  Assignment: "assignments",
  OtherTask: "otherTasks",
  PublicHoliday: "publicHolidays",
  SlotTime: "slotTimes",
  AuditLog: "auditLogs",
  FaultLog: "faultLogs",
  OperatorLog: "operatorLogs",
  FirewallLog: "firewallLogs",
  AdminLog: "adminLogs",
  ImportHistory: "importHistory",
  NotificationRecord: "notifications",
  // Not read by the app UI, but stored under their own keys so the data exists
  // and teardown can remove it (documented limitation in IMPLEMENTATION.md).
  PositionQualRule: "positionQualRules",
  TrainingAttachment: "trainingAttachments",
}

// Loose value used for fields that may arrive as a resolved id string, null, or
// a passthrough object. Keeps validation permissive so real recipe rows pass.
const loose = z.any()

/**
 * Resolve time-relative inputs into concrete values AT SEED TIME.
 *
 * The recipe never hardcodes an instant for a field the app compares against
 * "now" (run dates, validity, leave windows, session expiry, ...). Instead it
 * passes an offset and the factory — which runs at seeding time, so its clock
 * is the correct reference — turns it into a real value:
 *
 *   `<field>OffsetDays: -2`   →  `<field>`  = today minus 2 days  (yyyy-mm-dd)
 *   `<field>OffsetHours: 24`  →  `<field>`  = now plus 24 hours   (ISO datetime)
 *
 * Any field with a literal value and no offset key is left exactly as given.
 */
function resolveOffsets(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue
    if (key.endsWith("OffsetDays")) {
      const field = key.slice(0, -"OffsetDays".length)
      const d = new Date()
      d.setUTCDate(d.getUTCDate() + Number(value))
      out[field] = d.toISOString().slice(0, 10)
      delete out[key]
    } else if (key.endsWith("OffsetHours")) {
      const field = key.slice(0, -"OffsetHours".length)
      out[field] = new Date(Date.now() + Number(value) * 3_600_000).toISOString()
      delete out[key]
    }
  }
  return out
}

/**
 * Build a DOMAIN (blob-backed) factory. `create` simply returns the row with a
 * guaranteed id plus the run tag. Persistence + teardown happen in bulk in the
 * handler hooks, so no per-record teardown is needed here.
 */
function domainFactory(shape: z.ZodRawShape) {
  return defineFactory({
    inputSchema: z.object(shape).passthrough(),
    create: (raw: Record<string, unknown>, ctx) => {
      const data = resolveOffsets(raw)
      const id = typeof data.id === "string" && data.id ? data.id : randomUUID()
      return { ...data, id, [RUN_TAG]: ctx.testRunId }
    },
  })
}

const iso = (v: unknown): string | undefined => {
  if (v == null) return undefined
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export const factories: FactoryRegistry = {
  // ── AUTH (real Postgres via Better Auth) ────────────────────────────────
  User: defineFactory({
    inputSchema: z
      .object({
        id: loose.optional(),
        name: z.string(),
        email: z.string(),
        role: loose.optional(),
        active: loose.optional(),
        lastLogin: loose.optional(),
        staffId: loose.optional(),
      })
      .passthrough(),
    // refSchema documents what teardown receives (the created Postgres user id).
    refSchema: z
      .object({ id: z.string(), email: z.string() })
      .passthrough(),
    create: async (data: Record<string, unknown>, ctx) => {
      const email = String(data.email)
      const name = String(data.name ?? email)
      // Real sign-up → creates the Better Auth user AND a hashed credential
      // account, so a normal email+password login works for this user.
      const res = await auth.api.signUpEmail({
        body: { email, password: TEST_PASSWORD, name },
      })
      const authUserId = (res as { user?: { id?: string } })?.user?.id
      if (!authUserId) throw new Error(`signUpEmail returned no user id for ${email}`)

      // Apply the app access level + verified flag directly.
      const appRole = String(data.role ?? "SP").toUpperCase()
      await db
        .update(userTable)
        .set({ appRole, emailVerified: true, name })
        .where(eq(userTable.id, authUserId))

      // The returned id is the Postgres user id so Account/Session refs line up.
      // The blob `users` slice row is projected from these fields in afterUp.
      return {
        id: authUserId,
        email,
        name,
        role: data.role ?? "SP",
        active: data.active ?? true,
        lastLogin: iso(data.lastLogin) ?? new Date().toISOString(),
        ...(typeof data.staffId === "string" ? { staffId: data.staffId } : {}),
        [RUN_TAG]: ctx.testRunId,
      }
    },
    teardown: async (record: Record<string, unknown>) => {
      // Cascades to account + session rows via the schema's onDelete: cascade.
      if (typeof record.id === "string") {
        await db.delete(userTable).where(eq(userTable.id, record.id))
      }
    },
  }),

  Account: defineFactory({
    inputSchema: z
      .object({ id: loose.optional(), userId: loose, accountId: loose.optional(), providerId: loose.optional() })
      .passthrough(),
    // The credential account already exists (created by signUpEmail in the User
    // factory). We reflect the scenario's Account entity without inserting a
    // duplicate credential row; teardown is handled by the User cascade.
    create: (data: Record<string, unknown>, ctx) => ({
      id: typeof data.id === "string" && data.id ? data.id : randomUUID(),
      userId: data.userId ?? null,
      accountId: data.accountId ?? null,
      providerId: data.providerId ?? "credentials",
      [RUN_TAG]: ctx.testRunId,
    }),
  }),

  Session: defineFactory({
    inputSchema: z
      .object({
        id: loose.optional(),
        userId: loose,
        token: loose.optional(),
        expiresAt: loose.optional(),
        ipAddress: loose.optional(),
        userAgent: loose.optional(),
      })
      .passthrough(),
    refSchema: z.object({ id: z.string() }).passthrough(),
    create: async (data: Record<string, unknown>, ctx) => {
      const id = typeof data.id === "string" && data.id ? data.id : randomUUID()
      const userId = String(data.userId)
      const token = typeof data.token === "string" && data.token ? data.token : `autonoma-${randomUUID()}`
      const expiresAt = iso(data.expiresAt) ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString()
      await db.insert(sessionTable).values({
        id,
        userId,
        token,
        expiresAt: new Date(expiresAt),
        ipAddress: typeof data.ipAddress === "string" ? data.ipAddress : null,
        userAgent: typeof data.userAgent === "string" ? data.userAgent : null,
      })
      return { id, userId, token, [RUN_TAG]: ctx.testRunId }
    },
    teardown: async (record: Record<string, unknown>) => {
      if (typeof record.id === "string") {
        await db.delete(sessionTable).where(eq(sessionTable.id, record.id))
      }
    },
  }),

  Verification: defineFactory({
    inputSchema: z
      .object({ id: loose.optional(), identifier: z.string(), value: loose.optional(), expiresAt: loose.optional() })
      .passthrough(),
    refSchema: z.object({ id: z.string() }).passthrough(),
    create: async (data: Record<string, unknown>, ctx) => {
      const id = typeof data.id === "string" && data.id ? data.id : randomUUID()
      const expiresAt = iso(data.expiresAt) ?? new Date(Date.now() + 3600 * 1000).toISOString()
      await db.insert(verificationTable).values({
        id,
        identifier: String(data.identifier),
        value: String(data.value ?? randomUUID()),
        expiresAt: new Date(expiresAt),
      })
      return { id, [RUN_TAG]: ctx.testRunId }
    },
    teardown: async (record: Record<string, unknown>) => {
      if (typeof record.id === "string") {
        await db.delete(verificationTable).where(eq(verificationTable.id, record.id))
      }
    },
  }),

  // ── DOMAIN (blob snapshot) ──────────────────────────────────────────────
  Staff: domainFactory({
    initials: loose.optional(),
    firstName: z.string(),
    lastName: z.string(),
    rank: loose.optional(),
    email: loose.optional(),
    programs: loose.optional(),
    active: loose.optional(),
    joined: loose.optional(),
    homePositions: loose.optional(),
  }),
  Simulator: domainFactory({
    code: z.string(),
    name: z.string(),
    location: loose.optional(),
    active: loose.optional(),
    program: loose.optional(),
    simulatorType: loose.optional(),
  }),
  Position: domainFactory({
    code: z.string(),
    name: z.string(),
    validityDays: loose.optional(),
    program: loose.optional(),
    category: loose.optional(),
  }),
  Exercise: domainFactory({
    code: z.string(),
    name: z.string(),
    program: loose.optional(),
    simulatorId: loose.optional(),
    requiredPositions: loose.optional(),
    isValidation: loose.optional(),
    durationMin: loose.optional(),
  }),
  Course: domainFactory({
    code: z.string(),
    name: z.string(),
    kind: loose.optional(),
    exerciseIds: loose.optional(),
    startDate: loose.optional(),
    endDate: loose.optional(),
  }),
  Run: domainFactory({
    date: loose.optional(),
    slotTime: loose.optional(),
    simulatorId: loose.optional(),
    exerciseId: loose.optional(),
    status: loose.optional(),
    requiredPositions: loose.optional(),
  }),
  RunAssignment: domainFactory({
    runId: loose,
    positionId: loose.optional(),
    staffId: loose.optional(),
    manualOverride: loose.optional(),
    linkedPositionId: loose.optional(),
    trainingMode: loose.optional(),
  }),
  StaffValidity: defineFactory({
    inputSchema: z
      .object({ staffId: loose, positionId: loose, lastDateSat: loose.optional(), validityDays: loose.optional() })
      .passthrough(),
    create: (data: Record<string, unknown>, ctx) => ({
      ...data,
      // StaffValidity has no natural id; synthesize a stable one.
      id: typeof data.id === "string" && data.id ? data.id : `${String(data.staffId)}:${String(data.positionId)}`,
      [RUN_TAG]: ctx.testRunId,
    }),
  }),
  LeaveRecord: domainFactory({
    staffId: loose,
    type: loose.optional(),
    startDate: loose.optional(),
    endDate: loose.optional(),
    approval: loose.optional(),
  }),
  TrainingSession: domainFactory({
    title: z.string(),
    type: loose.optional(),
    date: loose.optional(),
    instructorId: loose.optional(),
    status: loose.optional(),
  }),
  TrainingAttendance: domainFactory({
    sessionId: loose,
    staffId: loose,
    attended: loose.optional(),
  }),
  TrainingLogEntry: domainFactory({
    date: loose.optional(),
    program: loose.optional(),
    ojtiId: loose.optional(),
    traineeId: loose.optional(),
    hours: loose.optional(),
    rating: loose.optional(),
  }),
  Qualification: domainFactory({
    code: z.string(),
    name: z.string(),
    effect: loose.optional(),
    description: loose.optional(),
  }),
  StaffQualification: domainFactory({
    staffId: loose,
    qualificationId: loose,
    expiry: loose.optional(),
  }),
  PositionQualRule: domainFactory({
    positionId: loose,
    requiredQuals: loose.optional(),
    preferredQuals: loose.optional(),
    excludedQuals: loose.optional(),
  }),
  ExerciseQualRule: domainFactory({
    exerciseId: loose,
    requiredQuals: loose.optional(),
    preferredQuals: loose.optional(),
    excludedQuals: loose.optional(),
  }),
  Assignment: domainFactory({
    code: z.string(),
    description: loose.optional(),
    group: loose.optional(),
    type: loose.optional(),
    appliesTo: loose.optional(),
    sortOrder: loose.optional(),
  }),
  OtherTask: domainFactory({
    title: z.string(),
    staffIds: loose.optional(),
    startDate: loose.optional(),
    endDate: loose.optional(),
    program: loose.optional(),
  }),
  PublicHoliday: domainFactory({
    date: loose.optional(),
    name: z.string(),
  }),
  SlotTime: domainFactory({
    label: z.string(),
    startTime: loose.optional(),
    endTime: loose.optional(),
  }),
  AuditLog: domainFactory({
    timestamp: loose.optional(),
    user: loose.optional(),
    action: loose.optional(),
    detail: loose.optional(),
  }),
  FaultLog: domainFactory({
    timestamp: loose.optional(),
    severity: loose.optional(),
    status: loose.optional(),
    system: loose.optional(),
    description: loose.optional(),
    reportedBy: loose.optional(),
  }),
  OperatorLog: domainFactory({
    timestamp: loose.optional(),
    shift: loose.optional(),
    operator: loose.optional(),
    category: loose.optional(),
    entry: loose.optional(),
  }),
  FirewallLog: domainFactory({
    timestamp: loose.optional(),
    action: loose.optional(),
    sourceIp: loose.optional(),
    destinationIp: loose.optional(),
    rule: loose.optional(),
    description: loose.optional(),
  }),
  AdminLog: domainFactory({
    timestamp: loose.optional(),
    user: loose.optional(),
    action: loose.optional(),
    target: loose.optional(),
    detail: loose.optional(),
  }),
  ImportHistory: domainFactory({
    filename: z.string(),
    date: loose.optional(),
    user: loose.optional(),
    rowsTotal: loose.optional(),
    rowsAccepted: loose.optional(),
  }),
  NotificationRecord: domainFactory({
    staffId: loose,
    channel: loose.optional(),
    kind: loose.optional(),
    subject: loose.optional(),
    sentAt: loose.optional(),
    sentBy: loose.optional(),
  }),
  TrainingAttachment: domainFactory({
    name: z.string(),
    contentType: loose.optional(),
    size: loose.optional(),
    uploadedAt: loose.optional(),
  }),

  // Pure enum listed in the scenario; no table and nothing to persist.
  RunStatus: defineFactory({
    inputSchema: z.object({ value: loose.optional() }).passthrough(),
    create: (data: Record<string, unknown>, ctx) => ({
      id: typeof data.id === "string" && data.id ? data.id : String(data.value ?? randomUUID()),
      [RUN_TAG]: ctx.testRunId,
    }),
  }),
}
