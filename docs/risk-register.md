# Risk register (baseline)

> Generated from `config/risk-register.initial.json` by `node scripts/risk/gen-register-md.mjs`. Do not edit by hand.
> Assessed 2026-05-10. The live register is in **Admin → Risk register**. After the baseline is imported there, the database is the source of truth and this file is a point-in-time record.

Method and scales: see [risk-management.md](./risk-management.md). Score = likelihood × impact (1–25). Bands: Low 1–4, Medium 5–9, High 10–14, Critical 15–25.

**Basis** separates *observed* risks (evidenced by code, configuration or command output in this repository) from *potential* risks (plausible, but no occurrence or defect has been demonstrated). Owners are role titles until named people are assigned.

## Summary

29 risks: 22 observed, 7 potential. Status: open 24, treating 1, mitigated 4.

### Residual heat map (count of risks)

| Likelihood \ Impact | 1 Insignificant | 2 Minor | 3 Moderate | 4 Major | 5 Severe |
|---|---|---|---|---|---|
| **5 Almost Certain** | · | · | · | · | · |
| **4 Likely** | · | · | R-012, R-013 | · | · |
| **3 Possible** | · | R-014, R-016 | R-001, R-005, R-009, R-023, R-028 | R-002, R-003 | · |
| **2 Unlikely** | · | · | R-017, R-020, R-029 | R-004, R-006, R-007, R-010, R-011, R-015, R-018, R-019, R-021, R-022 | R-008 |
| **1 Rare** | · | R-024 | · | R-026, R-027 | R-025 |

## Register

| ID | Risk | Category | Basis | Inherent | Controls | Residual | Strategy | Owner | Target | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| R-002 | Expired position validity only produces a warning | Validity/currency errors | observed | 15 Critical | weak | 12 High | reduce | Operations Manager | 2026-06-30 | open |
| R-003 | Eligibility rules read static reference data, not live store data | Qualification/eligibility errors | observed | 12 High | partial | 12 High | reduce | Training Manager | 2026-06-30 | open |
| R-012 | Known advisories in the dependency tree | Dependency vulnerabilities | observed | 12 High | none | 12 High | reduce | Technical Lead | 2026-06-30 | open |
| R-013 | No automated test suite; 24 TypeScript errors | Software defects | observed | 12 High | weak | 12 High | reduce | Technical Lead | 2026-08-31 | open |
| R-008 | Backups share the live Blob store and token | Blob storage | observed | 10 High | weak | 10 High | reduce | System Owner | 2026-07-31 | open |
| R-001 | Scheduling rules are enforced only in the browser | Unauthorized scheduling changes | observed | 12 High | partial | 9 Medium | reduce | System Owner | 2026-07-31 | open |
| R-005 | Leave recorded after assignment may not flag existing seats | Leave conflicts | potential | 9 Medium | partial | 9 Medium | reduce | Operations Manager | 2026-07-31 | open |
| R-009 | Recovery objectives (RTO/RPO) are not approved | Business continuity | observed | 12 High | partial | 9 Medium | reduce | System Owner | 2026-06-30 | open |
| R-023 | Incorrect scheduling data entry | Human error | potential | 12 High | partial | 9 Medium | reduce | Operations Manager | 2026-07-31 | open |
| R-028 | AI-assisted code changes | AI risks | potential | 9 Medium | weak | 9 Medium | reduce | Technical Lead | 2026-07-31 | open |
| R-004 | Manual override bypasses assignment blocks | Incorrect staff assignment | potential | 12 High | partial | 8 Medium | reduce | Operations Manager | 2026-07-31 | open |
| R-006 | All operational data lives in one JSON document | Data integrity | observed | 12 High | partial | 8 Medium | reduce | System Owner | 2026-09-30 | treating |
| R-007 | Restore overwrites live data without an automatic safety backup | Data loss | observed | 10 High | partial | 8 Medium | reduce | System Owner | 2026-06-30 | open |
| R-010 | Hosting, cron and storage depend on a single platform | Vercel | potential | 8 Medium | partial | 8 Medium | accept | System Owner | 2026-06-30 | open |
| R-011 | Postgres outage blocks all audited writes | Availability | observed | 8 Medium | partial | 8 Medium | accept | System Owner | 2026-06-30 | open |
| R-015 | No multi-factor authentication; weak passwords allowed in demo-seed mode | Authentication | observed | 12 High | partial | 8 Medium | reduce | System Owner | 2026-07-31 | open |
| R-018 | Single Admin can change permissions and restore or delete data | Administrative privilege | observed | 10 High | partial | 8 Medium | reduce | System Owner | 2026-08-31 | open |
| R-019 | Database credentials can disable audit protections | Insider misuse | potential | 10 High | partial | 8 Medium | reduce | System Owner | 2026-09-30 | open |
| R-021 | Test-data endpoint can create users and data | Third-party services | observed | 8 Medium | partial | 8 Medium | reduce | Technical Lead | 2026-07-31 | open |
| R-022 | Destructive administrative actions are single-step | Operational errors | potential | 12 High | partial | 8 Medium | reduce | Operations Manager | 2026-07-31 | open |
| R-014 | Builds ignore TypeScript errors | Deployment failure | observed | 9 Medium | partial | 6 Medium | reduce | Technical Lead | 2026-08-31 | open |
| R-016 | API rate limiting is per serverless instance | Cybersecurity | observed | 9 Medium | partial | 6 Medium | reduce | Technical Lead | 2026-09-30 | open |
| R-017 | Content Security Policy is report-only | Information security | observed | 8 Medium | partial | 6 Medium | reduce | Technical Lead | 2026-09-30 | open |
| R-020 | Email notifications depend on Resend | Third-party services | observed | 9 Medium | partial | 6 Medium | reduce | Operations Manager | 2026-07-31 | open |
| R-029 | Schema changes applied by ad-hoc scripts without a migration ledger | Database | observed | 9 Medium | partial | 6 Medium | reduce | Technical Lead | 2026-09-30 | open |
| R-025 | Unauthenticated or under-privileged API access | Authorization | observed | 15 Critical | effective | 5 Medium | reduce | Technical Lead | — | mitigated |
| R-026 | Lost updates from concurrent snapshot writes | Data integrity | observed | 16 Critical | effective | 4 Low | reduce | Technical Lead | — | mitigated |
| R-027 | Changes not attributable to a person | Insider misuse | observed | 12 High | effective | 4 Low | reduce | System Owner | — | mitigated |
| R-024 | Legacy client-writable audit log could be mistaken for the authoritative record | Information security | observed | 4 Low | effective | 2 Low | reduce | System Owner | 2026-09-30 | mitigated |

