/* ===========================================================================
 * AUTONOMA — per-run domain snapshot store
 * ===========================================================================
 * The whole app persists its editable domain data as ONE JSON snapshot in
 * Vercel Blob (see app/api/state/route.ts + lib/persisted-state.ts). That is a
 * single global document with no tenant/scope column, so seeding scenario data
 * into it directly would (a) clobber the real demo snapshot and (b) make
 * concurrent Autonoma test runs collide on the same file.
 *
 * To give every test run an isolated, disposable copy of the app's state, this
 * module writes each run's seeded slices to a PER-RUN blob keyed by testRunId:
 *
 *     sim-roster/autonoma/<testRunId>/state.json
 *
 * The app serves that per-run snapshot instead of the global one whenever the
 * request carries the `autonoma_run` cookie (set by the auth callback). Each run
 * blob is initialised from the app's REFERENCE/CONFIG data (see
 * buildReferenceSnapshot) with empty transactional slices, then factories append
 * their seeded records. The store applies the snapshot VERBATIM (the `__autonoma`
 * marker), so what a run shows is exactly reference-data + what its factories
 * seeded — a clean, isolated slate. `version` is pinned to SNAPSHOT_VERSION so
 * the store's migration/backfill logic never reseeds over our data.
 *
 * Teardown is scope-root: deleting the single per-run blob removes everything a
 * run created in one call (see deleteRunSnapshot / beforeDown in the handler).
 * =========================================================================== */
import { put, get, del } from "@vercel/blob"
import type { PersistedState } from "@/lib/persisted-state"
import { SNAPSHOT_VERSION } from "@/lib/persisted-state"
import * as seed from "@/lib/sample-data"

/**
 * The app's REFERENCE/CONFIG data — the slices that describe the fixed world a
 * scenario operates in (positions, simulators, exercises, courses, the SIM
 * bucket map, qual rules, the qualification catalogue, slot times, holidays and
 * OJTI pools). Every per-run blob is initialised with a copy of these so:
 *   - the app renders (schedules need positions, exercises, slot times, …), and
 *   - master-data factories (Position/Simulator/Exercise/…) APPEND to the seed
 *     set rather than replacing it, keeping all cross-references intact.
 *
 * Crucially, reference data only ever references OTHER reference data, while
 * transactional data references reference data — so seeding reference slices and
 * leaving transactional slices EMPTY yields a clean, fully-consistent slate with
 * no dangling references. Transactional slices (staff, runs, leave, training,
 * logs, …) are intentionally omitted here and filled only by factories.
 */
function buildReferenceSnapshot(): Partial<PersistedState> {
  return {
    positions: structuredClone(seed.positions),
    simulators: structuredClone(seed.simulators),
    exercises: structuredClone(seed.exercises),
    courses: structuredClone(seed.courses),
    courseSimClass: structuredClone(seed.courseSimClass),
    exerciseQualRules: structuredClone(seed.exerciseQualRules),
    qualifications: structuredClone(seed.qualifications),
    slotTimes: structuredClone(seed.slotTimes),
    publicHolidays: structuredClone(seed.publicHolidays),
    trainingGroups: structuredClone(seed.trainingGroups),
  }
}

/** Cookie name the app reads to switch /api/state onto the per-run snapshot. */
export const RUN_COOKIE = "autonoma_run"

/** Blob pathname holding one test run's isolated domain snapshot. */
export function runSnapshotPath(testRunId: string): string {
  // Keep the id filesystem-safe; testRunIds are uuid-ish but stay defensive.
  const safe = testRunId.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `sim-roster/autonoma/${safe}/state.json`
}

/**
 * A partial snapshot: every slice is optional, but `version` and the
 * `__autonoma` marker are always present.
 *
 * `__autonoma: true` tells the store's load effect to apply these slices
 * VERBATIM — skipping the normal migration/dedupe/history-backfill pipeline
 * that would otherwise inject multi-year historical runs and bury the clean
 * scenario data. `positionQualRules` and `trainingAttachments` are carried as
 * loose extra keys (the app persists neither in its normal snapshot) so the
 * verbatim branch can surface them without changing the normal persisted shape.
 */
export const AUTONOMA_MARKER = "__autonoma" as const
export type RunSnapshot = Partial<PersistedState> & {
  version: number
  __autonoma: true
  positionQualRules?: unknown[]
  trainingAttachments?: unknown[]
}

