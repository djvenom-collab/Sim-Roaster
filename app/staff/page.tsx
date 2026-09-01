"use client"

/* ===========================================================================
 * STAFF DETAILS PAGE ("/staff") — the people directory
 * ===========================================================================
 * Browse and edit staff: contact details, rank, program(s), home positions,
 * and a per-person profile with tabs for their currency, run history, training,
 * "Other Tasks" they're committed to, and leave.
 *
 * The starting roster comes from the DIM roster (lib/dim/sample.ts); edits made
 * here update the live store copy. A person's home positions and programs
 * directly affect which seats they can be scheduled into.
 * =========================================================================== */
import { useEffect, useState } from "react"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared"
import { StaffEditorDialog } from "@/components/staff-editor-dialog"
import { PersonActivityChart } from "@/components/charts/person-activity-chart"
import { StaffOjtProgress } from "@/components/staff-ojt-progress"
import { StaffGroupValidations } from "@/components/staff-group-validations"
import { traineeOjtSummary } from "@/lib/training-log-analytics"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Search,
  Mail,
  Phone,
  ChevronLeft,
  UserX,
  Plus,
  Pencil,
  Trash2,
  Clock,
  Repeat,
  GraduationCap,
  CalendarOff,
  ClipboardList,
} from "lucide-react"
import { formatDate, todayISO, daysBetween } from "@/lib/dates"
import { runHours } from "@/lib/analytics"
import { programBadgeClass, programDisplay, type Program } from "@/lib/program"
import { cn } from "@/lib/utils"

