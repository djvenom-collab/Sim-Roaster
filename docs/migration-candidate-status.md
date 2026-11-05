# Single working migration candidate — DO NOT MERGE

Branch: storage/migration-candidate. This replaces the preparation-PR merge
cycle with one draft. Do not merge/redeploy intermediate revisions.

## Infrastructure verified

An isolated Neon resource named sim-roster-migration-test was provisioned on
Free (free_v3), with auth disabled. Connected only to Preview using the
MIGRATION_TEST prefix; existing credentials removed: none. Production env
variables untouched. No plan upgrade or paid resource selected.

Preview-only /migration-test and Admin POST /api/admin/migration-rehearsal are
hard-gated to this branch + Preview. Test pool requires explicit test credentials,
normalizes pooled/unpooled endpoint identity, rejects a target matching the
existing database, and never falls back to DATABASE_URL. Local isolation tests
cover production/wrong branch/missing/same target rejection. The test creates
only synthetic records in a unique temporary schema and removes that schema.

Real deployed Neon rehearsal passed with two Pool connections: NOWAIT table-lock
contention rejects a second writer while first holds the lock; serialized sends
retain 502 total / 500 active / 2 archived; recipient-predicated mutation affects
one owner; rollback restores deleted-state counts; attachment JSON is preserved.
This is not a load test, sustained concurrency proof or production migration.

## Repository in progress (not connected to app)

candidate-store.ts is a transitional record-oriented JSONB prototype with
slice/key/order columns, revision lock, per-record diff writes, notification
overflow preservation and transaction-local change counts. Tests use PGlite;
no app imports or runtime selection. It is **not** the normalized/FK-complete
operational schema. It does not yet supply complete production authorization,
full audit history/chain, per-domain APIs, archive UI, backup/restore or all
snapshot omission/reordering semantics. The change table is not a replacement
for audit.event. No runtime backend switch has been added.

## Data decision before real-data rehearsal

Owner must choose a private copy of the current operational snapshot in the
isolated resource versus an anonymized copy. Until that choice, test only
synthetic records; do not import personal roster/message data or fetch real
attachment bytes for rehearsal. Either choice leaves production untouched.
Do not ask for database passwords or snapshot contents in chat. Counts from
the aggregate report are not the full migration input.

## Remaining required work in THIS draft

Complete field coverage, identity/permission-compatible demo behavior,
normalized or explicitly agreed record model, record/date scoped APIs and
client integration; preserve server validation, CAS/conflicts and atomic
audit; remove implicit notification truncation only when archive writes are
durable. Verify full value parity, representative user workflows, isolated
backup/restore and preservation of post-cutover changes. No final review or
production migration approval should be requested before these gates pass.

Production still uses Blob. Archiving is not active. A ready preview does not
mean a finished candidate. Infrastructure setup and the synthetic test do not
constitute migration of the app.
