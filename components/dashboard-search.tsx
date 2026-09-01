"use client"

/* ===========================================================================
 * DASHBOARD SEARCH — global quick-find on the dashboard
 * ===========================================================================
 * One search box that looks across people (name / 3-letter initials), exercises
 * (code / name), courses (code / name) and training sessions (title). Picking a
 * result expands an inline detail panel with the most useful info for that kind
 * of record — a mini profile for people, a spec sheet for exercises, etc.
 *
 * It only READS from the store. People link out to their full profile via
 * /staff?staff=<id>.
 * =========================================================================== */
import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Search,
  X,
  User,
  PlaneTakeoff,
  BookOpen,
  GraduationCap,
  Mail,
  Phone,
  Clock,
  Users,
  CalendarClock,
  ArrowLeft,
  ExternalLink,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusBadge } from "@/components/shared"
import { useStore } from "@/lib/store"
import { todayISO, formatShort } from "@/lib/dates"
import { programBadgeClass, programDisplay, type Program } from "@/lib/program"
import { cn } from "@/lib/utils"

type ResultType = "staff" | "exercise" | "course" | "training"
type Result = { type: ResultType; id: string; label: string; sub: string }

const TYPE_META: Record<ResultType, { icon: typeof User; label: string }> = {
  staff: { icon: User, label: "Person" },
  exercise: { icon: PlaneTakeoff, label: "Exercise" },
  course: { icon: BookOpen, label: "Course" },
  training: { icon: GraduationCap, label: "Training" },
}

const PER_GROUP = 6

