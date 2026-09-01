"use client"

/* ===========================================================================
 * STAFF · OJT TRAINING PROGRESS (trainee view)
 * ===========================================================================
 * Shows a single trainee's initial-validation OJT progress, broken down per
 * position group: hours accumulated toward the 40h cap, completion status, the
 * OJTIs who trained them, positions covered and average rating.
 *
 * This is the TRAINEE side of the OJTI log. The mirror-image instructor totals
 * live in the Trainers/OJTI tab on the Training page.
 * =========================================================================== */
import { useMemo } from "react"
import { useStore } from "@/lib/store"
import {
  traineeGroupProgress,
  GROUP_TRAINING_CAP,
  type TraineeGroupProgress,
} from "@/lib/training-log-analytics"
import { programBadgeClass, programDisplay } from "@/lib/program"
import { formatDate } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, GraduationCap, CheckCircle2, Star, User } from "lucide-react"

export function StaffOjtProgress({ staffId }: { staffId: string }) {
  const store = useStore()
  // Follow the global top-bar year filter (reportTrainingLogs is year-scoped).
  const groups = useMemo(
    () => traineeGroupProgress(store.reportTrainingLogs, staffId, store.trainingGroups),
    [store.reportTrainingLogs, staffId, store.trainingGroups],
  )

  if (groups.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No on-the-job training logged for this person yet.
        </CardContent>
      </Card>
    )
  }

  const totalHours = groups.reduce((s, g) => s + g.hours, 0)
  const completed = groups.filter((g) => g.status === "completed").length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="size-4" />
          <span className="font-medium tabular-nums text-foreground">{totalHours.toFixed(1)}</span> total OJT hours
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-4" />
          <span className="font-medium tabular-nums text-foreground">{completed}</span> of {groups.length} pools validated
        </span>
      </div>

      <div className="grid gap-3">
        {groups.map((g) => (
          <GroupProgressCard key={g.group.id} progress={g} />
        ))}
      </div>
    </div>
  )
}

function GroupProgressCard({ progress: g }: { progress: TraineeGroupProgress }) {
  const store = useStore()
  const completed = g.status === "completed"

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{g.group.label}</span>
              <Badge variant="outline" className={cn("text-[10px]", programBadgeClass(g.group.program))}>
                {programDisplay(g.group.program)}
              </Badge>
              {completed ? (
                <Badge className="gap-1 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                  <CheckCircle2 className="size-3" /> Validated
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <GraduationCap className="size-3" /> In training
                </Badge>
              )}
              {g.overCap && (
                <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400">
                  Extension
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {g.group.positionIds.map((pid) => {
                const trained = g.positionIds.includes(pid)
                return (
                  <Badge
                    key={pid}
                    variant="outline"
                    className={cn("font-mono text-[10px]", !trained && "text-muted-foreground/50")}
                    title={store.positionById(pid)?.name}
                  >
                    {store.positionById(pid)?.code ?? pid}
                  </Badge>
                )
              })}
            </div>
          </div>
          <div className="text-right">
            <div className="tabular-nums">
              <span className={cn("text-lg font-semibold", completed && "text-emerald-600")}>
                {g.hours.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground"> / {GROUP_TRAINING_CAP}h</span>
            </div>
            {!completed && (
              <p className="text-xs text-muted-foreground tabular-nums">{g.remaining.toFixed(1)}h to validation</p>
            )}
          </div>
        </div>

        {/* Progress bar toward the 40h cap */}
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(g.pct * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${g.group.label} training progress`}
        >
          <div
            className={cn("h-full rounded-full transition-all", completed ? "bg-emerald-600" : "bg-primary")}
            style={{ width: `${Math.max(g.pct * 100, 2)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="size-3" /> OJTI:{" "}
            <span className="text-foreground">
              {g.ojtiIds
                .map((oid) => {
                  const o = store.staffById(oid)
                  return o ? `${o.firstName} ${o.lastName}` : "—"
                })
                .join(", ")}
            </span>
          </span>
          <span className="tabular-nums">
            {g.entryCount} session{g.entryCount === 1 ? "" : "s"}
          </span>
          {g.avgRating != null && (
            <span className="flex items-center gap-1">
              <Star className="size-3 fill-amber-500 text-amber-500" />
              <span className="tabular-nums">{g.avgRating.toFixed(1)}</span> avg
            </span>
          )}
          {g.lastDate && <span>Last: {formatDate(g.lastDate)}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
