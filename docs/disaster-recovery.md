# Sim-Roaster: Disaster Recovery Runbooks

Step-by-step procedures for the ten defined scenarios. For dependencies, tiers and RTO/RPO, see [business-continuity.md](./business-continuity.md). For backup mechanics and the restoration test, see [backup-restore.md](./backup-restore.md). RTO/RPO figures are **recommended values pending owner approval** unless `config/recovery-objectives.json` shows them as approved.

```bash
E=--env-file-if-exists=/vercel/share/.env.project
```

## 0. Common procedure (every scenario)

1. **Detect:** an external uptime alert on `/api/health`, a user report, or a Vercel or Neon status alert.
2. **Triage (≤ 15 min):** as an Admin, open `/api/health?detail=1`. It shows each dependency's status, its latency and the backup age.
3. **Declare:** the technical recovery lead tells the service owner. Open an incident ticket and start a timeline (UTC).
4. **Preserve evidence:** **don't delete anything.** Snapshot first, then fix.
5. **Recover** using the scenario below.
6. **Verify:** `/api/health` reports `ok`; a test sign-in works; roster record counts look right; `/api/audit/verify` reports the chain intact.
7. **Close:** tell users. Within 5 working days, write a post-incident review covering cause, timeline, RTO/RPO achieved and actions. Update these runbooks.

---

## Scenario 1: Vercel deployment failure

*The build fails, or a new deployment won't start or serve.* Production keeps serving the last good deployment, because Vercel only promotes a build that succeeds.

1. Vercel → Deployments → open the failed deployment → read *Build Logs*.
2. Classify the failure:
   - **Code or type error:** fix it on a branch, push, and check the preview before merging.
   - **Missing env var:** `node $E scripts/dr/env-inventory.mjs --check` (locally, against the same environment), then add the variable in Vercel.
   - **npm, Google Fonts or registry outage (tier 3):** wait and redeploy. Running production is unaffected.
   - **Vercel platform incident:** check vercel-status.com and go to scenario 9.
3. Redeploy: Deployments → ⋯ → *Redeploy* (untick "use existing build cache" if you suspect the cache).
4. If production itself is affected, go to scenario 8.

## Scenario 2: Database unavailable (Neon)

*Health shows `neon-postgres: down`.* Impact: no new sign-ins; roster writes, restores and backup deletions are **refused** (fail-closed audit); existing sessions may still read.

1. Confirm: Neon Console → project → *Monitoring*; check neonstatus.com.
2. Check for self-inflicted causes: the compute is suspended or out of quota (Console → Billing/Usage), or the `DATABASE_URL` was rotated or changed in Vercel.
3. Tell users: "Sim-Roaster is read-only; changes can't be saved." Ask them to note any changes on paper.
4. **Provider outage:** wait. Don't point the app at another database: that would split the audit chain and the auth data.
5. **Endpoint or compute failure only:** in Neon, restart the compute. If `main` is unrecoverable, create a branch from the latest point in time, then in Vercel set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the branch's connection strings and redeploy.
6. Verify (step 0.6). Then re-enter the paper changes.

## Scenario 3: Database corruption

*Wrong or inconsistent auth or audit data, a bad migration, or `/api/audit/verify` reports a broken chain.*

1. **Freeze:** stop running migrations or scripts. Don't "fix" rows in place.
2. Find the last good time T: use the audit trail (`/api/audit` filters), Neon *Monitoring*, and the migration timestamps.
3. Neon → *Create branch* from `main` at T, named `recovery-<date>`.
4. Validate the branch:
   ```bash
   DATABASE_URL=<branch-url> node scripts/dr/export-database.mjs --out=/tmp/recovery
   ```
   Check the row counts. Run `select count(*) from audit.event` and check the chain with the queries in `lib/audit/query.ts`.
5. Choose how to restore:
   - **Whole database:** Neon → *Restore* `main` to T. Neon keeps the pre-restore state as a backup branch.
   - **Specific tables:** copy the rows from the branch selectively (see backup-restore.md §7b). Don't overwrite `audit.event`; re-insert only the missing rows.
6. Writes between T and now are lost for the restored tables. List them from the audit trail and the pre-restore backup branch, then re-enter them.
7. Verify (step 0.6), including `/api/audit/verify`.
8. **Roster-data corruption** (Blob, not the database): go to scenario 6, step 3 onwards.

## Scenario 4: Blob storage unavailable

*Health shows `vercel-blob: down`.* Impact: the roster can't load or save; backups and attachments are unavailable.

