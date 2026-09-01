/* ===========================================================================
 * NOTIFICATION MESSAGE TEMPLATES — the wording of every message
 * ===========================================================================
 * This file only BUILDS the text of messages (subject + body); it does not
 * send anything. There are three kinds:
 *   - assignment: "you've been booked on this run"
 *   - weekly:     a one-week digest (seating + training + currency)
 *   - daily:      everything a person has on a single day
 * Each kind has an email version and a shorter SMS version.
 *
 * SAFE TO CHANGE: the wording inside the `lines`/`parts` arrays — this is where
 * you edit what recipients actually read (greetings, the "arrive 15 minutes
 * early" note, section headings, etc.). The values come in via the `ctx`
 * object, so keep the ${...} placeholders intact.
 * Sending/recording happens in lib/use-notify.ts and app/api/notify/route.ts.
 * =========================================================================== */
import type { Run, Staff, Position, Simulator, Exercise, SlotTime, User, ValidityStatus } from "./types"
import { formatDate } from "./dates"

// ── Per-assignment message (single booking) ──────────────────────────────
export interface NotifyContext {
  staff: Staff
  run: Run
  position: Position
  simulator?: Simulator
  exercise?: Exercise
  slot?: SlotTime
  contact?: User
}

export interface NotifyMessage {
  subject: string
  body: string
}

function slotText(ctx: NotifyContext): string {
  return ctx.slot ? `${ctx.slot.label} (${ctx.slot.startTime}–${ctx.slot.endTime})` : ctx.run.slotTime
}

/** Full message used for email and the copy-to-clipboard action. */
export function buildAssignmentMessage(ctx: NotifyContext): NotifyMessage {
  const { staff, run, position, simulator, exercise, contact } = ctx
  const subject = `Simulator booking — ${formatDate(run.date)} ${run.slotTime} — ${position.code}`
  const lines = [
    `Hi ${staff.firstName},`,
    ``,
    `You have been assigned to an upcoming simulator session. Details below:`,
    ``,
    `Date:       ${formatDate(run.date)}`,
    `Time slot:  ${slotText(ctx)}`,
    `Position:   ${position.code} — ${position.name}`,
  ]
  if (exercise) lines.push(`Exercise:   ${exercise.code} — ${exercise.name}`)
  if (simulator) lines.push(`Simulator:  ${simulator.code} — ${simulator.name}`)
  if (contact) lines.push(``, `Contact:    ${contact.name} (${contact.email})`)
  lines.push(
    ``,
    `Please arrive 15 minutes before your slot. Reply to this message if you have any conflicts.`,
  )
  return { subject, body: lines.join("\n") }
}

/** Condensed single-paragraph body suited to SMS. */
export function buildSmsBody(ctx: NotifyContext): string {
  const { staff, run, position, exercise, simulator } = ctx
  const parts = [
    `${staff.firstName}: sim booking ${formatDate(run.date)} ${slotText(ctx)}.`,
    `Position ${position.code} (${position.name}).`,
  ]
  if (exercise) parts.push(`Ex ${exercise.code}.`)
  if (simulator) parts.push(`Sim ${simulator.code}.`)
  parts.push(`Arrive 15 min early.`)
  return parts.join(" ")
}

// ── Weekly schedule digest (seating + training + currency snapshot) ──────
export interface WeeklyItem {
  runId: string // the run this seating belongs to (used to clear notify-dirty flags)
  date: string
  slotLabel: string // resolved slot text or raw slotTime
  positionCode: string
  positionName: string
  exercise?: string
  simulator?: string
}

export interface WeeklyTrainingItem {
  sessionId: string // the training session id (used to clear notify-dirty flags)
  date: string
  title: string
  type: string
  slotTime: string
  durationMin?: number
  simulator?: string
  positions?: string[] // position codes the training covers
  role: "attendee" | "instructor"
}

export interface WeeklyCurrencyItem {
  positionCode: string
  positionName: string
  status: ValidityStatus
  daysRemaining: number | null
  expiry: string | null
}

export interface WeeklyOtherTaskItem {
  taskId: string // used to clear notify-dirty flags if needed
  title: string
  area?: string // free-text description of the task
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  durationMin?: number
  classroom?: string
}

export interface WeeklyContext {
  staff: Staff
  weekStart: string
  weekEnd: string
  items: WeeklyItem[] // simulator seating assignments
  trainings: WeeklyTrainingItem[]
  otherTasks: WeeklyOtherTaskItem[]
  currency: WeeklyCurrencyItem[]
  contact?: User
}

