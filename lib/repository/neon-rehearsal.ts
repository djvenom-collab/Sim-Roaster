import "server-only"
import type { Pool } from "pg"

// Real multi-connection test, synthetic temporary namespace. No application,
// auth, audit or source snapshot read/import. DDL/cleanup is transaction-local.
export async function runNeonRehearsal(pool: Pool) {
  const first = await pool.connect()
  const second = await pool.connect()
  const schema = `rehearsal_${crypto.randomUUID().replaceAll("-", "")}`
  const table = `${schema}.notification`
  let firstOpen = false
  let secondOpen = false
  let created = false
  try {
    await first.query(`CREATE SCHEMA ${schema}`)
    created = true
    await first.query(`CREATE TABLE ${table} (id text PRIMARY KEY, recipient text NOT NULL, sent_order integer NOT NULL UNIQUE, archived boolean NOT NULL DEFAULT false, read_at timestamptz, flagged boolean, deleted_at timestamptz, payload jsonb NOT NULL)`)
    await first.query(`INSERT INTO ${table}(id,recipient,sent_order,payload) SELECT 'synthetic-'||i, CASE WHEN i%2=0 THEN 'a' ELSE 'b' END, i, jsonb_build_object('id','synthetic-'||i,'channel','in_app','attachments',jsonb_build_array(jsonb_build_object('id','test-file','pathname','synthetic/not-a-real-file'))) FROM generate_series(1,500) i`)
    const archive = `WITH ranked AS (SELECT id,row_number() OVER (ORDER BY sent_order DESC) AS n FROM ${table} WHERE NOT archived) UPDATE ${table} t SET archived=true FROM ranked r WHERE t.id=r.id AND r.n>500`
    await first.query("BEGIN")
    firstOpen = true
    await first.query("SET LOCAL statement_timeout='10s'")
    await first.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`)
    await second.query("BEGIN")
    secondOpen = true
    await second.query("SET LOCAL lock_timeout='500ms'")
    // Prove two separate connections: NOWAIT must fail while first holds lock.
    let contentionProtected = false
    try { await second.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE NOWAIT`) } catch (error) {
      contentionProtected = (error as { code?: string }).code === "55P03"
    }
    await second.query("ROLLBACK")
    secondOpen = false
    if (!contentionProtected) throw new Error("Writer lock did not exclude a second connection")
    await first.query(`INSERT INTO ${table}(id,recipient,sent_order,payload) VALUES ('synthetic-501','a',501,'{"channel":"in_app","flagged":false}')`)
    await first.query(archive)
    await first.query("COMMIT")
    firstOpen = false
    await second.query("BEGIN")
    secondOpen = true
    await second.query("SET LOCAL statement_timeout='10s'")
    await second.query(`LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE`)
    await second.query(`INSERT INTO ${table}(id,recipient,sent_order,payload) VALUES ('synthetic-502','b',502,'{"channel":"in_app","deletedAt":"kept-in-evidence"}')`)
    await second.query(archive)
    await second.query("COMMIT")
    secondOpen = false
    const counts = (await first.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE NOT archived)::int AS active,count(*) FILTER(WHERE archived)::int AS archived FROM ${table}`)).rows[0]
    if (counts.total !== 502 || counts.active !== 500 || counts.archived !== 2) throw new Error("Retention parity failed")
    await first.query("BEGIN")
    firstOpen = true
    await first.query(`UPDATE ${table} SET deleted_at=now() WHERE recipient='a' AND id=ANY($1::text[])`, [["synthetic-501", "synthetic-502"]])
    const owned = (await first.query(`SELECT count(*)::int AS n FROM ${table} WHERE deleted_at IS NOT NULL`)).rows[0].n
    if (owned !== 1) throw new Error("Recipient predicate failed")
    await first.query("ROLLBACK")
    firstOpen = false
    if ((await first.query(`SELECT count(*)::int AS n FROM ${table} WHERE deleted_at IS NOT NULL`)).rows[0].n !== 0) throw new Error("Rollback failed")
    const attachments = (await first.query(`SELECT payload->'attachments' AS files FROM ${table} WHERE id='synthetic-1'`)).rows[0].files
    if (attachments?.[0]?.id !== "test-file") throw new Error("Attachment evidence lost")
    return { passed: true, synthetic: true, separateConnections: true, writerLockExclusion: contentionProtected, ...counts, recipientPredicate: true, rollback: true, attachmentsPreserved: true }
  } finally {
    if (firstOpen) await first.query("ROLLBACK").catch(() => {})
    if (secondOpen) await second.query("ROLLBACK").catch(() => {})
    try { if (created) await first.query(`DROP SCHEMA ${schema} CASCADE`) } finally { first.release(); second.release() }
  }
}
