"use client"

/* ===========================================================================
 * SEATING PLAN / AVAILABILITY PAGE ("/seating") — who can sit where
 * ===========================================================================
 * For a chosen date, lists each active run and every required position as a
 * card, showing the assigned person plus live checks: currency status, hard
 * "blocks" (red), soft "warnings" (amber), or "qualified & available" (green).
 * You can assign/swap staff inline and notify them.
 *
 * The eligibility logic comes from evaluateAssignment() in
 * lib/assignment-eval.ts; this page only displays the result and lets you act
 * on it. Data is limited to the active RADAR/TOWER program.
 * =========================================================================== */
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { useDeepLinkHighlight, HIGHLIGHT_RING } from "@/lib/use-deep-link"
import { cn } from "@/lib/utils"
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared"
import { FillPositionsDialog } from "@/components/fill-positions-dialog"
import { StaffAssignPopover } from "@/components/staff-assign-popover"
import { NotifyRunDialog } from "@/components/notify-run-dialog"
import { NotifyStaffButton } from "@/components/notify-staff-button"
import { evaluateAssignment } from "@/lib/assignment-eval"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { DayNavigator } from "@/components/day-navigator"
import { Check, AlertTriangle, Ban, UserCog, CalendarX2, Link2, GraduationCap } from "lucide-react"
import { formatDate } from "@/lib/dates"
import { useScopedDate } from "@/lib/use-scoped-date"
import type { Run } from "@/lib/types"

