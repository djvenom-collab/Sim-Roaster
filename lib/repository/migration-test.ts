import "server-only"
import { Pool } from "pg"
import { explicitPostgresTls } from "@/lib/db/connection-string"

// No fallback to DATABASE_URL. This pool can never select production through
// missing rehearsal config. Branch and environment must both match explicitly.
export function migrationTestPool() {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "storage/migration-candidate") throw new Error("Rehearsal disabled")
  const test = process.env.MIGRATION_TEST_DATABASE_URL
  if (!test || !process.env.DATABASE_URL) throw new Error("Rehearsal configuration missing")
  const testURL = new URL(test)
  const liveURL = new URL(process.env.DATABASE_URL)
  const endpoint = (u: URL) => u.hostname.replace(/-pooler(?=\.)/, "")
  if (endpoint(testURL) === endpoint(liveURL)) throw new Error("Rehearsal target is not isolated")
  return new Pool({ connectionString: explicitPostgresTls(test), max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 1000 })
}
