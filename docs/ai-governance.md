# AI Governance

Status: **AI is currently outside the runtime scope of Sim-Roaster.**
Last assessed: 2026-05-10. Owner: Technical Lead.

This document supports alignment with ISO/IEC 42001:2023 (AI management systems). It is **not** a claim of ISO/IEC 42001 certification or conformity. No certification body has assessed this system.

Related documents: [ai-system-inventory.md](./ai-system-inventory.md), [ai-risk-assessment.md](./ai-risk-assessment.md), [risk-register.md](./risk-register.md) (R-028).

---

## 1. Scope determination

The question is whether any Sim-Roaster functionality is an *AI system* (a machine-based system that infers how to generate outputs, such as predictions, recommendations or content, from inputs). It also asks whether the app relies on an external AI, ML or LLM service.

### Evidence examined

| Check | Result |
|---|---|
| `package.json` dependencies | No AI SDK, model provider, ML runtime, vector database or embedding library. Full list: `@autonoma-ai/sdk`, `@base-ui/react`, `@vercel/analytics`, `@vercel/blob`, `better-auth`, `class-variance-authority`, `clsx`, `drizzle-orm`, `lucide-react`, `next`, `next-themes`, `pg`, `react`, `react-dom`, `recharts`, `resend`, `server-only`, `shadcn`, `sonner`, `swr`, `tailwind-merge`, `tw-animate-css`, `zod` (plus build tooling). |
| Source search (`app/`, `components/`, `lib/`, `scripts/`) | No imports of `ai`, `@ai-sdk/*`, `openai`, `@anthropic-ai/*` or LangChain. No `generateText`/`streamText` calls, and no calls to model-provider hosts. |
| Environment variables (`config/dependencies.json`, project vars) | No model-provider or AI Gateway keys are referenced by the code. The `ai-services` entry in `config/dependencies.json` is marked "Not used". |
| `@autonoma-ai/sdk` | Despite the name, this is an HMAC-verified test-data protocol layer (`discover`/`up`/`down`) used by `app/api/autonoma/route.ts`. It runs app-defined factories and does not call a model. It is not an AI system within Sim-Roaster. |
| Auto-Fill Positions (`components/fill-positions-dialog.tsx` → `fillPositions` in `lib/store.tsx`) | **Deterministic rule-based assignment**, not AI. See 1.1. |

### 1.1 Why Auto-Fill is not AI

`fillPositions` is a greedy assigner with fixed, human-authored rules:

1. Candidates must be `active`, hold the position as a home position, and not already be seated on the run.
2. `scoreCandidate(staffId, positionId, date)` must return non-null. That function applies the existing eligibility, leave, availability, training and validity/currency rules. Ineligible staff are excluded, not down-ranked.
3. The remaining candidates are sorted by a fixed comparator in this order: expiring currency first, then same-day position stickiness, avoiding yesterday's position, fewest times on the position, lowest workload, currency score, and finally `staffId` as a total-order tie-break.
4. The first candidate is picked.

Identical inputs always produce the same output. There is no learned model, no training data, no randomness and no statistical inference. The `allowOverride` argument is accepted but **not used** (`_allowOverride`), so Auto-Fill never seats an ineligible person. A manual override remains a separate, permission-gated human action (`manual_override`).

It is therefore governed as ordinary scheduling logic, through code review, the audit trail and the risk register. It is not governed as an AI system.

### 1.2 AI used in development (out of runtime scope)

The codebase is developed with AI coding assistance (v0 branches, `AGENTS.md`). That is a software-development supply-chain concern, not an AI system operated by Sim-Roaster. It is tracked as risk **R-028** (control: human review of every AI-generated pull request, plus type-check and test gates).

### 1.3 Conclusion

No AI system is in scope. The AI system inventory is empty, and the AI risk assessment covers only conditional and development-time risks. AI was **not** added to satisfy ISO/IEC 42001.

---

## 2. Keeping the scope statement true

The statement above remains valid only while it can be checked. The control is:

```bash
node scripts/ai/check-ai-scope.mjs
```

The script is read-only and needs no credentials. It exits `1` if any of the following appear:
- an AI/ML package
- an AI SDK import or call
- a model-provider endpoint
- a provider API-key environment variable

Run it in CI or before merging. A failure means section 5 must be completed before release. `@autonoma-ai/sdk` is on its reviewed allow-list. Any new allow-list entry needs a written justification in this document.

Review triggers that re-open this assessment:
- `check-ai-scope.mjs` fails
- a feature proposal mentions recommendations, prediction, summarisation, chat, natural-language input, or "smart"/"intelligent" scheduling
- a new third-party service is added to `config/dependencies.json` with `kind: "ai"`
- annual review (next: 2027-05-10)

---

## 3. Roles

| Role | Responsibility |
|---|---|
| Technical Lead (AI owner) | Owns this document and the scope decision, approves any AI introduction, and maintains the inventory. |
| Admin | Configures permissions. Would approve enabling any AI feature per environment. |
| Scheduler/manager users | Remain the decision-makers for all roster changes. |

---

## 4. Policy that applies now and later

These rules apply to any future AI feature. They are recorded now so that design starts from them.

