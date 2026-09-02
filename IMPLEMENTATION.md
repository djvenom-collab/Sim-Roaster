# Autonoma SDK Integration — Implementation Checklist

Test-data endpoint that lets the Autonoma test runner `discover`, seed (`up`),
and tear down (`down`) the "standard" scenario for Sim Roaster.

## Architecture

This app stores data in **two** backends, so seeding spans both:

1. **Auth entities** (`User`, `Session`, `Account`, `Verification`) are real
   Postgres rows in the Better Auth tables. The `User` factory runs Better
   Auth's own `signUpEmail`, so every seeded credential account is hashed
   exactly like a real one — the returned credentials actually log in.
2. **Domain entities** (`Staff`, `Simulator`, `Run`, logs, …) live only in the
   single Vercel Blob snapshot at `sim-roster/state.json`. Their factories shape
   the row; the handler's `afterUp` flushes them all into the snapshot in one
   write, and `beforeDown` removes them by run tag.

### Files
- `app/api/autonoma/route.ts` — `POST /api/autonoma`; production-guarded; HMAC verified by the SDK.
- `lib/autonoma/config.ts` — `HandlerConfig`: factories, `afterUp`, `beforeDown`, `auth`.
- `lib/autonoma/factories.ts` — one factory per entity; seed-time offset resolution.
- `lib/autonoma/snapshot.ts` — blob read/merge/remove keyed by `__autonomaRunId`.
- `proxy.ts` — `/api/autonoma` exempted from the session gate (guarded by its own HMAC).
- Recipe file: `/home/vercel-sandbox/.autonoma/v0-project/recipe.json` (33 entities, 174 records).

### Time handling
The recipe never hardcodes an instant. Fields compared against "now" are passed
as `<field>OffsetDays` / `<field>OffsetHours`; the factory (which runs at seed
time) converts them to concrete values. There is no time token — by design.

### Per-run uniqueness (survives overlapping runs)
- Postgres `user.email` UNIQUE → tokenized with `{{testRunId}}`.
- Session `token`, Account `accountId` → `{{testRunShortId}}`.
- Domain codes (`Position.code`, `Simulator.code`, `Exercise.code`,
  `Course.code`, `Qualification.code`, `Assignment.code`) → `{{testRunShortId}}`
  so a human reading the blob can tell runs apart; blob rows also get fresh
  UUIDs, so they never collide regardless.

## Entity factories (from the entity audit)
- [x] User
- [x] Session
- [x] Account
- [x] Verification
- [x] Staff
- [x] Simulator
- [x] Position
- [x] Exercise
- [x] Course
- [x] RunStatus (pure enum — no persistence)
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

## Delivery checklist
- [x] Endpoint implemented and production-guarded.
- [x] Teardown removes exactly this run's rows (Postgres cascade + blob run tag).
- [x] Auth callback returns real, usable credentials (login verified → HTTP 200 + session).
- [x] Maintenance note (this file).
- [x] Full-recipe `up` succeeds; all rows created (6 PG users + 159 blob rows), then `down` removes them all.
- [x] Concurrent-instances proof (`--repeat 3`) → `ok: true`, all three live at once.
- [x] Clean `sdk check` on `recipe.json` → `ok: true`, 0 problems.
- [x] Wrong signature rejected → HTTP 401.
- [ ] Pushed branch + opened pull request.

## Known limitation
The blob snapshot is one global document, so two overlapping `up`/`down` calls
read-modify-write the same file. `mergeRecords`/`removeRecords` re-read
immediately before writing to minimize clobbering, but this is best-effort. The
`--repeat 3` proof passes because each run tags and removes only its own rows.

## Maintenance
When a new domain entity is added to the app:
1. Add a factory in `lib/autonoma/factories.ts`.
2. Map its model name → PersistedState slice in `SLICE_FOR_MODEL`.
3. Add its records (with `_alias`/`_ref` wiring) to the recipe generator
   `scripts/autonoma/gen-recipe.mjs`, regenerate with
   `node scripts/autonoma/gen-recipe.mjs`, and run `sdk check`.