// In-process accumulator so the many factory calls inside a single `up` request
// don't each re-read the blob. Keyed by testRunId. It is only a cache — every
// mutation is flushed to the blob immediately, so a cold process recovers by
// reading the existing per-run blob back in (see loadSnapshot).
const cache = new Map<string, RunSnapshot>()

async function readBlob(testRunId: string): Promise<RunSnapshot | null> {
  try {
    const result = await get(runSnapshotPath(testRunId), { access: "private", useCache: false })
    if (!result || result.statusCode === 304 || !result.stream) return null
    const text = await new Response(result.stream).text()
    return text ? (JSON.parse(text) as RunSnapshot) : null
  } catch {
    return null
  }
}

/** Load (or lazily initialise) the accumulator for a run. */
export async function loadSnapshot(testRunId: string): Promise<RunSnapshot> {
  const cached = cache.get(testRunId)
  if (cached) return cached
  const existing = await readBlob(testRunId)
  // A brand-new run starts from the reference/config world with EMPTY
  // transactional slices; an existing run resumes exactly where it left off.
  const snap: RunSnapshot =
    existing ?? { version: SNAPSHOT_VERSION, __autonoma: true, ...buildReferenceSnapshot() }
  // Always pin the version so the app never runs a reseed migration over our data,
  // and always stamp the verbatim-apply marker.
  snap.version = SNAPSHOT_VERSION
  snap.__autonoma = true
  cache.set(testRunId, snap)
  return snap
}

async function flush(testRunId: string, snap: RunSnapshot): Promise<void> {
  cache.set(testRunId, snap)
  await put(runSnapshotPath(testRunId), JSON.stringify(snap), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  })
}

type ArraySliceKey = {
  [K in keyof PersistedState]: PersistedState[K] extends Array<infer _> ? K : never
}[keyof PersistedState]

// The array slices a factory may write to: every array slice of PersistedState
// plus the two loose passthrough slices the verbatim branch surfaces.
type WritableSlice = ArraySliceKey | "positionQualRules" | "trainingAttachments"

/**
 * Append a record to an array slice of the run snapshot and flush to blob.
 * Returns the same record for convenience.
 */
export async function appendToSlice<T extends Record<string, unknown>>(
  testRunId: string,
  slice: WritableSlice,
  record: T,
): Promise<T> {
  const snap = await loadSnapshot(testRunId)
  const arr = ((snap as Record<string, unknown>)[slice] as T[] | undefined) ?? []
  arr.push(record)
  ;(snap as Record<string, unknown>)[slice] = arr
  await flush(testRunId, snap)
  return record
}

/**
 * Upsert a record into an array slice, matched by `match`. Used where the app's
 * own creation path already inserted a placeholder row (e.g. Run creates empty
 * RunAssignments, Staff creates default StaffValidity) so an explicit factory
 * for that child updates the existing row instead of duplicating it — exactly
 * as the store's assignStaff / setStaffValidity do.
 */
export async function upsertIntoSlice<T extends Record<string, unknown>>(
  testRunId: string,
  slice: WritableSlice,
  record: T,
  match: (existing: T) => boolean,
): Promise<T> {
  const snap = await loadSnapshot(testRunId)
  const arr = ((snap as Record<string, unknown>)[slice] as T[] | undefined) ?? []
  const idx = arr.findIndex(match)
  if (idx >= 0) arr[idx] = { ...arr[idx], ...record }
  else arr.push(record)
  ;(snap as Record<string, unknown>)[slice] = arr
  await flush(testRunId, snap)
  return record
}

/**
 * Guarantee a per-run blob exists (marked + version-pinned), even when a
 * scenario seeds no domain slices (e.g. a User-only run). Called once from the
 * auth callback so /api/state always serves an ISOLATED verbatim snapshot for
 * the run rather than falling back to the global demo data.
 */
export async function ensureSnapshot(testRunId: string): Promise<void> {
  const snap = await loadSnapshot(testRunId)
  await flush(testRunId, snap)
}

/** Scope-root teardown: delete a run's entire snapshot in one call. Idempotent. */
export async function deleteRunSnapshot(testRunId: string): Promise<void> {
  cache.delete(testRunId)
  try {
    await del(runSnapshotPath(testRunId))
  } catch {
    // Already gone (or never written) — teardown is best-effort/idempotent.
  }
}
