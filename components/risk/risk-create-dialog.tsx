"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { BASES, RISK_CATEGORIES, score, type Risk } from "@/lib/risk/model"
import { ERROR_TEXT, Field, IMPACT_OPTIONS, LIKELIHOOD_OPTIONS, NativeSelect, riskRequest, ScoreChip, toOptions } from "./risk-ui"

const EMPTY = {
  title: "",
  category: RISK_CATEGORIES[0] as string,
  basis: "potential",
  description: "",
  cause: "",
  consequence: "",
  assets: "",
  likelihood: "3",
  impact: "3",
  riskOwner: "",
  reviewDate: "",
}

export function RiskCreateDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (r: Risk) => void }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const { risk } = await riskRequest<{ risk: Risk }>("/api/risks", "POST", {
        op: "create",
        risk: {
          title: form.title,
          category: form.category,
          basis: form.basis,
          description: form.description,
          cause: form.cause,
          consequence: form.consequence,
          assets: form.assets.split(",").map((s) => s.trim()).filter(Boolean),
          likelihood: Number(form.likelihood),
          impact: Number(form.impact),
          riskOwner: form.riskOwner.trim() || null,
          reviewDate: form.reviewDate || null,
        },
      })
      toast.success(`${risk.id} created`)
      setForm(EMPTY)
      onCreated(risk)
    } catch (error) {
      toast.error(ERROR_TEXT[(error as Error).message] ?? "Could not create risk")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New risk</DialogTitle>
            <DialogDescription>Residual rating starts equal to inherent until controls are recorded.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="nr-title">
            <Input id="nr-title" required maxLength={200} value={form.title} onChange={set("title")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="nr-cat">
              <NativeSelect id="nr-cat" value={form.category} onChange={set("category")} options={toOptions(RISK_CATEGORIES)} />
            </Field>
            <Field label="Basis" htmlFor="nr-basis" hint="Observed = evidenced in the system; potential = plausible, not yet seen.">
              <NativeSelect id="nr-basis" value={form.basis} onChange={set("basis")} options={toOptions(BASES)} />
            </Field>
          </div>
          <Field label="Description" htmlFor="nr-desc">
            <Textarea id="nr-desc" rows={2} value={form.description} onChange={set("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cause" htmlFor="nr-cause">
              <Textarea id="nr-cause" rows={2} value={form.cause} onChange={set("cause")} />
            </Field>
            <Field label="Potential consequence" htmlFor="nr-cons">
              <Textarea id="nr-cons" rows={2} value={form.consequence} onChange={set("consequence")} />
            </Field>
          </div>
          <Field label="Affected assets / processes" htmlFor="nr-assets" hint="Comma-separated">
            <Input id="nr-assets" value={form.assets} onChange={set("assets")} />
          </Field>
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <Field label="Likelihood" htmlFor="nr-l">
              <NativeSelect id="nr-l" value={form.likelihood} onChange={set("likelihood")} options={LIKELIHOOD_OPTIONS} />
            </Field>
            <Field label="Impact" htmlFor="nr-i">
              <NativeSelect id="nr-i" value={form.impact} onChange={set("impact")} options={IMPACT_OPTIONS} />
            </Field>
            <div className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
              Inherent <ScoreChip value={score(Number(form.likelihood), Number(form.impact))} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Risk owner" htmlFor="nr-owner">
              <Input id="nr-owner" maxLength={120} value={form.riskOwner} onChange={set("riskOwner")} />
            </Field>
            <Field label="Review date" htmlFor="nr-review">
              <Input id="nr-review" type="date" value={form.reviewDate} onChange={set("reviewDate")} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.title.trim()}>
              {busy ? "Creating…" : "Create risk"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
