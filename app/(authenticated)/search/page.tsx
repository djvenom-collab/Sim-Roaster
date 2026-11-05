"use client"

/* ===========================================================================
 * SEARCH RESULTS PAGE ("/search")
 * ===========================================================================
 * The full-list destination for the dashboard search box. The dashboard only
 * previews a handful of matches per type; when there are more, "See all"
 * brings the user here where EVERY match is listed (no cap), optionally
 * filtered to a single type via ?type=exercise|staff|course|training.
 *
 * Exercises list every scheduled day (past + upcoming), since that's the main
 * thing people come here to see. Read-only; people link to their full profile.
 * =========================================================================== */
import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Search,
  User,
  PlaneTakeoff,
  BookOpen,
  GraduationCap,
  Clock,
  Users,
  Monitor,
  CalendarClock,
} from "lucide-react"
import { PageHeader, StatusBadge } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useStore } from "@/lib/store"
import { todayISO, formatShort } from "@/lib/dates"
import { programBadgeClass, programDisplay, type Program } from "@/lib/program"
import { cn } from "@/lib/utils"

type FilterType = "all" | "staff" | "exercise" | "course" | "training"

const TABS: { value: FilterType; label: string; icon: typeof User }[] = [
  { value: "all", label: "All", icon: Search },
  { value: "staff", label: "People", icon: User },
  { value: "exercise", label: "Exercises", icon: PlaneTakeoff },
  { value: "course", label: "Courses", icon: BookOpen },
  { value: "training", label: "Training", icon: GraduationCap },
]

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading search…</div>}>
      <SearchResults />
    </Suspense>
  )
}

