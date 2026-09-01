"use client"

/* ===========================================================================
 * DASHBOARD PAGE ("/") — the landing overview
 * ===========================================================================
 * The first screen after sign-in. It summarises today: today's runs, plans
 * still missing staff, currency that's expiring/expired, upcoming training and
 * leave, and quick links into the planners.
 *
 * It only READS from the store and shows it — no data is changed here. To
 * change what counts as a warning (e.g. "incomplete plan"), look at the small
 * filters near the top of the component. Wording/labels are inline in the JSX.
 * =========================================================================== */
import Link from "next/link"
import { useState } from "react"
import {
  AlertTriangle,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  PlaneTakeoff,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
  UserPlus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared"
import { DayNavigator } from "@/components/day-navigator"
import { WeeklyPushDialog } from "@/components/weekly-push-dialog"
import { DashboardSearch } from "@/components/dashboard-search"
import { AssignFreeStaffPopover } from "@/components/assign-free-staff-popover"
import { LeaveTrendChart } from "@/components/charts/leave-trend-chart"
import { TrainingTrendChart } from "@/components/charts/training-trend-chart"
import { SimHoursChart } from "@/components/charts/sim-hours-chart"
import { useStore } from "@/lib/store"
import { useScopedDate } from "@/lib/use-scoped-date"
import { todayISO, formatDate, formatShort } from "@/lib/dates"

export default function DashboardPage() {
  const store = useStore()
  // The dashboard is now day-scoped: pick any day and every "today" panel below
  // reflects that date. Defaults to the real today; the DayNavigator in the
  // header steps back/forward and resets to today.
  const [date, setDate] = useScopedDate()
  const isToday = date === todayISO()

  const todaysRuns = store.scopedRuns.filter((r) => r.date === date)
  const incompletePlans = store.scopedRuns.filter((r) => {
    if (r.status === "cancelled") return false
    const asgs = store.assignmentsForRun(r.id)
    return asgs.some((a) => !a.staffId) && r.date >= date
  })
  const statusCounts = store.scopedRuns
    .filter((r) => r.date >= date)
    .reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
  const onLeaveToday = store.scopedLeaveRecords.filter(
    (l) => l.approval !== "rejected" && date >= l.startDate && date <= l.endDate,
  )
  const expiringValidity = store.scopedStaff.flatMap((s) =>
    s.homePositions
      .map((posId) => {
        const v = store.validityFor(s.id, posId)
        return { staff: s, posId, ...v }
      })
      .filter((v) => v.status === "expiring" || v.status === "expired"),
  )
  const upcomingTraining = store.scopedTrainingSessions
    .filter((t) => t.date >= date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  // Free / unassigned people for the selected day: active staff who are NOT
  // seated on any run that day, NOT on leave, NOT in training, and NOT on
  // another committed task. These are the people available to pull in.
  const assignedStaffIds = new Set(
    store.scopedRuns
      .filter((r) => r.date === date && r.status !== "cancelled")
      .flatMap((r) => store.assignmentsForRun(r.id))
      .filter((a) => a.staffId)
      .map((a) => a.staffId as string),
  )
  const freeStaff = store.scopedStaff.filter(
    (s) =>
      s.active !== false &&
      !assignedStaffIds.has(s.id) &&
      !store.isOnLeave(s.id, date) &&
      !store.isInTraining(s.id, date) &&
      !store.otherTaskOn(s.id, date),
  )

  // conflict warnings: assigned staff who are on leave / in training / expired
  const conflicts: { run: string; detail: string }[] = []
  store.scopedRuns
    .filter((r) => r.date >= date && r.status !== "cancelled")
    .forEach((r) => {
      store.assignmentsForRun(r.id).forEach((a) => {
        if (!a.staffId) return
        const s = store.staffById(a.staffId)
        if (!s) return
        const pos = store.positionById(a.positionId)
        if (store.isOnLeave(a.staffId, r.date))
          conflicts.push({ run: r.id, detail: `${s.initials} assigned ${pos?.code} but on leave` })
        else if (store.isInTraining(a.staffId, r.date))
          conflicts.push({ run: r.id, detail: `${s.initials} assigned ${pos?.code} but in training` })
        else {
          const v = store.validityFor(a.staffId, a.positionId)
          if (v.status === "expired" && !a.manualOverride)
            conflicts.push({ run: r.id, detail: `${s.initials} expired for ${pos?.code}` })
        }
      })
    })

  const stats = [
    { label: isToday ? "Today's Runs" : "Runs This Day", value: todaysRuns.length, icon: PlaneTakeoff, href: "/daily", tint: "text-primary" },
    { label: "Incomplete Plans", value: incompletePlans.length, icon: ClipboardList, href: "/seating", tint: "text-amber-600" },
    { label: isToday ? "On Leave Today" : "On Leave", value: onLeaveToday.length, icon: CalendarOff, href: "/leave", tint: "text-violet-600" },
    { label: "Validity Alerts", value: expiringValidity.length, icon: ShieldAlert, href: "/validity", tint: "text-red-600" },
  ]

  return (
    <>
      <PageHeader
        title="Operations Dashboard"
        description={`${isToday ? "Live overview" : "Overview"} for ${formatDate(date)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DayNavigator date={date} onDateChange={setDate} />
            <WeeklyPushDialog />
            <Button
              nativeButton={false}
              render={
                <Link href="/daily">
                  <ClipboardList className="size-4" /> Open Run Planner
                </Link>
              }
            />
          </div>
        }
      />

      <DashboardSearch />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{s.value}</p>
                </div>
                <s.icon className={`size-7 ${s.tint}`} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Today's runs */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <PlaneTakeoff className="size-4 text-primary" /> {isToday ? "Today's Runs" : `Runs · ${formatShort(date)}`}
            </CardTitle>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/daily">View all</Link>} />
          </CardHeader>
          <CardContent className="space-y-2">
            {todaysRuns.length === 0 ? (
              <EmptyState icon={PlaneTakeoff} title="No runs scheduled" description={isToday ? "Enjoy the quiet day on the floor." : `Nothing scheduled for ${formatShort(date)}.`} />
            ) : (
              todaysRuns.map((r) => {
                const ex = store.exerciseById(r.exerciseId)
                const sim = store.simulatorById(r.simulatorId)
                const asgs = store.assignmentsForRun(r.id)
                const filled = asgs.filter((a) => a.staffId).length
                return (
                  <Link
                    key={r.id}
                    href={`/seating?run=${r.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex w-14 flex-col items-center rounded-md bg-muted px-2 py-1">
                        <span className="text-sm font-semibold tabular-nums">{r.slotTime}</span>
                        <span className="text-[10px] text-muted-foreground">{sim?.code}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {ex?.code} · {ex?.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {filled}/{asgs.length} positions filled
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={r.status} />
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Exercise status summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-emerald-600" /> Exercise Status
            </CardTitle>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/exercises">View all</Link>} />
          </CardHeader>
          <CardContent className="space-y-1">
            {["confirmed", "tentative", "completed", "postponed", "cancelled"].map((st) => (
              <Link
                key={st}
                href="/daily"
                className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
              >
                <StatusBadge status={st} />
                <span className="text-lg font-semibold tabular-nums">{statusCounts[st] ?? 0}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {/* Free / unassigned people */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="size-4 text-emerald-600" /> {isToday ? "Free Today" : `Free · ${formatShort(date)}`}
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {freeStaff.length}
              </span>
            </CardTitle>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/staff">View all</Link>} />
          </CardHeader>
          <CardContent className="space-y-1">
            {freeStaff.length === 0 ? (
              <EmptyState icon={UserCheck} title="No one free" description="Everyone is assigned, on leave, or training." />
            ) : (
              freeStaff.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/40"
                >
                  <Link href={`/staff?staff=${s.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[8px]">{s.initials.slice(0, 3)}</AvatarFallback>
                    </Avatar>
                    <span className="truncate">
                      {s.firstName} {s.lastName[0]}.
                    </span>
                    <span className="text-xs text-muted-foreground">{s.rank}</span>
                  </Link>
                  <AssignFreeStaffPopover
                    staff={s}
                    date={date}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                        <UserPlus className="size-3.5" /> Assign
                      </Button>
                    }
                  />
                </div>
              ))
            )}
            {freeStaff.length > 8 && (
              <p className="pt-1 text-center text-xs text-muted-foreground">+{freeStaff.length - 8} more available</p>
            )}
          </CardContent>
        </Card>

        {/* Conflicts */}
        <Card className="border-amber-500/40">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-amber-600" /> Conflict Warnings
            </CardTitle>
            {conflicts.length > 0 && (
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/seating">Resolve</Link>} />
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {conflicts.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No conflicts detected" />
            ) : (
              conflicts.slice(0, 6).map((c, i) => (
                <Link
                  key={i}
                  href={`/seating?run=${c.run}`}
                  className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-xs transition-colors hover:bg-amber-500/20"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <span>
                    <span className="font-medium">{c.run.toUpperCase()}</span> — {c.detail}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Validity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-red-600" /> Expiring / Expired
            </CardTitle>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/validity">View all</Link>} />
          </CardHeader>
          <CardContent className="space-y-1">
            {expiringValidity.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="All validities current" />
            ) : (
              expiringValidity.slice(0, 6).map((v, i) => (
                <Link
                  key={i}
                  href={`/staff?staff=${v.staff.id}`}
                  className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback className="text-[8px]">{v.staff.initials.slice(0, 3)}</AvatarFallback>
                    </Avatar>
                    <span>
                      {v.staff.firstName} {v.staff.lastName[0]}. · {store.positionById(v.posId)?.code}
                    </span>
                  </div>
                  <StatusBadge status={v.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Training & leave */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-blue-600" /> Upcoming Training
            </CardTitle>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/training">View all</Link>} />
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingTraining.length === 0 ? (
              <EmptyState icon={GraduationCap} title="No training scheduled" />
            ) : (
              upcomingTraining.map((t) => (
                <Link
                  key={t.id}
                  href={`/training?training=${t.id}`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-blue-600" />
                    <div>
                      <p className="font-medium leading-tight">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{formatShort(t.date)} · {t.slotTime}</p>
                    </div>
                  </div>
                  <StatusBadge status="training" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analytics — leave, training and simulator utilisation trends */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Analytics</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <LeaveTrendChart href="/leave" />
          <TrainingTrendChart href="/training" />
        </div>
        <div className={`grid gap-4 ${store.activeProgram === "ALL" ? "xl:grid-cols-2" : ""}`}>
          {(store.activeProgram === "ALL" ? (["RADAR", "TOWER"] as const) : ([store.activeProgram] as const)).map(
            (program) => (
              <SimHoursChart key={program} program={program} href="/sim-hours" />
            ),
          )}
        </div>
      </div>
    </>
  )
}
