# AI System Inventory

Last reviewed: 2026-05-10. Owner: Technical Lead. Governance: [ai-governance.md](./ai-governance.md).

## Runtime AI systems

**None.** Sim-Roaster does not operate an AI system and does not call an external AI, ML or LLM service at runtime. The evidence is in [ai-governance.md section 1](./ai-governance.md#1-scope-determination). The scope is guarded by `node scripts/ai/check-ai-scope.mjs`.

## Reviewed and excluded

These items were assessed because they could be mistaken for AI. They are recorded so a reviewer does not need to re-investigate them.

| Item | Location | Why it is not an AI system |
|---|---|---|
| Auto-Fill Positions | `components/fill-positions-dialog.tsx`, `fillPositions` in `lib/store.tsx` | A deterministic greedy assigner. It uses hard eligibility filters (`scoreCandidate`) and a fixed sort comparator with an ID tie-break, so identical input gives identical output. It has no model, training data or randomness, and it never applies overrides. |
| `@autonoma-ai/sdk` | `app/api/autonoma/route.ts`, `lib/autonoma/*` | An HMAC-verified E2E test-data protocol that runs app-defined factories. It does not call a model. |
| Vercel Analytics | `@vercel/analytics` | Page-view telemetry, with no inference over roster data. |
| AI coding assistance | Development process (v0, `AGENTS.md`) | Not part of the deployed system. Tracked as risk R-028. |

## Entry template (complete before any AI feature ships)

Copy this block for each AI system. Every field is mandatory. "TBD" blocks release.

```markdown
### AI-001 — <name>

| Field | Value |
|---|---|
| AI system | <feature name and code location> |
| Purpose | <the single decision or task it supports> |
| Owner | <named role accountable for it> |
| Provider/model | <gateway model ID, pinned version, region> |
| Inputs | <fields sent, as IDs/codes where possible; what is explicitly excluded> |
| Outputs | <schema of the proposal object; Zod schema location> |
| Data accessed | <state slices read; whether any personal data leaves the system; provider retention/training terms> |
| Users | <roles allowed to invoke it; feature-flag name> |
| Decision impact | <advisory only; what happens if the advice is wrong; which prohibited categories it could touch> |
| Human oversight | <accept/reject UI; which store actions apply changes; deterministic rule re-check> |
| Known limitations | <e.g. no knowledge of off-system constraints, stale data, context-size limits> |
| Failure modes | <timeout, provider outage, invalid output, plausible-but-wrong proposal, prompt injection via free text> |
| Monitoring | <audit actions, acceptance and rule-rejection rates, alert thresholds> |
| Fallback | <manual scheduling and deterministic Auto-Fill; kill switch> |
| Risk register ID | <R-xxx> |
| Approved by / date | <Technical Lead, Admin> |
```