1. Check vercel-status.com (Blob). Check `BLOB_READ_WRITE_TOKEN` is still present (`env-inventory.mjs --check`) and that the store wasn't disconnected (Vercel → Storage).
2. **Token or connection problem:** reconnect the store in Vercel → Storage → the store → *Connect project*, then redeploy.
3. **Provider outage:** tell users. If the outage looks likely to exceed the RTO, give rostering staff a **read-only copy**: take the latest off-platform verified backup (`verify-backups.mjs --download`, see BC §5.7) and share the roster extract by other means.
4. **Store lost (permanent):** create a new Blob store, connect it, then upload the latest off-platform verified backup to `sim-roster/state.json`:
   ```bash
   node -e 'const{put}=require("@vercel/blob");const fs=require("fs");put("sim-roster/state.json",fs.readFileSync(process.argv[1],"utf8"),{access:"private",allowOverwrite:true,contentType:"application/json"}).then(r=>console.log(r.pathname))' /secure/offsite/<backup>.json
   ```
   (Use `$E` to load the new token.) Re-upload attachments from the off-platform copy.
5. Verify (step 0.6), then run `restore-drill.mjs` to confirm backups work again.

## Scenario 5: Authentication failure

*Nobody can sign in, or everyone gets 401 or redirect loops.*

1. Check `/api/health` for `better-auth` and `neon-postgres`. If Neon is down, go to scenario 2.
2. Check `BETTER_AUTH_SECRET` is set in Production (`env-inventory.mjs --check`). If it was rotated or deleted by mistake, restore the **original value** from the password manager and redeploy. (A new value works, but signs everyone out.)
3. Check `BETTER_AUTH_URL` (when set) and the production domain match. A mismatch breaks the trusted-origin and cookie checks.
4. **Microsoft SSO only failing (tier 3):** users sign in with email and password. Check the Entra app registration and the expiry of `MICROSOFT_CLIENT_SECRET`.
5. **A recent deploy changed `lib/auth.ts` or `proxy.ts`:** Instant Rollback (scenario 8).
6. **Locked-out Admins:** with database access, confirm the Admin user exists: `select id, email, "appRole" from public."user" where "appRole"='Admin'`. Reset passwords through the app's normal flow, not by writing hashes directly.

## Scenario 6: Accidental mass deletion

*Roster records, staff or courses were deleted in bulk, or a bad restore was applied.*

1. **Stop further damage:** ask users to stop editing. The 409 conflict protection stops stale tabs from overwriting data again.
2. **Preserve the current state:** on `/backup`, create a backup labelled `pre-recovery-<date>`.
3. **Scope it:** in the Admin audit log, filter by `action=…delete` or `state.update` and the time window. The before/after diff shows exactly which entities went, who did it, and when.
4. **Choose the recovery point:** the newest backup taken *before* the deletion.
   ```bash
   node $E scripts/dr/verify-backups.mjs --latest=10
   node $E scripts/dr/restore-drill.mjs --id=<candidate> --compare-live
   ```
   `recordDeltaLiveMinusBackup` shows what the restore brings back (negative live counts) and what it would lose: legitimate changes made after the backup (positive counts).
5. **Restore:**
   - **Few legitimate later changes:** restore that backup on `/backup` (backup-restore.md §7a), then re-enter the later changes using the audit diff.
   - **Many legitimate later changes:** re-create only the deleted entities from the backup JSON, using the audit `oldValue` snapshots as the source.
6. **Attachments deleted:** recover them from the off-platform copy. Blob deletes can't be undone.
7. **Auth users deleted:** use scenario 3 with a Neon PITR branch, restoring just the affected `public.user` and `public.account` rows.
8. Verify (step 0.6). Record the root cause, and add a control (for example, a role restriction) if one was missing.

## Scenario 7: Compromised administrator account

*Suspicious Admin activity, leaked credentials, or unexpected restores, deletions or role changes.*

1. **Contain (immediately):**
   ```sql
   -- revoke every session for the account
   delete from public.session where "userId" = '<user-id>';
   -- remove Admin rights while investigating
   update public."user" set "appRole" = 'Viewer' where id = '<user-id>';
   ```
   (Run as a DB admin; note the time. These are the only manual writes this runbook allows, and both are recorded in the incident timeline.)
2. **Suspected widespread compromise:** rotate `BETTER_AUTH_SECRET` in Vercel and redeploy. This invalidates **all** sessions.
3. **Rotate any secret the attacker might have seen:** `CRON_SECRET`, `RESEND_API_KEY`, `MICROSOFT_CLIENT_SECRET`, `AUTONOMA_*`. Rotate `BLOB_READ_WRITE_TOKEN` and the Neon password if Vercel or Neon access was involved. Check Vercel and Neon team membership and audit logs.
4. **Investigate:** export the audit trail for the actor (`/api/audit/export?actor=<email>&from=…`) and run `/api/audit/verify` to prove it hasn't been tampered with. The trail is append-only and hash-chained; the compromised Admin could not alter it through the application.
5. **Remediate data:** treat every change made by the actor as suspect. Revert using scenario 6, steps 3–5.
6. **Recover the account:** the user resets their password through a verified channel. An Admin restores their role. Record who approved it.
7. Notify the people the organisation's incident-response and data-protection procedures require (this may include a personal-data breach assessment).

