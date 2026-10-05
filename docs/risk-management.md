# Risk management procedure

How Sim-Roaster identifies, assesses, treats, monitors and reviews risk. Structured on the ISO 31000:2018 process (scope and criteria → assessment → treatment → monitoring and review → communication and recording). This is an alignment, not a certification claim.

- **Live register:** Admin → **Risk register** (Admin role only).
- **Baseline register:** [risk-register.md](./risk-register.md), generated from `config/risk-register.initial.json`.
- **Related:** [business-continuity.md](./business-continuity.md), [disaster-recovery.md](./disaster-recovery.md), [backup-restore.md](./backup-restore.md), [data-architecture-migration.md](./data-architecture-migration.md).

## 1. Scope and context

The scope is the Sim-Roaster application and everything it depends on: the Next.js app on Vercel, Neon Postgres (auth sessions, audit trail, risk register), Vercel Blob (operational snapshot and backups), Resend (notifications), the Autonoma test endpoint, the npm dependency tree, and the people and processes that schedule simulator staff.

The risk register is kept apart from scheduling data. It lives in its own Postgres schema (`risk`), its code lives in `lib/risk/*` and imports nothing from scheduling modules, and changes to it never touch the Blob snapshot.

## 2. Roles

| Role | Responsibility |
|---|---|
| **System Owner** | Owns the register and the risk appetite. Approves risk acceptance and RTO/RPO. Chairs the quarterly review. |
| **Risk owner** (per risk) | Accountable for the risk: keeps its rating current and decides on treatment or acceptance (with the System Owner for residual High/Critical). |
| **Treatment owner** (per risk) | Delivers the treatment actions by the target date and reports progress. |
| **Technical Lead** | Identifies technical risks from code, configuration and tooling, and implements technical treatments. |
| **Operations / Training Manager** | Owns the scheduling, qualification, validity and leave risks. |
| **Administrators** | Record changes in the register. Only the Admin role can view or change it. |

Until named people are assigned, owners in the baseline are role titles. Assigning named owners is the first action at the initial review.

## 3. Risk criteria

### Likelihood (over the next 12 months)

| Rating | Label | Guide |
|---|---|---|
| 1 | Rare | Not expected; exceptional circumstances only |
| 2 | Unlikely | Could happen but not expected |
| 3 | Possible | Might happen; has happened in similar systems |
| 4 | Likely | Expected to happen at some point |
| 5 | Almost Certain | Expected to happen frequently, or already happening |

### Impact (worst credible outcome)

| Rating | Label | Operations | Data | Compliance and safety |
|---|---|---|---|---|
| 1 | Insignificant | No noticeable effect | None | None |
| 2 | Minor | Minor inconvenience; workaround available | Recoverable, small | Internal finding |
| 3 | Moderate | Sessions disrupted for a day | Partial loss, recoverable from backup | Reportable non-conformance |
| 4 | Major | Multiple sessions lost or wrongly staffed | Significant loss or disclosure | Regulatory finding |
| 5 | Severe | Prolonged outage or unsafe/non-current staff deliver training | Permanent loss or large disclosure | Regulatory sanction or safety consequence |

### Score and bands

**Score = likelihood × impact** (1–25). The calculation is enforced by generated database columns (`inherent_score`, `residual_score`), so a score can never disagree with its ratings.

| Band | Score | Required response |
|---|---|---|
| Critical | 15–25 | Treat immediately; System Owner informed within 1 business day; monthly review |
| High | 10–14 | Treatment plan with owner and target date; quarterly review at minimum |
| Medium | 5–9 | Treat or accept with rationale; quarterly review |
| Low | 1–4 | Accept or monitor; review at least annually |

**Inherent** risk is rated as if the existing controls did not exist. **Residual** risk is rated with existing controls at their assessed effectiveness (`none`, `weak`, `partial`, `effective`). A new risk starts with residual equal to inherent until its controls are recorded.

### Observed vs potential

Every risk is labelled with its basis:

- **Observed:** there is concrete evidence in this system, such as a file and line, configuration, or command output. That evidence is recorded with the risk.
- **Potential:** plausible for this kind of system, but no defect or occurrence has been demonstrated here.

An observed *cause* does not mean the *consequence* has happened. For example, R-003 is observed (the static import is in the code), but whether it has led to wrong eligibility decisions is not yet known; the risk text says so.

