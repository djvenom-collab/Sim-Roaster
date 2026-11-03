/* ENVIRONMENT CONFIGURATION INVENTORY (never prints values).
 * Reports which variables from config/dependencies.json are present, so a
 * rebuilt environment can be checked against the expected set.
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/dr/env-inventory.mjs [--check] [--markdown]
 *   --check exits 1 when a required variable is missing.
 */
import { loadJson, parseArgs } from "./lib.mjs"

const args = parseArgs()
const { dependencies } = await loadJson("config/dependencies.json")
const rows = dependencies.flatMap((d) =>
  d.envVars.map((v) => ({ dependency: d.id, tier: d.tier, name: v.name, required: v.required, managedBy: v.managedBy, present: Boolean(process.env[v.name]) })),
)

if (args.markdown) {
  console.log("| Variable | Dependency | Tier | Required | Restored by | Present |\n|---|---|---|---|---|---|")
  for (const r of rows) console.log(`| \`${r.name}\` | ${r.dependency} | ${r.tier} | ${r.required ? "yes" : "no"} | ${r.managedBy} | ${r.present ? "yes" : "NO"} |`)
} else {
  for (const r of rows) console.log(`${r.present ? "SET    " : "MISSING"}  ${r.required ? "required" : "optional"}  ${r.name.padEnd(32)} ${r.dependency} (${r.managedBy})`)
}
const missing = rows.filter((r) => r.required && !r.present)
if (missing.length) console.error(`\nMissing required: ${missing.map((m) => m.name).join(", ")}`)
process.exit(args.check && missing.length ? 1 : 0)
