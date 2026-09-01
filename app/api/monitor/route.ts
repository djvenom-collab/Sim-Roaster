import { NextResponse } from "next/server"
import { list, put, head } from "@vercel/blob"

// ── Shared types (re-exported so the page can import them) ────────────────────
export interface MetricSnapshot {
  timestamp: string       // ISO
  cpu: number             // 0–100 %
  memory: number          // 0–100 %
  memoryUsedMB: number
  memoryTotalMB: number
  disk: number            // 0–100 %
  diskUsedGB: number
  diskTotalGB: number
  bandwidth: number       // total Mbps (in + out)
  bandwidthInMbps: number
  bandwidthOutMbps: number
  blobFiles: number
  blobStorageBytes: number
}

export interface MonitorPayload {
  latest: MetricSnapshot
  buffer: MetricSnapshot[]   // last BUFFER_SIZE samples from the server ring buffer
}

// ── Configuration ─────────────────────────────────────────────────────────────
const BUFFER_SIZE   = 60          // samples kept in the server ring buffer
const ARCHIVE_EVERY = 20          // flush to Blob every N samples (~60 s at 3 s/poll)
const POLL_INTERVAL_MS = 3_000
const BLOB_TTL_MS   = 60_000
const ARCHIVE_PREFIX = "sim-roster/monitor/"

// ── Module-level state (persists across requests in the same serverless instance)
// ─────────────────────────────────────────────────────────────────────────────
// The ring buffer accumulates samples whether or not the page is open.
// When Vercel cold-starts a new instance we seed the buffer from the most
// recent archive file so there is always data available immediately.
let ringBuffer: MetricSnapshot[] = []
let sampleCount = 0             // total samples since instance start
let bufferSeeded = false        // true once we have tried to seed from Blob

// Blob stats cache — refreshed at most once per minute
let blobCache: { files: number; bytes: number; expiresAt: number } = { files: 0, bytes: 0, expiresAt: 0 }

// ── Deterministic noise ───────────────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function smoothNoise(base: number, amplitude: number, seed: number): number {
  const rng = seededRng(seed)
  const v = base
    + amplitude * (rng() * 2 - 1) * 0.5
    + amplitude * (rng() * 2 - 1) * 0.3
    + amplitude * (rng() * 2 - 1) * 0.2
  return Math.max(0, Math.min(100, v))
}

// ── Seed buffer from latest Blob archive on cold-start ────────────────────────
async function seedBufferFromBlob(): Promise<void> {
  if (bufferSeeded) return
  bufferSeeded = true
  try {
    const { blobs } = await list({ prefix: ARCHIVE_PREFIX })
    if (blobs.length === 0) return
    // Sort by pathname descending — the last file is today's or the most recent
    const sorted = [...blobs].sort((a, b) => b.pathname.localeCompare(a.pathname))
    const res = await fetch(sorted[0].url)
    if (!res.ok) return
    const text = await res.text()
    const lines = text.trim().split("\n").filter(Boolean)
    // Take the last BUFFER_SIZE lines
    const samples: MetricSnapshot[] = lines
      .slice(-BUFFER_SIZE)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean) as MetricSnapshot[]
    if (samples.length > 0) {
      ringBuffer = samples
    }
  } catch {
    // Non-fatal — continue with empty buffer
  }
}

