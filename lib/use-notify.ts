"use client"

/* ===========================================================================
 * useNotify HOOK — gathers data, sends, and records notifications
 * ===========================================================================
 * This is the bridge between the screens and the message templates. It:
 *   1. "build*Context" — collects a person's runs / training / currency for a
 *      run, a day, or a week into a tidy object the templates understand.
 *   2. "send*Email"    — turns that into a message and delivers it to the
 *      recipient's IN-APP inbox (no real email/SMS is sent in this prototype).
 *      It also appears in the Notification Viewer.
 *   3. "recordHandoff" — logs copy-to-clipboard actions so they also show in
 *      the viewer.
 *
 * CHANGEABLE PARAMETERS:
 *   - The working week is Mon–Fri: see `addDaysISO(weekStart, 4)` in
 *     buildWeekContext (change 4 to 6 for a full 7-day week).
 *   - Cancelled runs are skipped from digests (the `status === "cancelled"`
 *     checks). To change what counts, edit those filters.
 *   - Message wording lives in lib/notify.ts, not here.
 * =========================================================================== */
import { useCallback } from "react"
import { useStore } from "./store"
import {
  buildAssignmentMessage,
  buildWeeklyMessage,
  buildDailyMessage,
  type NotifyContext,
  type WeeklyContext,
  type WeeklyItem,
  type WeeklyTrainingItem,
  type WeeklyCurrencyItem,
  type WeeklyOtherTaskItem,
  type DailyContext,
  type DailySeatItem,
  type DailyTrainingItem,
  type DailyOtherTaskItem,
} from "./notify"
import { addDaysISO } from "./dates"
import type { NotificationChannel, NotificationKind, Run, TrainingAttachment } from "./types"

export interface DeliveryResult {
  /** Always true: in-app delivery cannot fail once the recipient exists. */
  delivered: true
  /** Whether the recipient has an active login that can open the inbox. */
  hasAccount: boolean
}