## 4. Process

### 4.1 Identify

Sources: code and configuration review, dependency audits (`pnpm audit`), incidents, audit-trail findings (`/api/audit`), DR drills (`scripts/dr/*`), change proposals and staff reports. Record each new risk in the Admin UI (**New risk**) with category, cause, consequence, affected assets, basis and evidence.

### 4.2 Analyse and evaluate

The risk owner rates inherent likelihood and impact, records existing controls with their effectiveness (**Controls** tab), then rates residual risk (**Residual** tab, with a reason). Compare the residual band against the required responses in §3.

### 4.3 Treat

Choose a strategy in the **Treatment** tab:

- **Avoid:** stop the activity that creates the risk.
- **Reduce:** add or improve controls. Record each action with owner, target date and status (planned, in progress, done, cancelled).
- **Transfer:** move the consequence elsewhere (contract, insurance, provider SLA).
- **Accept:** use **Accept / close → Accept risk**. This records the approver (the signed-in Admin), the date and a rationale. The database refuses to mark a risk accepted without that approval. Residual High or Critical risks may be accepted only by the System Owner.

Baseline risks marked *proposed for acceptance* (R-010, R-011) stay `open` until the System Owner accepts them through the UI.

### 4.4 Monitor and review

- **Periodic review:** every risk has a review date. Record reviews in the **Review** tab (outcome, notes, current residual rating, next review date). Reviews are append-only: the database rejects UPDATE, DELETE and TRUNCATE on `risk.review`.
- **Overdue reviews** are counted on the register and highlighted in the table.
- **Trigger-based review:** reassess the affected risks after any incident, major release, dependency advisory rated high or critical, platform change, or failed DR drill.
- **Quarterly register review:** the System Owner and risk owners go through every open risk, confirm ratings and owners, and record a review entry for each. Next scheduled: **2026-08-10**.

### 4.5 Close

A risk no longer relevant (the asset was retired, or the cause was removed and verified) is closed with a reason through **Accept / close → Close risk**. Closed risks are read-only and hidden by default. Risks are never deleted: the database rejects DELETE and TRUNCATE on `risk.risk`.

## 5. Recording and audit

Every register change goes through `withAudit` with fail-closed semantics: the audit event is written to the hash-chained `audit.event` table **before** the change is saved, and if the audit write fails the change is refused (HTTP 503). Audit actions:

| Action | Trigger |
|---|---|
| `risk.created` | New risk, or baseline import (reason records the source) |
| `risk.updated` | Identification or inherent rating edited |
| `risk.owner_assigned` | Risk or treatment owner changed |
| `risk.controls_recorded` | Controls or overall effectiveness changed |
| `risk.treatment_recorded` | Strategy, plan, actions, target date or status changed |
| `risk.residual_updated` | Residual rating changed (reason required) |
| `risk.reviewed` | Periodic review recorded |
| `risk.accepted` | Formal acceptance (rationale required) |
| `risk.closed` | Risk closed (reason required) |
| `authz.denied` (entity `risk`) | Non-Admin attempted access |

Each event stores only the fields that changed (previous and new values), along with the actor, time, IP and user agent. Every update carries the risk's `version`. A stale edit is rejected with HTTP 409, so two administrators can never silently overwrite each other.

## 6. Setup and operations

```bash
# 1. Create the schema (idempotent; creates no rows)
node --env-file-if-exists=/vercel/share/.env.project scripts/risk/apply-risk-schema.mjs

# 2. In the app: Admin → Risk register → Import baseline
#    (inserts any baseline risk not already present; each insert is audited)

# 3. After editing config/risk-register.initial.json, regenerate the baseline doc
node scripts/risk/gen-register-md.mjs
```

Once imported, the database is the source of truth. Editing the JSON afterwards doesn't change existing rows: **Import baseline** only adds IDs that are missing. To keep a snapshot of the live register, use **Export** (JSON) in the register header, or the audit CSV export.

Rollback: `db/migrations/0003_risk_register.down.sql` drops the `risk` schema and every row in it. Export first.

## 7. Communication

- A summary of residual Critical and High risks goes to the System Owner after each quarterly review.
- Accepted risks, with their approver and rationale, are reported annually.
- Incidents that change a risk rating are noted in the incident record with the risk ID.
