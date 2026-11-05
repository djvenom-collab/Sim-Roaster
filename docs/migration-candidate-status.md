# Single working migration candidate — DO NOT MERGE

All work remains on storage/migration-candidate / PR #24. No intermediate merge
or production release is required. Production still uses Blob.

## Verified deployed milestones

Private copy: 27,205 records / 32 slices, complete source-value parity before
commit. No attachment bytes copied. Initial evidence retained independently.

375fdca, desktop 1280x800: source read-only before opt-in, isolated DB banner
after opt-in, candidate staff edit PUT 200, reload retained edit. Restore returned
27,205 records, parity=true, previousCandidatePreserved=true; screenshot delivered.

f06419f: current source exactly matched original private copy; no test markers.
The record-level modified count had false positives from JSONB object key order;
fixed with a regression test in the next revision. Archive UI loaded successfully.
Changed-domain save failed with Duplicate entity ID. This exposed existing client
audit IDs based only on Date.now: a staff save logs staff and qualifications in
the same millisecond. Latest code uses UUIDs; actual callback test proves 100 IDs
remain distinct with time frozen. This explains the previously intermittent save
failure. Latest deployed save/reload must be rechecked before claiming fixed.

## Isolation incident, now guarded

Before opt-in, an earlier preview could schedule shared PUT /api/state; one such
request returned 200. A subsequent full source-value comparison matched the
original copy, with no test marker found. No blind restoration was performed.
The entire exact Preview branch now blocks shared mutation APIs with or without
the rehearsal cookie. Pre-opt-in StoreProvider is read-only. Production policy
is unchanged. Direct regression tests cover branch and opt-in isolation.

## Implemented in draft

Record-organized JSONB prototype with locked revisions, per-record diff writes,
500 active notifications plus durable overflow archive, initial backup and
recovery preserving the pre-restore candidate. Missing domains stay unchanged;
explicit empty arrays remain explicit deletion. Kind changes fail closed.

Atomic hash-linked before/after audit evidence is required for candidate writes.
Audit failure rolls back data and revision. This is separate from production's
audit.event/viewer, and not tamper-proof against the database owner. Earlier
candidate edits have summary-only evidence.

Candidate client sends only changed domains and only advances fingerprints on a
successful save. Initial app hydration still reads the whole active snapshot.
Bounded keyset record reads and an Admin-only read-only archive viewer exist in
the rehearsal page. Source check returns aggregate parity/drift only, never data.

## Remaining before production approval

Complete supported domain model, per-domain server validation/permissions for all
demo levels, bounded/date-scoped application loading, archive integration beyond
Admin rehearsal, production audit integration, representative role workflows,
performance evidence and cutover/rollback procedure preserving post-cutover edits.
The record-oriented bridge is not the normalized domain-table implementation.
No final production backend switch, migration, archive activation, attachment
relocation, paid plan selection or old-data deletion has been approved/performed.
