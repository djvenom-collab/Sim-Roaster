# Migration preparation, phase 1

**Offline library and specification only. No runtime change, no SQL execution,
no live migration and no replacement of the existing importer.** The legacy
importer remains unsafe for current notification/import data and must not be
run. This PR does not declare relational mapping complete.

## Owner decisions

- Keep demo role-derived accounts for now; do not auto-create staff accounts or
  remap users. Revisit explicit identity/recipient authorization before real
  multi-user use. Client-side ownership guards are not server authorization.
- Keep newest **500 globally** as active notifications; archive all older ones,
  not discard them. This matches the scope of the old global cap, not 500 per
  recipient. Count soft-deleted rows toward the cap to avoid changing retention
  semantics silently. Hide deleted messages in recipient views, but retain them
  and their metadata for administrative history according to future policy.
- Live cutover and isolated resource provisioning are not approved by this doc.

## Executable offline preparation

`scripts/migration/lossless-plan.mjs` is pure: no database/Blob/environment/file
I/O. `prepareLosslessPlan(snapshot)` returns evidence envelopes for every known
slice, explicit notification projections and lossless legacy/structured import
records. No CLI accepts credentials or auto-runs these functions. The plan is
labelled `executionAllowed: false`; it must not be treated as SQL import input.

All values must be finite acyclic JSON. Unknown top-level slices or wrong slice
shapes block the plan. Unknown nested fields are retained exactly in source
payloads, **not claimed as relationally mapped**. Canonical field-value hashes
and `reconstructSource` catch value loss, not merely missing IDs/counts. Arrays
retain order; object property order is not semantic. Plans contain private data:
never log, commit or expose real plans through the aggregate diagnostic endpoint.

Notifications retain source IDs, in_app/email/sms/copy channel, readAt, flagged,
deletedAt and full attachment metadata. Source payload preserves absence versus
explicit values and future nested fields. Retention ordering is sentAt descending
with source-array order breaking timestamp ties. Invalid/timezone-free timestamps
and duplicate IDs block; never silently default them. Existing records missing
required fields need reviewed remediation, not invented values.

Legacy imports keep `{summary, when}` without inventing filenames, actors or
original IDs. A migration-only key binds snapshot digest + source position;
identical legacy entries remain distinct. Structured records retain original IDs
and counts. Reconstructed source is checked against the complete source digest.
These are staging/evidence mappings; structured relational import schema must be
adapted in the isolated implementation, not assumed to match the old table.

## Target storage contract (phase 2; not applied here)

- Notification table accepts in_app and stores read_at, nullable flagged,
  deleted_at, archived_at, stable ID, row_version and source provenance.
- Active and archived messages belong to one consistent transactional model;
  indexes support recipient + archive status + sent_at + ID cursor pagination.
- On new delivery, one transaction inserts the idempotent message, moves overflow
  from active to archived, commits audit/outbox and never deletes overflow rows.
  Use a retention lock/serializable strategy so concurrent sends cannot each
  leave more than 500 active records. Bulk sends must archive in the same unit.
- Attachments retain canonical references when archived. Archiving must never
  physically remove bytes still referenced by sessions/messages or backups.
- Archived inbox retrieval is paginated and server-authorized. Restore-to-active
  policy, archive retention/deletion period and user UI are separate decisions;
  do not silently impose an expiry on archives. Old snapshots can have already
  lost messages due to the previous cap; recovery depends on retained backups.
- Legacy import table/staging supports format, nullable source_id, original JSON
  payload and provenance; no fake filename or fabricated original timestamp.
- Keep existing applied migrations untouched. Add versioned additive DDL only
  after live schema inspection and isolated rehearsal approval. No bootstrap
  DDL, backend flag or archive writer is added in this phase.

## Remaining gates

Complete per-domain relational mappings/inverse reconstruction, all required and
natural keys/relations, attachment availability and schema checks; this evidence
library alone cannot satisfy those gates. Current assessment issue codes refer
to the **legacy** importer, which is still unchanged and still blocked.

Next: isolated schema/repository/API rehearsal with parity tests, backup/restore,
concurrent delivery/edit/retention tests and preview-production resource separation.
No production database dry run, writes, backup upload or cleanup without approval.
After new writes, rollback must preserve/replay them; flipping to an old Blob
snapshot is not a lossless rollback. See storage-redesign.md for cutover gates.

## Checks

Run `node scripts/quality/migration-preparation.mjs` (synthetic records only).
Covers 500/501/503 boundaries, active+archive union equality, same-time ordering,
exact source reconstruction/tamper detection, notifications including deleted
and attachment-bearing rows, duplicate/invalid inputs and legacy provenance.
No real data or relational database behavior is exercised by this test.
