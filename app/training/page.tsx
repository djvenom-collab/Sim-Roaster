"use client"

/* ===========================================================================
 * SIM OPS TRAINING PAGE ("/training") — training sessions & attendance
 * ===========================================================================
 * Lists training sessions (initial validation, annual checks, remedial, etc.),
 * who instructs and who attends, plus file attachments. Being in a session
 * makes a person "busy" that day so they won't be scheduled onto a run.
 *
 * CHANGEABLE: the training types/titles are seeded in lib/sample-data.ts.
 * Attachments upload via the API routes under app/api/training-attachments.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { useDeepLinkHighlight, HIGHLIGHT_RING } from "@/lib/use-deep-link"
import { cn } from "@/lib/utils"
import { can } from "@/lib/permissions"
import { PageHeader, EmptyState } from "@/components/shared"
import { DayNavigator } from "@/components/day-navigator"
import { useScopedDate } from "@/lib/use-scoped-date"
import { TrainingTrendChart } from "@/components/charts/training-trend-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, GraduationCap, User, Users, MapPin, CalendarClock, Pencil, Trash2, Send, AlertTriangle, ClipboardList } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { NotifyTrainingDialog } from "@/components/notify-training-dialog"
import { TrainingLog } from "@/components/training-log"
import { OjtiMetrics } from "@/components/ojti-metrics"
import { formatDate, todayISO } from "@/lib/dates"
import type { TrainingSession, TrainingAttachment } from "@/lib/types"
import { TrainingAttachmentsEditor, TrainingAttachmentsList } from "@/components/training-attachments"

const TYPES = [
  "Initial Validation",
  "Annual COC",
  "Remedial Training",
  "Continuation Training",
] as const

// Sections render in this order; any legacy/unknown type falls into "Other".
const SECTIONS = [...TYPES, "Other"] as const

export default function TrainingPage() {
  const store = useStore()
  const canManage = can(store.currentRole, "manage_training")
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [type, setType] = useState(TYPES[0])
  const [date, setDate] = useState(todayISO())
  const [slot, setSlot] = useState("09:00")
  const [instructor, setInstructor] = useState(store.scopedStaff[0]?.id ?? "")
  const [simId, setSimId] = useState<string>("none")
  const [durationMin, setDurationMin] = useState<number>(120)
  const [positionIds, setPositionIds] = useState<string[]>([])
  const [trainees, setTrainees] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [attachments, setAttachments] = useState<TrainingAttachment[]>([])
  const [deleteTarget, setDeleteTarget] = useState<TrainingSession | null>(null)
  const [activeType, setActiveType] = useState<(typeof SECTIONS)[number] | "All">("All")

  // Day-scoped view (like the Daily Run Planner): step through days and see only
  // that day's sessions. "View all" bypasses the day filter and lists every
  // session (newest first) grouped by type — the original behaviour.
  const [navDate, setNavDate] = useScopedDate()
  const [viewAll, setViewAll] = useState(false)
  const [tab, setTab] = useState<"sessions" | "log" | "ojti">("sessions")

  // Deep link: /training?training=<id> must reveal the session regardless of the
  // current day, so it switches to All types AND View all before highlighting.
  const highlightTraining = useDeepLinkHighlight("training", "training", () => {
    setActiveType("All")
    setViewAll(true)
  })

  // Program- AND year-scoped (reportTrainingSessions) so the sessions list — in
  // both day view and "view all" — reflects the top-bar program and year slicer.
  const allSorted = [...store.reportTrainingSessions].sort((a, b) => b.date.localeCompare(a.date))
  // The list the page actually renders: every session in view-all mode, else
  // just the sessions on the selected day.
  const sorted = viewAll ? allSorted : allSorted.filter((s) => s.date === navDate)

  const sectionOf = (t: string) => (TYPES.includes(t as (typeof TYPES)[number]) ? t : "Other")
  const grouped = SECTIONS.map((section) => ({
    section,
    sessions: sorted.filter((s) => sectionOf(s.type) === section),
  }))
    // In view-all keep the fixed TYPE sections (even if empty); in day view only
    // show sections that actually have a session so the day isn't full of blanks.
    .filter((g) => (viewAll ? g.section !== "Other" || g.sessions.length > 0 : g.sessions.length > 0))

  const visibleGroups = activeType === "All" ? grouped : grouped.filter((g) => g.section === activeType)
  const countFor = (section: (typeof SECTIONS)[number]) =>
    sorted.filter((s) => sectionOf(s.type) === section).length

  const toggleTrainee = (id: string) =>
    setTrainees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const togglePosition = (id: string) =>
    setPositionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const resetForm = () => {
    setTitle("")
    setType(TYPES[0])
    setDate(todayISO())
    setSlot("09:00")
    setInstructor(store.scopedStaff[0]?.id ?? "")
    setSimId("none")
    setDurationMin(120)
    setPositionIds([])
    setTrainees([])
    setNotes("")
    setAttachments([])
  }

  const openAdd = () => {
    setEditId(null)
    resetForm()
    setOpen(true)
  }

  const openEdit = (session: TrainingSession) => {
    setEditId(session.id)
    setTitle(session.title)
    setType(session.type)
    setDate(session.date)
    setSlot(session.slotTime)
    setInstructor(session.instructorId)
    setSimId(session.simulatorId ?? "none")
    setDurationMin(session.durationMin ?? 120)
    setPositionIds(session.positionIds ?? [])
    setTrainees(
      store.trainingAttendance.filter((a) => a.sessionId === session.id).map((a) => a.staffId),
    )
    setNotes(session.notes ?? "")
    setAttachments(session.attachments ?? [])
    setOpen(true)
  }

  const submit = () => {
    if (!title.trim()) {
      toast.error("Title required")
      return
    }
    if (editId) {
      const existing = store.scopedTrainingSessions.find((s) => s.id === editId)
      const t: TrainingSession = {
        ...(existing as TrainingSession),
        id: editId,
        title: title.trim(),
        type,
        date,
        slotTime: slot,
        instructorId: instructor,
        simulatorId: simId === "none" ? undefined : simId,
        durationMin,
        positionIds: positionIds.length ? positionIds : undefined,
        notes: notes.trim() || undefined,
        status: existing?.status ?? (date < todayISO() ? "completed" : "scheduled"),
        attachments: attachments.length ? attachments : undefined,
      }
      store.updateTraining(t, trainees)
      toast.success("Training session updated")
    } else {
      const t: TrainingSession = {
        id: `tr-${Date.now()}`,
        title: title.trim(),
        type,
        date,
        slotTime: slot,
        instructorId: instructor,
        simulatorId: simId === "none" ? undefined : simId,
        durationMin,
        positionIds: positionIds.length ? positionIds : undefined,
        notes: notes.trim() || undefined,
        status: date < todayISO() ? "completed" : "scheduled",
        attachments: attachments.length ? attachments : undefined,
      }
      store.addTraining(t, trainees)
      toast.success("Training session created")
    }
    setOpen(false)
    setEditId(null)
    resetForm()
  }

  const handleDelete = (session: TrainingSession) => {
    store.deleteTraining(session.id)
    toast.success("Training session deleted")
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        description="Schedule training sessions, assign instructors, and track attendance."
        actions={
          tab !== "sessions" ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <DayNavigator date={navDate} onDateChange={setNavDate} viewAll={viewAll} onViewAllChange={setViewAll} />
            <Dialog
              open={open}
              onOpenChange={(o) => {
                setOpen(o)
                if (!o) setEditId(null)
              }}
            >
              <Button disabled={!canManage} onClick={openAdd}>
                <Plus className="size-4" /> New Session
              </Button>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editId ? "Edit Training Session" : "New Training Session"}</DialogTitle>
                <DialogDescription>
                  {editId ? "Update the session details and enrolled trainees." : "Create a session and enrol trainees."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="t-title">Title</Label>
                  <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. LVP Refresher" />
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Instructor</Label>
                  <Select value={instructor} onValueChange={setInstructor}>
                    <SelectTrigger>
                      <SelectValue>
                        {(value) => {
                          const s = store.scopedStaff.find((x) => x.id === value)
                          return s ? `${s.firstName} ${s.lastName} (${s.initials})` : "Select instructor"
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {store.scopedStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} ({s.initials})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-date">Date</Label>
                  <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-slot">Time</Label>
                  <Input id="t-slot" type="time" value={slot} onChange={(e) => setSlot(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="t-duration">Duration (minutes)</Label>
                  <Input
                    id="t-duration"
                    type="number"
                    min={15}
                    step={15}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Simulator (optional)</Label>
                  <Select value={simId} onValueChange={setSimId}>
                    <SelectTrigger>
                      <SelectValue>
                        {(value) => {
                          if (!value || value === "none") return "None (classroom)"
                          const s = store.scopedSimulators.find((x) => x.id === value)
                          return s ? `${s.code} — ${s.name}` : "None (classroom)"
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (classroom)</SelectItem>
                      {store.scopedSimulators.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Positions (optional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Optionally tag the positions this training covers.
                  </p>
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
                    {store.scopedPositions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No positions available.</p>
                    ) : (
                      store.scopedPositions.map((p) => {
                        const on = positionIds.includes(p.id)
                        return (
                          <button key={p.id} type="button" onClick={() => togglePosition(p.id)}>
                            <Badge
                              variant={on ? "default" : "outline"}
                              className={`cursor-pointer font-mono ${on ? "" : "text-muted-foreground"}`}
                              title={p.name}
                            >
                              {p.code}
                            </Badge>
                          </button>
                        )
                      })
                    )}
                  </div>
                  {positionIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{positionIds.length} position(s) selected</p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Trainees</Label>
                  <p className="text-xs text-muted-foreground">
                    Select staff to enrol in this session. They are added as attendees and marked busy on the day.
                  </p>
                  <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-md border p-2">
                    {store.scopedStaff
                      .filter((s) => s.id !== instructor && s.active)
                      .map((s) => {
                        const on = trainees.includes(s.id)
                        return (
                          <button key={s.id} type="button" onClick={() => toggleTrainee(s.id)}>
                            <Badge
                              variant={on ? "default" : "outline"}
                              className={`cursor-pointer ${on ? "" : "text-muted-foreground"}`}
                            >
                              {s.firstName} {s.lastName}
                            </Badge>
                          </button>
                        )
                      })}
                  </div>
                  {trainees.length > 0 && (
                    <p className="text-xs text-muted-foreground">{trainees.length} trainee(s) selected</p>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="t-notes">Notes</Label>
                  <Textarea id="t-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Attachments</Label>
                  <TrainingAttachmentsEditor attachments={attachments} onChange={setAttachments} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submit}>{editId ? "Save changes" : "Create session"}</Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          </div>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "sessions" | "log" | "ojti")} className="space-y-6">
        <TabsList className="w-fit">
          <TabsTrigger value="sessions" className="gap-1.5">
            <GraduationCap className="size-4" /> Sessions
          </TabsTrigger>
          <TabsTrigger value="log" className="gap-1.5">
            <ClipboardList className="size-4" /> OJT Log
          </TabsTrigger>
          <TabsTrigger value="ojti" className="gap-1.5">
            <Users className="size-4" /> OJTI Hours
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-0 space-y-6">
      <p className="text-sm text-muted-foreground">
        {viewAll
          ? `All sessions · ${allSorted.length} total`
          : `${formatDate(navDate)} · ${sorted.length} session(s) this day`}
      </p>

      <TrainingTrendChart />

      {sorted.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={viewAll ? "No training sessions" : "No training on this day"}
          description={viewAll ? undefined : "Step to another day or use View all to see every session."}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by training type">
            {(["All", ...TYPES] as const).map((t) => {
              const active = activeType === t
              return (
                <Button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => setActiveType(t)}
                  className="gap-2"
                >
                  {t}
                  <Badge variant={active ? "secondary" : "outline"} className="px-1.5">
                    {t === "All" ? sorted.length : countFor(t)}
                  </Badge>
                </Button>
              )
            })}
          </div>
          {visibleGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No {activeType === "All" ? "" : `${activeType} `}sessions {viewAll ? "found" : "on this day"}.
            </p>
          )}
          {visibleGroups.map((group) => (
            <section key={group.section} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{group.section}</h2>
                <Badge variant="secondary">{group.sessions.length}</Badge>
              </div>
              {group.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions in this category.</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {group.sessions.map((session) => {
            const instructor = store.staffById(session.instructorId)
            const sim = session.simulatorId ? store.simulatorById(session.simulatorId) : null
            const attendees = store.trainingAttendance.filter((a) => a.sessionId === session.id)
            const present = attendees.filter((a) => a.attended).length
            // Trainees can only see materials if they're enrolled; managers and the instructor always can.
            const isEnrolled = store.currentUser?.staffId
              ? attendees.some((a) => a.staffId === store.currentUser!.staffId) ||
                session.instructorId === store.currentUser!.staffId
              : false
            const canSeeMaterials = canManage || isEnrolled
            return (
              <Card
                key={session.id}
                id={`training-${session.id}`}
                className={cn("scroll-mt-24 transition-shadow", highlightTraining === session.id && HIGHLIGHT_RING)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{session.title}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{session.type}</Badge>
                        {(session.status ?? (session.date < todayISO() ? "completed" : "scheduled")) === "completed" ? (
                          <Badge variant="default">Completed</Badge>
                        ) : (
                          <Badge variant="outline">Scheduled</Badge>
                        )}
                        {store.needsNotify(`training:${session.id}`) && (
                          <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="size-3" /> Changes not notified
                          </Badge>
                        )}
                        <span className="flex items-center gap-1">
                          <CalendarClock className="size-3" /> {formatDate(session.date)} · {session.slotTime}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={present === attendees.length && attendees.length > 0 ? "default" : "outline"}>
                        {present}/{attendees.length} present
                      </Badge>
                      {canManage && (
                        <>
                          <NotifyTrainingDialog
                            session={session}
                            trigger={
                              <Button variant="ghost" size="icon" className="size-7" aria-label="Notify attendees">
                                <Send className="size-3.5" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label="Edit session"
                            onClick={() => openEdit(session)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            aria-label="Delete session"
                            onClick={() => setDeleteTarget(session)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="size-3" /> Instructor: {instructor?.firstName} {instructor?.lastName}
                    </span>
                    {sim && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {sim.code}
                      </span>
                    )}
                    {session.durationMin != null && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3" /> {session.durationMin} min
                      </span>
                    )}
                    {session.positionIds && session.positionIds.length > 0 && (
                      <span className="flex flex-wrap items-center gap-1">
                        {session.positionIds.map((pid) => (
                          <Badge key={pid} variant="outline" className="font-mono text-[10px]">
                            {store.positionById(pid)?.code ?? pid}
                          </Badge>
                        ))}
                      </span>
                    )}
                    {session.linkedRunId && (
                      <Badge variant="outline" className="text-[10px]">
                        Linked to {store.exerciseById(store.runs.find((r) => r.id === session.linkedRunId)?.exerciseId ?? "")?.name ?? session.linkedRunId}
                      </Badge>
                    )}
                  </div>
                  {session.notes && <p className="text-sm text-muted-foreground">{session.notes}</p>}
                  {canSeeMaterials && session.attachments && session.attachments.length > 0 && (
                    <TrainingAttachmentsList attachments={session.attachments} />
                  )}
                  <div className="space-y-1.5 border-t pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attendance</p>
                    {attendees.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No attendees added.</p>
                    ) : canManage ? (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {attendees.map((a) => {
                          const s = store.staffById(a.staffId)
                          return (
                            <label
                              key={a.id}
                              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                            >
                              <Checkbox
                                checked={a.attended}
                                disabled={!canManage}
                                onCheckedChange={() => store.toggleAttendance(session.id, a.staffId)}
                              />
                              <span>
                                {s?.firstName} {s?.lastName}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    ) : (
                      // Sim Pilots only need the headcount, not the named roster.
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground tabular-nums">{attendees.length}</span>{" "}
                        {attendees.length === 1 ? "trainee" : "trainees"} enrolled
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
                    )
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
        </TabsContent>

        <TabsContent value="log" className="mt-0">
          <TrainingLog />
        </TabsContent>

        <TabsContent value="ojti" className="mt-0">
          <OjtiMetrics />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete training session"
        description={`Remove "${deleteTarget?.title ?? ""}" and its attendance records? This cannot be undone.`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  )
}