export function DashboardSearch() {
  const store = useStore()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Result | null>(null)

  const q = query.trim().toLowerCase()

  const results = useMemo<Result[]>(() => {
    if (!q) return []
    const out: Result[] = []

    store.scopedStaff
      .filter((s) =>
        `${s.firstName} ${s.lastName} ${s.initials} ${s.rank}`.toLowerCase().includes(q),
      )
      .slice(0, PER_GROUP)
      .forEach((s) =>
        out.push({
          type: "staff",
          id: s.id,
          label: `${s.firstName} ${s.lastName}`,
          sub: `${s.initials} · ${s.rank}`,
        }),
      )

    store.scopedExercises
      .filter((e) => `${e.code} ${e.name} ${e.program}`.toLowerCase().includes(q))
      .slice(0, PER_GROUP)
      .forEach((e) =>
        out.push({ type: "exercise", id: e.id, label: `${e.code} · ${e.name}`, sub: programDisplay(e.program as Program) }),
      )

    store.scopedCourses
      .filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q))
      .slice(0, PER_GROUP)
      .forEach((c) =>
        out.push({ type: "course", id: c.id, label: `${c.code} · ${c.name}`, sub: `${c.exerciseIds.length} exercises` }),
      )

    store.scopedTrainingSessions
      .filter((t) => `${t.title} ${t.type}`.toLowerCase().includes(q))
      .slice(0, PER_GROUP)
      .forEach((t) =>
        out.push({ type: "training", id: t.id, label: t.title, sub: `${formatShort(t.date)} · ${t.slotTime}` }),
      )

    return out
  }, [q, store])

  const grouped = useMemo(() => {
    const map = new Map<ResultType, Result[]>()
    for (const r of results) {
      const arr = map.get(r.type) ?? []
      arr.push(r)
      map.set(r.type, arr)
    }
    return map
  }, [results])

  // Uncapped match counts per type, so we can tell when there's more than the
  // preview shows and offer a "see all" link to the full results page.
  const totals = useMemo(() => {
    if (!q) return { staff: 0, exercise: 0, course: 0, training: 0, all: 0 }
    const staff = store.scopedStaff.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.initials} ${s.rank}`.toLowerCase().includes(q),
    ).length
    const exercise = store.scopedExercises.filter((e) =>
      `${e.code} ${e.name} ${e.program}`.toLowerCase().includes(q),
    ).length
    const course = store.scopedCourses.filter((c) =>
      `${c.code} ${c.name}`.toLowerCase().includes(q),
    ).length
    const training = store.scopedTrainingSessions.filter((t) =>
      `${t.title} ${t.type}`.toLowerCase().includes(q),
    ).length
    return { staff, exercise, course, training, all: staff + exercise + course + training }
  }, [q, store])

  const clear = () => {
    setQuery("")
    setSelected(null)
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(null)
            }}
            placeholder="Search people, exercises, courses or training…"
            className="pl-9 pr-9"
            aria-label="Search the operation"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Detail view for the selected result */}
        {selected ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="-ml-2 h-8" onClick={() => setSelected(null)}>
              <ArrowLeft className="size-4" /> Back to results
            </Button>
            {selected.type === "staff" && <StaffResult id={selected.id} />}
            {selected.type === "exercise" && <ExerciseResult id={selected.id} />}
            {selected.type === "course" && <CourseResult id={selected.id} />}
            {selected.type === "training" && <TrainingResult id={selected.id} />}
          </div>
        ) : q ? (
          results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No matches for &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <div className="space-y-4">
              {(["staff", "exercise", "course", "training"] as ResultType[]).map((type) => {
                const items = grouped.get(type)
                if (!items || items.length === 0) return null
                const Meta = TYPE_META[type]
                const total = totals[type]
                const hasMore = total > items.length
                return (
                  <div key={type} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Meta.icon className="size-3.5" /> {Meta.label}
                        <span className="text-muted-foreground/70">({total})</span>
                      </p>
                      {hasMore && (
                        <Link
                          href={`/search?q=${encodeURIComponent(query.trim())}&type=${type}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          See all {total}
                        </Link>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      {items.map((r) => (
                        <button
                          key={`${r.type}-${r.id}`}
                          type="button"
                          onClick={() => setSelected(r)}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
                        >
                          <span className="truncate font-medium">{r.label}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{r.sub}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              <Link
                href={`/search?q=${encodeURIComponent(query.trim())}`}
                className="flex items-center justify-center gap-1 rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Search className="size-3.5" /> View all {totals.all} result{totals.all === 1 ? "" : "s"} on one page
              </Link>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Detail panels ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

function StaffResult({ id }: { id: string }) {
  const store = useStore()
  const s = store.staffById(id)
  if (!s) return null

  const validity = s.homePositions.map((posId) => ({ posId, ...store.validityFor(s.id, posId) }))
  const expiring = validity.filter((v) => v.status === "expiring" || v.status === "expired")

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-12">
          <AvatarFallback className="text-sm">{s.initials.slice(0, 3)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-tight">
              {s.firstName} {s.lastName}
            </h3>
            {!s.active && <Badge variant="secondary">Inactive</Badge>}
            {(s.programs as Program[]).map((pr) => (
              <Badge key={pr} variant="outline" className={cn(programBadgeClass(pr))}>
                {programDisplay(pr)}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {s.rank} · Initials {s.initials}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <Link href={`/staff?staff=${s.id}`}>
              <ExternalLink className="size-4" /> Full profile
            </Link>
          }
        />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Mail className="size-3" /> {s.email}
        </span>
        <span className="flex items-center gap-1">
          <Phone className="size-3" /> {s.phone}
        </span>
      </div>

      <Field label={`Operational positions (${s.homePositions.length})`}>
        <div className="flex flex-wrap gap-1">
          {s.homePositions.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            s.homePositions.map((p) => (
              <Badge key={p} variant="outline" className="font-mono">
                {store.positionById(p)?.code}
              </Badge>
            ))
          )}
        </div>
      </Field>

      <Field label="Currency">
        {expiring.length === 0 ? (
          <span className="text-emerald-600">All {validity.length} positions current</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {expiring.map((v) => (
              <span key={v.posId} className="inline-flex items-center gap-1">
                <Badge variant="outline" className="font-mono">
                  {store.positionById(v.posId)?.code}
                </Badge>
                <StatusBadge status={v.status} />
              </span>
            ))}
          </div>
        )}
      </Field>
    </div>
  )
}

function ExerciseResult({ id }: { id: string }) {
  const store = useStore()
  const e = store.exerciseById(id)
  if (!e) return null

  const sim = store.simulatorById(e.simulatorId)
  const today = todayISO()
  // Every scheduled day for this exercise — past and upcoming — newest first.
  const allRuns = store.scopedRuns
    .filter((r) => r.exerciseId === e.id)
    .sort((a, b) => b.date.localeCompare(a.date) || a.slotTime.localeCompare(b.slotTime))
  const upcomingRuns = allRuns.filter((r) => r.date >= today && r.status !== "cancelled")

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {e.code}
        </Badge>
        <h3 className="text-lg font-semibold leading-tight">{e.name}</h3>
        <Badge variant="outline" className={cn(programBadgeClass(e.program as Program))}>
          {programDisplay(e.program as Program)}
        </Badge>
        {e.isValidation && <Badge>Validation</Badge>}
        {!e.active && <Badge variant="secondary">Inactive</Badge>}
      </div>

      {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Duration">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5 text-muted-foreground" /> {e.durationMin} min
          </span>
        </Field>
        <Field label="Required staff">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5 text-muted-foreground" /> {e.requiredStaff}
          </span>
        </Field>
        <Field label="Simulator">{sim ? `${sim.code}` : "—"}</Field>
        <Field label="Scheduled days">
          {allRuns.length}
          {upcomingRuns.length > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({upcomingRuns.length} upcoming)
            </span>
          )}
        </Field>
      </div>

      <Field label={`Required positions (${e.requiredPositions.length})`}>
        <div className="flex flex-wrap gap-1">
          {e.requiredPositions.length === 0 ? (
            <span className="text-muted-foreground">None specified</span>
          ) : (
            e.requiredPositions.map((p) => (
              <Badge key={p} variant="outline" className="font-mono">
                {store.positionById(p)?.code}
              </Badge>
            ))
          )}
        </div>
      </Field>

      <Field label={`All scheduled days (${allRuns.length})`}>
        {allRuns.length === 0 ? (
          <span className="text-muted-foreground">No runs scheduled</span>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {allRuns.map((r) => {
              const past = r.date < today
              return (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs",
                    past && "opacity-70",
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <CalendarClock className="size-3.5 text-muted-foreground" />
                    {formatShort(r.date)} · {r.slotTime}
                    {!past && (
                      <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                        Upcoming
                      </Badge>
                    )}
                  </span>
                  <StatusBadge status={r.status} />
                </li>
              )
            })}
          </ul>
        )}
      </Field>
    </div>
  )
}

function CourseResult({ id }: { id: string }) {
  const store = useStore()
  const c = store.courseById(id)
  if (!c) return null

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {c.code}
        </Badge>
        <h3 className="text-lg font-semibold leading-tight">{c.name}</h3>
        <Badge variant="outline" className={cn(programBadgeClass(c.program as Program))}>
          {programDisplay(c.program as Program)}
        </Badge>
        <Badge variant="secondary" className="capitalize">
          {c.kind}
        </Badge>
        {c.cancelled && <Badge variant="destructive">Cancelled</Badge>}
      </div>

      {c.notes && <p className="text-sm text-muted-foreground">{c.notes}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Dates">
          {formatShort(c.startDate)} – {formatShort(c.endDate)}
        </Field>
        <Field label="Required people">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5 text-muted-foreground" /> {c.requiredPeople}
          </span>
        </Field>
        <Field label="Exercises">{c.exerciseIds.length}</Field>
      </div>

      <Field label="Exercises in course">
        <div className="flex flex-wrap gap-1">
          {c.exerciseIds.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : (
            c.exerciseIds.map((eid) => (
              <Badge key={eid} variant="outline" className="font-mono">
                {store.exerciseById(eid)?.code ?? eid}
              </Badge>
            ))
          )}
        </div>
      </Field>
    </div>
  )
}

function TrainingResult({ id }: { id: string }) {
  const store = useStore()
  const t = store.scopedTrainingSessions.find((x) => x.id === id)
  if (!t) return null

  const instructor = store.staffById(t.instructorId)
  const sim = t.simulatorId ? store.simulatorById(t.simulatorId) : undefined

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap className="size-5 text-blue-600" />
        <h3 className="text-lg font-semibold leading-tight">{t.title}</h3>
        <StatusBadge status={t.status === "completed" ? "completed" : "training"} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Type">{t.type || "—"}</Field>
        <Field label="When">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5 text-muted-foreground" /> {formatShort(t.date)} · {t.slotTime}
          </span>
        </Field>
        <Field label="Instructor">
          {instructor ? `${instructor.firstName} ${instructor.lastName}` : "—"}
        </Field>
        <Field label="Simulator">{sim ? sim.code : "—"}</Field>
      </div>

      {t.positionIds && t.positionIds.length > 0 && (
        <Field label="Positions">
          <div className="flex flex-wrap gap-1">
            {t.positionIds.map((p) => (
              <Badge key={p} variant="outline" className="font-mono">
                {store.positionById(p)?.code}
              </Badge>
            ))}
          </div>
        </Field>
      )}

      {t.notes && <Field label="Notes">{t.notes}</Field>}
    </div>
  )
}
