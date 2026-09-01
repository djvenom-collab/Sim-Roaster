/* ===========================================================================
 * OJTI TRAINING LOG — analytics
 * ===========================================================================
 * Derived metrics off the raw OJTI training log (store.trainingLogs).
 *
 * Initial validation on a position group is capped at 40 hours of OJT, with the
 * possibility of an approved EXTENSION beyond that. Progress toward that cap is
 * shown per TRAINEE per GROUP on the staff page, while the mirror-image totals
 * for each OJTI (instructor) are shown in the Trainers/OJTI tab under Training.
 * =========================================================================== */
import { type TrainingGroup } from "./training-groups"
import type { TrainingLogEntry } from "./types"

/** Standard OJT hours cap per position group for initial validation. */
export const GROUP_TRAINING_CAP = 40

/** Build an id→group lookup from the (now editable) group list. */
const groupLookup = (groups: TrainingGroup[]) => new Map(groups.map((g) => [g.id, g]))

export type OjtGroupStatus = "in_training" | "completed"

/** A single trainee's accumulated OJT on one position group. */
export interface TraineeGroupProgress {
  group: TrainingGroup
  hours: number
  cap: number
  entryCount: number
  status: OjtGroupStatus
  /** Logged beyond the standard 40h cap (i.e. an approved extension zone). */
  overCap: boolean
  /** Hours still remaining to reach the cap (0 once complete). */
  remaining: number
  /** Fraction of the cap completed, clamped to 0..1 for the progress bar. */
  pct: number
  /** Distinct OJTIs who delivered this training. */
  ojtiIds: string[]
  /** Distinct positions trained within the group. */
  positionIds: string[]
  avgRating: number | null
  lastDate: string | null
}

const sumHours = (entries: TrainingLogEntry[]) => entries.reduce((s, e) => s + e.hours, 0)

const avgRating = (entries: TrainingLogEntry[]): number | null => {
  const rated = entries.filter((e) => e.rating != null)
  if (rated.length === 0) return null
  return rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length
}

const latestDate = (entries: TrainingLogEntry[]): string | null =>
  entries.reduce<string | null>((acc, e) => (acc == null || e.date > acc ? e.date : acc), null)

function groupSortKey(g: TrainingGroup) {
  // RADAR groups before TOWER, then by label (Group 1..4).
  return `${g.program === "RADAR" ? 0 : 1}-${g.label}`
}

/**
 * Per-group OJT progress for one trainee. Only groups the trainee has actually
 * logged hours on are returned, sorted by program then group.
 */
export function traineeGroupProgress(
  logs: TrainingLogEntry[],
  traineeId: string,
  groups: TrainingGroup[],
): TraineeGroupProgress[] {
  const byId = groupLookup(groups)
  const mine = logs.filter((l) => l.traineeId === traineeId)
  const byGroup = new Map<string, TrainingLogEntry[]>()
  for (const l of mine) {
    const arr = byGroup.get(l.groupId)
    if (arr) arr.push(l)
    else byGroup.set(l.groupId, [l])
  }

  const out: TraineeGroupProgress[] = []
  for (const [groupId, entries] of byGroup) {
    const group = byId.get(groupId)
    if (!group) continue
    const hours = sumHours(entries)
    const completed = hours >= GROUP_TRAINING_CAP
    out.push({
      group,
      hours,
      cap: GROUP_TRAINING_CAP,
      entryCount: entries.length,
      status: completed ? "completed" : "in_training",
      overCap: hours > GROUP_TRAINING_CAP,
      remaining: Math.max(0, GROUP_TRAINING_CAP - hours),
      pct: Math.min(1, hours / GROUP_TRAINING_CAP),
      ojtiIds: Array.from(new Set(entries.map((e) => e.ojtiId))),
      positionIds: Array.from(new Set(entries.flatMap((e) => e.positionIds))),
      avgRating: avgRating(entries),
      lastDate: latestDate(entries),
    })
  }
  return out.sort((a, b) => groupSortKey(a.group).localeCompare(groupSortKey(b.group)))
}

/** Roll-up of a trainee's OJT across all groups (used for directory badges). */
export interface TraineeOjtSummary {
  totalHours: number
  groupsInTraining: number
  groupsCompleted: number
  hasActivity: boolean
}

