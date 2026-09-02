/* ===========================================================================
 * AUTONOMA — Blob snapshot access
 * ===========================================================================
 * The app persists ALL of its domain data as one JSON snapshot in Vercel Blob
 * at `sim-roster/state.json` (see app/api/state/route.ts). There is no
 * per-entity database for the domain models — they live in that single blob.
 *
 * Autonoma's factories therefore seed by MERGING test records into that
 * snapshot and tearing down by REMOVING exactly the records they added. Every
 * seeded record carries an `__autonomaRunId` tag so teardown is surgical and
 * never touches the developer's real data or another concurrent run's rows.
 *
 * NOTE ON CONCURRENCY: the blob is a single global document, so two overlapping
 * runs read-modify-write the same file. `mergeRecords` re-reads immediately
 * before writing to reduce clobbering, but this is best-effort — see
 * IMPLEMENTATION.md for the documented limitation.
 * =========================================================================== */
import { get, put } from "@vercel/blob"
import { SNAPSHOT_VERSION } from "@/lib/persisted-state"

const PATHNAME = "sim-roster/state.json"

// Tag stamped onto every seeded record so teardown can find its own rows.
export const RUN_TAG = "__autonomaRunId"

export type Snapshot = Record<string, unknown> & { version?: number }

export async function readSnapshot(): Promise<Snapshot> {
  try {
    const result = await get(PATHNAME, { access: "private", useCache: false })
    if (!result || result.statusCode === 304 || !result.stream) {
      return { version: SNAPSHOT_VERSION }
    }
    const text = await new Response(result.stream).text()
    const parsed = text ? (JSON.parse(text) as Snapshot) : { version: SNAPSHOT_VERSION }
    return parsed && typeof parsed === "object" ? parsed : { version: SNAPSHOT_VERSION }
  } catch {
    // No snapshot yet (or unreadable) — start from a minimal one. The store's
    // mergeWithSeed backfills every untouched slice from the sample data.
    return { version: SNAPSHOT_VERSION }
  }
}

export async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  await put(PATHNAME, JSON.stringify(snapshot), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  })
}

// Strip SDK-internal fields (any `__`-prefixed key) from a record before it is
// written into the app snapshot — EXCEPT the run tag, which teardown needs.
function cleanForSnapshot(record: Record<string, unknown>, runId: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (k.startsWith("__")) continue
    out[k] = v
  }
  out[RUN_TAG] = runId
  return out
}

/**
 * Append seeded records (keyed by PersistedState slice) into the live snapshot,
 * tagging each with the run id. Reads the latest snapshot first so overlapping
 * runs accumulate instead of clobbering one another.
 */
export async function mergeRecords(
  bySlice: Record<string, Record<string, unknown>[]>,
  runId: string,
): Promise<void> {
  const snapshot = await readSnapshot()
  for (const [slice, records] of Object.entries(bySlice)) {
    if (records.length === 0) continue
    // Append IN PLACE. The app snapshot can hold tens of thousands of rows, so
    // we push onto the existing array rather than spreading it into a fresh one
    // ([...existing, ...tagged]) — the spread would duplicate the entire slice
    // in memory on every seed, which is what drove the dev server toward its
    // heap ceiling under repeated Autonoma runs.
    const existing = Array.isArray(snapshot[slice]) ? (snapshot[slice] as unknown[]) : []
    for (const r of records) existing.push(cleanForSnapshot(r, runId))
    snapshot[slice] = existing
  }
  await writeSnapshot(snapshot)
}

/**
 * Remove every record this run added, matched by the run tag. Idempotent: a
 * second teardown finds nothing left to remove. Only ever drops rows carrying
 * THIS run's tag, so real data and other runs are untouched.
 */
export async function removeRecords(runId: string): Promise<void> {
  const snapshot = await readSnapshot()
  let changed = false
  for (const value of Object.values(snapshot)) {
    if (!Array.isArray(value)) continue
    // Prune IN PLACE with a single reverse splice pass. Building a `.filter()`
    // copy of a tens-of-thousands-row array on every teardown is exactly the
    // transient allocation that pushed the dev server past its heap limit;
    // splicing mutates the existing array without duplicating it.
    for (let i = value.length - 1; i >= 0; i--) {
      const row = value[i]
      if (row && typeof row === "object" && (row as Record<string, unknown>)[RUN_TAG] === runId) {
        value.splice(i, 1)
        changed = true
      }
    }
  }
  if (changed) await writeSnapshot(snapshot)
}

/**
 * Find this run's id from a refs map. Every factory stamps `__autonomaRunId`
 * onto the record it returns, so the value is present on any ref record and is
 * carried inside the signed refs token used by `down`.
 */
export function runIdFromRefs(refs: Record<string, Record<string, unknown>[]>, fallback: string): string {
  for (const records of Object.values(refs)) {
    for (const record of records) {
      const tag = record?.[RUN_TAG]
      if (typeof tag === "string" && tag) return tag
    }
  }
  return fallback
}
