# Storage redesign — staged design, not a live migration

## Status and scope

This change removes the synthetic System Monitor page, its polling/API/archive
writer and permission entry. It **does not delete any stored object**, alter the
live snapshot, create tables, run migration tools or change production config.
Real dependency health (`/api/health`), backup/restore, scheduled backup, audit,
risk management and recovery checks remain intact. Old `/monitor` and
`/api/monitor*` URLs are no longer supported; no replacement polling endpoint.

The previous [migration assessment](./data-architecture-migration.md) is useful
historical context, not proof that its schema/tooling covers today's data. Do
not run its commit command or assume its old counts/dry-run results still apply.

## Before-change baseline

Source: main `c2b195da3548decf5464b8dc2e412628c61adb95`.
Measured before monitor removal, production 2026-11-05 06:41–06:47 UTC:

| Operation | Samples | Mean function duration | p75 first-byte time |
|---|---:|---:|---:|
| State GET | 2 | 4034 ms | 4527 ms |
| State PUT | 1 | 4562 ms | 4616 ms |

Tiny observational sample, not a benchmark or full browser load timing. The
metrics are separate aggregates and should not be subtracted. No monitor API
invocations or runtime log records appeared in that window (no coverage gaps).
Removing the monitor cannot be credited with a measured roster speedup here.
Its CPU/memory/network numbers were deterministic simulations. While mounted,
it polled every three seconds and attempted archive rewrites every 20 samples;
it was not an independent always-running telemetry service.

Baseline regression reproductions, lint and non-incremental typecheck pass.
No production load generator or synthetic writes were used.

## Current persistence boundaries (source-backed)

| Data | Current source of truth / paths | Migration concern |
|---|---|---|
| Operational entities/config/feed | `sim-roster/state.json` | Shared complete snapshot/revision; browser loads all and saves all |
| Snapshot backups | `sim-roster/backups/` | Backup/restore APIs directly depend on old snapshot path |
| Recovery evidence/manifests | `sim-roster/dr/` and backup manifests | Preserve chain, hashes, retention and restore compatibility |
| Training/notification files | `training/` | Existing references/path validators must continue working |
| Authentication | PostgreSQL via Better Auth | Never mix/reset auth IDs or schema during ops migration |
| Durable audit | `audit.event` | Preserve append-only chain and actor/correlation identities |
| Risk register | `risk` schema | Separate lifecycle; do not drop/reseed |
| Test data | Per-run Autonoma snapshot/cookie routing + auth rows | Keep concurrent test runs isolated from shared data |
| Legacy monitor files | `sim-roster/monitor/` | Retained; no new app reader/writer after removal |

Live object counts, sizes, reference integrity, database schema and stored rows
were **not** newly enumerated. Source definitions and old documentation are not
substitutes for that inventory. Operational migrations already exist under
`db/migrations` and `scripts/migration`; review them, don't blindly reapply them.

## Target: organized transactional data, organized file storage

**Recommended:** PostgreSQL for relational operational records, private Blob for
files/immutable exports/backups. Directories alone don't make a database:
splitting the same whole-snapshot save across JSON files adds network requests
and partial-write risks unless atomicity and query boundaries are redesigned.

Proposed logical database domains (final DDL follows current-data validation):

- Reference: positions, simulators, qualifications, slot times, public holidays.
- People/access: staff, home positions, program membership, qualifications,
  app-user mapping and per-role permissions (server-authoritative).
- Curriculum: exercises, required positions/qualification rules, courses,
  course-exercise links and simulator-class assignments.
- Scheduling: runs, seat assignments, required positions, status history.
- Availability: leave, other tasks and staff-task membership.
- Training: groups/pools, sessions, attendance, logs, positions, attachment metadata.
- Communication: notifications, attachments, read receipts, important/deleted
  markers, delivery status and dirty/notified bookkeeping.
- Operational history: import records (structured and legacy), fault/operator/
  security/admin logs. Keep authoritative audit separate from client display feeds.

Use stable source IDs, FK/unique/check constraints and indexed date/FK filters.
Use row versions/If-Match for mutation conflicts and transactions for changes
that span runs, assignments, qualifications and notifications. Per-domain API
writes should validate authorization + business rules on the server and commit
business data and audit in the same database transaction. Keep the existing
audit evidence/chain intact; do not replace it with editable client logs.

Proposed private Blob layout for **new** files, not paths to create now:

```text
sim-roster/
  attachments/training/<session-id>/<file-id>/<safe-name>
  attachments/notifications/<notification-id>/<file-id>/<safe-name>
  backups/<date>/<backup-id>/manifest.json
  backups/<date>/<backup-id>/data/<domain>.ndjson
  exports/<date>/<export-id>/<file>
  recovery/<run-id>/<artifact>
```

