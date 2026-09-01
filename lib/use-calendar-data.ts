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

export function useCalendarData(filters: CalendarFilters) {
  const store = useStore()

  return useMemo(() => {
    const map = new Map<string, DayData>()
    const ensure = (date: string): DayData => {
      if (!map.has(date)) map.set(date, { date, runs: [], trainingCount: 0, leaveCount: 0 })
      return map.get(date)!
    }

    // filter runs (scoped to the active program first)
    const runs = store.scopedRuns.filter((r) => {
      if (filters.simulatorId !== "all" && r.simulatorId !== filters.simulatorId) return false
      if (filters.exerciseId !== "all" && r.exerciseId !== filters.exerciseId) return false
      if (filters.status !== "all" && r.status !== filters.status) return false
      if (filters.positionId !== "all" && !r.requiredPositions.includes(filters.positionId)) return false
      if (filters.staffId !== "all") {
        const asgs = store.assignmentsForRun(r.id)
        if (!asgs.some((a) => a.staffId === filters.staffId)) return false
      }
      return true
    })
    runs.forEach((r) => ensure(r.date).runs.push(r))

    // training (scoped to the active program)
    store.scopedTrainingSessions.forEach((t) => {
      if (filters.trainingType !== "all" && t.type !== filters.trainingType) return
      if (filters.staffId !== "all") {
        const attending = store.trainingAttendance.some(
          (a) => a.sessionId === t.id && a.staffId === filters.staffId,
        )
        if (t.instructorId !== filters.staffId && !attending) return
      }
      ensure(t.date).trainingCount++
    })

    // leave (scoped to the active program via staff membership)
    store.scopedLeaveRecords.forEach((l) => {
      if (l.approval === "rejected") return
      if (filters.staffId !== "all" && l.staffId !== filters.staffId) return
      // Iterate days with a safe, timezone-independent helper. Guard against
      // malformed ranges so a bad record can never hang the calendar.
      let d = l.startDate
      let guard = 0
      while (d <= l.endDate && guard < 366) {
        ensure(d).leaveCount++
        d = addDaysISO(d, 1)
        guard++
      }
    })

    // holidays
    store.publicHolidays.forEach((h) => {
      ensure(h.date).holiday = h.name
    })

    return map
  }, [store, filters])
}
