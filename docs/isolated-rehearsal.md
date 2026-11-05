# Isolated migration rehearsal — phase 2a

Run `node scripts/quality/migration-rehearsal.mjs` locally. It accepts **no
arguments**, reads no environment credentials or live snapshot and creates two
ephemeral in-memory PostgreSQL WASM instances using dev-only PGlite. It never
connects to Neon, uploads files or changes the application runtime. No new API
or backend switch. Closing the instances discards the complete test dataset.

## What this executes

`rehearsal-schema.sql` belongs under scripts, not db/migrations: it is a
purpose-built staging/evidence schema, not the final operational schema.
It exercises the phase-1 lossless plan against real PostgreSQL SQL semantics:

- Import 503 synthetic messages, all supported channels including in_app,
  receipt/flag/deletion/attachment values, and both import-history formats.
- Exactly 500 active and 3 archived; source-order tie-break retained.
- Compare all notification JSON values and hashes and reconstruct every source
  slice after SQL jsonb storage. Preserve unknown nested fields as evidence,
  not as a claim of fully normalized relational columns.
- Reject invalid channels/duplicate IDs; verify rollback after a failed
  transaction. Recipient/date/order keyset pagination returns no duplicated IDs.
- Restore source evidence into a second independent in-memory instance and
  reconstruct the original snapshot. This is a logical evidence restore, not
  a pg_dump/PITR, attachment or complete operational database recovery drill.

The test database IDs are synthetic recipient keys, not real auth account
mappings. Demo role accounts stay unchanged. Source payloads are private-data
staging evidence in the future; never log or commit a real lossless plan.

## What remains unimplemented/unverified

This is a useful rehearsal foundation, **not completion of phase 2**. There is
no deployed backend, user-facing archive, transactional concurrent overflow
writer, domain API or live resource isolation. PGlite's single-process execution
does not prove correctness with multiple Neon connections/writers. The test
uses explicit recipient predicates but does not validate session authorization.
The app's old 500-item truncation remains active until a reviewed runtime
archive writer is implemented; merging this PR does not start archiving.

The full normalized ops mapping, source-to-target field parity for every domain,
FK/natural keys, ownership authorization, attachment reference checks,
transactional audit and multi-writer retention locks still need implementation.
The historical importer is still unsafe and must not be run against live data.

## Next approval boundary

For an actual Neon rehearsal, provision/select an explicitly isolated branch
and verify production/preview environment targeting; do not assume the current
integration connection separates them. This requires a separately approved
resource/configuration plan. Do not enter credentials in chat. Rehearsal schema
must not be applied to the current production database. No maintenance window,
production backup, cutover, cleanup or archive expiry is authorized here.

After isolated multi-connection tests pass, expose targeted read/write APIs and
connect the client in a later reviewed change. Keep production writes fenced
through final backup/parity checks; rollback after new writes must replay or
otherwise preserve those writes, not simply point at the old Blob snapshot.
