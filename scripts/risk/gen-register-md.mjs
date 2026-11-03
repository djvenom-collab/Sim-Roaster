// Renders docs/risk-register.md from config/risk-register.initial.json.
// Usage: node scripts/risk/gen-register-md.mjs
import { readFile, writeFile } from "node:fs/promises"

const L = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"]
const I = ["Insignificant", "Minor", "Moderate", "Major", "Severe"]
const band = (s) => (s >= 15 ? "Critical" : s >= 10 ? "High" : s >= 5 ? "Medium" : "Low")
const esc = (s) => String(s ?? "").replaceAll("|", "\\|").replaceAll("\n", " ")
const scoreCell = (l, i) => `${l * i} ${band(l * i)}`

const src = JSON.parse(await readFile(new URL("../../config/risk-register.initial.json", import.meta.url), "utf8"))
const risks = [...src.risks].sort((a, b) => b.residualLikelihood * b.residualImpact - a.residualLikelihood * a.residualImpact || a.id.localeCompare(b.id))

const out = []
out.push("# Risk register (baseline)", "")
out.push(`> Generated from \`config/risk-register.initial.json\` by \`node scripts/risk/gen-register-md.mjs\`. Do not edit by hand.`)
out.push(`> Assessed ${src.assessedOn}. The live register is in **Admin → Risk register**. After the baseline is imported there, the database is the source of truth and this file is a point-in-time record.`, "")
out.push("Method and scales: see [risk-management.md](./risk-management.md). Score = likelihood × impact (1–25). Bands: Low 1–4, Medium 5–9, High 10–14, Critical 15–25.", "")
out.push("**Basis** separates *observed* risks (evidenced by code, configuration or command output in this repository) from *potential* risks (plausible, but no occurrence or defect has been demonstrated). Owners are role titles until named people are assigned.", "")

const counts = { observed: 0, potential: 0 }
const byStatus = {}
for (const r of risks) {
  counts[r.basis]++
  byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
}
out.push("## Summary", "")
out.push(`${risks.length} risks: ${counts.observed} observed, ${counts.potential} potential. Status: ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(", ")}.`, "")

out.push("### Residual heat map (count of risks)", "")
out.push("| Likelihood \\ Impact | 1 " + I[0] + " | 2 " + I[1] + " | 3 " + I[2] + " | 4 " + I[3] + " | 5 " + I[4] + " |")
out.push("|---|---|---|---|---|---|")
for (let l = 5; l >= 1; l--) {
  const cells = [1, 2, 3, 4, 5].map((i) => {
    const ids = risks.filter((r) => r.status !== "closed" && r.residualLikelihood === l && r.residualImpact === i).map((r) => r.id)
    return ids.length ? ids.join(", ") : "·"
  })
  out.push(`| **${l} ${L[l - 1]}** | ${cells.join(" | ")} |`)
}
out.push("")

out.push("## Register", "")
out.push("| ID | Risk | Category | Basis | Inherent | Controls | Residual | Strategy | Owner | Target | Status |")
out.push("|---|---|---|---|---|---|---|---|---|---|---|")
for (const r of risks) {
  out.push(
    `| ${r.id} | ${esc(r.title)} | ${esc(r.category)} | ${r.basis} | ${scoreCell(r.likelihood, r.impact)} | ${r.controlEffectiveness} | ${scoreCell(r.residualLikelihood, r.residualImpact)} | ${r.treatmentStrategy} | ${esc(r.riskOwner)} | ${r.targetDate ?? "—"} | ${r.status} |`,
  )
}
out.push("")

out.push("## Category coverage", "")
const cats = [...new Set(src.risks.map((r) => r.category))]
const required = [
  "Information security", "Cybersecurity", "Authentication", "Authorization", "Data integrity", "Data loss", "Availability",
  "Business continuity", "Third-party services", "Vercel", "Database", "Blob storage", "Operational errors", "Human error",
  "Unauthorized scheduling changes", "Incorrect staff assignment", "Validity/currency errors", "Leave conflicts",
  "Qualification/eligibility errors", "Software defects", "Deployment failure", "Dependency vulnerabilities", "Insider misuse",
  "Administrative privilege", "AI risks",
]
out.push("| Category | Risks |", "|---|---|")
for (const c of required) out.push(`| ${c} | ${src.risks.filter((r) => r.category === c).map((r) => r.id).join(", ") || "None identified"} |`)
const extra = cats.filter((c) => !required.includes(c))
if (extra.length) out.push("", `Additional categories: ${extra.join(", ")}.`)
out.push("")

out.push("## Risk details", "")
for (const r of [...src.risks].sort((a, b) => a.id.localeCompare(b.id))) {
  out.push(`### ${r.id} — ${r.title}`, "")
  out.push(`- **Category:** ${r.category} · **Basis:** ${r.basis} · **Status:** ${r.status} · **Review:** ${r.reviewDate ?? "—"}`)
  out.push(`- **Description:** ${r.description}`)
  out.push(`- **Cause:** ${r.cause}`)
  out.push(`- **Potential consequence:** ${r.consequence}`)
  out.push(`- **Affected assets/processes:** ${r.assets.join("; ")}`)
  out.push(`- **Inherent:** likelihood ${r.likelihood} (${L[r.likelihood - 1]}) × impact ${r.impact} (${I[r.impact - 1]}) = **${scoreCell(r.likelihood, r.impact)}**`)
  out.push(`- **Existing controls (${r.controlEffectiveness}):** ${r.existingControls.length ? r.existingControls.map((c) => `${c.description} [${c.effectiveness}]`).join("; ") : "None"}`)
  out.push(`- **Residual:** likelihood ${r.residualLikelihood} × impact ${r.residualImpact} = **${scoreCell(r.residualLikelihood, r.residualImpact)}**`)
  out.push(`- **Treatment (${r.treatmentStrategy}):** ${r.treatmentPlan}`)
  out.push(`- **Risk owner:** ${r.riskOwner} · **Treatment owner:** ${r.treatmentOwner} · **Target:** ${r.targetDate ?? "—"}`)
  if (r.evidence.length) out.push(`- **Evidence:** ${r.evidence.map((e) => `\`${e.ref}\` — ${e.note}`).join("; ")}`)
  out.push("")
}

await writeFile(new URL("../../docs/risk-register.md", import.meta.url), out.join("\n"))
console.log(`wrote docs/risk-register.md (${risks.length} risks)`)