function SearchResults() {
  const params = useSearchParams()
  const store = useStore()
  const initialQ = params.get("q") ?? ""
  const initialType = (params.get("type") as FilterType) ?? "all"

  const [query, setQuery] = useState(initialQ)
  const [type, setType] = useState<FilterType>(
    ["staff", "exercise", "course", "training"].includes(initialType) ? initialType : "all",
  )

  const q = query.trim().toLowerCase()

  const staff = useMemo(
    () =>
      !q
        ? []
        : store.scopedStaff.filter((s) =>
            `${s.firstName} ${s.lastName} ${s.initials} ${s.rank}`.toLowerCase().includes(q),
          ),
    [q, store],
  )
  const exercises = useMemo(
    () =>
      !q
        ? []
        : store.scopedExercises.filter((e) =>
            `${e.code} ${e.name} ${e.program}`.toLowerCase().includes(q),
          ),
    [q, store],
  )
  const courses = useMemo(
    () => (!q ? [] : store.scopedCourses.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q))),
    [q, store],
  )
  const training = useMemo(
    () =>
      !q
        ? []
        : store.scopedTrainingSessions.filter((t) => `${t.title} ${t.type}`.toLowerCase().includes(q)),
    [q, store],
  )

  const total = staff.length + exercises.length + courses.length + training.length
  const show = (t: FilterType) => type === "all" || type === t

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search results"
        description={q ? `${total} match${total === 1 ? "" : "es"} for “${query.trim()}”` : "Type to search the operation."}
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/">Back to dashboard</Link>} />
        }
      />

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, exercises, courses or training…"
          className="pl-9"
          aria-label="Search the operation"
          autoFocus
        />
      </div>

      <Tabs value={type} onValueChange={(v) => setType(v as FilterType)}>
        <TabsList className="flex-wrap">
          {TABS.map((t) => {
            const count =
              t.value === "all"
                ? total
                : t.value === "staff"
                  ? staff.length
                  : t.value === "exercise"
                    ? exercises.length
                    : t.value === "course"
                      ? courses.length
                      : training.length
            return (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="size-3.5" /> {t.label}
                <span className="text-muted-foreground">({count})</span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      {!q ? null : total === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No matches for “{query.trim()}”.</p>
      ) : (
        <div className="space-y-8">
          {show("exercise") && exercises.length > 0 && (
            <Section icon={PlaneTakeoff} title="Exercises" count={exercises.length}>
              <div className="grid gap-4 lg:grid-cols-2">
                {exercises.map((e) => (
                  <ExerciseCard key={e.id} id={e.id} />
                ))}
              </div>
            </Section>
          )}

          {show("training") && training.length > 0 && (
            <Section icon={GraduationCap} title="Training" count={training.length}>
              <div className="grid gap-3 md:grid-cols-2">
                {training
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((t) => {
                    const instructor = store.staffById(t.instructorId)
                    const sim = t.simulatorId ? store.simulatorById(t.simulatorId) : undefined
                    return (
                      <div key={t.id} className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium leading-tight">{t.title}</p>
                          <StatusBadge status={t.status === "completed" ? "completed" : "training"} />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <CalendarClock className="size-3.5" /> {formatShort(t.date)} · {t.slotTime}
                          </span>
                          {t.type && <span>{t.type}</span>}
                          {instructor && (
                            <span>
                              {instructor.firstName} {instructor.lastName}
                            </span>
                          )}
                          {sim && (
                            <span className="inline-flex items-center gap-1">
                              <Monitor className="size-3.5" /> {sim.code}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </Section>
          )}

          {show("staff") && staff.length > 0 && (
            <Section icon={User} title="People" count={staff.length}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {staff.map((s) => (
                  <Link
                    key={s.id}
                    href={`/staff?staff=${s.id}`}
                    className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
                  >
                    <Avatar className="size-10">
                      <AvatarFallback className="text-xs">{s.initials.slice(0, 3)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.firstName} {s.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.initials} · {s.rank}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {(s.programs as Program[]).map((pr) => (
                        <Badge key={pr} variant="outline" className={cn("text-[10px]", programBadgeClass(pr))}>
                          {programDisplay(pr)}
                        </Badge>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {show("course") && courses.length > 0 && (
            <Section icon={BookOpen} title="Courses" count={courses.length}>
              <div className="grid gap-3 md:grid-cols-2">
                {courses
                  .slice()
                  .sort((a, b) => a.startDate.localeCompare(b.startDate))
                  .map((c) => (
                    <div key={c.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">
                          {c.code}
                        </Badge>
                        <p className="font-medium leading-tight">{c.name}</p>
                        {c.cancelled && <Badge variant="destructive">Cancelled</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {formatShort(c.startDate)} – {formatShort(c.endDate)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" /> {c.requiredPeople}
                        </span>
                        <span>{c.exerciseIds.length} exercises</span>
                      </div>
                    </div>
                  ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof User
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4" /> {title}
        <Badge variant="secondary" className="font-normal">
          {count}
        </Badge>
      </h2>
      {children}
    </section>
  )
}

/* Exercise card with EVERY scheduled day (past + upcoming). */
function ExerciseCard({ id }: { id: string }) {
  const store = useStore()
  const e = store.exerciseById(id)
  if (!e) return null

  const sim = store.simulatorById(e.simulatorId)
  const today = todayISO()
  const allRuns = store.scopedRuns
    .filter((r) => r.exerciseId === e.id)
    .sort((a, b) => b.date.localeCompare(a.date) || a.slotTime.localeCompare(b.slotTime))
  const upcoming = allRuns.filter((r) => r.date >= today && r.status !== "cancelled").length

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant="outline" className="font-mono">
            {e.code}
          </Badge>
          {e.name}
          <Badge variant="outline" className={cn(programBadgeClass(e.program as Program))}>
            {programDisplay(e.program as Program)}
          </Badge>
          {e.isValidation && <Badge variant="secondary">Validation</Badge>}
        </CardTitle>
        {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Monitor className="size-3.5" /> {sim?.code ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" /> {e.requiredStaff} staff
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {e.durationMin} min
          </span>
          <span>
            {allRuns.length} day{allRuns.length === 1 ? "" : "s"}
            {upcoming > 0 && <span className="ml-1">({upcoming} upcoming)</span>}
          </span>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            All scheduled days ({allRuns.length})
          </p>
          {allRuns.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs scheduled.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
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
        </div>
      </CardContent>
    </Card>
  )
}