export default function StaffPage() {
  const store = useStore()
  const canManage = can(store.currentRole, "manage_staff")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  // Allow other pages (e.g. the dashboard search) to deep-link straight to a
  // profile via /staff?staff=<id>. Read it once on mount from the URL.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("staff")
    if (id) setSelected(id)
  }, [])

  const filtered = store.scopedStaff.filter((s) =>
    `${s.firstName} ${s.lastName} ${s.initials} ${s.rank}`.toLowerCase().includes(search.toLowerCase()),
  )

  if (selected) {
    return <StaffDetail id={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Profiles"
        description="Directory of SIM staff with roles, validity and history."
        actions={
          canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add staff
            </Button>
          )
        }
      />
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search staff…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {addOpen && <StaffEditorDialog open={addOpen} onOpenChange={setAddOpen} />}

      {filtered.length === 0 ? (
        <EmptyState icon={UserX} title="No staff found" description="Try a different search term." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => {
            const quals = store.qualsForStaff(s.id)
            const ojt = traineeOjtSummary(store.trainingLogs, s.id, store.trainingGroups)
            return (
              <button key={s.id} onClick={() => setSelected(s.id)} className="text-left">
                <Card className="transition-colors hover:border-primary/50 hover:bg-accent/40">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Avatar className="size-11">
                      <AvatarFallback className="text-xs">{s.initials.slice(0, 3)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">
                          {s.firstName} {s.lastName}
                        </span>
                        {!s.active && (
                          <Badge variant="secondary" className="text-[10px]">
                            Inactive
                          </Badge>
                        )}
                        {ojt.groupsInTraining > 0 && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <GraduationCap className="size-2.5" /> In training
                          </Badge>
                        )}
                        {ojt.groupsInTraining === 0 && ojt.groupsCompleted > 0 && (
                          <Badge className="gap-1 bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
                            <GraduationCap className="size-2.5" /> OJT complete
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{s.rank}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(s.programs as Program[]).map((pr) => (
                          <Badge
                            key={pr}
                            variant="outline"
                            className={cn("px-1 py-0 text-[9px]", programBadgeClass(pr))}
                          >
                            {programDisplay(pr)}
                          </Badge>
                        ))}
                        {s.homePositions.map((p) => (
                          <Badge key={p} variant="outline" className="px-1 py-0 text-[9px] font-mono">
                            {store.positionById(p)?.code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {quals.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {quals.length} qual{quals.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StaffDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const store = useStore()
  const canManage = can(store.currentRole, "manage_staff")
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const s = store.staffById(id)
  if (!s) return null

  const quals = store.qualsForStaff(id)
  const validityRows = s.homePositions.map((posId) => ({
    posId,
    v: store.validityFor(id, posId),
  }))
  const today = todayISO()
  // Run History is history — only runs that have already happened (on or before
  // today). Future-dated runs are part of the schedule, not history.
  const runHistory = store.runAssignments
    .filter((a) => a.staffId === id)
    .map((a) => ({ a, run: store.runs.find((r) => r.id === a.runId)! }))
    .filter((x) => x.run && x.run.date <= today)
    .sort((x, y) => y.run.date.localeCompare(x.run.date))
  const leaveHistory = store.leaveRecords.filter((l) => l.staffId === id)
  const taskHistory = store.otherTasks
    .filter((t) => t.staffIds.includes(id))
    .sort((x, y) => y.startDate.localeCompare(x.startDate))
  const trainingHistory = store.trainingAttendance
    .filter((t) => t.staffId === id)
    .map((t) => ({ t, session: store.trainingSessions.find((x) => x.id === t.sessionId)! }))
    .filter((x) => x.session)

  const userRole = store.users.find((u) => u.staffId === id)?.role

  // ── Year-to-date summary: total simulator hours vs. other activity ────────
  // All figures are for the CURRENT year up to today, so they line up with the
  // "Activity This Year" chart's YTD subtitle and the Run History table.
  const currentYear = new Date().getFullYear()
  const yearStart = `${currentYear}-01-01`
  const inYTD = (d: string) => d >= yearStart && d <= today
  // Only COMPLETED runs count as delivered simulator time.
  const completedRuns = runHistory.filter((x) => x.run.status === "completed" && inYTD(x.run.date))
  const simHours = completedRuns.reduce((sum, x) => sum + runHours(x.run, store.exerciseById), 0)
  const runsSat = completedRuns.length
  const trainingAttended = trainingHistory.filter(
    (x) => x.t.attended && inYTD(x.session.date),
  ).length
  let leaveDays = 0
  for (const l of leaveHistory) {
    if (l.approval === "rejected") continue
    const start = l.startDate < yearStart ? yearStart : l.startDate
    const end = l.endDate > today ? today : l.endDate
    if (start > end) continue
    leaveDays += daysBetween(start, end) + 1
  }
  const dutyDays = taskHistory.filter((t) => inYTD(t.startDate)).length
  const activityCount = runsSat + trainingAttended + leaveDays + dutyDays
  const avgPerRun = runsSat ? simHours / runsSat : 0
  const round1 = (n: number) => Math.round(n * 10) / 10

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ChevronLeft className="size-4" /> Back to directory
        </Button>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {editOpen && <StaffEditorDialog open={editOpen} onOpenChange={setEditOpen} staff={s} />}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Delete ${s.firstName} ${s.lastName}?`}
        description="This removes the staff member and clears them from any run assignments and validity records. This cannot be undone."
        onConfirm={() => {
          store.deleteStaff(s.id)
          toast.success("Staff member deleted")
          onBack()
        }}
      />

      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center">
        <Avatar className="size-16">
          <AvatarFallback className="text-base">{s.initials.slice(0, 3)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {s.firstName} {s.lastName}
            </h1>
            {!s.active && <Badge variant="secondary">Inactive</Badge>}
            {userRole && <Badge>{userRole}</Badge>}
            {(s.programs as Program[]).map((pr) => (
              <Badge key={pr} variant="outline" className={cn(programBadgeClass(pr))}>
                {programDisplay(pr)}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {s.rank} · Initials {s.initials} · Joined {formatDate(s.joined)}
          </p>
          <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Mail className="size-3" /> {s.email}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="size-3" /> {s.phone}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoCard label="Operational Positions">
          <div className="flex flex-wrap gap-1">
            {s.homePositions.map((p) => (
              <Badge key={p} variant="outline" className="font-mono">
                {store.positionById(p)?.code}
              </Badge>
            ))}
          </div>
        </InfoCard>
        <InfoCard label="Qualifications">
          {quals.length ? (
            <div className="flex flex-wrap gap-1">
              {quals.map((q) => (
                <Badge key={q.id} variant={q.effect === "restrict" ? "destructive" : "secondary"}>
                  {q.code}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">None</span>
          )}
        </InfoCard>
        <InfoCard label="Restrictions / Notes">
          <span className="text-sm text-muted-foreground">
            {quals.filter((q) => q.effect === "restrict").map((q) => q.name).join(", ") || s.notes || "None"}
          </span>
        </InfoCard>
      </div>

      <StaffGroupValidations staffId={id} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Hours vs Activity · {currentYear} year to date
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile icon={Repeat} label="Exercises Sat" value={runsSat} />
            <StatTile icon={Clock} label="Sim Hours" value={round1(simHours)} accent />
            <StatTile icon={GraduationCap} label="Training" value={trainingAttended} />
            <StatTile icon={CalendarOff} label="Leave Days" value={leaveDays} />
            <StatTile icon={ClipboardList} label="Other Duties" value={dutyDays} />
          </div>
          <p className="text-pretty text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{round1(simHours)} simulator hours</span>{" "}
            delivered across{" "}
            <span className="font-medium text-foreground">{activityCount} recorded activities</span>{" "}
            this year — averaging{" "}
            <span className="font-medium text-foreground">{round1(avgPerRun)} h</span> per exercise sat.
          </p>
        </CardContent>
      </Card>

      <PersonActivityChart staffId={id} />

      <Tabs defaultValue="validity">
        <TabsList>
          <TabsTrigger value="validity">Validity</TabsTrigger>
          <TabsTrigger value="runs">Run History</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="ojt">OJT Progress</TabsTrigger>
          <TabsTrigger value="tasks">Other Tasks</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
        </TabsList>

        <TabsContent value="validity">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Position</TableHead>
                    <TableHead>Last Date Sat</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validityRows.map(({ posId, v }) => (
                    <TableRow key={posId}>
                      <TableCell className="font-medium">
                        <Badge variant="outline" className="font-mono">
                          {store.positionById(posId)?.code}
                        </Badge>{" "}
                        {store.positionById(posId)?.name}
                      </TableCell>
                      <TableCell>{v.lastDateSat ? formatDate(v.lastDateSat) : "—"}</TableCell>
                      <TableCell>{v.expiry ? formatDate(v.expiry) : "—"}</TableCell>
                      <TableCell>{v.daysRemaining ?? "—"}</TableCell>
                      <TableCell>
                        <StatusBadge status={v.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardContent className="p-0">
              {runHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No run history.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Exercise</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runHistory.slice(0, 15).map(({ a, run }) => (
                      <TableRow key={a.id}>
                        <TableCell>{formatDate(run.date)}</TableCell>
                        <TableCell>{store.exerciseById(run.exerciseId)?.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {store.positionById(a.positionId)?.code}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={run.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training">
          <Card>
            <CardContent className="p-0">
              {trainingHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No training history.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Attendance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingHistory.map(({ t, session }) => (
                      <TableRow key={t.id}>
                        <TableCell>{formatDate(session.date)}</TableCell>
                        <TableCell>{session.title}</TableCell>
                        <TableCell>{session.type}</TableCell>
                        <TableCell>
                          <Badge variant={t.attended ? "default" : "secondary"}>
                            {t.attended ? "Attended" : "Scheduled"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ojt">
          <StaffOjtProgress staffId={id} />
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardContent className="p-0">
              {taskHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Not assigned to any other tasks.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Program</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taskHistory.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="font-medium">{t.title}</div>
                          {t.description && (
                            <div className="max-w-md text-pretty text-xs text-muted-foreground">{t.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">
                          {t.startDate === t.endDate
                            ? formatDate(t.startDate)
                            : `${formatDate(t.startDate)} → ${formatDate(t.endDate)}`}
                          {(t.startTime || t.durationMin) && (
                            <span className="block text-xs text-muted-foreground">
                              {t.startTime ? t.startTime : ""}
                              {t.startTime && t.endTime ? `–${t.endTime}` : ""}
                              {t.durationMin ? `${t.startTime ? " · " : ""}${t.durationMin} min` : ""}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.classroom || "—"}</TableCell>
                        <TableCell>
                          {t.program ? (
                            <Badge variant="outline" className={cn(programBadgeClass(t.program as Program))}>
                              {programDisplay(t.program)}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave">
          <Card>
            <CardContent className="p-0">
              {leaveHistory.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No leave records.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Approval</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaveHistory.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.type}</TableCell>
                        <TableCell>{formatDate(l.startDate)}</TableCell>
                        <TableCell>{formatDate(l.endDate)}</TableCell>
                        <TableCell>
                          <StatusBadge status={l.approval} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className={cn("rounded-lg border p-3", accent ? "border-primary/30 bg-primary/5" : "bg-card")}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accent && "text-primary")}>{value}</div>
    </div>
  )
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
