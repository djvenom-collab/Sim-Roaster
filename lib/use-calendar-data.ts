"use client"

/* ===========================================================================
 * useCalendarData HOOK — builds the per-day summary for calendar views
 * ===========================================================================
 * The Monthly and Weekly planners need to know, for each date, how many runs /
 * training sessions / leave days / holidays fall on it. This hook does that
 * once and hands back a Map keyed by date ("2026-06-10" -> { runs, counts }).
 *
 * It also applies the FILTER BAR choices (staff, position, simulator,
 * exercise, status, training type). Everything is already limited to the
 * active RADAR/TOWER program before filtering.
 *
 * CHANGEABLE PARAMETERS:
 *   - emptyFilters: the default "show everything" state ("all"). Change a value
 *     to make a page start pre-filtered.
 *   - Rejected leave is ignored (the `approval === "rejected"` check). Adjust
 *     to change which leave shows on the calendar.
 * =========================================================================== */
import { useMemo } from "react"
import { useStore } from "@/lib/store"
import { addDaysISO } from "@/lib/dates"

// One day's worth of summary data shown on a calendar cell.
export interface DayData {
  date: string
  runs: ReturnType<typeof useStore>["runs"]
  trainingCount: number
  leaveCount: number
  holiday?: string
}

export interface CalendarFilters {
  staffId: string
  positionId: string
  simulatorId: string
  exerciseId: string
  status: string
  trainingType: string
}

export const emptyFilters: CalendarFilters = {
  staffId: "all",
  positionId: "all",
  simulatorId: "all",
  exerciseId: "all",
  status: "all",
  trainingType: "all",
}

// Calendar views pass their inclusive visible range; callers that omit it retain
// the full-history behavior. Memoize by the inputs used here, not the entire
// store, so a notification or log update doesn't rebuild the calendar summary.
export function useCalendarData(filters: CalendarFilters, range?: { start: string; end: string }) {
  const {
    scopedRuns, assignmentsForRun, scopedTrainingSessions,
    trainingAttendance, scopedLeaveRecords, publicHolidays,
  } = useStore()
  const { staffId, positionId, simulatorId, exerciseId, status, trainingType } = filters
  const start = range?.start
  const end = range?.end

  return useMemo(() => {
    const map = new Map<string, DayData>()
    const ensure = (date: string): DayData => {
      if (!map.has(date)) map.set(date, { date, runs: [], trainingCount: 0, leaveCount: 0 })
      return map.get(date)!
    }

    const visible = (date: string) => (!start || date >= start) && (!end || date <= end)

    // filter runs (scoped to the active program first)
    const runs = scopedRuns.filter((r) => {
      if (!visible(r.date)) return false
      if (simulatorId !== "all" && r.simulatorId !== simulatorId) return false
      if (exerciseId !== "all" && r.exerciseId !== exerciseId) return false
      if (status !== "all" && r.status !== status) return false
      if (positionId !== "all" && !r.requiredPositions.includes(positionId)) return false
      if (staffId !== "all") {
        const asgs = assignmentsForRun(r.id)
        if (!asgs.some((a) => a.staffId === staffId)) return false
      }
      return true
    })
    runs.forEach((r) => ensure(r.date).runs.push(r))

    // training (scoped to the active program)
    scopedTrainingSessions.forEach((t) => {
      if (!visible(t.date)) return
      if (trainingType !== "all" && t.type !== trainingType) return
      if (staffId !== "all") {
        const attending = trainingAttendance.some(
          (a) => a.sessionId === t.id && a.staffId === staffId,
        )
        if (t.instructorId !== staffId && !attending) return
      }
      ensure(t.date).trainingCount++
    })

    // leave (scoped to the active program via staff membership)
    scopedLeaveRecords.forEach((l) => {
      if (l.approval === "rejected") return
      if (staffId !== "all" && l.staffId !== staffId) return
      // Iterate days with a safe, timezone-independent helper. Guard against
      // malformed ranges so a bad record can never hang the calendar.
      if ((start && l.endDate < start) || (end && l.startDate > end)) return
      // Expand only visible days, but retain the old 366-day cap measured from
      // the original start (not the clipped start) for malformed long records.
      const cappedEnd = addDaysISO(l.startDate, 365)
      const last = [l.endDate, cappedEnd, end].filter((d): d is string => !!d).sort()[0]
      let d = start && l.startDate < start ? start : l.startDate
      let guard = 0
      while (d <= last && guard < 366) {
        ensure(d).leaveCount++
        d = addDaysISO(d, 1)
        guard++
      }
    })

    // holidays
    publicHolidays.forEach((h) => {
      if (!visible(h.date)) return
      ensure(h.date).holiday = h.name
    })

    return map
  }, [
    scopedRuns, assignmentsForRun, scopedTrainingSessions, trainingAttendance,
    scopedLeaveRecords, publicHolidays,
    staffId, positionId, simulatorId, exerciseId, status, trainingType, start, end,
  ])
}
