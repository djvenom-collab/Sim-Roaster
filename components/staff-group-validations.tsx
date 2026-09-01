"use client"

/* ===========================================================================
 * STAFF · POSITION GROUP VALIDATIONS
 * ===========================================================================
 * Every employee goes through an initial positional-group validation process.
 * This card surfaces, on the profile, a "badge of completion" for each position
 * group the person has fully validated (>= the 40h OJT cap). Groups still in
 * progress are shown muted so the full validation picture is visible at a glance.
 * =========================================================================== */
import { useMemo } from "react"
import { useStore } from "@/lib/store"
import { traineeGroupProgress } from "@/lib/training-log-analytics"
import { programBadgeClass, programDisplay } from "@/lib/program"
import { formatDate } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Award, CheckCircle2, GraduationCap } from "lucide-react"

export function StaffGroupValidations({ staffId }: { staffId: string }) {
  const store = useStore()
  // Validations are a lifetime achievement, so this stays all-time (not scoped
  // to the top-bar year filter) — once a group is validated it stays validated.
  const groups = useMemo(
    () => traineeGroupProgress(store.trainingLogs, staffId, store.trainingGroups),
    [store.trainingLogs, staffId, store.trainingGroups],
  )

  if (groups.length === 0) return null

  const completed = groups.filter((g) => g.status === "completed")
  const inProgress = groups.filter((g) => g.status !== "completed")

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Award className="size-4" />
          Position Pool Validations
          <span className="ml-auto tabular-nums text-foreground">
            {completed.length}
            <span className="text-muted-foreground"> / {groups.length}</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No position pools validated yet — initial training still in progress.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {completed.map((g) => (
              <div
                key={g.group.id}
                className="flex items-start gap-3 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600/15">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium leading-tight">{g.group.label}</span>
                    <Badge variant="outline" className={cn("text-[10px]", programBadgeClass(g.group.program))}>
                      {programDisplay(g.group.program)}
                    </Badge>
                    {g.overCap && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400"
                      >
                        Extension
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    Validated{g.lastDate ? ` · ${formatDate(g.lastDate)}` : ""}
                    <span className="text-muted-foreground"> · {g.hours.toFixed(1)}h</span>
                  </p>
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {g.group.positionIds.map((pid) => (
                      <Badge
                        key={pid}
                        variant="outline"
                        className="font-mono text-[10px]"
                        title={store.positionById(pid)?.name}
                      >
                        {store.positionById(pid)?.code ?? pid}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {inProgress.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <GraduationCap className="size-3.5" /> In training:
            </span>
            {inProgress.map((g) => (
              <Badge key={g.group.id} variant="secondary" className="gap-1 text-[10px]">
                {g.group.label}
                <span className="tabular-nums text-muted-foreground">{g.hours.toFixed(0)}h</span>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
