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
    const existing = Array.isArray(snapshot[slice]) ? (snapshot[slice] as unknown[]) : []
    const tagged = records.map((r) => ({ ...r, [RUN_TAG]: runId }))
    snapshot[slice] = [...existing, ...tagged]
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
  for (const [key, value] of Object.entries(snapshot)) {
    if (!Array.isArray(value)) continue
    const filtered = value.filter(
      (row) => !(row && typeof row === "object" && (row as Record<string, unknown>)[RUN_TAG] === runId),
    )
    if (filtered.length !== value.length) {
      snapshot[key] = filtered
      changed = true
    }
  }
  if (changed) await writeSnapshot(snapshot)
}