// Human-readable schedule for an other-task within a digest line.
function otherTaskWhen(t: { startDate: string; endDate: string; startTime?: string; endTime?: string; durationMin?: number }): string {
  if (t.startDate === t.endDate) {
    // Single day: show a time window / duration if we have one.
    if (t.startTime && t.endTime) return `${formatDate(t.startDate)} ${t.startTime}–${t.endTime}`
    if (t.startTime) return `${formatDate(t.startDate)} from ${t.startTime}${t.durationMin ? ` (${t.durationMin} min)` : ""}`
    return `${formatDate(t.startDate)}${t.durationMin ? ` (${t.durationMin} min)` : ""}`
  }
  // Multi-day span.
  return `${formatDate(t.startDate)} → ${formatDate(t.endDate)}`
}

// Human-readable currency state, e.g. "Expiring — 9 days left" / "Expired 4 days ago".
function currencyText(c: WeeklyCurrencyItem): string {
  switch (c.status) {
    case "valid":
      return c.daysRemaining != null ? `Current — ${c.daysRemaining} days left` : "Current"
    case "expiring":
      return `Expiring — ${c.daysRemaining ?? 0} days left`
    case "expired":
      return c.daysRemaining != null ? `EXPIRED ${Math.abs(c.daysRemaining)} days ago` : "EXPIRED"
    default:
      return "No record"
  }
}