export function traineeOjtSummary(
  logs: TrainingLogEntry[],
  traineeId: string,
  allGroups: TrainingGroup[],
): TraineeOjtSummary {
  const groups = traineeGroupProgress(logs, traineeId, allGroups)
  const groupsCompleted = groups.filter((g) => g.status === "completed").length
  const groupsInTraining = groups.filter((g) => g.status === "in_training").length
  return {
    totalHours: groups.reduce((s, g) => s + g.hours, 0),
    groupsInTraining,
    groupsCompleted,
    hasActivity: groups.length > 0,
  }
}

// ── OJTI (instructor) side ──────────────────────────────────────────────────

/** One trainee's OJT delivered by a specific OJTI (within a group). */
export interface OjtiTraineeDetail {
  traineeId: string
  hours: number
  entryCount: number
  avgRating: number | null
  lastDate: string | null
  positionIds: string[]
}

export interface OjtiGroupBreakdown {
  group: TrainingGroup
  hours: number
  entryCount: number
  traineeIds: string[]
  /** Per-trainee split so a group row can expand to show who was trained. */
  trainees: OjtiTraineeDetail[]
}

/** Aggregated instructing metrics for one OJTI. */
export interface OjtiSummary {
  ojtiId: string
  totalHours: number
  entryCount: number
  traineeIds: string[]
  byProgram: { RADAR: number; TOWER: number }
  groups: OjtiGroupBreakdown[]
  avgRating: number | null
  lastDate: string | null
}

/** One summary per OJTI who has logged any instruction, sorted by hours desc. */
export function ojtiSummaries(logs: TrainingLogEntry[], allGroups: TrainingGroup[]): OjtiSummary[] {
  const byId = groupLookup(allGroups)
  const byOjti = new Map<string, TrainingLogEntry[]>()
  for (const l of logs) {
    const arr = byOjti.get(l.ojtiId)
    if (arr) arr.push(l)
    else byOjti.set(l.ojtiId, [l])
  }

  const out: OjtiSummary[] = []
  for (const [ojtiId, entries] of byOjti) {
    // group breakdown
    const groupMap = new Map<string, TrainingLogEntry[]>()
    for (const e of entries) {
      const arr = groupMap.get(e.groupId)
      if (arr) arr.push(e)
      else groupMap.set(e.groupId, [e])
    }
    const groups: OjtiGroupBreakdown[] = []
    for (const [groupId, ge] of groupMap) {
      const group = byId.get(groupId)
      if (!group) continue
      // Per-trainee split within this group, sorted by hours desc.
      const traineeMap = new Map<string, TrainingLogEntry[]>()
      for (const e of ge) {
        const arr = traineeMap.get(e.traineeId)
        if (arr) arr.push(e)
        else traineeMap.set(e.traineeId, [e])
      }
      const trainees: OjtiTraineeDetail[] = Array.from(traineeMap.entries())
        .map(([traineeId, te]) => ({
          traineeId,
          hours: sumHours(te),
          entryCount: te.length,
          avgRating: avgRating(te),
          lastDate: latestDate(te),
          positionIds: Array.from(new Set(te.flatMap((x) => x.positionIds))),
        }))
        .sort((a, b) => b.hours - a.hours)
      groups.push({
        group,
        hours: sumHours(ge),
        entryCount: ge.length,
        traineeIds: Array.from(new Set(ge.map((x) => x.traineeId))),
        trainees,
      })
    }
    groups.sort((a, b) => groupSortKey(a.group).localeCompare(groupSortKey(b.group)))

    out.push({
      ojtiId,
      totalHours: sumHours(entries),
      entryCount: entries.length,
      traineeIds: Array.from(new Set(entries.map((e) => e.traineeId))),
      byProgram: {
        RADAR: sumHours(entries.filter((e) => e.program === "RADAR")),
        TOWER: sumHours(entries.filter((e) => e.program === "TOWER")),
      },
      groups,
      avgRating: avgRating(entries),
      lastDate: latestDate(entries),
    })
  }
  return out.sort((a, b) => b.totalHours - a.totalHours)
}
