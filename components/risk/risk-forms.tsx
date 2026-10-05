"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  BASES,
  EFFECTIVENESS,
  REVIEW_OUTCOMES,
  RISK_CATEGORIES,
  score,
  STRATEGIES,
  TREATMENT_STATUSES,
  type Control,
  type PatchRiskInput,
  type Risk,
  type Treatment,
} from "@/lib/risk/model"
import { Field, IMPACT_OPTIONS, LIKELIHOOD_OPTIONS, NativeSelect, ScoreChip, STATUS_LABEL, toOptions } from "./risk-ui"

type Submit = (patch: PatchRiskInput) => Promise<boolean>
type FormProps = { risk: Risk; submit: Submit; busy: boolean }
type Without<T> = T extends unknown ? Omit<T, "version"> : never
const localId = () => crypto.randomUUID().slice(0, 8)

function Actions({ busy, label, disabled }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end">
      <Button type="submit" size="sm" disabled={busy || disabled}>
        {busy ? "Saving…" : label}
      </Button>
    </div>
  )
}

function useSubmit(risk: Risk, submit: Submit) {
  return (patch: Without<PatchRiskInput>) => (e: React.FormEvent) => {
    e.preventDefault()
    void submit({ ...patch, version: risk.version } as PatchRiskInput)
  }
}

export function DetailsForm({ risk, submit, busy }: FormProps) {
  const [f, setF] = useState({
    title: risk.title,
    category: risk.category,
    basis: risk.basis as string,
    description: risk.description,
    cause: risk.cause,
    consequence: risk.consequence,
    assets: risk.assets.join(", "),
    likelihood: String(risk.likelihood),
    impact: String(risk.impact),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }))
  const on = useSubmit(risk, submit)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={on({
        op: "update",
        fields: {
          title: f.title,
          category: f.category as Risk["category"] as never,
          basis: f.basis as Risk["basis"],
          description: f.description,
          cause: f.cause,
          consequence: f.consequence,
          assets: f.assets.split(",").map((s) => s.trim()).filter(Boolean),
          likelihood: Number(f.likelihood),
          impact: Number(f.impact),
        },
      })}
    >
      <Field label="Title" htmlFor="d-title">
        <Input id="d-title" required value={f.title} onChange={set("title")} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" htmlFor="d-cat">
          <NativeSelect id="d-cat" value={f.category} onChange={set("category")} options={toOptions(RISK_CATEGORIES)} />
        </Field>
        <Field label="Basis" htmlFor="d-basis">
          <NativeSelect id="d-basis" value={f.basis} onChange={set("basis")} options={toOptions(BASES)} />
        </Field>
      </div>
      <Field label="Description" htmlFor="d-desc">
        <Textarea id="d-desc" rows={2} value={f.description} onChange={set("description")} />
      </Field>
      <Field label="Cause" htmlFor="d-cause">
        <Textarea id="d-cause" rows={2} value={f.cause} onChange={set("cause")} />
      </Field>
      <Field label="Potential consequence" htmlFor="d-cons">
        <Textarea id="d-cons" rows={2} value={f.consequence} onChange={set("consequence")} />
      </Field>
      <Field label="Affected assets / processes" htmlFor="d-assets" hint="Comma-separated">
        <Input id="d-assets" value={f.assets} onChange={set("assets")} />
      </Field>
      <div className="grid items-end gap-3 sm:grid-cols-3">
        <Field label="Inherent likelihood" htmlFor="d-l">
          <NativeSelect id="d-l" value={f.likelihood} onChange={set("likelihood")} options={LIKELIHOOD_OPTIONS} />
        </Field>
        <Field label="Inherent impact" htmlFor="d-i">
          <NativeSelect id="d-i" value={f.impact} onChange={set("impact")} options={IMPACT_OPTIONS} />
        </Field>
        <div className="flex h-9 items-center">
          <ScoreChip value={score(Number(f.likelihood), Number(f.impact))} />
        </div>
      </div>
      <Actions busy={busy} label="Save details" />
    </form>
  )
}

