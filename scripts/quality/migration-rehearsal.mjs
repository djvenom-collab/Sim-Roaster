// Always ephemeral: no connection string, environment variables, real snapshot
// file, network or persistent data directory accepted. Synthetic records only.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { prepareLosslessPlan, reconstructSource, valueDigest } from '../migration/lossless-plan.mjs'

if (process.argv.length > 2) throw Error('This rehearsal accepts no arguments or live data')
const schema = await readFile(new URL('../migration/rehearsal-schema.sql', import.meta.url), 'utf8')
const source = {
  version: 11,
  staff: [{ id: 'demo', nested: { futureField: 'preserve 🙂' } }],
  notifications: Array.from({ length: 503 }, (_, i) => ({
    id: `n${i}`, staffId: i % 2 ? 'demo-a' : 'demo-b', channel: 'in_app', kind: 'custom',
    subject: `Synthetic ${i}`, body: 'No real message', to: 'demo',
    sentAt: new Date(Date.UTC(2026, 10, 5, 0, 0, i)).toISOString(), sentBy: 'Demo', simulated: true,
    ...(i === 0 ? { flagged: true, readAt: '2026-11-05T01:00:00Z', deletedAt: '2026-11-05T02:00:00Z', attachments: [{ id: 'f', pathname: 'synthetic/file', custom: true }] } : {}),
  })),
  importHistory: [{ summary: 'Legacy entry', when: 'original local text' }, { id: 'i', filename: 'demo.xlsx', date: '2026-11-05', user: 'Demo', rowsTotal: 1, rowsAccepted: 1, rowsRejected: 0 }],
}
const plan = prepareLosslessPlan(source)
const db = new PGlite()
const restore = new PGlite()
const tx = async (operation) => {
  await db.exec('BEGIN')
  try { const result = await operation(); await db.exec('COMMIT'); return result } catch (e) { await db.exec('ROLLBACK'); throw e }
}
try {
  await db.exec(schema)
  await tx(async () => {
    for (const slice of plan.slices) await db.query('INSERT INTO rehearsal.source_slice VALUES ($1,$2,$3)', [slice.name, JSON.stringify(slice.source_payload), slice.source_hash])
    const activeIds = new Set(plan.notifications.active.map((n) => n.id))
    for (const [index, n] of source.notifications.entries()) {
      const mapped = [...plan.notifications.active, ...plan.notifications.archived].find((v) => v.id === n.id)
      await db.query('INSERT INTO rehearsal.notification VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [mapped.id, mapped.staff_id, mapped.channel, mapped.kind, mapped.sent_at, index, mapped.read_at, mapped.flagged, mapped.deleted_at, !activeIds.has(n.id), JSON.stringify(mapped.source_payload), mapped.source_hash])
    }
    for (const item of plan.imports) await db.query('INSERT INTO rehearsal.import_record VALUES ($1,$2,$3,$4,$5)', [item.migration_key, item.source_id, item.format, JSON.stringify(item.source_payload), item.source_hash])
  })
  const counts = (await db.query('SELECT archived, count(*)::int AS n FROM rehearsal.notification GROUP BY archived')).rows
  assert.equal(counts.find((v) => !v.archived).n, 500)
  assert.equal(counts.find((v) => v.archived).n, 3)
  const records = (await db.query('SELECT * FROM rehearsal.notification ORDER BY source_order')).rows
  assert.deepEqual(records.map((v) => v.source_payload), source.notifications)
  for (const record of records) assert.equal(valueDigest(record.source_payload), record.source_hash)
  assert.equal(records[0].flagged, true)
  assert.ok(records[0].deleted_at)
  const imported = (await db.query('SELECT * FROM rehearsal.import_record ORDER BY migration_key')).rows
  assert.ok(imported.some((row) => row.format === 'legacy' && row.source_id === null && row.source_payload.when === 'original local text'))
  const slices = (await db.query('SELECT name, payload AS source_payload, value_hash AS source_hash FROM rehearsal.source_slice')).rows
  assert.deepEqual(reconstructSource({ ...plan, slices }), source)

  // SQL constraints actually execute in PostgreSQL WASM, not request doubles.
  await assert.rejects(() => db.query("UPDATE rehearsal.notification SET channel='unknown' WHERE id='n0'"))
  await assert.rejects(() => db.query("INSERT INTO rehearsal.notification SELECT * FROM rehearsal.notification WHERE id='n0'"))
  await assert.rejects(() => tx(async () => { await db.query("UPDATE rehearsal.notification SET flagged=false WHERE id='n0'"); throw Error('simulate failure') }))
  assert.equal((await db.query("SELECT flagged FROM rehearsal.notification WHERE id='n0'")).rows[0].flagged, true)

  // Cursor pagination uses an explicit recipient and stable date/order tuple.
  const page = async (recipient, archived, cursor = null) => (await db.query(`SELECT id,sent_at,source_order FROM rehearsal.notification WHERE staff_id=$1 AND archived=$2 AND deleted_at IS NULL AND ($3::timestamptz IS NULL OR sent_at < $3 OR (sent_at=$3 AND source_order>$4)) ORDER BY sent_at DESC,source_order LIMIT 37`, [recipient, archived, cursor?.sent_at ?? null, cursor?.source_order ?? null])).rows
  const seen = []
  let cursor = null
  while (true) { const rows = await page('demo-a', false, cursor); if (!rows.length) break; seen.push(...rows.map((r) => r.id)); cursor = rows.at(-1) }
  const expected = records.filter((r) => r.staff_id === 'demo-a' && !r.archived && !r.deleted_at).length
  assert.equal(seen.length, expected)
  assert.equal(new Set(seen).size, seen.length)
  assert.ok((await page('demo-b', true)).every((r) => records.find((v) => v.id === r.id).staff_id === 'demo-b'))

  // Logical backup/restore in a second independent in-memory database. Not a
  // full pg_dump/PITR drill, and no claim of Neon/multi-connection concurrency.
  await restore.exec(schema)
  for (const slice of slices) await restore.query('INSERT INTO rehearsal.source_slice VALUES ($1,$2,$3)', [slice.name, JSON.stringify(slice.source_payload), slice.source_hash])
  const restoredSlices = (await restore.query('SELECT name,payload AS source_payload,value_hash AS source_hash FROM rehearsal.source_slice')).rows
  assert.deepEqual(reconstructSource({ ...plan, slices: restoredSlices }), source)
  await db.exec('BEGIN')
  await db.query("DELETE FROM rehearsal.notification WHERE id='n0'")
  await db.exec('ROLLBACK')
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rehearsal.notification')).rows[0].n, 503)
  console.log('PASS: isolated PostgreSQL schema/import, 500 active + 3 archived, field-value parity, real constraints/transaction rollback, recipient cursor pagination and logical evidence restore')
  console.log('LIMIT: synthetic WASM rehearsal only; no live schema, Neon isolation, concurrent writers, domain API, runtime archive activation or production cutover tested')
} finally {
  await db.close()
  await restore.close()
}
