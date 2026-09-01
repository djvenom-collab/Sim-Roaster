"use client"

/* ===========================================================================
 * OJTI / TRAINERS TAB — instructor-side metrics off the OJTI training log
 * ===========================================================================
 * The mirror image of the trainee OJT progress shown on the staff page. Where
 * a trainee's hours accumulate toward their 40h validation, here we roll the
 * same log entries up by the OJTI (instructor) who delivered them: total hours
 * instructed, how many trainees, program split and a per-group breakdown.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { useStore } from "@/lib/store"
import { ojtiSummaries, type OjtiSummary, type OjtiGroupBreakdown } from "@/lib/training-log-analytics"
import { matchesProgram, programBadgeClass, programDisplay } from "@/lib/program"
import { formatDate } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Users, Clock, GraduationCap, Star, ChevronDown } from "lucide-react"

export function OjtiMetrics() {
  const store = useStore()
  // Accumulated OJT hours follow BOTH global top-bar slicers: the year filter
  // (reportTrainingLogs is scoped by entry date) and the RADAR/TOWER program.
  const logs = useMemo(
    () => store.reportTrainingLogs.filter((l) => matchesProgram(l.program, store.activeProgram)),
    [store.reportTrainingLogs, store.activeProgram],
  )
  const summaries = useMemo(
    () => ojtiSummaries(logs, store.trainingGroups),
    [logs, store.trainingGroups],
  )

  // OJTI-qualified staff, so we can flag who holds the formal qualification.
  const ojtiIds = useMemo(() => {
    const ojtiQual = store.qualifications.find((q) => q.code === "OJTI")
    if (!ojtiQual) return new Set<string>()
    return new Set(
      store.staffQualifications.filter((q) => q.qualificationId === ojtiQual.id).map((q) => q.staffId),
    )
  }, [store.qualifications, store.staffQualifications])

  if (summaries.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No instructor activity yet"
        description="Once OJTIs log training sessions, their instructing hours and trainees appear here."
      />
    )
  }

  const totalHours = summaries.reduce((s, o) => s + o.totalHours, 0)
  const totalTrainees = new Set(logs.map((l) => l.traineeId)).size

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-4" />
          <span className="font-medium tabular-nums text-foreground">{summaries.length}</span> active OJTI
          {summaries.length === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" />
          <span className="font-medium tabular-nums text-foreground">{totalHours.toFixed(1)}</span> hours instructed
        </span>
        <span className="flex items-center gap-1.5">
          <GraduationCap className="size-4" />
          <span className="font-medium tabular-nums text-foreground">{totalTrainees}</span> trainees under instruction
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {summaries.map((o) => (
          <OjtiCard key={o.ojtiId} summary={o} isQualified={ojtiIds.has(o.ojtiId)} />
        ))}
      </div>
    </div>
  )
}

function OjtiCard({ summary: o, isQualified }: { summary: OjtiSummary; isQualified: boolean }) {
  const store = useStore()
  const ojti = store.staffById(o.ojtiId)
  const name = ojti ? `${ojti.firstName} ${ojti.lastName}` : "Unknown OJTI"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="text-xs">{ojti?.initials.slice(0, 3) ?? "?"}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{name}</CardTitle>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {ojti?.rank && <span>{ojti.rank}</span>}
                {isQualified ? (
                  <Badge variant="secondary" className="text-[10px]">
                    OJTI qualified
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
                  >
                    Not OJTI qualified
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Badge className="gap-1 tabular-nums">
            <Clock className="size-3" /> {o.totalHours.toFixed(1)}h
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            <span className="tabular-nums text-foreground">{o.traineeIds.length}</span> trainee
            {o.traineeIds.length === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">
            {o.entryCount} session{o.entryCount === 1 ? "" : "s"}
          </span>
          {o.avgRating != null && (
            <span className="flex items-center gap-1">
              <Star className="size-3 fill-amber-500 text-amber-500" />
              <span className="tabular-nums">{o.avgRating.toFixed(1)}</span> avg given
            </span>
          )}
          {o.lastDate && <span>Last: {formatDate(o.lastDate)}</span>}
        </div>

        {/* Program split */}
        <div className="flex flex-wrap gap-1.5">
          {(["RADAR", "TOWER"] as const).map((p) =>
            o.byProgram[p] > 0 ? (
              <Badge key={p} variant="outline" className={cn("gap-1 tabular-nums", programBadgeClass(p))}>
                {programDisplay(p)} · {o.byProgram[p].toFixed(1)}h
              </Badge>
            ) : null,
          )}
        </div>

        {/* Per-group breakdown — each row expands to show who was trained */}
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">By position pool</p>
          <div className="grid gap-1">
            {o.groups.map((gb) => (
              <GroupBreakdownRow key={gb.group.id} breakdown={gb} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function GroupBreakdownRow({ breakdown: gb }: { breakdown: OjtiGroupBreakdown }) {
  const store = useStore()
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs hover:bg-muted/60"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronDown
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
          <Badge variant="outline" className={cn("text-[10px]", programBadgeClass(gb.group.program))}>
            {programDisplay(gb.group.program)}
          </Badge>
          <span className="truncate text-foreground">{gb.group.label}</span>
          <span className="hidden truncate text-muted-foreground sm:inline">
            ({gb.group.positionIds.map((pid) => store.positionById(pid)?.code ?? pid).join(", ")})
          </span>
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">{gb.hours.toFixed(1)}h</span> · {gb.traineeIds.length}{" "}
          trainee{gb.traineeIds.length === 1 ? "" : "s"}
        </span>
      </button>
      {open && (
        <div className="space-y-1 border-t px-2.5 py-2">
          {gb.trainees.map((t) => {
            const person = store.staffById(t.traineeId)
            const pname = person ? `${person.firstName} ${person.lastName}` : "Unknown trainee"
            return (
              <div key={t.traineeId} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[9px]">{person?.initials.slice(0, 3) ?? "?"}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-foreground">{pname}</span>
                  {t.avgRating != null && (
                    <span className="flex items-center gap-0.5 text-muted-foreground">
                      <Star className="size-2.5 fill-amber-500 text-amber-500" />
                      <span className="tabular-nums">{t.avgRating.toFixed(1)}</span>
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-medium text-foreground">{t.hours.toFixed(1)}h</span> · {t.entryCount} session
                  {t.entryCount === 1 ? "" : "s"}
                  {t.lastDate ? ` · ${formatDate(t.lastDate)}` : ""}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