export function OwnersForm({ risk, submit, busy }: FormProps) {
  const [riskOwner, setRiskOwner] = useState(risk.riskOwner ?? "")
  const [treatmentOwner, setTreatmentOwner] = useState(risk.treatmentOwner ?? "")
  const on = useSubmit(risk, submit)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={on({ op: "assign_owners", riskOwner: riskOwner.trim() || null, treatmentOwner: treatmentOwner.trim() || null })}
    >
      <Field label="Risk owner" htmlFor="o-risk" hint="Accountable for the risk and for accepting it.">
        <Input id="o-risk" maxLength={120} value={riskOwner} onChange={(e) => setRiskOwner(e.target.value)} />
      </Field>
      <Field label="Treatment owner" htmlFor="o-treat" hint="Responsible for delivering the treatment plan.">
        <Input id="o-treat" maxLength={120} value={treatmentOwner} onChange={(e) => setTreatmentOwner(e.target.value)} />
      </Field>
      <Actions busy={busy} label="Assign owners" />
    </form>
  )
}

export function ControlsForm({ risk, submit, busy }: FormProps) {
  const [controls, setControls] = useState<Control[]>(risk.controls)
  const [overall, setOverall] = useState<string>(risk.controlEffectiveness)
  const update = (i: number, patch: Partial<Control>) => setControls((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const on = useSubmit(risk, submit)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={on({
        op: "record_controls",
        controls: controls.filter((c) => c.description.trim()),
        controlEffectiveness: overall as Risk["controlEffectiveness"],
      })}
    >
      {controls.length === 0 ? <p className="text-sm text-muted-foreground">No controls recorded.</p> : null}
      {controls.map((c, i) => (
        <div key={c.id} className="flex items-start gap-2">
          <Input
            aria-label={`Control ${i + 1} description`}
            className="flex-1"
            value={c.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <NativeSelect
            aria-label={`Control ${i + 1} effectiveness`}
            className="w-28"
            value={c.effectiveness}
            onChange={(e) => update(i, { effectiveness: e.target.value as Control["effectiveness"] })}
            options={toOptions(EFFECTIVENESS)}
          />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove control ${i + 1}`} onClick={() => setControls((cs) => cs.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setControls((cs) => [...cs, { id: localId(), description: "", effectiveness: "partial" }])}
      >
        <Plus className="size-4" /> Add control
      </Button>
      <Field label="Overall control effectiveness" htmlFor="c-overall">
        <NativeSelect id="c-overall" value={overall} onChange={(e) => setOverall(e.target.value)} options={toOptions(EFFECTIVENESS)} />
      </Field>
      <Actions busy={busy} label="Record controls" />
    </form>
  )
}

export function TreatmentForm({ risk, submit, busy }: FormProps) {
  const [strategy, setStrategy] = useState<string>(risk.treatmentStrategy === "accept" ? "reduce" : risk.treatmentStrategy)
  const [plan, setPlan] = useState(risk.treatmentPlan)
  const [actions, setActions] = useState<Treatment[]>(risk.treatments)
  const [targetDate, setTargetDate] = useState(risk.targetDate ?? "")
  const [status, setStatus] = useState(["open", "treating", "mitigated"].includes(risk.status) ? risk.status : "open")
  const update = (i: number, patch: Partial<Treatment>) => setActions((a) => a.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const on = useSubmit(risk, submit)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={on({
        op: "record_treatment",
        strategy: strategy as Risk["treatmentStrategy"],
        plan,
        treatments: actions.filter((t) => t.action.trim()),
        targetDate: targetDate || null,
        status: status as "open" | "treating" | "mitigated",
      })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Strategy" htmlFor="t-strategy" hint="Use 'Accept' below for formal acceptance.">
          <NativeSelect id="t-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)} options={toOptions(STRATEGIES.filter((s) => s !== "accept"))} />
        </Field>
        <Field label="Status" htmlFor="t-status">
          <NativeSelect
            id="t-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={["open", "treating", "mitigated"].map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
        </Field>
      </div>
      <Field label="Treatment plan" htmlFor="t-plan">
        <Textarea id="t-plan" rows={3} value={plan} onChange={(e) => setPlan(e.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">Treatment actions</legend>
        {actions.map((t, i) => (
          <div key={t.id} className="flex flex-col gap-2 rounded-md border border-border p-2">
            <div className="flex gap-2">
              <Input aria-label={`Action ${i + 1}`} className="flex-1" value={t.action} onChange={(e) => update(i, { action: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove action ${i + 1}`} onClick={() => setActions((a) => a.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input aria-label={`Action ${i + 1} owner`} placeholder="Owner" value={t.owner ?? ""} onChange={(e) => update(i, { owner: e.target.value || null })} />
              <Input aria-label={`Action ${i + 1} target date`} type="date" value={t.targetDate ?? ""} onChange={(e) => update(i, { targetDate: e.target.value || null })} />
              <NativeSelect aria-label={`Action ${i + 1} status`} value={t.status} onChange={(e) => update(i, { status: e.target.value as Treatment["status"] })} options={toOptions(TREATMENT_STATUSES)} />
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setActions((a) => [...a, { id: localId(), action: "", owner: risk.treatmentOwner, targetDate: null, status: "planned" }])}
        >
          <Plus className="size-4" /> Add action
        </Button>
      </fieldset>
      <Field label="Target date" htmlFor="t-date">
        <Input id="t-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <Actions busy={busy} label="Record treatment" />
    </form>
  )
}

function RatingPair({ prefix, l, i, setL, setI }: { prefix: string; l: string; i: string; setL: (v: string) => void; setI: (v: string) => void }) {
  return (
    <div className="grid items-end gap-3 sm:grid-cols-3">
      <Field label="Residual likelihood" htmlFor={`${prefix}-l`}>
        <NativeSelect id={`${prefix}-l`} value={l} onChange={(e) => setL(e.target.value)} options={LIKELIHOOD_OPTIONS} />
      </Field>
      <Field label="Residual impact" htmlFor={`${prefix}-i`}>
        <NativeSelect id={`${prefix}-i`} value={i} onChange={(e) => setI(e.target.value)} options={IMPACT_OPTIONS} />
      </Field>
      <div className="flex h-9 items-center">
        <ScoreChip value={score(Number(l), Number(i))} />
      </div>
    </div>
  )
}

export function ResidualForm({ risk, submit, busy }: FormProps) {
  const [l, setL] = useState(String(risk.residualLikelihood))
  const [i, setI] = useState(String(risk.residualImpact))
  const [reason, setReason] = useState("")
  const on = useSubmit(risk, submit)
  return (
    <form className="flex flex-col gap-3" onSubmit={on({ op: "update_residual", residualLikelihood: Number(l), residualImpact: Number(i), reason })}>
      <RatingPair prefix="r" l={l} i={i} setL={setL} setI={setI} />
      <Field label="Reason" htmlFor="r-reason" hint="Recorded in the audit trail.">
        <Textarea id="r-reason" rows={2} required value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Actions busy={busy} label="Update residual risk" disabled={!reason.trim()} />
    </form>
  )
}

export function ReviewForm({ risk, submit, busy }: FormProps) {
  const [outcome, setOutcome] = useState<string>("no_change")
  const [notes, setNotes] = useState("")
  const [l, setL] = useState(String(risk.residualLikelihood))
  const [i, setI] = useState(String(risk.residualImpact))
  const [next, setNext] = useState("")
  const on = useSubmit(risk, submit)
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={on({
        op: "record_review",
        outcome: outcome as (typeof REVIEW_OUTCOMES)[number],
        notes,
        residualLikelihood: Number(l),
        residualImpact: Number(i),
        nextReviewDate: next || null,
      })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Outcome" htmlFor="v-outcome">
          <NativeSelect id="v-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} options={toOptions(REVIEW_OUTCOMES)} />
        </Field>
        <Field label="Next review date" htmlFor="v-next">
          <Input id="v-next" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
      <RatingPair prefix="v" l={l} i={i} setL={setL} setI={setI} />
      <Field label="Review notes" htmlFor="v-notes">
        <Textarea id="v-notes" rows={3} required value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Actions busy={busy} label="Record review" disabled={!notes.trim()} />
    </form>
  )
}

export function DispositionForm({ risk, submit, busy }: FormProps) {
  const [rationale, setRationale] = useState("")
  const [reason, setReason] = useState("")
  const on = useSubmit(risk, submit)
  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-col gap-3" onSubmit={on({ op: "accept", rationale })}>
        <Field
          label="Accept risk"
          htmlFor="a-rationale"
          hint={`Records you as approver on today's date. Residual score ${risk.residualScore} will be tolerated without further treatment.`}
        >
          <Textarea id="a-rationale" rows={2} placeholder="Rationale for acceptance" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </Field>
        <Actions busy={busy} label="Accept risk" disabled={!rationale.trim() || risk.status === "accepted"} />
      </form>
      <form className="flex flex-col gap-3" onSubmit={on({ op: "close", reason })}>
        <Field label="Close risk" htmlFor="x-reason" hint="Closed risks become read-only. Risks are never deleted.">
          <Textarea id="x-reason" rows={2} placeholder="Why is this risk no longer relevant?" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="destructive" disabled={busy || !reason.trim()}>
            Close risk
          </Button>
        </div>
      </form>
    </div>
  )
}