1. **AI output is advisory.** Any AI output is a *recommendation*. It is never written to authoritative state (assignments, staff, qualifications, leave, users, roles, settings) without a human confirmation step by a user who already holds the permission for that change.
2. **Deterministic rules stay authoritative.** Eligibility, qualification, leave, validity/currency and authorization checks run on every AI-proposed change exactly as they do for a manual change. AI cannot relax, override or bypass them. AI cannot use `manual_override`.
3. **Prohibited autonomous actions.** Without explicit, authorized human confirmation, AI must never:
   - change staff eligibility or qualifications
   - override validity/currency requirements
   - approve leave
   - change user permissions or roles
   - change security controls or configuration
   - perform destructive or bulk operations (restore, delete, clear positions, bulk edits)
4. **Manual path always works.** Loss of an AI provider must not affect manual scheduling, Auto-Fill, or any existing workflow.
5. **Minimal data.** Send the minimum data needed. Prefer IDs and codes over names. Never send credentials, session tokens, contact details, free-text notes or health/leave reasons unless a documented assessment justifies it.
6. **Logged, not leaked.** Every AI request is logged as metadata (section 5.3). Prompt and response bodies and secrets are not logged by default.
7. **No certification claims.** Product and marketing material must not claim ISO/IEC 42001 certification.

---

## 5. Introducing AI: required controls

If AI is proposed, all items below must be in place before it reaches production. Record completion by adding an entry to [ai-system-inventory.md](./ai-system-inventory.md) and a risk entry in the register.

### 5.1 Before build
- [ ] Impact assessment completed in [ai-risk-assessment.md](./ai-risk-assessment.md) (intended use, affected people, decision impact, misuse).
- [ ] Inventory entry drafted, with all fields filled.
- [ ] Data-flow review: which slices and fields leave the system, which provider and region, and the provider's retention and training-use terms.
- [ ] Provider access via Vercel AI Gateway (no provider keys in code), and a model ID pinned to an explicit version.
- [ ] **Precondition:** scheduling rules enforced server-side. Today the rules run in the client store (`lib/store.tsx`), and `/api/state` validates the shape of the payload, not roster rules. AI-proposed changes must pass a server-side rule check before they are persisted. Risk register **R-001** (scheduling rules enforced only in the browser) and **R-003** (eligibility reads static reference data) must be closed first.

### 5.2 Human oversight design
- [ ] The AI endpoint is **read-only**. It returns a proposal object and never calls `/api/state`, backup, restore or user routes.
- [ ] Proposals are applied through the existing store actions (for example `assignStaff`). Those actions re-run `scoreCandidate` and permission checks, so an invalid proposal is rejected exactly as a manual one would be.
- [ ] The UI shows each proposed change with its rule-check result. The user must accept or reject each change, or a reviewed batch, explicitly. Nothing is pre-applied.
- [ ] Proposals that touch any prohibited category in section 4.3 are not offered for one-click apply.
- [ ] The feature is behind an Admin-controlled flag with a kill switch.

### 5.3 Logging
Write to the existing append-only, hash-chained audit trail (`audit.event`, via `recordAudit`/`withAudit` in `lib/audit/log.ts`) using these actions:
- `ai.request`
- `ai.recommendation.accepted`
- `ai.recommendation.rejected`
- `ai.recommendation.partial`

| Field | Source |
|---|---|
| AI request identifier | Server-generated UUID, returned to the client and echoed on accept/reject |
| Model/provider | Pinned gateway model ID (for example `provider/model@version`) |
| Purpose | Fixed enum per feature (for example `schedule.suggest`) |
| Timestamp | Audit event timestamp |
| Requesting user | Session user ID and role (actor) |
| Configuration/version | Feature-flag state, prompt-template version and app commit SHA |
| Result status | `ok`, `timeout`, `provider_error`, `rate_limited`, `invalid_output`, `rule_rejected` |
| Human decision | Accepted/rejected/partial, with counts of changes per outcome |

Do **not** log prompt bodies, raw model output, staff names, notes or secrets. Run metadata through `lib/audit/redact.ts`. If debugging needs content, use a separately approved, time-boxed sampling store with restricted access.

### 5.4 Graceful failure
- [ ] Hard timeout (target 10 s) and bounded retries. On any failure the UI shows "Suggestions unavailable. Schedule manually or use Auto-Fill." and every other control stays enabled.
- [ ] The AI call is never on the load, save, Auto-Fill or notify paths, so an outage cannot block them.
- [ ] Malformed or schema-invalid output is discarded (Zod-validated) and logged as `invalid_output`.
- [ ] Rate-limit the endpoint per user (`lib/security/rate-limit.ts`).
- [ ] Provider outage is covered in [disaster-recovery.md](./disaster-recovery.md) as a tier-4, non-critical dependency.

### 5.5 Monitoring
- [ ] Track the acceptance rate, rule-rejection rate (proposals the deterministic rules refused), error and timeout rate, and latency, from audit events.
- [ ] Alert if the rule-rejection rate rises above an agreed threshold. That is a signal of model or prompt drift.
- [ ] Review the inventory entry and risk assessment quarterly while the feature is live.

### 5.6 Release gate
- [ ] `check-ai-scope.mjs` allow-list updated with justification, and section 1 of this document rewritten.
- [ ] Tests prove that an AI proposal for an ineligible, expired or on-leave person is rejected by the existing rules.
- [ ] Tests prove the manual workflow works with the provider unreachable.
- [ ] Technical Lead and Admin sign-off recorded.
