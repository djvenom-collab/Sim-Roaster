# Sim-Roaster: Business Continuity (technical)

> **Status:** these are technical capabilities that support ISO 22301:2019 (business continuity) and ISO/IEC 27001:2022 (A.5.29, A.5.30, A.8.13, A.8.14, A.8.32). **Sim-Roaster is not certified against either standard**, and this document does not claim it is. Certification requires an organisational management system (scope, BIA, risk assessment, management review, internal audit, exercises) that software alone cannot provide.

Related: [`disaster-recovery.md`](./disaster-recovery.md) (scenario runbooks) · [`backup-restore.md`](./backup-restore.md) (backup mechanics and restoration test).

## 1. Sources of truth

| Artefact | Purpose |
|---|---|
| `config/dependencies.json` | Machine-readable dependency registry: tiers, failure impact, env var **names** (never values). |
| `config/recovery-objectives.json` | RTO/RPO per tier. Holds `approved` and `recommended` values separately. |
| `lib/continuity/health.ts`, `GET /api/health` | Live dependency checks plus backup age compared with the RPO. |
| `scripts/dr/*.mjs` | Backup verification, restoration drill, retention, database export, env inventory. |

If this document and the JSON files ever disagree, the JSON files win. Update both in the same change.

## 2. Dependency map

```
                         Users (browser)
                               │ HTTPS
                ┌──────────────▼───────────────┐
                │  Vercel (tier 1)             │  hosting, functions, env config,
                │  Next.js 16 app + proxy.ts   │  deployments, cron (/api/cron/backup)
                └──┬───────────┬───────────┬───┘
                   │           │           │
     ┌─────────────▼──┐  ┌─────▼────────┐  ┌▼────────────────────┐
     │ Better Auth (1)│  │ Vercel Blob  │  │ Resend email (3)    │
     │ email+password │  │ (1) private  │  │ /api/notify         │
     │ opt. Entra (3) │  │ state.json   │  │ simulated w/o key   │
     └──────┬─────────┘  │ backups/     │  └─────────────────────┘
            │            │ dr/          │
     ┌──────▼─────────┐  │ attachments  │
     │ Neon Postgres  │  └──────────────┘
     │ (1) user,      │
     │ session,       │   Build-time only: GitHub (2), npm + Google Fonts (3)
     │ account,       │   Non-essential: Vercel Analytics (4), Autonoma E2E (4)
     │ audit.event,   │   AI services: none used
     │ ops.* (target) │
     └────────────────┘
```

**Coupling worth knowing:**

- Roster writes (`PUT /api/state`), restores and backup deletions are **fail-closed on the audit trail**. If Neon is down they are refused, even when Blob is healthy. This is deliberate: no unaudited change to the record of truth. Reads still work for any session that is still valid.
- Authentication depends on Neon. A Neon outage means no new sign-ins.
- Vercel Blob is the system of record for operational roster data, and **Vercel Blob has no point-in-time recovery or versioning**. Recoverability of roster data depends entirely on the application's snapshot backups.

### Dependency inventory

| Dependency | Tier | Used for | Failure impact | Recovery owner |
|---|---|---|---|---|
| Vercel hosting | 1 | App, APIs, env config, cron | App unreachable | Vercel (platform); Instant Rollback (us) |
| Vercel Blob | 1 | Roster state, backups, attachments, DR evidence | No load/save; backups unavailable | Vercel (availability); us (data via backups) |
| Neon Postgres | 1 | Auth tables, audit trail, ops schema | No sign-in; writes refused | Neon (availability, PITR); us (configuration) |
| Better Auth | 1 | Sessions, roles (`user.appRole`) | 401 everywhere | Us (`BETTER_AUTH_SECRET`) |
| GitHub | 2 | Code, migrations, runbooks | No new deploys | GitHub |
| Microsoft Entra ID | 3 | Optional SSO | Use email + password | Microsoft / us |
| Resend | 3 | Notification email | Notify by phone/Teams | Resend |
| npm, Google Fonts | 3 | Build only | New builds fail; rollback still works | Third party |
| Vercel Analytics | 4 | Telemetry | None | Vercel |
| Autonoma | 4 | E2E test seeding | Tests fail | Us |
| AI services | n/a | Not used | n/a | n/a |

### Component criticality

| Component | Tier | Depends on |
|---|---|---|
| Roster read/write (`/api/state`, planning pages) | 1 | Vercel, Blob, Better Auth, Neon |
| Sign-in and sessions | 1 | Vercel, Better Auth, Neon |
| Backup and restore | 1 | Vercel, Blob, Neon (audit) |
| Audit trail (`/api/audit*`) | 2 | Neon |
| Training attachments | 2 | Blob |
| Health endpoint | 2 | Vercel |
| Email notifications | 3 | Resend |
| Monitor page (synthetic metrics only, not real telemetry) | 4 | Blob |

## 3. Recovery objectives (RTO / RPO)

