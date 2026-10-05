import "server-only"
import { BlobPreconditionFailedError, get, put } from "@vercel/blob"

// Single seam for reading/writing operational data. Routes depend on this
// interface, not on Blob, so the PostgreSQL implementation can be swapped in
// behind a flag at cutover (docs/data-architecture-migration.md, Phase 7)
// without touching callers.

export type Snapshot = Record<string, unknown>

export interface SnapshotRead {
  state: Snapshot | null
  /** Opaque concurrency token for the version that was read. */
  revision: string | null
}

export interface StateRepository {
  read(): Promise<SnapshotRead>
  /**
   * Writes the snapshot. When `expectedRevision` is provided the write only
   * succeeds if nobody has written since that revision was read; otherwise it
   * throws ConcurrencyConflictError and nothing is written.
   */
  write(state: Snapshot, opts: { expectedRevision: string | null }): Promise<{ revision: string }>
}

export class ConcurrencyConflictError extends Error {
  constructor() {
    super("concurrency_conflict")
    this.name = "ConcurrencyConflictError"
  }
}

export const STATE_PATHNAME = "sim-roster/state.json"

// Blob returns a weak validator (W/"…") on GET for large objects, but ifMatch
// only accepts the strong form. The opaque hash is identical, so normalise.
function normaliseRevision(etag: string | null | undefined): string | null {
  if (!etag) return null
  return etag.replace(/^W\//, "")
}

class BlobStateRepository implements StateRepository {
  async read(): Promise<SnapshotRead> {
    const result = await get(STATE_PATHNAME, { access: "private", useCache: false })
    if (!result || result.statusCode === 304 || !result.stream) return { state: null, revision: null }
    const text = await new Response(result.stream).text()
    return {
      state: text ? (JSON.parse(text) as Snapshot) : null,
      revision: normaliseRevision(result.blob.etag),
    }
  }

  async write(state: Snapshot, { expectedRevision }: { expectedRevision: string | null }) {
    try {
      const result = await put(STATE_PATHNAME, JSON.stringify(state), {
        access: "private",
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 0,
        ...(expectedRevision ? { ifMatch: normaliseRevision(expectedRevision)! } : {}),
      })
      return { revision: normaliseRevision(result.etag)! }
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) throw new ConcurrencyConflictError()
      throw error
    }
  }
}

export const stateRepository: StateRepository = new BlobStateRepository()