## Category coverage

| Category | Risks |
|---|---|
| Information security | R-017, R-024 |
| Cybersecurity | R-016 |
| Authentication | R-015 |
| Authorization | R-025 |
| Data integrity | R-006, R-026 |
| Data loss | R-007 |
| Availability | R-011 |
| Business continuity | R-009 |
| Third-party services | R-020, R-021 |
| Vercel | R-010 |
| Database | R-029 |
| Blob storage | R-008 |
| Operational errors | R-022 |
| Human error | R-023 |
| Unauthorized scheduling changes | R-001 |
| Incorrect staff assignment | R-004 |
| Validity/currency errors | R-002 |
| Leave conflicts | R-005 |
| Qualification/eligibility errors | R-003 |
| Software defects | R-013 |
| Deployment failure | R-014 |
| Dependency vulnerabilities | R-012 |
| Insider misuse | R-019, R-027 |
| Administrative privilege | R-018 |
| AI risks | R-028 |

## Risk details

### R-001 — Scheduling rules are enforced only in the browser

- **Category:** Unauthorized scheduling changes · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** Eligibility, leave, training and qualification checks run client-side. The server accepts any well-formed snapshot from a user with edit permission.
- **Cause:** evaluateAssignment() is imported only by UI components; PUT /api/state validates snapshot shape and permission, not assignment rules.
- **Potential consequence:** A modified client, script or stale tab can save assignments that the rules would block (unqualified, on leave, double-booked).
- **Affected assets/processes:** Run assignments; PUT /api/state; lib/assignment-eval.ts
- **Inherent:** likelihood 3 (Possible) × impact 4 (Major) = **12 High**
- **Existing controls (partial):** Server-side permission check on PUT /api/state [partial]; Hash-chained audit diff of every snapshot write (detective) [partial]
- **Residual:** likelihood 3 × impact 3 = **9 Medium**
- **Treatment (reduce):** Run evaluateAssignment server-side for every changed assignment in PUT /api/state and reject blocked seats unless manualOverride and a non-empty overrideReason are present.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `app/seating/page.tsx:24, components/staff-assign-popover.tsx:35, components/assign-free-staff-popover.tsx:40` — Only importers of evaluateAssignment; `app/api/state/route.ts, lib/security/validation.ts` — Server-side checks are permission + zod shape validation

### R-002 — Expired position validity only produces a warning

