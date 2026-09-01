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
- [ ] Every entity seeded + verified independently (up → inspect → down → inspect)
- [ ] Full-recipe `sdk up` → all rows present → `sdk down` → rows gone
- [ ] Wrong-signature rejected (SDK-enforced)
- [ ] Auth payload carries real credentials (not a placeholder)
- [ ] Time-sensitive rows land on the intended side of `now`
- [ ] `sdk check` on `recipe.json` prints `"ok": true`
- [ ] Concurrent-instances proof (`sdk up --repeat 3`) passes
- [ ] Branch pushed + pull request opened

## Concurrency design
- Blob domain data is isolated per run by the `testRunId` blob path, so hardcoded
  scenario ids (`pos-arr`, `sim-radar-1`, …) never collide across runs.
- The shared Neon auth table is the only cross-run surface: `User.email` carries
  `{{testRunId}}` and ids carry `{{testRunShortId}}`; Session/Account link to the
  User via `_ref` (Better Auth mints the real user id at signup).
