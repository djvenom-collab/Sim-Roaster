<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Autonoma test data

Autonoma runs end-to-end tests against this app and seeds realistic test data
through the signed `POST /api/autonoma` endpoint. Its factories create data via
the app's own creation paths — auth users through Better Auth's `signUpEmail`
(real hashed Postgres rows) and every domain entity into the single Vercel Blob
snapshot at `sim-roster/state.json`, each row tagged with the run id so teardown
removes exactly what a run created.

When you add or change a model — a new domain slice in `lib/persisted-state.ts`,
a new field, or a change to how a row is created — update the matching factory
in `lib/autonoma/factories.ts` (and its `SLICE_FOR_MODEL` mapping), add its
records to `scripts/autonoma/gen-recipe.mjs`, regenerate the recipe with
`node scripts/autonoma/gen-recipe.mjs`, and keep the seeded data in sync so the
tests continue to exercise the real schema.