- **Category:** Validity/currency errors · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** A staff member whose validity for a position has expired can still be assigned without override.
- **Cause:** assignment-eval.ts pushes 'Position validity expired' to warnings, not blocks.
- **Potential consequence:** Non-current staff deliver simulator sessions; regulatory or training-quality non-compliance.
- **Affected assets/processes:** Run assignments; Staff validity records
- **Inherent:** likelihood 3 (Possible) × impact 5 (Severe) = **15 Critical**
- **Existing controls (weak):** Warning badge shown in assignment popovers [weak]
- **Residual:** likelihood 3 × impact 4 = **12 High**
- **Treatment (reduce):** Operations Manager to confirm policy. If expired validity must not be scheduled, move it to blocks so it requires manual override with reason (and enforce server-side via R-001).
- **Risk owner:** Operations Manager · **Treatment owner:** Technical Lead · **Target:** 2026-06-30
- **Evidence:** `lib/assignment-eval.ts:48` — if (validity.status === "expired") warnings.push(...)

### R-003 — Eligibility rules read static reference data, not live store data

- **Category:** Qualification/eligibility errors · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** evaluateAssignment reads staff qualifications and position/exercise qualification rules from the bundled sample-data module.
- **Cause:** lib/assignment-eval.ts imports * as seed from ./sample-data and reads seed.staffQualifications, seed.positionQualRules and seed.exerciseQualRules.
- **Potential consequence:** If qualifications or rules are edited in the app, eligibility checks may use outdated data and allow or block the wrong people. Not yet confirmed whether these lists are editable at runtime.
- **Affected assets/processes:** Qualification rules; Run assignments
- **Inherent:** likelihood 3 (Possible) × impact 4 (Major) = **12 High**
- **Existing controls (partial):** Callers pass isOperational from the live staff profile [partial]
- **Residual:** likelihood 3 × impact 4 = **12 High**
- **Treatment (reduce):** Confirm whether these lists are runtime-editable. If so, pass live store lookups into evaluateAssignment and add a test that an edited rule changes the outcome.
- **Risk owner:** Training Manager · **Treatment owner:** Technical Lead · **Target:** 2026-06-30
- **Evidence:** `lib/assignment-eval.ts:21, :37, :62, :83` — Static import of sample-data used for rule evaluation

### R-004 — Manual override bypasses assignment blocks

