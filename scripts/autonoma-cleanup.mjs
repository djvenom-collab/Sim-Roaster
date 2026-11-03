// One-off maintenance helper: inspect / purge Autonoma test users left in Neon
// by an interrupted `up` (the normal path is the SDK `down` teardown).
// Scoped strictly to the @simroster.test email domain used by the recipe, so
// it can never touch real app accounts.
import pg from "pg"

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const mode = process.argv[2] ?? "list"

const { rows: testUsers } = await pool.query(
  `SELECT id, email FROM "user" WHERE email LIKE '%@simroster.test' ORDER BY email`,
)
console.log(`test users (@simroster.test): ${testUsers.length}`)
for (const r of testUsers) console.log("  -", r.email)

const { rows: other } = await pool.query(
  `SELECT count(*)::int AS n FROM "user" WHERE email NOT LIKE '%@simroster.test'`,
)
console.log(`NON-test users (preserved): ${other[0].n}`)

if (mode === "purge" && testUsers.length) {
  const ids = testUsers.map((r) => r.id)
  await pool.query(`DELETE FROM "session" WHERE "userId" = ANY($1)`, [ids])
  await pool.query(`DELETE FROM "account" WHERE "userId" = ANY($1)`, [ids])
  await pool.query(`DELETE FROM "verification" WHERE identifier LIKE '%@simroster.test'`)
  await pool.query(`DELETE FROM "user" WHERE id = ANY($1)`, [ids])
  console.log(`purged ${ids.length} test users (+ their sessions/accounts/verifications)`)
}

await pool.end()
