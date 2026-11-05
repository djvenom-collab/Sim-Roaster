# Read-only storage assessment

Open Admin / Permissions → Storage assessment → Run storage assessment.
The control fetches only when explicitly requested (no polling). Server-side
Better Auth session role must be Admin, regardless of client UI permissions.
Endpoint: `GET /api/admin/storage-assessment`, force-dynamic, no-store,
3 requests/minute per authenticated rate-limit bucket. Test-run cookies are
rejected so an isolated test page cannot accidentally assess global data.

The endpoint reads the current uncached shared snapshot, bounded to 16 MiB,
and returns aggregate counts/serialized byte sizes for known slices, plus
counts of duplicate IDs, malformed dates, selected orphan references and the
known historical migration gaps (in-app channel, flag/deletion metadata,
legacy import records). Unknown top-level keys are counted, never echoed.
No raw record contents, names, IDs, email addresses, notification subjects,
URLs, connection strings, tokens or exception details are returned. Values
never appear in issue codes; codes and slice names come from static lists.
No writes, schema changes, repairs, backups or migration execution.

A zero-issue report is **not** migration approval. This is partial validation:
not all required fields/natural keys/relationships are checked, unknown nested
fields are not mapped, attachment files aren't fetched, and the live PostgreSQL
schema isn't inspected. The report labels missing optional slices and states
these limits. Historical schema gaps are checked against source, not a claim
that deployed database tables have those exact constraints. Review the full
mapping and run an isolated rehearsal before cutover (see storage-redesign.md).

If storage/JSON decoding fails, the endpoint returns a generic error, not a
fabricated empty report. A genuinely absent snapshot is reported separately.
No-store and authorization apply before any snapshot read. Existing real
health, backup, permissions and data paths are unchanged.
