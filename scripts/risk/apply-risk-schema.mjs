// Applies db/migrations/0003_risk_register.up.sql (idempotent). Creates no risk rows:
// the baseline is imported from the Admin UI so every insert is audited.
// Usage: node --env-file-if-exists=/vercel/share/.env.project scripts/risk/apply-risk-schema.mjs
import { readFile } from "node:fs/promises"
import pg from "pg"

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const sql = await readFile(new URL("../../db/migrations/0003_risk_register.up.sql", import.meta.url), "utf8")
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query("BEGIN")
  await client.query(sql)
  await client.query("COMMIT")
  const { rows } = await client.query("SELECT count(*)::int AS n FROM risk.risk")
  console.log(`risk schema applied; risk.risk rows: ${rows[0].n}`)
} catch (error) {
  await client.query("ROLLBACK").catch(() => {})
  console.error("migration failed:", error.message)
  process.exitCode = 1
} finally {
  await client.end()
}