/** Builds a full one-week digest (seating, training, currency) for a single person. */
export function buildWeeklyMessage(ctx: WeeklyContext): NotifyMessage {
  const { staff, weekStart, weekEnd, items, trainings, otherTasks, currency, contact } = ctx
  const subject = `Your weekly digest — week of ${formatDate(weekStart)}`
  const lines = [
    `Hi ${staff.firstName},`,
    ``,
    `Here is your weekly digest for ${formatDate(weekStart)} to ${formatDate(weekEnd)}, covering your`,
    `simulator seating, training, and a snapshot of your currency status.`,
  ]

  lines.push(``, `SIMULATOR SEATING`)
  if (items.length === 0) {
    lines.push(`• No simulator sessions assigned this week.`)
  } else {
    for (const it of items) {
      const extras = [it.exercise && `Ex ${it.exercise}`, it.simulator && `Sim ${it.simulator}`]
        .filter(Boolean)
        .join(" · ")
      lines.push(`• ${formatDate(it.date)} — ${it.slotLabel} — ${it.positionCode} (${it.positionName})${extras ? ` — ${extras}` : ""}`)
    }
  }

  lines.push(``, `TRAINING`)
  if (trainings.length === 0) {
    lines.push(`• No training scheduled this week.`)
  } else {
    for (const t of trainings) {
      const meta = [
        t.durationMin ? `${t.durationMin} min` : null,
        t.simulator && `Sim ${t.simulator}`,
        t.positions && t.positions.length ? `Positions ${t.positions.join(", ")}` : null,
        t.role === "instructor" ? "You are instructing" : null,
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(`• ${formatDate(t.date)} ${t.slotTime} — ${t.title} [${t.type}]${meta ? ` — ${meta}` : ""}`)
    }
  }

  lines.push(``, `OTHER TASKS`)
  if (otherTasks.length === 0) {
    lines.push(`• No other tasks scheduled this week.`)
  } else {
    for (const t of otherTasks) {
      const meta = [t.classroom && `Room ${t.classroom}`, t.area].filter(Boolean).join(" · ")
      lines.push(`• ${otherTaskWhen(t)} — ${t.title}${meta ? ` — ${meta}` : ""}`)
    }
  }

  lines.push(``, `CURRENCY SNAPSHOT`)
  if (currency.length === 0) {
    lines.push(`• No currency records on file.`)
  } else {
    for (const c of currency) {
      const expiryText = c.expiry ? ` (expires ${formatDate(c.expiry)})` : ""
      lines.push(`• ${c.positionCode} (${c.positionName}): ${currencyText(c)}${expiryText}`)
    }
  }

  lines.push(``, `Please arrive 15 minutes before each slot and address any expiring currency above.`)
  if (contact) lines.push(``, `Contact: ${contact.name} (${contact.email})`)
  return { subject, body: lines.join("\n") }
}

/** Condensed SMS version of the weekly digest. */
export function buildWeeklySmsBody(ctx: WeeklyContext): string {
  const { staff, weekStart, items, trainings, otherTasks, currency } = ctx
  const parts: string[] = []
  for (const it of items) parts.push(`${formatDate(it.date)} ${it.slotLabel} ${it.positionCode}`)
  for (const t of trainings) parts.push(`${formatDate(t.date)} ${t.title}`)
  for (const t of otherTasks) parts.push(`${formatDate(t.startDate)} ${t.title}`)
  const atRisk = currency.filter((c) => c.status === "expiring" || c.status === "expired").length
  const head = `${staff.firstName} week of ${formatDate(weekStart)}`
  if (parts.length === 0 && atRisk === 0) return `${head}: nothing scheduled, currency all current.`
  const schedule = parts.length ? parts.join("; ") : "no sessions"
  const risk = atRisk > 0 ? ` ${atRisk} currency item(s) need attention.` : ""
  return `${head}: ${schedule}.${risk} Arrive 15 min early.`
}

// ── Combined daily digest (seating + training in one message) ───────────
export interface DailySeatItem {
  slotLabel: string
  positionCode: string
  positionName: string
  exercise?: string
  simulator?: string
}

export interface DailyTrainingItem {
  title: string
  type: string
  slotTime: string
  durationMin?: number
  simulator?: string
  positions?: string[] // position codes the training covers
  role: "attendee" | "instructor"
}

export interface DailyOtherTaskItem {
  title: string
  area?: string
  startTime?: string
  endTime?: string
  durationMin?: number
  classroom?: string
  multiDay?: boolean // true when the task spans more than this single day
}

export interface DailyContext {
  staff: Staff
  date: string
  seats: DailySeatItem[]
  trainings: DailyTrainingItem[]
  otherTasks: DailyOtherTaskItem[]
  contact?: User
}

/** One message per person listing every sim seat AND training they have on a day. */
export function buildDailyMessage(ctx: DailyContext): NotifyMessage {
  const { staff, date, seats, trainings, otherTasks, contact } = ctx
  const subject = `Your schedule — ${formatDate(date)}`
  const lines = [
    `Hi ${staff.firstName},`,
    ``,
    `Here is your confirmed schedule for ${formatDate(date)}:`,
  ]

  if (seats.length > 0) {
    lines.push(``, `SIMULATOR SEATING`)
    for (const s of seats) {
      const extras = [s.exercise && `Ex ${s.exercise}`, s.simulator && `Sim ${s.simulator}`]
        .filter(Boolean)
        .join(" · ")
      lines.push(`• ${s.slotLabel} — ${s.positionCode} (${s.positionName})${extras ? ` — ${extras}` : ""}`)
    }
  }

  if (trainings.length > 0) {
    lines.push(``, `TRAINING`)
    for (const t of trainings) {
      const meta = [
        t.durationMin ? `${t.durationMin} min` : null,
        t.simulator && `Sim ${t.simulator}`,
        t.positions && t.positions.length ? `Positions ${t.positions.join(", ")}` : null,
        t.role === "instructor" ? "You are instructing" : null,
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(`• ${t.slotTime} — ${t.title} [${t.type}]${meta ? ` — ${meta}` : ""}`)
    }
  }

  if (otherTasks.length > 0) {
    lines.push(``, `OTHER TASKS`)
    for (const t of otherTasks) {
      const when = t.startTime && t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime ? `from ${t.startTime}` : "All day"
      const meta = [
        t.durationMin ? `${t.durationMin} min` : null,
        t.classroom && `Room ${t.classroom}`,
        t.area,
        t.multiDay ? "Multi-day task" : null,
      ]
        .filter(Boolean)
        .join(" · ")
      lines.push(`• ${when} — ${t.title}${meta ? ` — ${meta}` : ""}`)
    }
  }

  if (seats.length === 0 && trainings.length === 0 && otherTasks.length === 0) {
    lines.push(``, `You currently have no simulator, training, or other-task commitments on this day.`)
  }

  lines.push(``, `Please arrive 15 minutes before your first slot. Reply if you have any conflicts.`)
  if (contact) lines.push(``, `Contact: ${contact.name} (${contact.email})`)
  return { subject, body: lines.join("\n") }
}

/** Condensed SMS version of the daily digest. */
export function buildDailySmsBody(ctx: DailyContext): string {
  const { staff, date, seats, trainings, otherTasks } = ctx
  const parts: string[] = []
  for (const s of seats) parts.push(`${s.slotLabel} ${s.positionCode}`)
  for (const t of trainings) parts.push(`${t.slotTime} ${t.title}`)
  for (const t of otherTasks) parts.push(t.startTime ? `${t.startTime} ${t.title}` : t.title)
  if (parts.length === 0) return `${staff.firstName}: nothing scheduled ${formatDate(date)}.`
  return `${staff.firstName} ${formatDate(date)}: ${parts.join("; ")}. Arrive 15 min early.`
}

export function mailtoHref(email: string, msg: NotifyMessage): string {
  return `mailto:${email}?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`
}

export function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/\s+/g, "")}?&body=${encodeURIComponent(body)}`
}
