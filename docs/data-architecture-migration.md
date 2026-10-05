# Sim-Roaster operational data architecture: assessment and migration plan

Status: **Plan only. Nothing irreversible has been executed.** Vercel Blob is still the
live datastore. The PostgreSQL schema has been exercised only inside transactions
that are always rolled back.

This document supports ISO/IEC 27001:2022 integrity controls and ISO 22301:2019
resilience objectives. It is engineering evidence, not a claim of certification.

---

## 1. Current state (as inspected)

### 1.1 Blob objects

| Pathname | Contents | Written by | Read by |
|---|---|---|---|
| `sim-roster/state.json` | **All operational data** as one JSON document (31 slices, ~3.7 MB, version 9) | `PUT /api/state` (browser autosave), `POST /api/backup/restore`, `lib/autonoma/snapshot.ts` (test seeding) | `GET /api/state`, `/api/backup`, `lib/security/authz.ts` (role permission lookup), Autonoma |
| `sim-roster/backups/*` | Point-in-time copies of `state.json` | `POST /api/backup` | `/api/backup` (list), restore, delete |
| `sim-roster/monitor/*` | Uptime/health history | `/api/monitor` | `/api/monitor/history` |
| Training attachments | Uploaded files | `/api/training-attachments/upload` | `.../file`, `.../delete` |

Live profile from `scripts/migration/validate-snapshot.mjs` (read-only): 32 staff,
23 positions, 6 simulators, 57 exercises, 264 courses, 3,114 runs, 18,798 run
assignments, 393 leave records, 315 training sessions, 1,113 attendance rows,
884 training logs, 313 validity rows, 10 users, plus audit, notification and log
slices. **No duplicate IDs, no duplicate natural keys, no orphaned references and
no unparseable dates were found.**

### 1.2 Risk assessment

| Property | Finding before this change |
|---|---|
| Concurrency | Every browser tab autosaves the **whole** snapshot 800 ms after any edit. Last write wins. |
| Lost updates | **High.** Two users editing different screens silently erase each other's work. A stale tab left open overwrites later changes on its next keystroke. |
| Corruption | One JSON blob: a truncated or malformed write damages all data at once. Writes are atomic at the object level, so a partial object is not observed, but there is no schema validation of content. |
| Referential integrity | Enforced only by client code. Nothing stops a run assignment pointing to a deleted staff member. |
| Versioning | A single integer `version` for client-side migrations. No per-record versioning, no history of changes. |
| Rollback | Only by restoring a whole backup, which discards every change since that backup. |
| Backup | Manual / scheduled copies to `sim-roster/backups/`. Restore is an unconditional overwrite. |
| Traceability | `auditLogs` is a client-written slice, so it can be edited or dropped by the same autosave that it is meant to audit. No `createdBy`/`updatedBy`. |

### 1.3 Recommendation

**Yes — PostgreSQL (Neon, already used for Better Auth) should become the
authoritative transactional store for operational data.** The data is strongly
relational (runs → required positions → assignments → staff/qualifications), is
edited concurrently, and needs referential integrity, row-level concurrency
control, and server-side audit trails that a single document cannot provide.
Blob remains appropriate for binary attachments, monitor history, and immutable
backup archives.

---

## 2. Already implemented (safe, reversible, non-destructive)

1. **Repository layer** — `lib/repository/state-repository.ts`. `/api/state`
   no longer calls Blob directly; it calls `stateRepository.read()/write()`.
   A PostgreSQL implementation can be dropped in behind the same interface.
2. **Optimistic concurrency on the live snapshot (immediate lost-update fix).**
   - `GET /api/state` returns the snapshot revision (Blob ETag) in the body and
     the `ETag` header.
   - `PUT /api/state` requires `If-Match`. A stale revision returns **409**, a
     missing one returns **428** once a snapshot exists. The write itself is a
     conditional Blob `put(..., { ifMatch })`, which closes the race between the
     server's read and write.
   - The client (`lib/store.tsx`) sends `If-Match`, stores the new revision after
     each save, and on conflict **stops autosaving** and tells the user to reload,
     instead of overwriting the other session's work.
   - Verified against the live store: Blob returns a weak validator (`W/"…"`) on
     read that `ifMatch` rejects; the repository normalises it to the strong form.
3. **Relational schema** — `db/migrations/0001_ops_schema.up.sql` / `.down.sql`,
   in a dedicated `ops` schema so it cannot collide with Better Auth tables.
4. **Migration tooling** — `scripts/migration/` (backup, validate, migrate,
   verify), described below.

Behaviour for users is unchanged except that a genuine conflict is now reported
instead of silently losing data.

---

## 3. Target relational model (`ops` schema)

Every table has a primary key, `created_at`, `updated_at` (trigger-maintained),
`created_by` / `updated_by` where a human edits the row, and an integer
`row_version` used for optimistic concurrency (`UPDATE … WHERE id = $1 AND
row_version = $2`; zero rows updated ⇒ 409).

