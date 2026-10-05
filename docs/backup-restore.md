# Sim-Roaster: Backup and Restore

All commands run from the repository root and load env vars without printing them:

```bash
E=--env-file-if-exists=/vercel/share/.env.project   # or a local .env file that is NOT committed
```

## 1. What is backed up

| Data | Store | Backup mechanism | Point-in-time recovery |
|---|---|---|---|
| Roster/operational state (`sim-roster/state.json`) | Vercel Blob | App snapshots in `sim-roster/backups/` (manual and daily scheduled) | **No.** Blob has no versioning or PITR. Recovery points are the snapshots only |
| Training attachments (`training-attachments/…`) | Vercel Blob | **None automatic.** Include them in the monthly off-platform copy (§5) | No |
| Users, sessions, accounts (`public.*`) | Neon | Neon PITR plus `export-database.mjs` | Yes, within Neon's configured history window |
| Audit trail (`audit.event`) | Neon | Neon PITR plus `export-database.mjs` | Yes, within the history window |
| Ops relational schema (`ops.*`, migration target) | Neon | Neon PITR plus `export-database.mjs` | Yes |
| Code, migrations, config, runbooks | GitHub | Git history | Yes (any commit) |
| Environment variables | Vercel | **Not backed up by the app.** Names are in `config/dependencies.json`; values belong in the password manager | No |

## 2. Operational-data backups

**Manual:** on the `/backup` page, Admins can create a labelled backup. `POST /api/backup` writes `sim-roster/backups/<ts>_<label>.json` with `allowOverwrite: false`, records `backup.create` in the audit trail, and writes a manifest.

**Scheduled:** `vercel.json` runs `GET /api/cron/backup` daily at 02:00 UTC. The route:

1. Requires `Authorization: Bearer $CRON_SECRET` (constant-time compare). Returns 503 until `CRON_SECRET` is set.
2. Reads live state, checks it parses, and computes its SHA-256.
3. Writes `…_auto-daily.json` (never overwrites), **reads it back and compares hashes**.
4. Writes a manifest to `sim-roster/dr/manifests/<same name>` (`sha256`, bytes, `kind`, `sourceEtag`, `verifiedAfterWrite`).
5. Records `backup.create` as the system actor, with success or failure.

It never deletes anything. Backups made before this change have no manifest. The verifier reports these as `manifest=absent` and still checks parse and structure.

## 3. Database backups and PITR (Neon)

- **Provider PITR:** Neon keeps WAL history for the project's configured retention window. Restore by creating a branch at a timestamp or LSN (Console → Branches → *Create branch* → *Point in time*), or by restoring `main` in place (Console → *Restore*). **The window has to be configured manually** ([business-continuity.md §5](./business-continuity.md#5-manual-configuration-required-not-done-by-code)).
- **Independent logical export:** this one doesn't depend on Neon's history.

  ```bash
  node $E scripts/dr/export-database.mjs --out=/secure/offsite            # excludes public.session by default
  ```

  It runs one `REPEATABLE READ, READ ONLY` transaction (a consistent point), writes one NDJSON file per table, and adds a `manifest.json` with row counts and SHA-256. Files are `0600` and the output directory is `0700`. **The output contains password hashes (`public.account`)**, so store it encrypted. The script refuses to write inside the repository.
- **Full dump (optional, needs `pg_dump` 16+):** `pg_dump "$DATABASE_URL_UNPOOLED" -Fc -n public -n audit -n ops -f sim-roster.dump`

## 4. Retention

```bash
node $E scripts/dr/backup-retention.mjs                    # dry run: prints KEEP/PRUNE, deletes nothing
node $E scripts/dr/backup-retention.mjs --apply --confirm=<prune count>
```

Default policy (configurable by flag): 14 daily, 8 weekly, 12 monthly, minimum 10. The script always keeps the newest backup and any backup whose label contains `_pre-`, `_keep` or `_legal-hold`. It deletes only with **both** `--apply` and a `--confirm` equal to the exact prune count, and never runs automatically. Align the policy with the organisation's records-retention schedule before using `--apply`. Neon PITR retention is configured separately in Neon.

## 5. Integrity verification

```bash
node $E scripts/dr/verify-backups.mjs --latest=5
node $E scripts/dr/verify-backups.mjs --json > /secure/reports/verify-$(date +%F).json
node $E scripts/dr/verify-backups.mjs --download=/secure/offsite         # off-platform copy plus .sha256 files
```

For each backup the verifier downloads it, computes SHA-256 and compares it with the manifest. `MISMATCH` is a failure. It then parses the JSON and profiles the structure: slice count, record count, duplicate IDs, orphaned references. It exits 1 if any backup fails, and reports the newest backup's age against the RPO.