export default function SeatingPage() {
  const store = useStore()
  const [date, setDate] = useScopedDate()

  // Deep link: /seating?run=<id> jumps to that run's date, scrolls to its card
  // and highlights it.
  const highlightRun = useDeepLinkHighlight("run", "run", (id) => {
    const run = store.scopedRuns.find((r) => r.id === id)
    if (run) setDate(run.date)
  })

  const runs = store.scopedRuns
    .filter((r) => r.date === date && r.status !== "cancelled")
    .sort((a, b) => a.slotTime.localeCompare(b.slotTime))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seating Plan"
        description="Assign staff to required positions with live validity and qualification checks."
        actions={<FillPositionsDialog scopeDate={date} />}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DayNavigator date={date} onDateChange={setDate} />
        <span className="text-sm text-muted-foreground">
          {formatDate(date)} · {runs.length} run(s)
        </span>
      </div>

      {runs.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title="No active runs for this day"
          description="Pick another date or create runs in the Daily Run Planner."
        />
      ) : (
        runs.map((run) => {
          const ex = store.exerciseById(run.exerciseId)
          const sim = store.simulatorById(run.simulatorId)
          const assignments = store.assignmentsForRun(run.id)
          const filled = assignments.filter((a) => a.staffId).length
          const total = run.requiredPositions.length
          return (
            <Card
              key={run.id}
              id={`run-${run.id}`}
              className={cn("scroll-mt-24 transition-shadow", highlightRun === run.id && HIGHLIGHT_RING)}
            >
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 space-y-0">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base">
                    <span className="font-mono">{run.slotTime}</span>
                    <span>{ex?.code}</span>
                    <span className="font-normal text-muted-foreground">{ex?.name}</span>
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{sim?.code}</span>
                    <StatusBadge status={run.status} />
                    <Badge variant={filled === total ? "default" : "secondary"}>
                      {filled}/{total} positions
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {store.needsNotify(`run:${run.id}`) && (
                    <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="size-3" /> Changes not notified
                    </Badge>
                  )}
                  {filled > 0 && <NotifyRunDialog run={run} />}
                  <FillPositionsDialog scopeDate={date} singleRunId={run.id} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {run.requiredPositions.map((posId) => {
                    const pos = store.positionById(posId)
                    const a = assignments.find((x) => x.positionId === posId)
                    const staff = a?.staffId ? store.staffById(a.staffId) : null
                    // A flexible seat backs up a primary position: currency and
                    // eligibility that matter are those of the LINKED primary, so
                    // a support shift refreshes the person's validity there.
                    const isFlexible = pos?.category === "Flexible"
                    const linkedId = a?.linkedPositionId ?? null
                    const trainingMode = !!a?.trainingMode
                    const creditPosId = isFlexible && linkedId ? linkedId : posId
                    const linkedPos = linkedId ? store.positionById(linkedId) : null
                    const validity = staff ? store.validityFor(staff.id, creditPosId) : null
                    // Another position in this same run already occupied by this staff.
                    const dupPosId =
                      staff &&
                      assignments.find((x) => x.staffId === staff.id && x.positionId !== posId)?.positionId
                    const seatedAtInRun = dupPosId ? store.positionById(dupPosId)?.code ?? null : null
                    // Operational eligibility: a linked flexible seat checks the
                    // PRIMARY position; an UNLINKED flexible seat is a free support
                    // seat anyone may sit; and a TRAINING flexible seat waives the
                    // validation requirement entirely (an un-validated trainee may
                    // be seated). Otherwise the person must hold the position.
                    const isOperationalForSeat =
                      isFlexible && (trainingMode || !linkedId)
                        ? true
                        : staff
                          ? staff.homePositions.includes(creditPosId)
                          : false
                    const ev =
                      staff && validity
                        ? evaluateAssignment({
                            staffId: staff.id,
                            positionId: creditPosId,
                            exerciseId: run.exerciseId,
                            date: run.date,
                            validity,
                            onLeave: !!store.isOnLeave(staff.id, run.date),
                            inTraining: !!store.isInTraining(staff.id, run.date),
                            seatedAtInRun,
                            isOperational: isOperationalForSeat,
                          })
                        : null
                    return (
                      <div key={posId} className="rounded-lg border bg-card p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn("font-mono", isFlexible && "border-sky-500/40 text-sky-700 dark:text-sky-400")}
                            >
                              {pos?.code}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{pos?.name}</span>
                            {isFlexible && linkedPos && (
                              <Badge variant="secondary" className="gap-1 text-[10px]">
                                <Link2 className="size-2.5" /> {linkedPos.code}
                              </Badge>
                            )}
                            {isFlexible && trainingMode && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-400"
                              >
                                <GraduationCap className="size-2.5" /> Training
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {staff && (
                              <NotifyStaffButton run={run} staffId={staff.id} positionId={posId} />
                            )}
                            <StaffAssignPopover
                              run={run}
                              positionId={posId}
                              evalPositionId={isFlexible && linkedId ? linkedId : undefined}
                              freeSeat={isFlexible && (trainingMode || !linkedId)}
                              trigger={
                                <Button variant="ghost" size="icon" className="size-7">
                                  <UserCog className="size-4" />
                                </Button>
                              }
                            />
                          </div>
                        </div>
                        {staff && validity ? (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {staff.firstName} {staff.lastName}{" "}
                                <span className="text-muted-foreground">({staff.initials})</span>
                              </span>
                              <StatusBadge status={validity.status} className="h-5 px-1.5 text-[10px]" />
                            </div>
                            {a?.manualOverride && (
                              <Badge variant="destructive" className="text-[10px]">
                                Manual override
                              </Badge>
                            )}
                            <div className="space-y-0.5">
                              {ev && ev.blocks.length > 0 ? (
                                ev.blocks.map((b, i) => (
                                  <div key={i} className="flex items-center gap-1.5 text-xs text-red-600">
                                    <Ban className="size-3" /> {b}
                                  </div>
                                ))
                              ) : ev && ev.warnings.length > 0 ? (
                                ev.warnings.map((w, i) => (
                                  <div key={i} className="flex items-center gap-1.5 text-xs text-amber-600">
                                    <AlertTriangle className="size-3" /> {w}
                                  </div>
                                ))
                              ) : (
                                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                                  <Check className="size-3" /> Qualified &amp; available
                                </div>
                              )}
                              {isFlexible && trainingMode ? (
                                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                                  <GraduationCap className="size-3" /> Training seat — no currency recorded
                                </div>
                              ) : isFlexible && linkedPos ? (
                                <div className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400">
                                  <Link2 className="size-3" /> Refreshing {linkedPos.code} currency
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                            <AlertTriangle className="size-3" /> Unassigned
                          </div>
                        )}
                        {isFlexible && (
                          <FlexibleLinkControl
                            run={run}
                            flexPosId={posId}
                            linkedId={linkedId}
                            trainingMode={trainingMode}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}

/* ── Flexible support-seat linker ───────────────────────────────────────────
 * A flexible seat can be tied to one of the run's PRIMARY (non-flexible) seats.
 * Once linked, whoever sits here earns currency for that primary position on a
 * completed run — so a support shift still counts toward their validity.
 * A TRAINING toggle marks the seat as a trainee seat: no currency is recorded
 * and the "must be validated" requirement is waived.
 * ========================================================================== */
function FlexibleLinkControl({
  run,
  flexPosId,
  linkedId,
  trainingMode,
}: {
  run: Run
  flexPosId: string
  linkedId: string | null
  trainingMode: boolean
}) {
  const store = useStore()
  const canEdit = can(store.currentRole, "edit_assignment") || can(store.currentRole, "fill_positions")

  // Candidate primaries = this run's other required seats that are not flexible.
  const primaries = run.requiredPositions
    .filter((pid) => pid !== flexPosId)
    .map((pid) => store.positionById(pid))
    .filter((p): p is NonNullable<typeof p> => !!p && p.category !== "Flexible")

  return (
    <div className="mt-2 space-y-2 border-t pt-2">
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <Link2 className="size-3" /> Supporting position
        </div>
        <Select
          value={linkedId ?? "none"}
          onValueChange={(v) => store.linkFlexiblePosition(run.id, flexPosId, v === "none" ? null : v)}
          disabled={!canEdit}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Not linked" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not linked (free seat)</SelectItem>
            {primaries.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <GraduationCap className="size-3" /> Training seat
        </span>
        <Switch
          checked={trainingMode}
          onCheckedChange={(v) => store.setFlexibleTraining(run.id, flexPosId, v)}
          disabled={!canEdit}
          aria-label="Training seat — no currency recorded"
        />
      </label>
      {trainingMode && (
        <p className="text-[10px] leading-tight text-muted-foreground">
          Trainee seat: validity requirement waived and no currency is recorded for this shift.
        </p>
      )}
    </div>
  )
}