export function useNotify() {
  const store = useStore()
  const { recordNotification } = store

  // This prototype has no email/SMS provider: every "email" is delivered to the
  // recipient's in-app inbox (bell + My notifications), which doubles as the
  // simulated mailbox. No email address or phone number is required.
  const deliverInApp = useCallback(
    (args: {
      staffId: string
      kind: NotificationKind
      subject: string
      body: string
      attachments?: TrainingAttachment[]
    }): DeliveryResult => {
      const staff = store.staffById(args.staffId)
      if (!staff) throw new Error("Unknown staff member")
      const account = store.users.find((u) => u.staffId === staff.id && u.active)
      recordNotification({
        staffId: staff.id,
        channel: "in_app",
        kind: args.kind,
        subject: args.subject,
        body: args.body,
        to: account ? `${account.name} (in-app inbox)` : "In-app inbox",
        simulated: false,
        attachments: args.attachments,
      })
      return { delivered: true, hasAccount: !!account }
    },
    [recordNotification, store],
  )

  const buildContext = useCallback(
    (run: Run, staffId: string, positionId: string): NotifyContext | null => {
      const staff = store.staffById(staffId)
      const position = store.positionById(positionId)
      if (!staff || !position) return null
      return {
        staff,
        position,
        run,
        simulator: store.simulatorById(run.simulatorId),
        exercise: store.exerciseById(run.exerciseId),
        slot: store.slotTimes.find((s) => s.startTime === run.slotTime),
        contact: store.currentUser,
      }
    },
    [store],
  )

  // Build a one-week schedule digest for a staff member, starting at weekStart (ISO).
  const buildWeekContext = useCallback(
    (staffId: string, weekStart: string): WeeklyContext | null => {
      const staff = store.staffById(staffId)
      if (!staff) return null
      // Working week is Mon–Fri, so the digest window ends on Friday (Mon + 4).
      const weekEnd = addDaysISO(weekStart, 4)
      const items: WeeklyItem[] = store.runAssignments
        .filter((a) => a.staffId === staffId)
        .map((a) => {
          const run = store.runs.find((r) => r.id === a.runId)
          if (!run || run.date < weekStart || run.date > weekEnd) return null
          if (run.status === "cancelled") return null
          const position = store.positionById(a.positionId)
          if (!position) return null
          const slot = store.slotTimes.find((s) => s.startTime === run.slotTime)
          const exercise = store.exerciseById(run.exerciseId)
          const simulator = store.simulatorById(run.simulatorId)
          return {
            runId: run.id,
            date: run.date,
            slotLabel: slot ? `${slot.label} (${slot.startTime}–${slot.endTime})` : run.slotTime,
            positionCode: position.code,
            positionName: position.name,
            exercise: exercise ? exercise.code : undefined,
            simulator: simulator ? simulator.code : undefined,
          } as WeeklyItem
        })
        .filter((x): x is WeeklyItem => x !== null)
        .sort((a, b) => a.date.localeCompare(b.date) || a.slotLabel.localeCompare(b.slotLabel))

      // Training the person attends OR instructs within the week window.
      const attendingIds = new Set(
        store.trainingAttendance.filter((ta) => ta.staffId === staffId).map((ta) => ta.sessionId),
      )
      const trainings: WeeklyTrainingItem[] = store.trainingSessions
        .filter(
          (t) =>
            t.date >= weekStart &&
            t.date <= weekEnd &&
            (attendingIds.has(t.id) || t.instructorId === staffId),
        )
        .map((t) => ({
          sessionId: t.id,
          date: t.date,
          title: t.title,
          type: t.type,
          slotTime: t.slotTime,
          durationMin: t.durationMin,
          simulator: t.simulatorId ? store.simulatorById(t.simulatorId)?.code : undefined,
          positions: (t.positionIds ?? [])
            .map((pid) => store.positionById(pid)?.code)
            .filter((c): c is string => !!c),
          role: t.instructorId === staffId ? "instructor" : "attendee",
        }) as WeeklyTrainingItem)
        .sort((a, b) => a.date.localeCompare(b.date) || a.slotTime.localeCompare(b.slotTime))

      // Currency snapshot across every position this person holds a record for,
      // surfacing expiring/expired first so the digest highlights what's at risk.
      const currency: WeeklyCurrencyItem[] = store.staffValidity
        .filter((sv) => sv.staffId === staffId)
        .map((sv) => {
          const position = store.positionById(sv.positionId)
          if (!position) return null
          const v = store.validityFor(staffId, sv.positionId)
          return {
            positionCode: position.code,
            positionName: position.name,
            status: v.status,
            daysRemaining: v.daysRemaining,
            expiry: v.expiry,
          } as WeeklyCurrencyItem
        })
        .filter((x): x is WeeklyCurrencyItem => x !== null)
        .sort((a, b) => (a.daysRemaining ?? 99999) - (b.daysRemaining ?? 99999))

      // Other tasks (meetings, projects, detachments…) that overlap the week
      // window and include this person. A task counts if any part of its span
      // falls between weekStart and weekEnd.
      const otherTasks: WeeklyOtherTaskItem[] = store.otherTasks
        .filter((t) => t.staffIds.includes(staffId) && t.startDate <= weekEnd && t.endDate >= weekStart)
        .map((t) => ({
          taskId: t.id,
          title: t.title,
          area: t.description,
          startDate: t.startDate,
          endDate: t.endDate,
          startTime: t.startTime,
          endTime: t.endTime,
          durationMin: t.durationMin,
          classroom: t.classroom,
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))

      return { staff, weekStart, weekEnd, items, trainings, otherTasks, currency, contact: store.currentUser }
    },
    [store],
  )

  // Build a combined daily digest for a person: every sim seat AND training on `date`.
  const buildDailyContext = useCallback(
    (staffId: string, date: string): DailyContext | null => {
      const staff = store.staffById(staffId)
      if (!staff) return null

      const seats: DailySeatItem[] = store.runAssignments
        .filter((a) => a.staffId === staffId)
        .map((a) => {
          const run = store.runs.find((r) => r.id === a.runId)
          if (!run || run.date !== date || run.status === "cancelled") return null
          const position = store.positionById(a.positionId)
          if (!position) return null
          const slot = store.slotTimes.find((s) => s.startTime === run.slotTime)
          return {
            slotLabel: slot ? `${slot.label} (${slot.startTime}–${slot.endTime})` : run.slotTime,
            positionCode: position.code,
            positionName: position.name,
            exercise: store.exerciseById(run.exerciseId)?.code,
            simulator: store.simulatorById(run.simulatorId)?.code,
          } as DailySeatItem
        })
        .filter((x): x is DailySeatItem => x !== null)

      const attendingIds = new Set(
        store.trainingAttendance.filter((ta) => ta.staffId === staffId).map((ta) => ta.sessionId),
      )
      const trainings: DailyTrainingItem[] = store.trainingSessions
        .filter((t) => t.date === date && (attendingIds.has(t.id) || t.instructorId === staffId))
        .map((t) => ({
          title: t.title,
          type: t.type,
          slotTime: t.slotTime,
          durationMin: t.durationMin,
          simulator: t.simulatorId ? store.simulatorById(t.simulatorId)?.code : undefined,
          positions: (t.positionIds ?? [])
            .map((pid) => store.positionById(pid)?.code)
            .filter((c): c is string => !!c),
          role: t.instructorId === staffId ? "instructor" : "attendee",
        }))

      // Other tasks that keep this person busy on `date` (task span includes it).
      const otherTasks: DailyOtherTaskItem[] = store.otherTasks
        .filter((t) => t.staffIds.includes(staffId) && date >= t.startDate && date <= t.endDate)
        .map((t) => ({
          title: t.title,
          area: t.description,
          startTime: t.startTime,
          endTime: t.endTime,
          durationMin: t.durationMin,
          classroom: t.classroom,
          multiDay: t.startDate !== t.endDate,
        }))
        .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.title.localeCompare(b.title))

      return { staff, date, seats, trainings, otherTasks, contact: store.currentUser }
    },
    [store],
  )

  // The send* names are kept for callers; all of them deliver in-app.
  const sendDailyEmail = useCallback(
    async (ctx: DailyContext) => {
      const msg = buildDailyMessage(ctx)
      return deliverInApp({ staffId: ctx.staff.id, kind: "daily", ...msg })
    },
    [deliverInApp],
  )

  const sendCustomEmail = useCallback(
    async (args: { staffId: string; subject: string; body: string; attachments?: TrainingAttachment[] }) =>
      deliverInApp({ ...args, kind: "custom" }),
    [deliverInApp],
  )

  const sendEmail = useCallback(
    async (ctx: NotifyContext) => {
      const msg = buildAssignmentMessage(ctx)
      return deliverInApp({ staffId: ctx.staff.id, kind: "assignment", ...msg })
    },
    [deliverInApp],
  )

  const sendWeeklyEmail = useCallback(
    async (ctx: WeeklyContext) => {
      const msg = buildWeeklyMessage(ctx)
      return deliverInApp({ staffId: ctx.staff.id, kind: "weekly", ...msg })
    },
    [deliverInApp],
  )

  // Record a copy-to-clipboard hand-off so it shows in the viewer.
  const recordHandoff = useCallback(
    (args: {
      staffId: string
      channel: NotificationChannel
      kind: NotificationKind
      subject: string
      body: string
      to: string
    }) => {
      recordNotification({ ...args, simulated: true })
    },
    [recordNotification],
  )

  return {
    buildContext,
    buildWeekContext,
    buildDailyContext,
    sendEmail,
    sendWeeklyEmail,
    sendDailyEmail,
    sendCustomEmail,
    recordHandoff,
  }
}
