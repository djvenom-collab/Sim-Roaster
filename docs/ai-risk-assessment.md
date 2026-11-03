# AI Risk Assessment

Last assessed: 2026-05-10. Owner: Technical Lead. Scoring uses the same 5×5 likelihood × impact scale as [risk-management.md](./risk-management.md).

This assessment supports alignment with ISO/IEC 42001:2023. It is not a certification or conformity claim.

## 1. Current position

Sim-Roaster has **no runtime AI system** ([ai-governance.md section 1](./ai-governance.md#1-scope-determination)). There is no AI impact on staff, rosters or training records to assess today. The risks below are either:

- **Current (development-time):** risks that exist now from how the software is built.
- **Conditional:** risks that would apply if AI is introduced. The required controls are listed in [ai-governance.md section 5](./ai-governance.md#5-introducing-ai-required-controls). Each must become a live risk-register entry when the feature is designed.

## 2. Current risks

| ID | Risk | L | I | Score | Controls | Status |
|---|---|---|---|---|---|---|
| R-028 | AI-assisted code changes introduce defects or weaken security controls | 3 | 3 | 9 | Branch-based PRs; type-check baseline; append-only audit trail; `check-ai-scope.mjs` to detect an accidental runtime AI dependency. Gap: human PR review is not enforced. | Open, in register |
| AI-C0 | Scope statement goes stale: AI is added without governance | 2 | 4 | 8 | `scripts/ai/check-ai-scope.mjs` tripwire; review triggers in ai-governance.md section 2 | New control. Wire into CI to reach "effective". |

## 3. Conditional risks (if AI is introduced)

Inherent scores assume an AI scheduling-recommendation feature with no controls. The target is the residual score once the [section 5 controls](./ai-governance.md#5-introducing-ai-required-controls) are in place.

| ID | Risk | Inherent L×I | Key controls | Target residual |
|---|---|---|---|---|
| AI-C1 | AI proposes an ineligible, unqualified, expired-currency or on-leave person, and it is applied | 4×5 = 20 | Advisory only; proposals applied via existing store actions that re-run `scoreCandidate`; server-side rule enforcement as a precondition (close R-001, R-003); no `manual_override` for AI | 1×5 = 5 |
| AI-C2 | AI performs a prohibited autonomous action (eligibility, qualifications, leave approval, permissions, security config, bulk/destructive ops) | 3×5 = 15 | Read-only AI endpoint with no write routes; prohibited categories are not one-click applicable; existing RBAC | 1×5 = 5 |
| AI-C3 | Personal or operational data is disclosed to a provider (names, contact details, leave reasons), or used for provider training | 3×4 = 12 | Data minimisation (IDs/codes); provider terms reviewed; AI Gateway; no free-text fields sent | 2×3 = 6 |
| AI-C4 | A provider outage or latency blocks scheduling | 3×4 = 12 | AI off the critical path; timeout; UI fallback to manual and Auto-Fill; kill switch | 2×1 = 2 |
| AI-C5 | Plausible but poor recommendations (unfair workload, rotation drift) are accepted uncritically (automation bias) | 3×3 = 9 | Per-change accept/reject with rule-check results shown; monitor acceptance and rule-rejection rates; quarterly review | 2×2 = 4 |
| AI-C6 | Prompt injection via user-controlled text (notes, names) alters the output | 2×3 = 6 | Exclude free text; Zod-validate output; output can only propose, never act | 1×2 = 2 |
| AI-C7 | Secrets or prompt content leak through logs | 2×4 = 8 | Metadata-only audit logging; `lib/audit/redact.ts`; no prompt/response bodies by default | 1×3 = 3 |
| AI-C8 | Model or version change silently alters behaviour | 3×3 = 9 | Pinned model ID; prompt-template version logged per request; rule-rejection alert | 1×3 = 3 |
| AI-C9 | No accountability: who accepted an AI change cannot be shown | 3×3 = 9 | Request ID linked to accept/reject events in the hash-chained `audit.event` | 1×2 = 2 |

## 4. Impact on individuals

There is no current impact, because no AI-driven decision affects staff. If AI-C1/C2 controls fail, the people affected would be staff wrongly rostered onto positions they aren't current for, which is a safety and compliance impact. That is why server-side deterministic rule enforcement is a hard precondition, not an optional control.

## 5. Review

Re-assess on any trigger in [ai-governance.md section 2](./ai-governance.md#2-keeping-the-scope-statement-true), or annually (next: 2027-05-10).
