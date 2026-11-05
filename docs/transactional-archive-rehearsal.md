# Transactional notification archive prototype (isolated only)

This extends the local rehearsal, not the live backend. No application imports,
HTTP endpoints, credentials, migration or UI change. Run the synthetic-only test:

```sh
node scripts/quality/transactional-archive.mjs
```

`rehearsal-notifications.mjs` requires a caller-owned transaction for mutations.
Delivery validates the entire batch, locks the rehearsal notification table,
allocates stable ordering, inserts new IDs and archives active overflow beyond
500 in the same transaction. Retries with matching delivery content preserve
existing read/flag/deletion state. Reusing an ID for different delivery content
fails the transaction. Existing archived rows never silently become active again.
No physical row/file deletion occurs. Soft-deleted rows still count toward the
500 global active cap, per phase-1 policy.

Receipt/flag/delete operations predicate on recipient and IDs; deletion is soft
and read timestamp is first-open-wins. Archived status never changes on those
actions. Queries paginate active or archived messages with recipient predicates,
using sent_at/source_order cursor. Immutable original JSON is preserved for
migration evidence, while query results overlay current receipt/flag/delete
columns. Source hashes describe original evidence, not current mutable actions.

The tests use real SQL in ephemeral PGlite: overflow from 503→505 keeps exactly
500 active with 5 archived, duplicate delivery is idempotent, conflicting delivery
ID fails, receipts survive retries, cursor pages don't overlap, other-recipient
IDs aren't modified, soft-deletes retain all rows and transaction failure rolls
back inserts **and** archive transitions. An injected failure stands in for a
future audit failure; this prototype does not call the production audit module.

## Strict limits

No real Neon multi-connection concurrency proof: table locking is the proposed
protocol, tested only in single-process PostgreSQL WASM. Every production writer
would need to use that same protocol. Lock contention, connection budgets,
timeouts, deadlocks/retry strategy, transactional audit and performance need
isolated Neon tests before runtime adoption. No autonomous retry after unknown
commit outcome; caller must resolve it using stable delivery IDs.

This is a repository prototype, **not server authentication**. Future API must
derive recipient from a validated server session and reject caller-selected
identity. Demo account linking remains deferred; role-based demo UX is not a
production authorization policy. Cursor input validation is not tamper-proof
identity; recipient predicates must remain mandatory.

Live app still uses Blob and its old truncation; merging this PR does not enable
archiving. Other operational domains, attachment retention checks, full schema
mapping, archive UI, real backup restore and migration/cutover are unfinished.
Historical importer is still unsafe; do not run it.

## Next required boundary

Select/provision an isolated Neon branch/resource under a separately approved
configuration plan. Verify preview and production connection targets differ
without displaying credential values. Only then apply an explicitly reviewed
rehearsal schema and execute multi-connection tests. No live operational snapshot
import, backend switch, destructive cleanup or production schema change is
included here. This additional rehearsal is not a substitute for that boundary.
