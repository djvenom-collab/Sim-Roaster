# Autonoma integration — implementation checklist

Endpoint: `POST /api/autonoma` (HMAC-signed; excluded from the auth middleware).
Recipe: `/home/vercel-sandbox/.autonoma/v0-project/recipe.json` (scenario: `standard`).

## Where each model is written
- **Auth models** (`User`, `Session`, `Account`, `Verification`) → real Better Auth +
  Neon rows (`lib/autonoma/auth.ts`, `lib/db`). Gives the runner a real login.
- **Everything else** → a slice of the app's per-run Blob snapshot
  (`lib/autonoma/run-store.ts`). The store applies it VERBATIM via the
  `__autonoma` marker (`lib/store.tsx`), so no migration/dedupe/backfill runs.

## Factories (one per entity the audit lists) — 33 total
- [x] User
- [x] Session
- [x] Account
- [x] Verification
- [x] Staff
- [x] Simulator
- [x] Position
- [x] Exercise
- [x] Course
- [x] Run
- [x] RunAssignment
- [x] StaffValidity
- [x] LeaveRecord
- [x] TrainingAttachment
- [x] TrainingSession
- [x] TrainingAttendance
- [x] TrainingLogEntry
- [x] Qualification
- [x] StaffQualification
- [x] PositionQualRule
- [x] ExerciseQualRule
- [x] Assignment
- [x] OtherTask
- [x] PublicHoliday
- [x] SlotTime
- [x] AuditLog
- [x] FaultLog
- [x] OperatorLog
- [x] FirewallLog
- [x] AdminLog
- [x] ImportHistory
- [x] NotificationRecord
- [x] TrainingGroup

## Infrastructure
- [x] Endpoint (`app/api/autonoma/route.ts`, `createHandler` from `@autonoma-ai/server-web`)
- [x] Middleware exclusion for `/api/autonoma`
- [x] Teardown — scope-root: `deleteRunSnapshot(testRunId)` drops the whole per-run
      blob in one call; auth rows are deleted per-User (cascades Session/Account).
- [x] Auth callback — real email+password login for the seeded Admin user, returns
      session cookies + sets the `autonoma_run` cookie so `/api/state` serves the run.
- [x] Maintenance note appended to `AGENTS.md`
- [x] `AUTONOMA_SIGNING_SECRET` provisioned (Production/Preview/Development) + `.env`

## Validation
- [x] Full-recipe `sdk up` → all 33 models / 118 records present in `/api/state`
      (staff 5, runs 5, users 3, leave 3, training 2, logs, …) → `sdk down` → gone
- [x] Per-run isolation verified: two parallel runs (`conc-x`/`conc-y`) each serve
      only their own data + their own tokenised users
- [x] Wrong-signature rejected — unsigned `POST /api/autonoma` returns 401
- [x] Auth payload carries real credentials (real Better Auth login; browser
      login as the seeded Admin renders the seeded dashboard)
- [x] Time-sensitive rows land on the intended side of `now` (relative offsets
      resolved in `lib/autonoma/dates.ts`)
- [x] `sdk check` on `recipe.json` prints `"ok": true` (0 problems)
- [x] Concurrent-instances proof (`sdk up --repeat 3`) → `ok: true`, all 3 up,
      teardown complete (0 test users left; 6 real users preserved)
- [x] Production `next build` passes with `/api/autonoma` compiled
- [x] Branch pushed + pull request opened

## Browser-verified
Logged in as the seeded Admin with the `autonoma_run` cookie: Admin ▸ Users shows
the 3 seeded users; the dashboard shows the seeded runs (RAD01 3/3 Confirmed,
TWR01 1/2 Tentative) and On-Leave-Today 1 — all from the isolated per-run blob.

## Concurrency design
- Blob domain data is isolated per run by the `testRunId` blob path, so hardcoded
  scenario ids (`pos-arr`, `sim-radar-1`, …) never collide across runs.
- The shared Neon auth table is the only cross-run surface: `User.email` carries
  `{{testRunId}}` and ids carry `{{testRunShortId}}`; Session/Account link to the
  User via `_ref` (Better Auth mints the real user id at signup).
