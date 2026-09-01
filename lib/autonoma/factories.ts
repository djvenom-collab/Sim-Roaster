/* ===========================================================================
 * AUTONOMA — factory registry
 * ===========================================================================
 * One factory per model the scenarios seed. Each factory:
 *   - validates the create payload against a Zod `inputSchema` (this also drives
 *     the `discover` schema the dashboard reads),
 *   - materialises a record that matches the app's real type (lib/types.ts),
 *   - persists it where the app actually reads it, and
 *   - returns at least `{ id }` so the SDK can wire `_ref` links and tear it
 *     down later.
 *
 * WHERE DATA GOES
 *   - User / Session / Account / Verification are REAL Better Auth + Neon rows
 *     (lib/autonoma/auth.ts, lib/db) so the runner can log in for real.
 *   - Every other model is a slice of the app's per-run Blob snapshot
 *     (lib/autonoma/run-store.ts). The store applies that snapshot VERBATIM
 *     (see the `__autonoma` marker) so seeded data lands exactly as written.
 *
 * DATES
 *   Recipes are stored once and replayed for months, so date fields are carried
 *   as OFFSETS in days from the seeding moment (negative = past) and resolved to
 *   a real instant here (lib/autonoma/dates.ts). A literal ISO string is also
 *   accepted and passed through unchanged.
 * =========================================================================== */
import { z } from "zod"
import { defineFactory } from "@autonoma-ai/sdk"
import type { FactoryRegistry } from "@autonoma-ai/sdk"
import { appendToSlice } from "./run-store"
import { isoDate, isoDateTime } from "./dates"
import {
  createAuthUser,
  deleteAuthUser,
  SEED_PASSWORD,
} from "./auth"
import { db } from "@/lib/db"
import { session, account, verification } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// ── Shared helpers ─────────────────────────────────────────────────────────

/** A date offset (days from seeding) OR a literal ISO/plain-string date. */
const dateInput = z.union([z.number(), z.string()])

/** Resolve a date-only (yyyy-mm-dd) field: number → offset days, string → as-is. */
function resolveDate(v: unknown, fallbackDays = 0): string {
  if (typeof v === "number") return isoDate(v)
  if (typeof v === "string" && v.trim()) return v
  return isoDate(fallbackDays)
}

/** Resolve a full-timestamp field: number → offset days, string → as-is. */
function resolveDateTime(v: unknown, fallbackDays = 0, fallbackMin = 0): string {
  if (typeof v === "number") return isoDateTime(v)
  if (typeof v === "string" && v.trim()) return v
  return isoDateTime(fallbackDays, fallbackMin)
}

/** Nullable date: preserves an explicit null / "never" (used by currency fields). */
function resolveNullableDate(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === "string" && (v.trim() === "" || v.toLowerCase() === "never")) return null
  return resolveDate(v)
}

/** Stable per-run fallback id when the payload omits one. */
function fallbackId(prefix: string, testRunId: string, extra?: string): string {
  const short = testRunId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)
  return `${prefix}-${short}${extra ? `-${extra}` : ""}-${Math.random().toString(36).slice(2, 7)}`
}

// ===========================================================================
// AUTH MODELS — real Better Auth + Neon rows
// ===========================================================================

const userFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      name: z.string(),
      email: z.string(),
      appRole: z.string().optional().describe("SP | SUP | SOO | STO | TL | Admin"),
      createdAt: dateInput.optional(),
    })
    .passthrough(),
  async create(data) {
    // Real signed-up user (hashed password + account row) tagged with appRole.
    const created = await createAuthUser({
      email: data.email,
      name: data.name,
      appRole: data.appRole ?? "SP",
    })
    // Return the REAL Better Auth id so Session/Account `_ref` links resolve to
    // a valid FK, plus the fields the auth callback needs to sign in.
    return {
      id: created.id,
      email: created.email,
      name: created.name,
      appRole: created.appRole,
      password: SEED_PASSWORD,
    }
  },
  async teardown(record) {
    // Deleting the user cascades its session + account rows (schema onDelete).
    await deleteAuthUser(String(record.id))
  },
})

const sessionFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      userId: z.string().describe("_ref to a User id"),
      token: z.string().optional(),
      expiresAt: dateInput.optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("sess", ctx.testRunId)
    const token = data.token ?? fallbackId("tok", ctx.testRunId)
    await db
      .insert(session)
      .values({
        id,
        userId: data.userId,
        token,
        expiresAt: new Date(resolveDateTime(data.expiresAt, 1)),
      })
      .onConflictDoNothing()
    return { id, userId: data.userId, token }
  },
  async teardown(record) {
    await db.delete(session).where(eq(session.id, String(record.id)))
  },
})

const accountFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      userId: z.string().describe("_ref to a User id"),
      accountId: z.string().optional(),
      providerId: z.string().optional(),
      provider: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("acc", ctx.testRunId)
    await db
      .insert(account)
      .values({
        id,
        userId: data.userId,
        accountId: data.accountId ?? id,
        providerId: data.providerId ?? data.provider ?? "credential",
      })
      .onConflictDoNothing()
    return { id, userId: data.userId }
  },
  async teardown(record) {
    await db.delete(account).where(eq(account.id, String(record.id)))
  },
})

const verificationFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      identifier: z.string(),
      value: z.string(),
      expiresAt: dateInput.optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ver", ctx.testRunId)
    await db
      .insert(verification)
      .values({
        id,
        identifier: data.identifier,
        value: data.value,
        expiresAt: new Date(resolveDateTime(data.expiresAt, 0, 60)),
      })
      .onConflictDoNothing()
    return { id }
  },
  async teardown(record) {
    await db.delete(verification).where(eq(verification.id, String(record.id)))
  },
})

// ===========================================================================
// DOMAIN MODELS — per-run Blob snapshot slices
// ===========================================================================
//
// These share a simple shape: build the typed record, append it to its slice,
// echo the id back so cross-references (`_ref`) stay stable. `slice(...)`
// captures that pattern; a few models need custom date/nesting logic and are
// written out in full.

const staffFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      initials: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      rank: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      homePositions: z.array(z.string()).optional(),
      programs: z.array(z.string()).optional(),
      active: z.boolean().optional(),
      joined: dateInput.optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("staff", ctx.testRunId)
    const record = {
      id,
      initials: data.initials,
      firstName: data.firstName,
      lastName: data.lastName,
      rank: data.rank ?? "Controller",
      email: data.email ?? "",
      phone: data.phone ?? "",
      homePositions: data.homePositions ?? [],
      programs: data.programs ?? [],
      active: data.active ?? true,
      joined: resolveDate(data.joined, -365),
      ...(data.notes ? { notes: data.notes } : {}),
    }
    await appendToSlice(ctx.testRunId, "staff", record)
    return record
  },
})

const simulatorFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      code: z.string(),
      name: z.string(),
      location: z.string().optional(),
      program: z.string().optional(),
      active: z.boolean().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("sim", ctx.testRunId)
    const record = {
      id,
      code: data.code,
      name: data.name,
      location: data.location ?? "Simulator Centre",
      active: data.active ?? true,
      ...(data.program ? { program: data.program } : {}),
    }
    await appendToSlice(ctx.testRunId, "simulators", record)
    return record
  },
})

const positionFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      code: z.string(),
      name: z.string(),
      description: z.string().optional(),
      validityDays: z.number().optional(),
      program: z.string(),
      active: z.boolean().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("pos", ctx.testRunId)
    const record = {
      id,
      code: data.code,
      name: data.name,
      description: data.description ?? data.name,
      validityDays: data.validityDays ?? 90,
      program: data.program,
      active: data.active ?? true,
    }
    await appendToSlice(ctx.testRunId, "positions", record)
    return record
  },
})

const exerciseFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      code: z.string(),
      name: z.string(),
      program: z.string(),
      description: z.string().optional(),
      durationMin: z.number().optional(),
      simulatorId: z.string(),
      requiredStaff: z.number().optional(),
      isValidation: z.boolean().optional(),
      requiredPositions: z.array(z.string()).optional(),
      active: z.boolean().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ex", ctx.testRunId)
    const requiredPositions = data.requiredPositions ?? []
    const record = {
      id,
      code: data.code,
      name: data.name,
      program: data.program,
      description: data.description ?? data.name,
      durationMin: data.durationMin ?? 120,
      simulatorId: data.simulatorId,
      requiredStaff: data.requiredStaff ?? requiredPositions.length ?? 2,
      requiredPositions,
      active: data.active ?? true,
      ...(data.isValidation != null ? { isValidation: data.isValidation } : {}),
    }
    await appendToSlice(ctx.testRunId, "exercises", record)
    return record
  },
})

const courseFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      code: z.string(),
      name: z.string(),
      program: z.string(),
      kind: z.enum(["exercise", "training"]).optional(),
      exerciseIds: z.array(z.string()).optional(),
      startDate: dateInput.optional(),
      endDate: dateInput.optional(),
      requiredPeople: z.number().optional(),
      active: z.boolean().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("crs", ctx.testRunId)
    const record = {
      id,
      code: data.code,
      name: data.name,
      program: data.program,
      kind: data.kind ?? "exercise",
      exerciseIds: data.exerciseIds ?? [],
      startDate: resolveDate(data.startDate, -7),
      endDate: resolveDate(data.endDate, 21),
      requiredPeople: data.requiredPeople ?? 2,
      active: data.active ?? true,
    }
    await appendToSlice(ctx.testRunId, "courses", record)
    return record
  },
})

const runFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      date: dateInput.optional(),
      slotTime: z.string().optional(),
      simulatorId: z.string(),
      exerciseId: z.string(),
      status: z.enum(["tentative", "confirmed", "cancelled", "postponed", "completed"]).optional(),
      requiredPositions: z.array(z.string()).optional(),
      requiredStaff: z.number().optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("run", ctx.testRunId)
    const record = {
      id,
      date: resolveDate(data.date, 0),
      slotTime: data.slotTime ?? "08:00",
      simulatorId: data.simulatorId,
      exerciseId: data.exerciseId,
      status: data.status ?? "tentative",
      requiredPositions: data.requiredPositions ?? [],
      ...(data.requiredStaff != null ? { requiredStaff: data.requiredStaff } : {}),
      ...(data.notes ? { notes: data.notes } : {}),
    }
    await appendToSlice(ctx.testRunId, "runs", record)
    return record
  },
})

const runAssignmentFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      runId: z.string(),
      positionId: z.string(),
      staffId: z.string().nullable().optional(),
      manualOverride: z.boolean().optional(),
      overrideReason: z.string().optional(),
      linkedPositionId: z.string().optional(),
      trainingMode: z.boolean().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ra", ctx.testRunId)
    const record = {
      id,
      runId: data.runId,
      positionId: data.positionId,
      staffId: data.staffId ?? null,
      ...(data.manualOverride != null ? { manualOverride: data.manualOverride } : {}),
      ...(data.overrideReason ? { overrideReason: data.overrideReason } : {}),
      ...(data.linkedPositionId ? { linkedPositionId: data.linkedPositionId } : {}),
      ...(data.trainingMode != null ? { trainingMode: data.trainingMode } : {}),
    }
    await appendToSlice(ctx.testRunId, "runAssignments", record)
    return record
  },
})

const staffValidityFactory = defineFactory({
  inputSchema: z
    .object({
      staffId: z.string(),
      positionId: z.string(),
      lastDateSat: dateInput.nullable().optional(),
      validityDays: z.number().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const record = {
      staffId: data.staffId,
      positionId: data.positionId,
      lastDateSat: resolveNullableDate(data.lastDateSat),
      validityDays: data.validityDays ?? 90,
    }
    await appendToSlice(ctx.testRunId, "staffValidity", record)
    // StaffValidity has no id of its own; synthesise one for the ref graph.
    return { id: `sv-${data.staffId}-${data.positionId}`, ...record }
  },
})

const leaveRecordFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      staffId: z.string(),
      type: z.enum(["Annual", "Sick", "Training", "Course", "Compassionate", "Other"]).optional(),
      startDate: dateInput.optional(),
      endDate: dateInput.optional(),
      fullDay: z.boolean().optional(),
      approval: z.enum(["pending", "approved", "rejected"]).optional(),
      notes: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("lv", ctx.testRunId)
    const record = {
      id,
      staffId: data.staffId,
      type: data.type ?? "Annual",
      startDate: resolveDate(data.startDate, 1),
      endDate: resolveDate(data.endDate, 1),
      fullDay: data.fullDay ?? true,
      approval: data.approval ?? "pending",
      ...(data.notes ? { notes: data.notes } : {}),
    }
    await appendToSlice(ctx.testRunId, "leaveRecords", record)
    return record
  },
})

const trainingAttachmentFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      name: z.string(),
      pathname: z.string().optional(),
      url: z.string().optional(),
      contentType: z.string().optional(),
      size: z.number().optional(),
      uploadedAt: dateInput.optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("att", ctx.testRunId)
    const record = {
      id,
      name: data.name,
      pathname: data.pathname ?? `training/${id}.pdf`,
      url: data.url ?? `https://blob.local/${id}`,
      contentType: data.contentType ?? "application/pdf",
      size: data.size ?? 0,
      uploadedAt: resolveDateTime(data.uploadedAt, -2),
    }
    // Attachments are normally nested under a TrainingSession; store them in a
    // loose passthrough slice so the run snapshot records them even standalone.
    await appendToSlice(ctx.testRunId, "trainingAttachments", record)
    return record
  },
})

const trainingSessionFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      title: z.string(),
      type: z.string().optional(),
      date: dateInput.optional(),
      slotTime: z.string().optional(),
      instructorId: z.string(),
      simulatorId: z.string().optional(),
      positionIds: z.array(z.string()).optional(),
      status: z.enum(["scheduled", "completed"]).optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ts", ctx.testRunId)
    const record = {
      id,
      title: data.title,
      type: data.type ?? "Theory",
      date: resolveDate(data.date, 2),
      slotTime: data.slotTime ?? "09:00",
      instructorId: data.instructorId,
      ...(data.simulatorId ? { simulatorId: data.simulatorId } : {}),
      ...(data.positionIds ? { positionIds: data.positionIds } : {}),
      status: data.status ?? "scheduled",
    }
    await appendToSlice(ctx.testRunId, "trainingSessions", record)
    return record
  },
})

const trainingAttendanceFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      sessionId: z.string(),
      staffId: z.string(),
      attended: z.boolean().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ta", ctx.testRunId)
    const record = {
      id,
      sessionId: data.sessionId,
      staffId: data.staffId,
      attended: data.attended ?? false,
    }
    await appendToSlice(ctx.testRunId, "trainingAttendance", record)
    return record
  },
})

const trainingLogFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      date: dateInput.optional(),
      program: z.enum(["RADAR", "TOWER"]).optional(),
      groupId: z.string(),
      positionIds: z.array(z.string()).optional(),
      ojtiId: z.string(),
      traineeId: z.string(),
      hours: z.number().optional(),
      rating: z.number().optional(),
      feedback: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("tl", ctx.testRunId)
    const record = {
      id,
      date: resolveDate(data.date, -1),
      program: data.program ?? "RADAR",
      groupId: data.groupId,
      positionIds: data.positionIds ?? [],
      ojtiId: data.ojtiId,
      traineeId: data.traineeId,
      hours: data.hours ?? 1,
      ...(data.rating != null ? { rating: data.rating } : {}),
      ...(data.feedback ? { feedback: data.feedback } : {}),
      createdAt: resolveDateTime(data.date, -1),
    }
    await appendToSlice(ctx.testRunId, "trainingLogs", record)
    return record
  },
})

const qualificationFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      code: z.string(),
      name: z.string(),
      effect: z.enum(["allow", "restrict"]).optional(),
      description: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("qual", ctx.testRunId)
    const record = {
      id,
      code: data.code,
      name: data.name,
      effect: data.effect ?? "allow",
      description: data.description ?? data.name,
    }
    await appendToSlice(ctx.testRunId, "qualifications", record)
    return record
  },
})

const staffQualificationFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      staffId: z.string(),
      qualificationId: z.string(),
      expiry: dateInput.optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("sq", ctx.testRunId)
    const record = {
      id,
      staffId: data.staffId,
      qualificationId: data.qualificationId,
      ...(data.expiry != null && data.expiry !== "" ? { expiry: resolveDate(data.expiry) } : {}),
    }
    await appendToSlice(ctx.testRunId, "staffQualifications", record)
    return record
  },
})

const positionQualRuleFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      positionId: z.string(),
      requiredQuals: z.array(z.string()).optional(),
      preferredQuals: z.array(z.string()).optional(),
      excludedQuals: z.array(z.string()).optional(),
      allowExpiredWithWarning: z.boolean().optional(),
      allowManualOverride: z.boolean().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("pqr", ctx.testRunId)
    const record = {
      id,
      positionId: data.positionId,
      requiredQuals: data.requiredQuals ?? [],
      preferredQuals: data.preferredQuals ?? [],
      excludedQuals: data.excludedQuals ?? [],
      allowExpiredWithWarning: data.allowExpiredWithWarning ?? false,
      allowManualOverride: data.allowManualOverride ?? true,
    }
    await appendToSlice(ctx.testRunId, "positionQualRules", record)
    return record
  },
})

const exerciseQualRuleFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      exerciseId: z.string(),
      requiredQuals: z.array(z.string()).optional(),
      preferredQuals: z.array(z.string()).optional(),
      excludedQuals: z.array(z.string()).optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("eqr", ctx.testRunId)
    const record = {
      id,
      exerciseId: data.exerciseId,
      requiredQuals: data.requiredQuals ?? [],
      preferredQuals: data.preferredQuals ?? [],
      excludedQuals: data.excludedQuals ?? [],
    }
    await appendToSlice(ctx.testRunId, "exerciseQualRules", record)
    return record
  },
})

const assignmentFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      code: z.string(),
      description: z.string().optional(),
      group: z.string().optional(),
      type: z.string().optional(),
      appliesTo: z.string().optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("asg", ctx.testRunId)
    const record = {
      id,
      code: data.code,
      description: data.description ?? data.code,
      group: data.group ?? "Roster",
      type: data.type ?? "Roster",
      appliesTo: data.appliesTo ?? "RADAR / TOWER",
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 1,
    }
    await appendToSlice(ctx.testRunId, "assignments", record)
    return record
  },
})

const otherTaskFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      staffIds: z.array(z.string()).optional(),
      startDate: dateInput.optional(),
      endDate: dateInput.optional(),
      program: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ot", ctx.testRunId)
    const record = {
      id,
      title: data.title,
      staffIds: data.staffIds ?? [],
      startDate: resolveDate(data.startDate, 0),
      endDate: resolveDate(data.endDate, 0),
      ...(data.description ? { description: data.description } : {}),
      ...(data.program ? { program: data.program } : {}),
    }
    await appendToSlice(ctx.testRunId, "otherTasks", record)
    return record
  },
})

const publicHolidayFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      date: dateInput.optional(),
      name: z.string(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ph", ctx.testRunId)
    const record = { id, date: resolveDate(data.date, 30), name: data.name }
    await appendToSlice(ctx.testRunId, "publicHolidays", record)
    return record
  },
})

const slotTimeFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      label: z.string(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("slot", ctx.testRunId)
    const record = {
      id,
      label: data.label,
      startTime: data.startTime ?? "08:00",
      endTime: data.endTime ?? "12:00",
    }
    await appendToSlice(ctx.testRunId, "slotTimes", record)
    return record
  },
})

const auditLogFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      timestamp: dateInput.optional(),
      user: z.string().optional(),
      action: z.string(),
      detail: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("al", ctx.testRunId)
    const record = {
      id,
      timestamp: resolveDateTime(data.timestamp, -1),
      user: data.user ?? "System",
      action: data.action,
      detail: data.detail ?? "",
    }
    await appendToSlice(ctx.testRunId, "auditLogs", record)
    return record
  },
})

const faultLogFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      timestamp: dateInput.optional(),
      severity: z.enum(["critical", "major", "minor", "info"]).optional(),
      status: z.enum(["open", "in-progress", "resolved", "closed"]).optional(),
      system: z.string(),
      description: z.string().optional(),
      reportedBy: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("fl", ctx.testRunId)
    const record = {
      id,
      timestamp: resolveDateTime(data.timestamp, -1),
      severity: data.severity ?? "minor",
      status: data.status ?? "open",
      system: data.system,
      description: data.description ?? "",
      reportedBy: data.reportedBy ?? "System",
    }
    await appendToSlice(ctx.testRunId, "faultLogs", record)
    return record
  },
})

const operatorLogFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      timestamp: dateInput.optional(),
      shift: z.enum(["morning", "afternoon", "night"]).optional(),
      operator: z.string().optional(),
      category: z.enum(["briefing", "run", "handover", "incident", "maintenance", "note"]).optional(),
      entry: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ol", ctx.testRunId)
    const record = {
      id,
      timestamp: resolveDateTime(data.timestamp, 0),
      shift: data.shift ?? "morning",
      operator: data.operator ?? "System",
      category: data.category ?? "note",
      entry: data.entry ?? "",
    }
    await appendToSlice(ctx.testRunId, "operatorLogs", record)
    return record
  },
})

const firewallLogFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      timestamp: dateInput.optional(),
      action: z.enum(["allow", "deny", "drop", "alert"]).optional(),
      sourceIp: z.string().optional(),
      destinationIp: z.string().optional(),
      port: z.number().optional(),
      protocol: z.string().optional(),
      rule: z.string().optional(),
      description: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("fw", ctx.testRunId)
    const record = {
      id,
      timestamp: resolveDateTime(data.timestamp, 0),
      action: data.action ?? "allow",
      sourceIp: data.sourceIp ?? "0.0.0.0",
      destinationIp: data.destinationIp ?? "0.0.0.0",
      port: data.port ?? 443,
      protocol: data.protocol ?? "TCP",
      rule: data.rule ?? "default",
      description: data.description ?? "",
    }
    await appendToSlice(ctx.testRunId, "firewallLogs", record)
    return record
  },
})

const adminLogFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      timestamp: dateInput.optional(),
      user: z.string().optional(),
      action: z.string(),
      detail: z.string().optional(),
      ipAddress: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("adl", ctx.testRunId)
    const record = {
      id,
      timestamp: resolveDateTime(data.timestamp, 0),
      user: data.user ?? "System",
      action: data.action,
      detail: data.detail ?? "",
      ipAddress: data.ipAddress ?? "127.0.0.1",
    }
    await appendToSlice(ctx.testRunId, "adminLogs", record)
    return record
  },
})

const importHistoryFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      filename: z.string(),
      date: dateInput.optional(),
      user: z.string().optional(),
      rowsTotal: z.number().optional(),
      rowsAccepted: z.number().optional(),
      rowsRejected: z.number().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("imp", ctx.testRunId)
    const record = {
      id,
      filename: data.filename,
      date: resolveDate(data.date, -7),
      user: data.user ?? "System",
      rowsTotal: data.rowsTotal ?? 0,
      rowsAccepted: data.rowsAccepted ?? 0,
      rowsRejected: data.rowsRejected ?? 0,
    }
    await appendToSlice(ctx.testRunId, "importHistory", record)
    return record
  },
})

const notificationFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      staffId: z.string(),
      channel: z.enum(["email", "sms", "copy"]).optional(),
      kind: z.enum(["assignment", "weekly", "daily", "training", "custom"]).optional(),
      subject: z.string().optional(),
      body: z.string().optional(),
      to: z.string().optional(),
      sentAt: dateInput.optional(),
      sentBy: z.string().optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("ntf", ctx.testRunId)
    const record = {
      id,
      staffId: data.staffId,
      channel: data.channel ?? "email",
      kind: data.kind ?? "custom",
      subject: data.subject ?? "",
      body: data.body ?? "",
      to: data.to ?? "",
      sentAt: resolveDateTime(data.sentAt, -1),
      sentBy: data.sentBy ?? "System",
      simulated: true,
    }
    await appendToSlice(ctx.testRunId, "notifications", record)
    return record
  },
})

const trainingGroupFactory = defineFactory({
  inputSchema: z
    .object({
      id: z.string().optional(),
      label: z.string(),
      program: z.string().optional(),
      positionIds: z.array(z.string()).optional(),
    })
    .passthrough(),
  async create(data, ctx) {
    const id = data.id ?? fallbackId("grp", ctx.testRunId)
    const record = {
      id,
      label: data.label,
      program: data.program ?? "RADAR",
      positionIds: data.positionIds ?? [],
    }
    await appendToSlice(ctx.testRunId, "trainingGroups", record)
    return record
  },
})

// ── Registry ─────────────────────────────────────────────────────────────
// Keys MUST match the model names the dashboard sends (see scenarios.md).
export const factories: FactoryRegistry = {
  User: userFactory,
  Session: sessionFactory,
  Account: accountFactory,
  Verification: verificationFactory,
  Staff: staffFactory,
  Simulator: simulatorFactory,
  Position: positionFactory,
  Exercise: exerciseFactory,
  Course: courseFactory,
  Run: runFactory,
  RunAssignment: runAssignmentFactory,
  StaffValidity: staffValidityFactory,
  LeaveRecord: leaveRecordFactory,
  TrainingAttachment: trainingAttachmentFactory,
  TrainingSession: trainingSessionFactory,
  TrainingAttendance: trainingAttendanceFactory,
  TrainingLogEntry: trainingLogFactory,
  Qualification: qualificationFactory,
  StaffQualification: staffQualificationFactory,
  PositionQualRule: positionQualRuleFactory,
  ExerciseQualRule: exerciseQualRuleFactory,
  Assignment: assignmentFactory,
  OtherTask: otherTaskFactory,
  PublicHoliday: publicHolidayFactory,
  SlotTime: slotTimeFactory,
  AuditLog: auditLogFactory,
  FaultLog: faultLogFactory,
  OperatorLog: operatorLogFactory,
  FirewallLog: firewallLogFactory,
  AdminLog: adminLogFactory,
  ImportHistory: importHistoryFactory,
  NotificationRecord: notificationFactory,
  TrainingGroup: trainingGroupFactory,
}
