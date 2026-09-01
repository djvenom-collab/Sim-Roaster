"use client"

/* ===========================================================================
 * EXERCISE TREE — nested slicer for the Exercises page
 * ===========================================================================
 * Renders the course catalogue as a collapsible hierarchy so the (long) list
 * is easier to scan:
 *
 *   Program            (Radar / Tower)
 *   └ Branch           (Courses = non-validation | Validation)
 *     └ SIM bucket     (SIM Operational | SIM Non-Operational)   ← user-managed
 *       └ Course       (e.g. RAD-C1)                              ← added by user
 *         └ Exercise   (e.g. RX-11)
 *
 * The two SIM buckets start empty; managers add courses into them from the
 * course list (persisted via store.courseSimClass), and each course's exercises
 * are shown under whichever branch (Course vs Validation) they belong to.
 * =========================================================================== */
import { useMemo, useState } from "react"
import type { useStore } from "@/lib/store"
import type { Exercise } from "@/lib/types"
import { cn } from "@/lib/utils"
import { programDisplay, programBadgeClass } from "@/lib/program"
import { HIGHLIGHT_RING } from "@/lib/use-deep-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  ChevronRight,
  Monitor,
  Users,
  Clock,
  Layers,
  Power,
  PowerOff,
  Plus,
  X,
  Pencil,
  Trash2,
  Radar,
  TowerControl,
  FolderOpen,
} from "lucide-react"

type Store = ReturnType<typeof useStore>
type Bucket = "operational" | "non-operational"

const BRANCHES = [
  { key: "course", label: "Courses", isValidation: false },
  { key: "validation", label: "Validation", isValidation: true },
] as const

const BUCKETS: { key: Bucket; label: string; icon: typeof Power }[] = [
  { key: "operational", label: "SIM Operational", icon: Power },
  { key: "non-operational", label: "SIM Non-Operational", icon: PowerOff },
]

