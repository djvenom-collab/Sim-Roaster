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
 * blob starts EMPTY: the recipe seeds every slice it needs — reference/config
 * (positions, simulators, exercises, qual rules, …) AND transactional (staff,
 * runs, leave, logs, …) — with the scenario's own ids, and the factories append
 * those records here. The store applies the snapshot VERBATIM (the `__autonoma`
 * marker), so a run shows exactly what its factories seeded — a clean, isolated
 * slate. Slices the recipe omits (e.g. the SIM bucket map, permission matrix)
 * fall back to the store's built-in defaults. `version` is pinned to
 * SNAPSHOT_VERSION so the store's migration/backfill never reseeds over it.
 *
 * Teardown is scope-root: deleting the single per-run blob removes everything a
 * run created in one call (see deleteRunSnapshot / beforeDown in the handler).
 * =========================================================================== */
import { put, get, del } from "@vercel/blob"
import type { PersistedState } from "@/lib/persisted-state"
import { SNAPSHOT_VERSION } from "@/lib/persisted-state"

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
// don't each re-read OR re-write the blob. A single `up` runs all its factory
// creates + the afterUp hook in ONE request/process, so mutations are buffered
// here and written to the blob exactly once via flushRun() from afterUp —
// turning ~120 sequential blob round-trips into one. Keyed by testRunId; a cold
// process recovers by reading the existing per-run blob back in (loadSnapshot).
const cache = new Map<string, RunSnapshot>()
// testRunIds whose in-memory snapshot has unflushed mutations.
const dirty = new Set<string>()

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
  // A brand-new run starts EMPTY — the recipe seeds every slice it needs
  // (reference/config AND transactional) with the scenario's own ids, so there
  // is nothing to pre-populate. An existing run resumes where it left off.
  const snap: RunSnapshot = existing ?? { version: SNAPSHOT_VERSION, __autonoma: true }
  // Always pin the version so the app never runs a reseed migration over our data,
  // and always stamp the verbatim-apply marker.
  snap.version = SNAPSHOT_VERSION
  snap.__autonoma = true
  cache.set(testRunId, snap)
  return snap
}

/**
 * Persist a run's buffered snapshot to its blob if it has pending mutations.
 * Idempotent and a no-op when nothing changed. Call once per `up` (afterUp).
 */
export async function flushRun(testRunId: string): Promise<void> {
  if (!dirty.has(testRunId)) return
  const snap = cache.get(testRunId)
  if (!snap) {
    dirty.delete(testRunId)
    return
  }
  await put(runSnapshotPath(testRunId), JSON.stringify(snap), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  })
  dirty.delete(testRunId)
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
  dirty.add(testRunId)
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
  dirty.add(testRunId)
  return record
}

/**
 * Nest a training attachment under its TrainingSession's `attachments[]` — the
 * only place the app surfaces attachments (see app/training/page.tsx). Creates a
 * stub session if the attachment is seeded before its session; the session
 * factory upserts by id afterwards and the shallow merge preserves this array.
 */
export async function attachToSession(
  testRunId: string,
  sessionId: string,
  attachment: Record<string, unknown>,
): Promise<void> {
  const snap = await loadSnapshot(testRunId)
  const sessions = ((snap as Record<string, unknown>).trainingSessions as
    | Array<Record<string, unknown>>
    | undefined) ?? []
  let session = sessions.find((s) => s.id === sessionId)
  if (!session) {
    session = { id: sessionId }
    sessions.push(session)
  }
  session.attachments = [
    ...((session.attachments as unknown[] | undefined) ?? []),
    attachment,
  ]
  ;(snap as Record<string, unknown>).trainingSessions = sessions
  dirty.add(testRunId)
}

/**
 * Guarantee a per-run snapshot exists (marked + version-pinned), even when a
 * scenario seeds no domain slices (e.g. a User-only run), so /api/state always
 * serves an ISOLATED verbatim snapshot for the run rather than falling back to
 * the global demo data. Marks the run dirty so flushRun (afterUp) writes it.
 */
export async function ensureSnapshot(testRunId: string): Promise<void> {
  await loadSnapshot(testRunId)
  dirty.add(testRunId)
}

/** Scope-root teardown: delete a run's entire snapshot in one call. Idempotent. */
export async function deleteRunSnapshot(testRunId: string): Promise<void> {
  cache.delete(testRunId)
  dirty.delete(testRunId)
  try {
    await del(runSnapshotPath(testRunId))
  } catch {
    // Already gone (or never written) — teardown is best-effort/idempotent.
  }
}