## 6. Backup restoration test procedure

A backup only counts as good once it has been **restored and the result checked**. The drill does that without touching live data.

**Frequency:** quarterly, after any change to the backup or restore code, and before any planned migration.

**Run:**

```bash
node $E scripts/dr/restore-drill.mjs --compare-live --operator="<name>" --out=/secure/dr-evidence
# a specific backup:  --id=sim-roster/backups/<file>.json
```

**What it does and what counts as a pass:**

| Step | Pass criterion |
|---|---|
| 1 select-backup | Latest (or `--id`) backup exists |
| 2 verify-integrity | SHA-256 matches the manifest (if one exists); valid JSON object; structure profiled |
| 3 restore-to-isolated-target | Written to `sim-roster/dr/drills/<ts>/state.json`. **The live path `sim-roster/state.json` is never written** (the script asserts this) |
| 4 read-back-and-compare | Restored copy is byte-identical (SHA-256) and the per-slice record counts match |
| 5 compare-with-live (read-only) | Reports the record delta between live and backup: the real data-loss window if this backup were used |
| 6 database-recoverability-checks | Read-only transaction: auth tables present, `audit.event` present, row counts |
| 7 objectives | Measured restore time and backup age compared with RTO/RPO (`approved` or `recommended-unapproved`) |

**Evidence:** a JSON record goes to `--out` and to Blob `sim-roster/dr/evidence/<ts>.json`. Attach it to the drill ticket, with the operator, date and pass/fail. A failed drill is an incident and should be raised as one.

**Database drill (manual, provider feature):**

1. Neon Console → Branches → *Create branch* from `main` at a point about 1 hour ago, named `dr-drill-YYYYMMDD`.
2. Copy that branch's connection string (do not commit it).
3. `DATABASE_URL=<branch url> node scripts/dr/export-database.mjs --out=/tmp/drill`, then compare `manifest.json` row counts with a production export.
4. Run `select count(*) from audit.event` on both. The branch count should be at most production's.
5. Delete the drill branch. Record the timings in the evidence file.

**Full end-to-end drill (yearly):** follow [disaster-recovery.md scenario 10](./disaster-recovery.md#scenario-10-complete-application-recovery) against a **separate Vercel project and Neon branch**, never production.

**Last validated run:** 5 Oct 2026. All 6 steps passed against backup `2026-08-03…_030826_V1.json` (25,815 records); technical restore took 0.17 min. RPO **not met** (backup age 63 days against the recommended 24 h).

## 7. Restoring

### 7a. Roster state from a backup (in-app)

1. **Take a safety backup first.** On `/backup`, create a backup labelled `pre-restore-<date>`. The restore route does **not** create one automatically, and the `_pre-` label protects it from retention.
2. Optionally run `restore-drill.mjs --id=<backup> --compare-live` to see exactly what will change.
3. On `/backup`, choose the backup and select *Restore*. This calls `POST /api/backup/restore` (Admin only). It is fail-closed: it is refused if the audit trail can't record it.
4. Ask users to reload. Open clients get a 409 conflict on their next autosave instead of overwriting the restored data.
5. Check record counts on the planning pages. Check the `backup.restore` entry in the Admin audit log.

### 7b. Neon database

- **Recommended (non-destructive):** create a branch at the target time, check it, then use the branch's *Reset from parent* or *Restore* to move `main`. Neon keeps a backup branch of the pre-restore state automatically.
- **Single table:** create a PITR branch, export the table (`export-database.mjs --schemas=public` against the branch URL), then import selectively. Do not restore `audit.event` by overwriting it: it is append-only. Re-insert missing rows only, in order, and run `/api/audit/verify` afterwards.

### 7c. Configuration and environment variables

```bash
node $E scripts/dr/env-inventory.mjs --check       # SET/MISSING per variable; never prints values
node $E scripts/dr/env-inventory.mjs --markdown    # table for the recovery ticket
```

- Integration-managed variables (`BLOB_*`, `DATABASE_URL*`, the `PG*` and `POSTGRES_*` families, `NEON_*`) are recreated by reconnecting the Vercel integration (Settings → Integrations / Storage). Don't copy them by hand.
- Manual variables (`BETTER_AUTH_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `MICROSOFT_*`, `AUTONOMA_*`): restore them from the password manager into Vercel → Settings → Environment Variables. Use the *same* `BETTER_AUTH_SECRET`, otherwise every session is invalidated (acceptable, and in fact intended, in scenario 7).
- **Never** commit `.env*` files or paste values into tickets or chat. `.gitignore` excludes `.env` and `.env.*` (except `.env.example`, which must contain names only).