## Scenario 8: Bad application deployment

*A deployment succeeded but is broken: errors, wrong behaviour, or data being written incorrectly.*

1. **Roll back (≤ 5 min):** Vercel → Deployments → the last known-good production deployment → ⋯ → *Instant Rollback*, or `vercel rollback <deployment-url>`. Rollback doesn't rebuild, so it works even when npm or GitHub is down.
2. Rollback restores **code only**, not data or env vars. If the bad deployment wrote bad data, follow scenario 6 (roster) or 3 (database) for the affected window. The audit trail shows which writes came after the deploy time.
3. **Database migrations:** if the deploy ran a migration, the previous code may not match the schema. Apply the matching `db/migrations/*.down.sql` **only after** a Neon branch backup, and only if the down migration doesn't drop data you need.
4. Fix it forward on a branch, check the preview deployment, then merge. After a rollback, Vercel stops auto-promoting new builds to production until you promote one explicitly.

## Scenario 9: Third-party dependency outage

| Dependency down | Effect | Action |
|---|---|---|
| Vercel platform | App down | Watch vercel-status.com. Nothing to fail over to; use the off-platform backup copy for read-only roster access if the outage exceeds the RTO |
| Neon | Read-only app, no sign-in | Scenario 2 |
| Blob | No roster | Scenario 4 |
| Resend | Emails not sent (failures are logged) | Tell staff directly; resend after recovery |
| Microsoft Entra | SSO fails | Email + password sign-in |
| GitHub | No deploys | Production unaffected; Instant Rollback still works |
| npm, Google Fonts | Builds fail | Production unaffected; retry later |
| Vercel Analytics, Autonoma | None for users | Ignore |

For each: confirm on the provider's status page, record it in the incident timeline, and set a review time against the dependency's RTO.

## Scenario 10: Complete application recovery

*Rebuild from nothing, for example after losing the Vercel project, or for a yearly full drill. **Always drill against a new project, never production.***

Prerequisites: GitHub access; the password manager (manual secrets); the latest off-platform backup and database export (BC §5.7); Vercel and Neon accounts.

1. **Code:** create a Vercel project from `djvenom-collab/Sim-Roaster` (`main`). Framework: Next.js. Don't deploy yet.
2. **Database:**
   - If the Neon project survives: create a branch (or use `main`) and connect it through the Vercel Neon integration.
   - If it's lost: create a Neon project, connect it, then apply the schema in order: Better Auth tables (`npx @better-auth/cli migrate`), `db/migrations/0001_ops_schema.up.sql`, `0002_audit_trail.up.sql` (`node scripts/audit/apply-audit-schema.mjs`). Re-import `public.user` and `public.account` from the latest NDJSON export, and `audit.event` in `seq` order.
3. **Blob:** create and connect a private Blob store. Upload the latest verified backup to `sim-roster/state.json` (scenario 4, step 4) and re-upload the attachments.
4. **Environment:** restore the manual secrets from the password manager. Then run `node $E scripts/dr/env-inventory.mjs --check` and expect exit 0.
5. **Deploy.** Assign the production domain (DNS stays with the domain registrar; update it if the project changed).
6. **Re-enable continuity controls:** `CRON_SECRET`, check the cron job is listed, the uptime monitor, and Neon PITR retention (BC §5).
7. **Verify:** step 0.6, then `restore-drill.mjs --compare-live` against the new store. A passing drill is the evidence that the recovery is complete.
8. Record the achieved RTO (start to verified) and RPO (age of the restored backup) against the objectives.

---

## Appendix: quick reference

| Need | Command or location |
|---|---|
| Live status | `/api/health` (public) · `/api/health?detail=1` (Admin) |
| Verify backups | `node $E scripts/dr/verify-backups.mjs --latest=5` |
| Prove a restore works | `node $E scripts/dr/restore-drill.mjs --compare-live` |
| Database export | `node $E scripts/dr/export-database.mjs --out=/secure/dir` |
| Env check | `node $E scripts/dr/env-inventory.mjs --check` |
| Retention plan | `node $E scripts/dr/backup-retention.mjs` (dry run) |
| Audit evidence | Admin → Audit · `/api/audit/export` · `/api/audit/verify` |
| Code rollback | Vercel → Deployments → *Instant Rollback* |
| Database PITR | Neon Console → Branches → *Point in time* |