// ── Build one snapshot ────────────────────────────────────────────────────────
function buildSnapshot(now: number, blobFiles: number, blobStorageBytes: number): MetricSnapshot {
  const bucket = Math.floor(now / POLL_INTERVAL_MS)

  const diskTotalGB  = 500
  const diskBaseUsedGB = 45 + blobStorageBytes / 1e9
  const diskUsedGB   = Math.min(diskTotalGB - 1, diskBaseUsedGB + smoothNoise(0, 2, bucket * 7) / 100 * 10)
  const disk         = (diskUsedGB / diskTotalGB) * 100

  const cpuBase = 22 + (bucket % 17 < 3 ? 38 : 0)
  const cpu     = smoothNoise(cpuBase, 12, bucket * 3)

  const memoryTotalMB = 32768
  const memory        = smoothNoise(61, 6, bucket * 5)
  const memoryUsedMB  = Math.round((memory / 100) * memoryTotalMB)

  const bwBase           = 8 + (bucket % 23 < 4 ? 32 : 0)
  const bandwidthInMbps  = Math.max(0.1, smoothNoise(bwBase,       8, bucket * 11) * 0.8)
  const bandwidthOutMbps = Math.max(0.1, smoothNoise(bwBase * 0.4, 4, bucket * 13) * 0.6)
  const bandwidth        = bandwidthInMbps + bandwidthOutMbps

  const r1 = (n: number) => Math.round(n * 10) / 10
  return {
    timestamp: new Date(now).toISOString(),
    cpu:  r1(cpu),  memory: r1(memory),
    memoryUsedMB, memoryTotalMB,
    disk: r1(disk), diskUsedGB: Math.round(diskUsedGB * 100) / 100, diskTotalGB,
    bandwidth: r1(bandwidth), bandwidthInMbps: r1(bandwidthInMbps), bandwidthOutMbps: r1(bandwidthOutMbps),
    blobFiles, blobStorageBytes,
  }
}

// ── Flush ring buffer to Blob archive ────────────────────────────────────────
// Appends to a daily NDJSON file: sim-roster/monitor/YYYY-MM-DD.ndjson
// Uses Blob's put() with addRandomSuffix:false + append — but since Blob has no
// native append, we read + rewrite. To keep it cheap we only flush every
// ARCHIVE_EVERY samples and cap each file at 24 h of data.
async function flushArchive(snapshots: MetricSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return
  try {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const path  = `${ARCHIVE_PREFIX}${today}.ndjson`

    // Try to read existing content
    let existing = ""
    try {
      const info = await head(path)
      if (info?.url) {
        const res = await fetch(info.url, { cache: "no-store" })
        if (res.ok) existing = await res.text()
      }
    } catch { /* file doesn't exist yet — first write of the day */ }

    const newLines = snapshots.map((s) => JSON.stringify(s)).join("\n")
    const combined = existing ? `${existing.trimEnd()}\n${newLines}` : newLines

    await put(path, combined + "\n", {
      access: "public",   // must be public for head()+fetch() read-back pattern
      addRandomSuffix: false,
      contentType: "application/x-ndjson",
      allowOverwrite: true,
    })
  } catch {
    // Non-fatal — archive failures must never crash the live monitor
  }
}

// ── GET /api/monitor — returns latest snapshot + full ring buffer ─────────────
export async function GET() {
  // Seed from Blob on first request after a cold start
  await seedBufferFromBlob()

  const now = Date.now()

  // Refresh Blob stats cache at most once per minute
  if (now >= blobCache.expiresAt) {
    try {
      const { blobs } = await list({ prefix: "sim-roster/" })
      blobCache = {
        files: blobs.length,
        bytes: blobs.reduce((s, b) => s + (b.size ?? 0), 0),
        expiresAt: now + BLOB_TTL_MS,
      }
    } catch {
      blobCache.expiresAt = now + BLOB_TTL_MS
    }
  }

  const snap = buildSnapshot(now, blobCache.files, blobCache.bytes)

  // Append to ring buffer (deduplicate by 3-second bucket)
  const last = ringBuffer.at(-1)
  const snapBucket = Math.floor(new Date(snap.timestamp).getTime() / POLL_INTERVAL_MS)
  const lastBucket = last ? Math.floor(new Date(last.timestamp).getTime() / POLL_INTERVAL_MS) : -1

  let pendingFlush: MetricSnapshot[] = []
  if (snapBucket !== lastBucket) {
    ringBuffer = [...ringBuffer, snap].slice(-BUFFER_SIZE)
    sampleCount++

    // Collect samples for archive flush every ARCHIVE_EVERY ticks
    if (sampleCount % ARCHIVE_EVERY === 0) {
      pendingFlush = [...ringBuffer]
    }
  }

  // Fire archive flush in background (don't await — keep response fast)
  if (pendingFlush.length > 0) {
    flushArchive(pendingFlush).catch(() => {})
  }

  const payload: MonitorPayload = {
    latest: snap,
    buffer: ringBuffer,
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  })
}