- **Category:** Incorrect staff assignment · **Basis:** potential · **Status:** open · **Review:** 2026-08-10
- **Description:** Managers can override hard blocks; the reason parameter is optional in the store API.
- **Cause:** assignStaff(runId, positionId, staffId, override?, reason?) accepts override without enforcing a reason server-side.
- **Potential consequence:** Ineligible staff assigned with no justification, discovered only after the session.
- **Affected assets/processes:** Run assignments; lib/store.tsx assignStaff
- **Inherent:** likelihood 3 (Possible) × impact 4 (Major) = **12 High**
- **Existing controls (partial):** Blocks are displayed before override [partial]; Audit diff records the changed assignment [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Require a non-empty override reason server-side; add a periodic override report for the Operations Manager.
- **Risk owner:** Operations Manager · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `lib/store.tsx:217, :1204` — override and reason are optional parameters

### R-005 — Leave recorded after assignment may not flag existing seats

- **Category:** Leave conflicts · **Basis:** potential · **Status:** open · **Review:** 2026-08-10
- **Description:** Leave is checked when an assignment is made. It has not been verified that existing assignments are re-flagged when leave is added later.
- **Cause:** isOnLeave() is evaluated at assignment time (lib/store.tsx:1131, :1345); no revalidation path was found.
- **Potential consequence:** Staff on leave remain rostered; session uncovered on the day.
- **Affected assets/processes:** Leave records; Run assignments
- **Inherent:** likelihood 3 (Possible) × impact 3 (Moderate) = **9 Medium**
- **Existing controls (partial):** Leave block at assignment time [partial]
- **Residual:** likelihood 3 × impact 3 = **9 Medium**
- **Treatment (reduce):** Verify behaviour; if confirmed, add a conflict report listing assignments that overlap leave, shown on the dashboard.
- **Risk owner:** Operations Manager · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `lib/store.tsx:1131, :1345` — Leave check at assignment time

### R-006 — All operational data lives in one JSON document

- **Category:** Data integrity · **Basis:** observed · **Status:** treating · **Review:** 2026-08-10
- **Description:** Every domain entity is stored in the single Blob object sim-roster/state.json and written as a whole document.
- **Cause:** Original persistence design; Postgres migration designed but not cut over.
- **Potential consequence:** A single bad write, corrupt document or schema drift affects all data at once; no referential integrity.
- **Affected assets/processes:** sim-roster/state.json; lib/repository/state-repository.ts
- **Inherent:** likelihood 3 (Possible) × impact 4 (Major) = **12 High**
- **Existing controls (partial):** If-Match revision check (409 on conflict) [effective]; zod snapshot validation [partial]; Nightly backup (vercel.json cron 02:00 UTC) [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Complete the relational cutover described in docs/data-architecture-migration.md.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** 2026-09-30
- **Evidence:** `lib/repository/state-repository.ts` — Whole-snapshot read/write; `docs/data-architecture-migration.md` — Migration plan

### R-007 — Restore overwrites live data without an automatic safety backup

- **Category:** Data loss · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** POST /api/backup/restore replaces the live snapshot; taking a pre-restore backup is a manual runbook step.
- **Cause:** Restore route does not snapshot current state first.
- **Potential consequence:** Restoring the wrong backup permanently loses changes made since the last backup.
- **Affected assets/processes:** app/api/backup/restore/route.ts; sim-roster/state.json
- **Inherent:** likelihood 2 (Unlikely) × impact 5 (Severe) = **10 High**
- **Existing controls (partial):** Restore is Admin-only and fail-closed audited [effective]; Runbook requires a manual pre-restore backup [weak]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Make the restore route write a pre-restore backup and refuse to proceed if that write fails.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** 2026-06-30
- **Evidence:** `app/api/backup/restore/route.ts` — No pre-restore snapshot; `docs/backup-restore.md` — Manual pre-restore step

### R-008 — Backups share the live Blob store and token

- **Category:** Blob storage · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** Backups are written under sim-roster/backups/ in the same store, using the same BLOB_READ_WRITE_TOKEN as live data.
- **Cause:** Single Blob store configured for the project.
- **Potential consequence:** Store deletion, account loss or token compromise destroys live data and every backup together.
- **Affected assets/processes:** Vercel Blob store; BLOB_READ_WRITE_TOKEN; sim-roster/backups/
- **Inherent:** likelihood 2 (Unlikely) × impact 5 (Severe) = **10 High**
- **Existing controls (weak):** scripts/dr/export-database.mjs and verify-backups.mjs (manual) [weak]
- **Residual:** likelihood 2 × impact 5 = **10 High**
- **Treatment (reduce):** Schedule an off-platform copy (separate account or provider, separate credentials) and verify it monthly.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `app/api/backup/route.ts:12` — BACKUP_PREFIX = "sim-roster/backups/"

### R-009 — Recovery objectives (RTO/RPO) are not approved

- **Category:** Business continuity · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** Recommended RTO/RPO values exist, but every approved value is null.
- **Cause:** Approval by the business owner not yet obtained.
- **Potential consequence:** Backup frequency and recovery effort are not tied to an agreed tolerance; recovery expectations may be unmet.
- **Affected assets/processes:** config/recovery-objectives.json; docs/disaster-recovery.md
- **Inherent:** likelihood 4 (Likely) × impact 3 (Moderate) = **12 High**
- **Existing controls (partial):** Recommended objectives and runbooks documented [partial]
- **Residual:** likelihood 3 × impact 3 = **9 Medium**
- **Treatment (reduce):** Owner approves RTO/RPO; run and record a restore drill against the approved values.
- **Risk owner:** System Owner · **Treatment owner:** System Owner · **Target:** 2026-06-30
- **Evidence:** `config/recovery-objectives.json` — "approved": { "rtoMinutes": null, ... }

### R-010 — Hosting, cron and storage depend on a single platform

- **Category:** Vercel · **Basis:** potential · **Status:** open · **Review:** 2026-08-10
- **Description:** Application hosting, the nightly backup cron and Blob storage all run on Vercel.
- **Cause:** Platform choice.
- **Potential consequence:** A platform outage or account suspension stops the app and scheduled backups simultaneously.
- **Affected assets/processes:** Vercel project; vercel.json cron; Vercel Blob
- **Inherent:** likelihood 2 (Unlikely) × impact 4 (Major) = **8 Medium**
- **Existing controls (partial):** Vercel instant rollback of deployments [partial]; DR runbooks (docs/disaster-recovery.md) [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (accept):** Proposed for acceptance: tolerate platform dependency, relying on off-platform backups (R-008). Requires owner approval before status becomes accepted.
- **Risk owner:** System Owner · **Treatment owner:** System Owner · **Target:** 2026-06-30
- **Evidence:** `vercel.json` — crons: /api/cron/backup at 0 2 * * *

### R-011 — Postgres outage blocks all audited writes

- **Category:** Availability · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** Audited operations fail closed: if the audit insert cannot be written the change is refused. Auth sessions also depend on Postgres.
- **Cause:** Deliberate fail-closed design of withAudit().
- **Potential consequence:** During a database outage no scheduling changes can be saved and users cannot sign in.
- **Affected assets/processes:** lib/audit/log.ts withAudit; Neon Postgres; Better Auth sessions
- **Inherent:** likelihood 2 (Unlikely) × impact 4 (Major) = **8 Medium**
- **Existing controls (partial):** Managed Postgres (Neon); /api/health reports dependency status [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (accept):** Proposed for acceptance: integrity of the audit trail is preferred over write availability. Requires owner approval.
- **Risk owner:** System Owner · **Treatment owner:** System Owner · **Target:** 2026-06-30
- **Evidence:** `lib/audit/log.ts (withAudit)` — Throws AuditUnavailableError before the operation runs

### R-012 — Known advisories in the dependency tree

- **Category:** Dependency vulnerabilities · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** pnpm audit on 2026-05-10 reported 1 critical, 27 high, 33 moderate and 6 low advisories, largely transitive (e.g. undici, hono, js-yaml, brace-expansion, postcss). Exploitability in this app has not been assessed.
- **Cause:** No automated dependency update or audit gate.
- **Potential consequence:** Exploitable library flaws could enable denial of service, header injection or worse.
- **Affected assets/processes:** package.json; pnpm-lock.yaml
- **Inherent:** likelihood 4 (Likely) × impact 3 (Moderate) = **12 High**
- **Existing controls (none):** None
- **Residual:** likelihood 4 × impact 3 = **12 High**
- **Treatment (reduce):** Triage the critical/high advisories for reachability, upgrade direct dependencies, enable Dependabot or Renovate, and add an audit step to CI.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-06-30
- **Evidence:** `pnpm audit --json (2026-05-10)` — metadata: critical 1, high 27, moderate 33, low 6

### R-013 — No automated test suite; 24 TypeScript errors

- **Category:** Software defects · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** package.json has build and lint scripts only and no test files exist. tsc --noEmit reports 24 errors.
- **Cause:** Tests not yet written; type errors tolerated.
- **Potential consequence:** Regressions in scheduling rules or persistence reach users undetected.
- **Affected assets/processes:** lib/assignment-eval.ts; lib/store.tsx; API routes
- **Inherent:** likelihood 4 (Likely) × impact 3 (Moderate) = **12 High**
- **Existing controls (weak):** ESLint; manual type-error baseline tracked during changes [weak]
- **Residual:** likelihood 4 × impact 3 = **12 High**
- **Treatment (reduce):** Add unit tests for evaluateAssignment and route tests for /api/state; fix the 24 type errors.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-08-31
- **Evidence:** `package.json scripts` — build, lint; no test; `npx tsc --noEmit (2026-05-10)` — 24 errors

### R-014 — Builds ignore TypeScript errors

- **Category:** Deployment failure · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** next.config.mjs sets typescript.ignoreBuildErrors: true, so type-broken code can deploy.
- **Cause:** Flag set to unblock builds while type errors exist.
- **Potential consequence:** Defective deployment reaches production; outage or incorrect behaviour until rollback.
- **Affected assets/processes:** next.config.mjs; Vercel deployments
- **Inherent:** likelihood 3 (Possible) × impact 3 (Moderate) = **9 Medium**
- **Existing controls (partial):** Preview deployments and Vercel instant rollback [partial]
- **Residual:** likelihood 3 × impact 2 = **6 Medium**
- **Treatment (reduce):** Fix the type errors (R-013) and remove ignoreBuildErrors; require a passing type-check before merge.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-08-31
- **Evidence:** `next.config.mjs:32` — ignoreBuildErrors: true

### R-015 — No multi-factor authentication; weak passwords allowed in demo-seed mode

- **Category:** Authentication · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** Better Auth is configured for email + password only. Minimum password length is 12, but 5 when demo seeding is enabled.
- **Cause:** lib/auth.ts: minPasswordLength: demoSeed ? 5 : 12; no two-factor plugin.
- **Potential consequence:** Credential stuffing or phishing gives full access, including to Admin accounts.
- **Affected assets/processes:** lib/auth.ts; Admin accounts
- **Inherent:** likelihood 3 (Possible) × impact 4 (Major) = **12 High**
- **Existing controls (partial):** Better Auth password hashing and session management [effective]; Auth rate limiting (100 req / 60 s with custom rules) [partial]; Failed sign-ins are audited [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Enable two-factor authentication for Admin accounts; confirm demo seeding is disabled in production.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `lib/auth.ts:125, :191, :194` — Password length, 24h sessions, rate limiting

### R-016 — API rate limiting is per serverless instance

- **Category:** Cybersecurity · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** The API rate limiter keeps counters in process memory, so limits are not shared across instances.
- **Cause:** In-memory Map store in lib/security/rate-limit.ts.
- **Potential consequence:** Brute-force or scraping traffic spread across instances exceeds intended limits.
- **Affected assets/processes:** lib/security/rate-limit.ts; All API routes
- **Inherent:** likelihood 3 (Possible) × impact 3 (Moderate) = **9 Medium**
- **Existing controls (partial):** Per-instance limits plus Better Auth limits on auth endpoints [partial]
- **Residual:** likelihood 3 × impact 2 = **6 Medium**
- **Treatment (reduce):** Move the limiter store to a shared backend (e.g. Upstash Redis).
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-09-30
- **Evidence:** `lib/security/rate-limit.ts:3, :12` — Fixed-window, in-memory rate limiter

### R-017 — Content Security Policy is report-only

- **Category:** Information security · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** CSP is sent as Content-Security-Policy-Report-Only, so it logs violations but blocks nothing.
- **Cause:** Initial rollout setting; Next.js inline scripts need a nonce before enforcement.
- **Potential consequence:** No CSP protection if an XSS flaw is introduced.
- **Affected assets/processes:** next.config.mjs
- **Inherent:** likelihood 2 (Unlikely) × impact 4 (Major) = **8 Medium**
- **Existing controls (partial):** React output escaping [effective]; X-Frame-Options SAMEORIGIN, nosniff, HSTS [effective]
- **Residual:** likelihood 2 × impact 3 = **6 Medium**
- **Treatment (reduce):** Introduce nonce-based script-src and switch to an enforced Content-Security-Policy.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-09-30
- **Evidence:** `next.config.mjs:9` — Content-Security-Policy-Report-Only

### R-018 — Single Admin can change permissions and restore or delete data

- **Category:** Administrative privilege · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** The role-permission matrix is stored in the snapshot and read by server authorization. One Admin can change it, restore backups or delete backups without a second approver.
- **Cause:** No dual control on privileged actions.
- **Potential consequence:** A compromised or mistaken Admin account can escalate privileges or destroy data.
- **Affected assets/processes:** lib/security/authz.ts; Permission matrix; Backup routes
- **Inherent:** likelihood 2 (Unlikely) × impact 5 (Severe) = **10 High**
- **Existing controls (partial):** Matrix changes captured in audit diff; audit is Admin-only and append-only [partial]; reconcilePermissionMatrix normalises stored matrix [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Quarterly access review of Admin accounts; consider two-person approval for restore and backup deletion.
- **Risk owner:** System Owner · **Treatment owner:** System Owner · **Target:** 2026-08-31
- **Evidence:** `lib/security/authz.ts:83-85` — permissionMatrix read from persisted state

### R-019 — Database credentials can disable audit protections

- **Category:** Insider misuse · **Basis:** potential · **Status:** open · **Review:** 2026-08-10
- **Description:** The application connects with credentials that can alter schema, so someone holding DATABASE_URL could drop the append-only triggers.
- **Cause:** Single database role used for app and migrations; env vars readable by project members.
- **Potential consequence:** Audit records could be altered or truncated by a privileged insider.
- **Affected assets/processes:** DATABASE_URL; audit.event
- **Inherent:** likelihood 2 (Unlikely) × impact 5 (Severe) = **10 High**
- **Existing controls (partial):** Append-only triggers on audit.event [partial]; Hash-chain verification (/api/audit/verify) detects altered or removed interior rows [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Create a least-privilege runtime role without DDL rights; periodically export the chain head hash off-platform.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** 2026-09-30
- **Evidence:** `lib/db/index.ts:7, scripts/audit/apply-audit-schema.mjs` — Same connection string used for app and DDL

### R-020 — Email notifications depend on Resend

- **Category:** Third-party services · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** Staff notifications are sent via Resend. If NOTIFY_FROM_EMAIL is unset the sender defaults to onboarding@resend.dev.
- **Cause:** Single email provider; default sender fallback.
- **Potential consequence:** Outage or misconfiguration means staff are not told about schedule changes.
- **Affected assets/processes:** app/api/notify/route.ts; Resend
- **Inherent:** likelihood 3 (Possible) × impact 3 (Moderate) = **9 Medium**
- **Existing controls (partial):** mailto: fallback links (lib/notify.ts:345) [partial]
- **Residual:** likelihood 2 × impact 3 = **6 Medium**
- **Treatment (reduce):** Set NOTIFY_FROM_EMAIL to a verified domain in production; surface send failures to the sender.
- **Risk owner:** Operations Manager · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `app/api/notify/route.ts:45-48` — Resend client and default from address

### R-021 — Test-data endpoint can create users and data

- **Category:** Third-party services · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** POST /api/autonoma seeds auth users and domain data into the live snapshot for end-to-end tests, protected by a signing secret.
- **Cause:** Third-party test tooling endpoint deployed with the app.
- **Potential consequence:** If the signing secret leaks, an attacker could create accounts or inject data.
- **Affected assets/processes:** app/api/autonoma/route.ts; AUTONOMA_SIGNING_SECRET
- **Inherent:** likelihood 2 (Unlikely) × impact 4 (Major) = **8 Medium**
- **Existing controls (partial):** Signed requests [effective]; Run-id tagging and teardown [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Disable the endpoint in production (allow only preview environments) and rotate the secret periodically.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `app/api/autonoma/route.ts, AGENTS.md` — Signed seeding endpoint

### R-022 — Destructive administrative actions are single-step

- **Category:** Operational errors · **Basis:** potential · **Status:** open · **Review:** 2026-08-10
- **Description:** Restore, backup deletion and bulk run cancellation are performed by one person after a confirmation dialog.
- **Cause:** No staged or reversible execution for destructive operations.
- **Potential consequence:** Wrong backup restored or wrong runs cancelled.
- **Affected assets/processes:** Backup page; Run cancellation
- **Inherent:** likelihood 3 (Possible) × impact 4 (Major) = **12 High**
- **Existing controls (partial):** Confirmation dialogs [partial]; Fail-closed audit on restore and delete [partial]; Nightly backups [partial]
- **Residual:** likelihood 2 × impact 4 = **8 Medium**
- **Treatment (reduce):** Automatic pre-restore backup (R-007); typed confirmation for restore and deletion.
- **Risk owner:** Operations Manager · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `components/confirm-dialog.tsx, components/cancel-run-dialog.tsx` — Confirmation-only safeguard

### R-023 — Incorrect scheduling data entry

- **Category:** Human error · **Basis:** potential · **Status:** open · **Review:** 2026-08-10
- **Description:** Wrong dates, positions, qualifications or leave entered by schedulers.
- **Cause:** Manual data entry under time pressure.
- **Potential consequence:** Sessions mis-staffed or staff double-booked.
- **Affected assets/processes:** Runs; Staff profiles; Leave records
- **Inherent:** likelihood 4 (Likely) × impact 3 (Moderate) = **12 High**
- **Existing controls (partial):** Assignment blocks and warnings in the UI [partial]; Audit diff allows tracing and correction [partial]
- **Residual:** likelihood 3 × impact 3 = **9 Medium**
- **Treatment (reduce):** Scheduler training; weekly pre-publication review of the coming week's roster.
- **Risk owner:** Operations Manager · **Treatment owner:** Operations Manager · **Target:** 2026-07-31

### R-024 — Legacy client-writable audit log could be mistaken for the authoritative record

- **Category:** Information security · **Basis:** observed · **Status:** mitigated · **Review:** 2026-08-10
- **Description:** The snapshot still carries an auditLogs slice written by the browser.
- **Cause:** Pre-existing client-side audit feature.
- **Potential consequence:** Investigations relying on it could be misled by forged entries.
- **Affected assets/processes:** lib/store.tsx auditLogs; Admin audit tab
- **Inherent:** likelihood 2 (Unlikely) × impact 2 (Minor) = **4 Low**
- **Existing controls (effective):** Labelled legacy in the Admin UI; server audit trail is authoritative [effective]
- **Residual:** likelihood 1 × impact 2 = **2 Low**
- **Treatment (reduce):** Remove the slice after the relational cutover.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** 2026-09-30
- **Evidence:** `lib/store.tsx:148` — auditLogs: AuditLog[] in client state

### R-025 — Unauthenticated or under-privileged API access

- **Category:** Authorization · **Basis:** observed · **Status:** mitigated · **Review:** 2026-08-10
- **Description:** API routes reachable without a session or with insufficient role.
- **Cause:** Route handlers previously lacked consistent authorization.
- **Potential consequence:** Data disclosure or modification by unauthenticated users.
- **Affected assets/processes:** All /api routes; proxy.ts; lib/security/authz.ts
- **Inherent:** likelihood 3 (Possible) × impact 5 (Severe) = **15 Critical**
- **Existing controls (effective):** proxy.ts session gate [effective]; authorize() with role/permission and CSRF origin check on every route [effective]
- **Residual:** likelihood 1 × impact 5 = **5 Medium**
- **Treatment (reduce):** Implemented. Keep: every new route must call authorize().
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** —
- **Evidence:** `proxy.ts, lib/security/authz.ts authorize()` — Session gate and per-route authorization; runtime check returned 307 for unauthenticated requests

### R-026 — Lost updates from concurrent snapshot writes

- **Category:** Data integrity · **Basis:** observed · **Status:** mitigated · **Review:** 2026-08-10
- **Description:** Two users saving the whole snapshot could silently overwrite each other's changes.
- **Cause:** Whole-document persistence.
- **Potential consequence:** Assignments or leave silently reverted.
- **Affected assets/processes:** PUT /api/state; lib/repository/state-repository.ts
- **Inherent:** likelihood 4 (Likely) × impact 4 (Major) = **16 Critical**
- **Existing controls (effective):** If-Match revision precondition; autosave stops on conflict [effective]
- **Residual:** likelihood 1 × impact 4 = **4 Low**
- **Treatment (reduce):** Implemented.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** —
- **Evidence:** `app/api/state/route.ts:19-21, :147-148; lib/repository/state-repository.ts:27, :65` — If-Match revision; 409 concurrency_conflict

### R-027 — Changes not attributable to a person

- **Category:** Insider misuse · **Basis:** observed · **Status:** mitigated · **Review:** 2026-08-10
- **Description:** Without a server-side trail, misuse of legitimate access could not be traced.
- **Cause:** Previously only a client-side audit log existed.
- **Potential consequence:** Inability to investigate or demonstrate accountability.
- **Affected assets/processes:** audit.event; lib/audit/*
- **Inherent:** likelihood 3 (Possible) × impact 4 (Major) = **12 High**
- **Existing controls (effective):** Append-only hash-chained server audit trail [effective]; Admin-only viewer, verification and CSV export [effective]
- **Residual:** likelihood 1 × impact 4 = **4 Low**
- **Treatment (reduce):** Implemented. Residual privileged-database risk tracked in R-019.
- **Risk owner:** System Owner · **Treatment owner:** Technical Lead · **Target:** —
- **Evidence:** `db/migrations/0002_audit_trail.up.sql` — Append-only, hash-chained; UPDATE/DELETE/TRUNCATE verified rejected

### R-028 — AI-assisted code changes

- **Category:** AI risks · **Basis:** potential · **Status:** open · **Review:** 2026-08-10
- **Description:** The application has no runtime AI features (no AI SDK dependency). The codebase is developed with AI assistance (v0 branches, AGENTS.md).
- **Cause:** Generated code may contain subtle defects or security regressions.
- **Potential consequence:** Defects or weakened controls merged without detection.
- **Affected assets/processes:** Source repository; AGENTS.md
- **Inherent:** likelihood 3 (Possible) × impact 3 (Moderate) = **9 Medium**
- **Existing controls (weak):** Branch-based changes with pull requests (human review not verified) [weak]
- **Residual:** likelihood 3 × impact 3 = **9 Medium**
- **Treatment (reduce):** Require human review of every AI-generated PR plus the test and type-check gates from R-013/R-014.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-07-31
- **Evidence:** `package.json (no ai/@ai-sdk deps); branch v0/security-hardening; AGENTS.md` — AI used in development only

### R-029 — Schema changes applied by ad-hoc scripts without a migration ledger

- **Category:** Database · **Basis:** observed · **Status:** open · **Review:** 2026-08-10
- **Description:** SQL migrations are applied by standalone scripts; the database does not record which migrations have run.
- **Cause:** No migration tracking table or runner.
- **Potential consequence:** Environments drift; a migration is skipped or applied out of order.
- **Affected assets/processes:** db/migrations/*; scripts/audit/apply-audit-schema.mjs
- **Inherent:** likelihood 3 (Possible) × impact 3 (Moderate) = **9 Medium**
- **Existing controls (partial):** Idempotent SQL with matching down scripts [partial]
- **Residual:** likelihood 2 × impact 3 = **6 Medium**
- **Treatment (reduce):** Introduce a schema_migrations ledger and a single runner script.
- **Risk owner:** Technical Lead · **Treatment owner:** Technical Lead · **Target:** 2026-09-30
- **Evidence:** `scripts/audit/apply-audit-schema.mjs` — Reads and executes one SQL file directly
