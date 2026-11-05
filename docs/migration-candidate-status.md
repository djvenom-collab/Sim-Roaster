# Single working migration candidate — DO NOT MERGE

Branch: storage/migration-candidate. All implementation and fixes stay in PR #24;
no intermediate merge or production release is required.

## Isolation and source evidence

Free Neon test resource, Preview-only MIGRATION_TEST-prefixed credentials.
Production credentials and operational Blob persistence are unchanged. Dedicated
pool refuses production/wrong branch/missing config or matching database endpoint.
Owner approved a private roster copy. That copy passed complete source-value
comparison before commit (27,205 records / 32 slices); no attachment bytes copied.
Initial evidence is retained in the test database independently of candidate edits.

The Admin-only preview opt-in loads the separate database copy verbatim. Shared mutation endpoints are blocked across the entire exact Preview branch,
including before opt-in and in old state API tabs. Pre-opt-in StoreProvider is
read-only to avoid scheduling shared autosaves. Never treat this flag as a production backend switch.

## Implemented, with limits

Record-oriented JSONB repository: domain/key/order rows, transactional revision
lock, per-record diff writes, archived notification overflow, initial-copy backup
and recovery that preserves the pre-restore candidate in another backup.
Omitted domains are retained; explicit empty arrays delete the submitted domain.
Changing a domain's container kind requires an explicit migration.

Candidate writes now require atomic before/after evidence in an independent,
hash-linked audit table. Test-induced audit failure rolls back data and revision.
This is rehearsal evidence, not integration with the existing production audit
viewer/permissions or a tamper-proof store against the database owner. Existing
candidate edits before this table was introduced have summary evidence only.

Synthetic local tests cover parity, 500-active retention, partial writes, empty
slices, one-record diffs, stale revision rejection, invalid-write rollback,
audit-chain recomputation, mandatory-audit failure and backup recovery. Earlier
real Neon tests proved separate connection locking and synthetic archive writes.
Those tests do not replace verifying the latest preview and actual user workflows.

## Current verification gate

Real deployed backup recovery passed at e3906f5 with 27,205 records, parity=true
and previousCandidatePreserved=true. The isolated save still returned 503 at
3d419d9; no successful save/reload is claimed. Sanitized diagnostics are being
added; never log exception text that could contain private records or credentials.

An isolation gap was observed: before opting in, the previous preview could
schedule a shared PUT /api/state; one such request returned 200. Whether this
was a no-op or changed data is unverified. Do not claim the source was unchanged
or blindly restore it. The current branch-wide server guard and pre-opt-in
read-only client address this path, with direct authorization regression tests.

The latest commit must be verified on its own READY preview. Do not merge yet.

## Still required before production approval

Full per-domain server validation/permissions, operationally supported record
model, bounded/date-scoped APIs and client reads/writes, archive UI, production
audit integration, representative demo-role workflows, deployed recovery and
post-cutover-change preservation, measurements and final cutover/rollback plan.
Client snapshot bridging is still transitional, not a completed storage redesign.

Production still uses Blob. No live migration, automatic archiving activation,
attachment relocation or old-data deletion has occurred.