export function ExerciseTree({
  store,
  canManage,
  search,
  highlightExercise,
  onEdit,
  onDelete,
}: {
  store: Store
  canManage: boolean
  search: string
  highlightExercise: string | null
  onEdit: (ex: Exercise) => void
  onDelete: (ex: Exercise) => void
}) {
  const q = search.trim().toLowerCase()
  const searching = q.length > 0
  const matches = (ex: Exercise) => !searching || `${ex.code} ${ex.name}`.toLowerCase().includes(q)

  // Courses now repeat per retained year. The exercise sheet is a structural,
  // single-year view, so scope to the newest selected year (the global slicer's
  // end) — keeps the tree to one editable set instead of duplicating every code.
  const treeCourses = useMemo(
    () => store.scopedCourses.filter((c) => Number(c.startDate.slice(0, 4)) === store.yearRange.end),
    [store.scopedCourses, store.yearRange.end],
  )

  // Programs present in the current (globally-scoped) catalogue.
  const programs = useMemo(
    () => Array.from(new Set(store.scopedExercises.map((e) => e.program).filter(Boolean))) as string[],
    [store.scopedExercises],
  )

  // Manual open/closed state; programs default open so the tree isn't empty.
  const [open, setOpen] = useState<Set<string>>(() => new Set(programs.map((p) => `p:${p}`)))
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  // Exercises belonging to a course, filtered to a branch (validation flag).
  const exercisesFor = (courseId: string, isValidation: boolean, program: string): Exercise[] => {
    const course = store.courseById(courseId)
    if (!course) return []
    return course.exerciseIds
      .map((id) => store.exerciseById(id))
      .filter((ex): ex is Exercise => !!ex && ex.program === program && ex.isValidation === isValidation)
  }

  if (programs.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No exercises in the current program scope.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {programs.map((program) => {
        const ProgIcon = program === "TOWER" ? TowerControl : Radar
        const pKey = `p:${program}`
        // Everything under this program, for the header count.
        const progExercises = store.scopedExercises.filter((e) => e.program === program && matches(e))
        const pOpen = open.has(pKey) || searching

        return (
          <div key={program} className="overflow-hidden rounded-lg border bg-card">
            <TreeRow
              depth={0}
              open={pOpen}
              onToggle={() => toggle(pKey)}
              icon={<ProgIcon className="size-4" />}
              label={<span className="font-semibold">{programDisplay(program)}</span>}
              badge={
                <Badge variant="outline" className={cn("font-mono", programBadgeClass(program as "RADAR" | "TOWER"))}>
                  {progExercises.length}
                </Badge>
              }
            />
            {pOpen && (
              <div className="border-t">
                {BRANCHES.map((branch) => {
                  const bKey = `${pKey}|b:${branch.key}`
                  // Count of matching exercises anywhere under this branch.
                  const branchCount = treeCourses
                    .filter((c) => c.program === program && store.courseSimClass[c.id])
                    .reduce(
                      (n, c) => n + exercisesFor(c.id, branch.isValidation, program).filter(matches).length,
                      0,
                    )
                  if (searching && branchCount === 0) return null
                  const brOpen = open.has(bKey) || searching

                  return (
                    <div key={branch.key} className="border-b last:border-b-0">
                      <TreeRow
                        depth={1}
                        open={brOpen}
                        onToggle={() => toggle(bKey)}
                        icon={<Layers className="size-4 text-muted-foreground" />}
                        label={branch.label}
                        badge={
                          <Badge variant="secondary" className="font-normal tabular-nums">
                            {branchCount}
                          </Badge>
                        }
                      />
                      {brOpen && (
                        <div>
                          {BUCKETS.map((bucket) => {
                            const sKey = `${bKey}|s:${bucket.key}`
                            const BucketIcon = bucket.icon
                            const bucketCourses = treeCourses
                              .filter((c) => c.program === program && store.courseSimClass[c.id] === bucket.key)
                              .map((c) => ({ course: c, exs: exercisesFor(c.id, branch.isValidation, program).filter(matches) }))
                              .filter((row) => (searching ? row.exs.length > 0 : row.exs.length > 0))
                              .sort((a, b) => a.course.code.localeCompare(b.course.code))
                            const bucketCount = bucketCourses.reduce((n, r) => n + r.exs.length, 0)
                            if (searching && bucketCount === 0) return null
                            const containsHighlight = bucketCourses.some((r) => r.exs.some((e) => e.id === highlightExercise))
                            const sOpen = open.has(sKey) || searching || containsHighlight

                            return (
                              <div key={bucket.key} className="border-t bg-muted/30">
                                <div className="flex items-center gap-1 pr-3">
                                  <TreeRow
                                    depth={2}
                                    open={sOpen}
                                    onToggle={() => toggle(sKey)}
                                    icon={<BucketIcon className="size-4 text-muted-foreground" />}
                                    label={bucket.label}
                                    badge={
                                      <Badge variant="outline" className="tabular-nums">
                                        {bucketCourses.length} course{bucketCourses.length === 1 ? "" : "s"}
                                      </Badge>
                                    }
                                  />
                                  {canManage && (
                                    <AddCoursePicker store={store} program={program} bucket={bucket.key} bucketLabel={bucket.label} />
                                  )}
                                </div>
                                {sOpen && (
                                  <div className="space-y-2 px-3 pb-3 pl-10">
                                    {bucketCourses.length === 0 ? (
                                      <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                                        No courses here yet.
                                        {canManage ? " Use “Add course” to place one in this section." : ""}
                                      </p>
                                    ) : (
                                      bucketCourses.map(({ course, exs }) => {
                                        const cKey = `${sKey}|c:${course.id}`
                                        const cOpen =
                                          open.has(cKey) || searching || exs.some((e) => e.id === highlightExercise)
                                        return (
                                          <div key={course.id} className="overflow-hidden rounded-md border bg-card">
                                            <div className="flex items-center gap-1 pr-2">
                                              <TreeRow
                                                depth={0}
                                                compact
                                                open={cOpen}
                                                onToggle={() => toggle(cKey)}
                                                icon={<FolderOpen className="size-4 text-muted-foreground" />}
                                                label={
                                                  <span className="flex items-center gap-2">
                                                    <Badge variant="outline" className="font-mono">
                                                      {course.code}
                                                    </Badge>
                                                    <span className="truncate">{course.name}</span>
                                                  </span>
                                                }
                                                badge={
                                                  <Badge variant="secondary" className="tabular-nums">
                                                    {exs.length}
                                                  </Badge>
                                                }
                                              />
                                              {canManage && (
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                                  aria-label={`Remove ${course.code} from ${bucket.label}`}
                                                  onClick={() => store.setCourseSimClass(course.id, null)}
                                                >
                                                  <X className="size-3.5" />
                                                </Button>
                                              )}
                                            </div>
                                            {cOpen && (
                                              <div className="space-y-1.5 border-t p-2">
                                                {exs.map((ex) => (
                                                  <ExerciseLeaf
                                                    key={ex.id}
                                                    ex={ex}
                                                    store={store}
                                                    canManage={canManage}
                                                    highlighted={ex.id === highlightExercise}
                                                    onEdit={onEdit}
                                                    onDelete={onDelete}
                                                  />
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* A single collapsible header row. depth adds left indentation (except when
 * `compact`, which is used for course rows already nested inside a card). */
function TreeRow({
  depth,
  open,
  onToggle,
  icon,
  label,
  badge,
  compact,
}: {
  depth: number
  open: boolean
  onToggle: () => void
  icon: React.ReactNode
  label: React.ReactNode
  badge?: React.ReactNode
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center gap-2 py-2.5 pr-3 text-left text-sm transition-colors hover:bg-accent/50",
        compact ? "py-2" : "",
      )}
      style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
    >
      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge}
    </button>
  )
}

/* Compact exercise row (the tree leaf) — mirrors the old card but denser. */
function ExerciseLeaf({
  ex,
  store,
  canManage,
  highlighted,
  onEdit,
  onDelete,
}: {
  ex: Exercise
  store: Store
  canManage: boolean
  highlighted: boolean
  onEdit: (ex: Exercise) => void
  onDelete: (ex: Exercise) => void
}) {
  const rule = store.exerciseQualRules.find((r) => r.exerciseId === ex.id)
  const runsUsing = store.scopedRuns.filter((r) => r.exerciseId === ex.id).length
  const hasRules = rule && (rule.requiredQuals.length || rule.preferredQuals.length || rule.excludedQuals.length)

  return (
    <div
      id={`exercise-${ex.id}`}
      className={cn(
        "scroll-mt-24 rounded-md border bg-background p-3 transition-shadow",
        highlighted && HIGHLIGHT_RING,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {ex.code}
            </Badge>
            <span className="text-sm font-medium">{ex.name}</span>
            {ex.isValidation && <Badge variant="secondary">Validation</Badge>}
            {!ex.active && <Badge variant="secondary">Archived</Badge>}
          </div>
          {ex.description && <p className="text-xs text-muted-foreground">{ex.description}</p>}
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onEdit(ex)} aria-label={`Edit ${ex.code}`}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onDelete(ex)} aria-label={`Delete ${ex.code}`}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Monitor className="size-3" /> {store.simulatorById(ex.simulatorId)?.code ?? "—"}
        </span>
        <span className="flex items-center gap-1">
          <Users className="size-3" /> {ex.requiredStaff} staff
        </span>
        <span className="flex items-center gap-1">
          <Clock className="size-3" /> {ex.durationMin} min
        </span>
        <span>{runsUsing} scheduled run(s)</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Positions</span>
        {ex.requiredPositions.map((p) => (
          <Badge key={p} variant="outline" className="font-mono text-[10px]">
            {store.positionById(p)?.code}
          </Badge>
        ))}
      </div>

      {hasRules && (
        <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2">
          <QualCol label="Required" ids={rule!.requiredQuals} variant="default" store={store} />
          <QualCol label="Preferred" ids={rule!.preferredQuals} variant="secondary" store={store} />
          <QualCol label="Excluded" ids={rule!.excludedQuals} variant="destructive" store={store} />
        </div>
      )}
    </div>
  )
}

/* Popover picker: add (or move) a course into this SIM bucket. */
function AddCoursePicker({
  store,
  program,
  bucket,
  bucketLabel,
}: {
  store: Store
  program: string
  bucket: Bucket
  bucketLabel: string
}) {
  const [open, setOpen] = useState(false)
  // Courses in this program not already in THIS bucket (so you can add unassigned
  // ones or move a course over from the other bucket).
  const options = store.scopedCourses
    .filter(
      (c) =>
        Number(c.startDate.slice(0, 4)) === store.yearRange.end &&
        c.program === program &&
        store.courseSimClass[c.id] !== bucket,
    )
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 text-xs" />}>
        <Plus className="size-3.5" /> Add course
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 overflow-hidden p-0">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Add a course to {bucketLabel}</div>
        {options.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">No courses available to add.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {options.map((c) => {
              const other = store.courseSimClass[c.id]
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    store.setCourseSimClass(c.id, bucket)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                    {c.code}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {other && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {other === "operational" ? "Operational" : "Non-Op"}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function QualCol({
  label,
  ids,
  variant,
  store,
}: {
  label: string
  ids: string[]
  variant: "default" | "secondary" | "destructive"
  store: Store
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {ids.length === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          ids.map((qid) => (
            <Badge key={qid} variant={variant} className="text-[10px]">
              {store.qualifications.find((x) => x.id === qid)?.code}
            </Badge>
          ))
        )}
      </div>
    </div>
  )
}
