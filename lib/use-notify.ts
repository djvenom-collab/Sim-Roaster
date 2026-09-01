"use client"

/* ===========================================================================
 * useNotify HOOK — gathers data, sends, and records notifications
 * ===========================================================================
 * This is the bridge between the screens and the message templates. It:
 *   1. "build*Context" — collects a person's runs / training / currency for a
 *      run, a day, or a week into a tidy object the templates understand.
 *   2. "send*Email"    — turns that into a message, posts it to /api/notify,
 *      and records it so it appears in the Notification Viewer.
 *   3. "recordHandoff" — logs SMS / copy / open-in-mail actions (no server
 *      send) so they also show in the viewer.
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

async function postEmail(to: string, name: string, subject: string, body: string) {
  const res = await fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, name, subject, body }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || "Failed to send email")
  return data as { id?: string; simulated?: boolean }
}

export function useNotify() {
  const store = useStore()
  const { recordNotification } = store

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

  // Send a combined daily digest email and record it.
  const sendDailyEmail = useCallback(
    async (ctx: DailyContext) => {
      const msg = buildDailyMessage(ctx)
      const res = await postEmail(
        ctx.staff.email,
        `${ctx.staff.firstName} ${ctx.staff.lastName}`,
        msg.subject,
        msg.body,
      )
      recordNotification({
        staffId: ctx.staff.id,
        channel: "email",
        kind: "daily",
        subject: msg.subject,
        body: msg.body,
        to: ctx.staff.email,
        simulated: !!res.simulated,
      })
      return res
    },
    [recordNotification],
  )

  // Send a free-text custom message (with optional attachments) to one person
  // and record it so it shows in their inbox and the Notification Viewer.
  const sendCustomEmail = useCallback(
    async (args: { staffId: string; subject: string; body: string; attachments?: TrainingAttachment[] }) => {
      const staff = store.staffById(args.staffId)
      if (!staff) throw new Error("Unknown staff member")
      const res = await postEmail(staff.email, `${staff.firstName} ${staff.lastName}`, args.subject, args.body)
      recordNotification({
        staffId: staff.id,
        channel: "email",
        kind: "custom",
        subject: args.subject,
        body: args.body,
        to: staff.email,
        simulated: !!res.simulated,
        attachments: args.attachments,
      })
      return res
    },
    [recordNotification, store],
  )

  // Send an assignment email and record it against the staff member.
  const sendEmail = useCallback(
    async (ctx: NotifyContext) => {
      const msg = buildAssignmentMessage(ctx)
      const res = await postEmail(
        ctx.staff.email,
        `${ctx.staff.firstName} ${ctx.staff.lastName}`,
        msg.subject,
        msg.body,
      )
      recordNotification({
        staffId: ctx.staff.id,
        channel: "email",
        kind: "assignment",
        subject: msg.subject,
        body: msg.body,
        to: ctx.staff.email,
        simulated: !!res.simulated,
      })
      return res
    },
    [recordNotification],
  )

  // Send a weekly schedule digest email and record it.
  const sendWeeklyEmail = useCallback(
    async (ctx: WeeklyContext) => {
      const msg = buildWeeklyMessage(ctx)
      const res = await postEmail(
        ctx.staff.email,
        `${ctx.staff.firstName} ${ctx.staff.lastName}`,
        msg.subject,
        msg.body,
      )
      recordNotification({
        staffId: ctx.staff.id,
        channel: "email",
        kind: "weekly",
        subject: msg.subject,
        body: msg.body,
        to: ctx.staff.email,
        simulated: !!res.simulated,
      })
      return res
    },
    [recordNotification],
  )

  // Record a non-email hand-off (SMS / copy / open-in-mail) so it shows in the viewer.
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