Manifests bind a consistent database checkpoint/version, per-file hashes, row
counts and schema version. Old files stay resolvable through stored canonical
pathnames; do not infer attachment locations from their new directory names.
Path validation and ownership checks need updating before using these prefixes.
No public upload/read-back fallback. Retention/cleanup is separately approved.

## Stages and acceptance gates

### 1. Remove obsolete monitor (this PR)

Delete page/API/writer and navigation/permission/dependency entries. Existing
permission reconciliation filters obsolete persisted keys while preserving
other role edits. Keep historical files and genuine health/backup controls.
Test absent routes, missing sidebar entry, permissions and normal sign-in/planning.
No archive deletion, data migration or schema changes.

### 2. Fresh inventory and migration coverage (next PR/investigation)

Read current source snapshot and file metadata in an authorized environment;
record schema version, checksum/ETag, per-slice counts, sizes, duplicates,
orphans, date/enumeration values and attachment references. Never log secrets
or unnecessary personal data. Check all current types against existing DDL/
mapping scripts. Explicitly verify fields added since the historical plan:
notification flags/deletions/attachments, training log details, optional slices,
permission reconciliation, structured **and** legacy imports, archived years and
per-run test markers. Unknown fields must be preserved or cause a blocking
validation result, never silently discarded. Determine actual deployed region,
DB region/connection budget and store region before changing infrastructure.

**Gate:** agreed domain mapping + report of unresolved fields; validated current
DDL/API contracts; no application writes or schema changes yet.

### 3. Isolated implementation and rehearsal

Create additive schema/repository/domain APIs in a preview-only isolated
resource with explicit resource/config approval. Keep Better Auth/audit/risk
untouched. Refactor client pages to request only relevant domain/date/page data;
never recreate a full application snapshot from tables on every page load.
Use an explicit backend switch, not environment auto-detection. Rehearse import
inside rollback transactions or disposable test resources, never live ops.
Synchronize Autonoma factories/teardown and demonstrate overlapping test-run
isolation before using automated UI seed runs.

**Gate:** counts, ID-set/hash/normalized-value parity, zero unresolved orphan/
duplicate constraints, role/CSRF checks, concurrent edits, fail-closed audit,
attachment access, reports/export, backup restore and rollback drills pass.

### 4. Approved backup and cutover

Announce maintenance/read-only period; stop all old snapshot writers (including
old tabs/deployments, restore APIs, tests and scripts). UI-only read-only mode
is insufficient: enforce a server-side write fence. Take immutable verified
backup + manifest; capture final ETag/hash; recheck it immediately before import.
Import transactionally into empty/version-checked target tables; shadow-compare
all required data; enable the new backend only after checks pass. No concurrent
dual-writer period. Retain source snapshot/backup without deleting it.

**Gate:** explicit production approval, known rollback owner/time budget,
validated data parity, new deployment READY + signed-in smoke test and audit
health. A schema script's `--dry-run` can still acquire locks and perform work;
not authorized against production merely because it later rolls back.

### 5. Rollback and retention

Before new writes, rollback may safely select the intact source. **After new
writes, flipping to the old Blob would lose data.** Fence writes, export/diff
post-cutover transactions, validate an explicit reverse/replay plan or prefer a
forward repair. Define restoration point and data-loss budget with the owner.
Only remove old data/archives after acceptance, retention review and explicit
delete approval. Protect old deployments that still use old persistence.

## Before/after measurement plan

Use the same dataset, user role, region, browser/network and routes; separate
cold/warm loads and unchanged/one-record/bulk saves. Collect enough samples to
report counts, p50/p75/p95, response bytes, DB queries/storage calls and CPU.
Measure login-to-usable-roster, Monthly→Daily→Seating, one-record save + reload,
concurrent edits, snapshot/DB backup+restore and error recovery. Validate exact
saved values, not just HTTP 200 (state GET intentionally returns a read_failed
JSON on some failures). Exclude synthetic monitor metrics from evidence.

Suggested outcome: smaller page-specific payloads, bounded query counts,
no whole-roster save for a single record, and lower observed load/save latency
without stale data or weaker correctness. Set numerical SLOs after a larger
baseline, not from the three observed requests above.

## Decisions still needed before production migration

- Confirm PostgreSQL domain design rather than multi-blob JSON as live database.
- Agree maintenance window, rollback/data-loss budget and retention.
- Identify an isolated migration/test environment and approve its provisioning.
- Validate actual current data and complete mapping before setting cutover dates.

The design intentionally requires no new credentials in chat and authorizes no
live schema changes, uploads, deletions or backend switch by itself.
