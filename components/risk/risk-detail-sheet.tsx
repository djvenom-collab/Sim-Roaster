"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import type { PatchRiskInput, Risk, RiskReview } from "@/lib/risk/model"
import { ControlsForm, DetailsForm, DispositionForm, OwnersForm, ResidualForm, ReviewForm, TreatmentForm } from "./risk-forms"
import { ERROR_TEXT, riskFetcher, riskRequest, ScoreChip, STATUS_LABEL } from "./risk-ui"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-pretty">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  )
}

function Overview({ risk, reviews }: { risk: Risk; reviews: RiskReview[] }) {
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-2">
        <Row label="Description">{risk.description}</Row>
        <Row label="Cause">{risk.cause}</Row>
        <Row label="Consequence">{risk.consequence}</Row>
        <Row label="Assets">{risk.assets.join(", ")}</Row>
        <Row label="Risk owner">{risk.riskOwner}</Row>
        <Row label="Treatment owner">{risk.treatmentOwner}</Row>
        <Row label="Strategy">
          <span className="capitalize">{risk.treatmentStrategy}</span>
          {risk.treatmentPlan ? ` — ${risk.treatmentPlan}` : null}
        </Row>
        <Row label="Target date">{risk.targetDate}</Row>
        <Row label="Review date">{risk.reviewDate}</Row>
        {risk.acceptance ? (
          <Row label="Accepted">
            {risk.acceptance.approvedOn} by {risk.acceptance.approvedBy ?? "unknown"}: {risk.acceptance.rationale}
          </Row>
        ) : null}
        {risk.closedAt ? <Row label="Closed">{`${risk.closedAt.slice(0, 10)}: ${risk.closureReason}`}</Row> : null}
      </dl>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Controls · {risk.controlEffectiveness}</h3>
        {risk.controls.length === 0 ? <p className="text-sm text-muted-foreground">None recorded.</p> : null}
        <ul className="flex flex-col gap-1">
          {risk.controls.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-pretty">{c.description}</span>
              <Badge variant="outline" className="shrink-0 capitalize">{c.effectiveness}</Badge>
            </li>
          ))}
        </ul>
      </section>

      {risk.evidence.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Evidence</h3>
          <ul className="flex flex-col gap-1.5">
            {risk.evidence.map((e) => (
              <li key={e.ref} className="text-sm">
                <code className="break-all font-mono text-xs">{e.ref}</code>
                {e.note ? <span className="text-muted-foreground"> — {e.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Review history</h3>
        {reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews recorded.</p> : null}
        <ol className="flex flex-col gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border-l-2 border-border pl-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{r.reviewedAt.slice(0, 16).replace("T", " ")}</span>
                <span className="text-muted-foreground">{r.reviewerEmail}</span>
                <Badge variant="secondary">{r.outcome.replaceAll("_", " ")}</Badge>
                <ScoreChip value={r.residualLikelihood * r.residualImpact} />
              </div>
              <p className="text-pretty">{r.notes}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

export function RiskDetailSheet({ riskId, onClose, onChanged }: { riskId: string | null; onClose: () => void; onChanged: () => void }) {
  const { data, mutate } = useSWR<{ risk: Risk; reviews: RiskReview[] }>(riskId ? `/api/risks/${riskId}` : null, riskFetcher)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState("overview")
  const risk = data?.risk
  const closed = risk?.status === "closed"

  async function submit(patch: PatchRiskInput) {
    if (!risk) return false
    setBusy(true)
    try {
      await riskRequest(`/api/risks/${risk.id}`, "PATCH", patch)
      toast.success("Saved and recorded in the audit trail")
      await mutate()
      onChanged()
      setTab("overview")
      return true
    } catch (error) {
      const code = (error as Error).message
      toast.error(ERROR_TEXT[code] ?? "Could not save the change")
      if (code === "version_conflict") await mutate()
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={riskId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {risk ? (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{risk.id}</span>
                <Badge variant={risk.basis === "observed" ? "default" : "outline"} className="capitalize">{risk.basis}</Badge>
                <Badge variant="secondary">{STATUS_LABEL[risk.status]}</Badge>
              </div>
              <SheetTitle className="text-balance">{risk.title}</SheetTitle>
              <SheetDescription>
                {risk.category} · Inherent <ScoreChip value={risk.inherentScore} /> → Residual <ScoreChip value={risk.residualScore} />
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <TabsList className="flex h-auto flex-wrap">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  {!closed ? (
                    <>
                      <TabsTrigger value="details">Details</TabsTrigger>
                      <TabsTrigger value="owners">Owners</TabsTrigger>
                      <TabsTrigger value="controls">Controls</TabsTrigger>
                      <TabsTrigger value="treatment">Treatment</TabsTrigger>
                      <TabsTrigger value="residual">Residual</TabsTrigger>
                      <TabsTrigger value="review">Review</TabsTrigger>
                      <TabsTrigger value="disposition">Accept / close</TabsTrigger>
                    </>
                  ) : null}
                </TabsList>
                <div key={risk.version} className="mt-4">
                  <TabsContent value="overview"><Overview risk={risk} reviews={data.reviews} /></TabsContent>
                  {!closed ? (
                    <>
                      <TabsContent value="details"><DetailsForm risk={risk} submit={submit} busy={busy} /></TabsContent>
                      <TabsContent value="owners"><OwnersForm risk={risk} submit={submit} busy={busy} /></TabsContent>
                      <TabsContent value="controls"><ControlsForm risk={risk} submit={submit} busy={busy} /></TabsContent>
                      <TabsContent value="treatment"><TreatmentForm risk={risk} submit={submit} busy={busy} /></TabsContent>
                      <TabsContent value="residual"><ResidualForm risk={risk} submit={submit} busy={busy} /></TabsContent>
                      <TabsContent value="review"><ReviewForm risk={risk} submit={submit} busy={busy} /></TabsContent>
                      <TabsContent value="disposition"><DispositionForm risk={risk} submit={submit} busy={busy} /></TabsContent>
                    </>
                  ) : null}
                </div>
              </Tabs>
            </div>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Loading risk…</SheetTitle>
            <SheetDescription>Fetching the latest version.</SheetDescription>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  )
}