| Domain | Tables |
|---|---|
| Reference | `simulator`, `position`, `qualification`, `assignment_code`, `slot_time`, `public_holiday` |
| People | `staff`, `staff_program`, `staff_home_position`, `staff_qualification`, `staff_validity` (position validity/currency), `app_user` (FK to Better Auth `user`), `role_permission` |
| Curriculum | `exercise`, `exercise_required_position`, `exercise_qual_rule`, `exercise_qual_rule_item` (eligibility), `course`, `course_exercise` |
| Scheduling | `run`, `run_required_position` (seating plan), `run_assignment`, `run_status_history` |
| Availability | `leave_record`, `other_task`, `other_task_staff` |
| Training | `training_group`, `training_group_position`, `training_session`, `training_session_position`, `training_attendance`, `training_log`, `training_log_position`, `attachment` |
| Traceability | `audit_event` (append-only; UPDATE/DELETE revoked from the app role), `admin_log`, `fault_log`, `operator_log`, `firewall_log`, `import_history`, `notification`, `notify_dirty` |

Integrity rules include: FKs with `ON DELETE RESTRICT` for operational history
(a staff member with assignments cannot be hard-deleted), unique
`(run_id, position_id)` on assignments so a seat cannot be double-booked, unique
`(staff_id, run_id)`, check constraints on date ranges (`end >= start`) and enum
values, and indexes on every FK and on date columns used by roster views.

---

## 4. Migration strategy

All scripts read Blob and **never write `sim-roster/state.json`**. Run with
`node --env-file-if-exists=/vercel/share/.env.project scripts/migration/<script>`.

| # | Phase | How | Status |
|---|---|---|---|
| 1 | **Backup** | `backup-blob-state.mjs` copies the live snapshot to an immutable `sim-roster/backups/pre-migration-<ts>.json`, re-downloads it, and verifies SHA-256 and byte count. | Script ready |
| 2 | **Schema creation** | `0001_ops_schema.up.sql`, applied inside the migration transaction. | Verified in dry run |
| 3 | **Data validation** | `validate-snapshot.mjs`: counts, duplicate IDs/keys, orphans, bad dates. Invalid rows are quarantined, not dropped silently. | Passed on live data (0 issues) |
| 4 | **Migration** | `migrate-to-postgres.mjs` loads all tables in **one transaction**. | Dry run: 48,953 rows |
| 5 | **Record-count verification** | Expected (from snapshot) vs actual (in DB) per table, plus ID-set equality. | All 41 tables matched |
| 6 | **Integrity verification** | FK/unique constraints enforced by Postgres at load; post-load orphan and checksum checks. | Passed, 0 quarantined |
| 7 | **Rollback** | Before cutover: transaction rollback (dry-run default) or `0001_ops_schema.down.sql`. After cutover: flip the repository flag back to Blob; the pre-migration backup is untouched. | Down migration written |
| 8 | **Cutover** | See section 5. | **Not started — needs approval** |

`--commit` is refused unless: a verified backup is named whose SHA-256 equals the
live snapshot (proving no edits since backup), `--confirm=<first 12 chars of that
hash>` is supplied, the `ops` tables are empty, and every check passes.

---

## 5. Cutover plan (requires explicit approval)

1. Announce a short maintenance window; set the app read-only (repository flag
   `STATE_BACKEND=readonly`).
2. Run Phase 1 backup, then `migrate-to-postgres.mjs --commit --backup=… --confirm=…`.
3. Deploy `PostgresStateRepository` behind `STATE_BACKEND=postgres`, initially
   serving the same snapshot shape so the UI is unchanged.
4. Compare: read the snapshot from both backends and diff (shadow read) before
   enabling writes.
5. Enable writes on Postgres. Keep Blob read-only as a fallback for an agreed
   period; rollback = set `STATE_BACKEND=blob`.
6. Afterwards, move screens from whole-snapshot saves to per-entity API
   mutations (each a transaction with `row_version` checks and a server-written
   `audit_event`) and retire the whole-snapshot write path.
7. Update Autonoma factories (`lib/autonoma/factories.ts`, recipe) to write
   through the repository, per `AGENTS.md`.

---

## 6. Known residual risks / follow-ups

- `lib/autonoma/snapshot.ts` and `/api/backup/restore` still write the snapshot
  unconditionally. Restore is intentionally an overwrite (admin action); open
  tabs will receive 409 and reload. Autonoma seeding runs against test data but
  should adopt `stateRepository` with `ifMatch` retry.
- Until per-entity APIs exist, a conflict forces a reload and re-applying the
  edit; it no longer loses data, but it is coarse-grained.
- The first-ever snapshot creation is not conditional (no revision exists yet).
- Point-in-time recovery after cutover relies on Neon PITR plus the Blob archive;
  confirm Neon retention meets the RPO/RTO in the business continuity plan.
