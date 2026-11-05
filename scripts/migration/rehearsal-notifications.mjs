// Isolated SQL repository prototype, NOT imported by app runtime. Caller owns
// the transaction and derives recipient from a validated session in a future API.
import { mapNotification } from './lossless-plan.mjs'

export async function insertAndArchive(tx, messages) {
  const mapped = messages.map(mapNotification) // validate entire batch first
  if (new Set(mapped.map((n) => n.id)).size !== mapped.length) throw Error('Duplicate batch ID')
  // All writers using this protocol serialize retention + monotonically
  // allocated tie-break positions. Neon multi-connection lock behavior still
  // requires a separate rehearsal; single-process WASM is not that evidence.
  await tx.query('LOCK TABLE rehearsal.notification IN SHARE ROW EXCLUSIVE MODE')
  let order = (await tx.query('SELECT COALESCE(MAX(source_order),-1)::int AS n FROM rehearsal.notification')).rows[0].n + 1
  for (const n of mapped) {
    const previous = (await tx.query('SELECT source_payload FROM rehearsal.notification WHERE id=$1', [n.id])).rows[0]
    if (previous) {
      // Retry is safe only for the same original delivery, never replacement
      // of an existing receipt/deletion/flag with a stale sender payload.
      const old = previous.source_payload
      for (const key of ['staffId','channel','kind','subject','body','to','sentAt','sentBy','simulated','attachments']) {
        if (JSON.stringify(old[key]) !== JSON.stringify(n.source_payload[key])) throw Error('Delivery ID collision')
      }
      continue
    }
    await tx.query('INSERT INTO rehearsal.notification VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11)', [n.id,n.staff_id,n.channel,n.kind,n.sent_at,order++,n.read_at,n.flagged,n.deleted_at,JSON.stringify(n.source_payload),n.source_hash])
  }
  // Archive only: never unarchive an old row on later deliveries or backfills.
  await tx.query(`WITH ranked AS (SELECT id, row_number() OVER (ORDER BY sent_at DESC,source_order) AS rank FROM rehearsal.notification WHERE NOT archived) UPDATE rehearsal.notification n SET archived=true FROM ranked r WHERE n.id=r.id AND r.rank>500`)
}

export async function updateRecipientMessages(tx, recipient, ids, action, at) {
  if (typeof recipient !== 'string' || !recipient || !Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || ids.length > 500) throw Error('Invalid recipient action')
  if (!['read','flag','unflag','delete'].includes(action) || !Number.isFinite(Date.parse(at))) throw Error('Invalid action')
  const selected = [...new Set(ids)]
  if (!selected.length) return 0
  // No caller-provided SQL identifiers/expressions. Archive status unaffected.
  const set = {
    read: 'read_at=COALESCE(read_at,$3::timestamptz)',
    flag: 'flagged=true', unflag: 'flagged=false',
    delete: 'deleted_at=COALESCE(deleted_at,$3::timestamptz)',
  }[action]
  // $3 must be bound even for boolean actions so parameter arity stays explicit.
  const result = await tx.query(`UPDATE rehearsal.notification SET ${set} WHERE staff_id=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL AND $3::timestamptz IS NOT NULL RETURNING id`, [recipient,selected,at])
  return result.rows.length
}

export async function listRecipientMessages(tx, recipient, { archived = false, limit = 50, cursor = null } = {}) {
  if (typeof recipient !== 'string' || !recipient || typeof archived !== 'boolean' || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw Error('Invalid page')
  if (cursor && (!Number.isSafeInteger(cursor.order) || cursor.order < 0 || !Number.isFinite(Date.parse(cursor.at)))) throw Error('Invalid cursor')
  const rows = (await tx.query(`SELECT id,source_payload,read_at,flagged,deleted_at,sent_at,source_order FROM rehearsal.notification WHERE staff_id=$1 AND archived=$2 AND deleted_at IS NULL AND ($3::timestamptz IS NULL OR sent_at<$3 OR (sent_at=$3 AND source_order>$4)) ORDER BY sent_at DESC,source_order LIMIT $5`, [recipient,archived,cursor?.at ?? null,cursor?.order ?? null,limit+1])).rows
  const more = rows.length > limit
  const visible = rows.slice(0,limit)
  return {
    // Immutable source evidence stays intact; live receipt/flag state overrides it.
    items: visible.map((r) => ({ ...r.source_payload, readAt: r.read_at ? new Date(r.read_at).toISOString() : undefined, flagged: r.flagged ?? undefined, deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : undefined })),
    next: more && visible.length ? { at: new Date(visible.at(-1).sent_at).toISOString(), order: visible.at(-1).source_order } : null,
  }
}
