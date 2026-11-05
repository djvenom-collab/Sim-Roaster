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

The Admin-only preview opt-in loads the separate database copy verbatim. Other
mutation endpoints are blocked while the candidate cookie is set, including old
state API tabs. Never treat this flag as a production backend switch.

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

An interrupted browser run left save/reload verification incomplete. A temporary
share-link lock also prevented reopening that exact deployment on resumption.
The latest commit must be verified on its own READY preview; no success is inferred
from a previous revision or build result. Do not merge yet.

## Still required before production approval

Full per-domain server validation/permissions, operationally supported record
model, bounded/date-scoped APIs and client reads/writes, archive UI, production
audit integration, representative demo-role workflows, deployed recovery and
post-cutover-change preservation, measurements and final cutover/rollback plan.
Client snapshot bridging is still transitional, not a completed storage redesign.

Production still uses Blob. No live migration, automatic archiving activation,
attachment relocation or old-data deletion has occurred.
