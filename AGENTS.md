# AGENTS.md

## Autonoma test-data integration

This app has an Autonoma SDK endpoint that seeds and tears down isolated,
per-test-run data. If you add or change domain entities, keep the integration in
sync or automated tests will seed stale shapes.

### Moving parts
- **Endpoint:** `POST /api/autonoma` — `app/api/autonoma/route.ts`, built with
  `createHandler` from `@autonoma-ai/server-web`. HMAC-signed with
  `AUTONOMA_SHARED_SECRET` + `AUTONOMA_SIGNING_SECRET`; unsigned requests get 401.
  It is excluded from the auth gate in `middleware.ts` — keep it excluded.
- **Factories:** `lib/autonoma/factories.ts` — one per entity (33 total). The
  registry at the bottom maps each model name to its factory.
- **Auth models** (`User`, `Session`, `Account`, `Verification`) create REAL
  Better Auth + Neon rows via `lib/autonoma/auth.ts` so the runner gets a real
  login. The `User` factory also mirrors into the app's in-app `users` slice so
  Admin ▸ Users & roles shows seeded users.
- **All other entities** are written to a PER-RUN copy of the app's Blob
  snapshot — `lib/autonoma/run-store.ts`, keyed by `testRunId`. Writes are
  buffered in-process during `up` and flushed to the blob once in `afterUp`
  (one write, not one-per-record).
- **Serving the run:** the auth callback sets an `autonoma_run` cookie; when
  `/api/state` (`app/api/state/route.ts`) sees it, it serves that run's snapshot
  instead of the global one. The snapshot carries an `__autonoma` marker so the
  store (`lib/store.tsx`) applies its slices VERBATIM — no migration, dedupe, or
  history backfill that would bury the clean scenario.
- **Teardown** is scope-root: `deleteRunSnapshot(testRunId)` drops the whole
  per-run blob in one call; auth rows are removed per-`User` (cascades
  Session/Account).

### If you add a new entity
1. Add a factory in `lib/autonoma/factories.ts` and register it.
2. If it is a new persisted slice, make sure the `__autonoma` branch in
   `lib/store.tsx` applies it (transactional slices reset empty when absent).
3. Re-validate (see below) and update the recipe.

### Concurrency rule
Real test runs OVERLAP. Anything with a global unique constraint must be
per-run: the shared surface here is `user.email`, which is tokenised with
`{{testRunId}}` in the recipe. Blob domain data is isolated by the `testRunId`
blob path, so the scenario's hardcoded ids (`pos-arr`, `sim-radar-1`, …) never
collide across runs.

### Validate
```
BIN=$(command -v autonoma-planner || echo npx @autonoma-ai/planner)
$BIN sdk check  --recipe /home/vercel-sandbox/.autonoma/v0-project/recipe.json
$BIN sdk up     --url <preview>/api/autonoma --recipe <recipe> --repeat 3   # concurrency proof
```

### Cleaning up leftovers
Orphaned test users (a crashed `up` before teardown) all use the
`@simroster.test` domain. `node --env-file-if-exists=.env.development.local
scripts/autonoma-cleanup.mjs purge` removes them and preserves real accounts.