**No organisationally approved RTO or RPO values exist yet.** The `approved` block for each tier in `config/recovery-objectives.json` is `null` on purpose. The values below are **engineering recommendations that require service-owner approval**. Until someone approves them, all tooling (health check, verifier, drill) reports them with `basis: "recommended-unapproved"`.

| Tier | Approved RTO | Approved RPO | *Recommended* RTO | *Recommended* RPO |
|---|---|---|---|---|
| 1 Critical | not set | not set | *4 h* | *24 h* (roster data); near-zero within Neon's PITR window for auth/audit |
| 2 Important | not set | not set | *8 h* | *24 h* |
| 3 Supporting | not set | not set | *72 h* | *n/a (stateless)* |
| 4 Non-essential | not set | not set | *best effort* | *best effort* |

**Why 24 h for roster data:** the scheduled backup runs daily (`vercel.json`, 02:00 UTC). For a tighter RPO, increase the cron frequency (hourly crons need a Vercel plan that supports them), then lower the value.

**To approve:** the service owner edits `tiers.<n>.approved` in `config/recovery-objectives.json`, filling in `rtoMinutes`, `rpoMinutes`, `approvedBy` and `approvedOn`, and merges through a reviewed PR. The tooling switches to `basis: "approved"` automatically.

**Current measured position (5 Oct 2026):** the only backup is 63 days old (`2026-08-03…_030826_V1.json`), so even the *recommended* RPO is **not met**. The first action after merging is in §5.

## 4. Continuity capabilities

| Capability | Mechanism | Where |
|---|---|---|
| Operational-data backup | Manual (`/backup` page) and daily scheduled snapshot, immutable (`allowOverwrite: false`), with a SHA-256 manifest | `app/api/backup`, `app/api/cron/backup` |
| Database backup | Neon PITR (provider) plus an independent logical NDJSON export | Neon console; `scripts/dr/export-database.mjs` |
| Retention | Grandfather-father-son policy, dry run by default | `scripts/dr/backup-retention.mjs` |
| Integrity verification | SHA-256 against manifest, parse, structural profile | `scripts/dr/verify-backups.mjs` |
| Proof of restorability | Non-destructive restoration drill with evidence record | `scripts/dr/restore-drill.mjs` |
| Monitoring | `/api/health` (public aggregate; Admin detail with backup age vs RPO) | `app/api/health` |
| Configuration recovery | Code and config in Git; env var names in the registry; values in a password manager | `scripts/dr/env-inventory.mjs` |
| Deployment rollback | Vercel Instant Rollback | Vercel dashboard |
| Change accountability | Append-only, hash-chained audit trail | `audit.event` |

## 5. Manual configuration required (not done by code)

This work makes **no destructive infrastructure changes**. Each of these steps must be done by a person with the right access:

1. **Vercel → Settings → Environment Variables:** set `CRON_SECRET` (random, at least 32 characters) for Production. Until it is set, `/api/cron/backup` returns 503 and **no scheduled backups run**.
2. **Vercel → Settings → Cron Jobs:** after deploying, confirm `/api/cron/backup` is listed and enabled. Trigger it once and check the result with `verify-backups.mjs --latest=1`.
3. **Neon → Project → Settings → Storage / History retention:** set the PITR window to at least the approved RPO for auth and audit data. The default on lower plans can be as short as 1 day. Record the configured value in §3.
4. **Neon:** enable protected branches for `main` (production) so it can't be deleted or reset by accident.
5. **Vercel → Settings → Deployment Protection:** keep Instant Rollback available. Note that Hobby plans only roll back to the previous production deployment.
6. **Uptime monitoring:** point an external monitor (any provider) at `GET /api/health`. It returns 503 when a tier-1 dependency is down. `degraded` returns 200 with a JSON body. Alert on both.
7. **Off-platform copy:** at least monthly, run `verify-backups.mjs --download=<encrypted off-platform dir>` and `export-database.mjs --out=<same>`. Blob backups live in the same store as live data, so one store-level loss would take both.
8. **Secrets escrow:** store every *manual* secret in `config/dependencies.json` in the organisation's password manager, with two named custodians.
9. **Approve RTO/RPO** (§3), and schedule the quarterly restoration drill ([`backup-restore.md` §6](./backup-restore.md#6-backup-restoration-test-procedure)).

## 6. Roles

| Role | Responsibility |
|---|---|
| Service owner | Approves RTO/RPO, accepts residual risk, declares a disaster |
| Technical recovery lead | Runs the runbooks; has Vercel Owner/Admin, Neon admin and Blob access |
| Deputy | Second person with the same access. No single point of failure in people |
| Administrator (app) | Verifies data after recovery; manages users |

Record named people outside this repository, in the organisation's continuity plan.

## 7. Exercises and review

- **Quarterly:** restoration drill (`restore-drill.mjs --compare-live`). File the evidence JSON.
- **Every six months:** a tabletop of one scenario from `disaster-recovery.md`, rotating through all ten.
- **Yearly, or after any incident or major change:** review this document, the dependency registry and the objectives.
