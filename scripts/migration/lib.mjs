/* Shared helpers for the Blob → PostgreSQL migration tooling.
 * Every helper here is READ-ONLY against Vercel Blob. Nothing in this module
 * writes to or deletes `sim-roster/state.json`. */
import { createHash } from "node:crypto"
import { get } from "@vercel/blob"

export const STATE_PATH = "sim-roster/state.json"

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`)
    process.exit(2)
  }
}

/** Reads the live snapshot and returns its raw text, parsed object, ETag and SHA-256. */
export async function readLiveSnapshot() {
  requireEnv("BLOB_READ_WRITE_TOKEN")
  const result = await get(STATE_PATH, { access: "private", useCache: false })
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`No readable snapshot at ${STATE_PATH}`)
  }
  const text = await new Response(result.stream).text()
  const state = JSON.parse(text)
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Snapshot is not a JSON object")
  }
  return {
    text,
    state,
    etag: result.blob.etag,
    uploadedAt: result.blob.uploadedAt,
    sha256: sha256(text),
    bytes: Buffer.byteLength(text),
  }
}

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex")
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {}
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg)
    if (m) out[m[1]] = m[2] ?? true
  }
  return out
}
