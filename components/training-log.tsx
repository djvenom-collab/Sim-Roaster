"use client"

/* ===========================================================================
 * OJTI TRAINING LOG — daily on-the-job training records per trainee
 * ===========================================================================
 * A running log written by OJTIs (instructors). Each entry captures a single
 * trainee's day of OJT: the position GROUP worked (positions are split into
 * fixed groups per program — see lib/training-groups.ts), the hours trained
 * that day, an overall rating, and written feedback for the trainee.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { EmptyState } from "@/components/shared"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { formatDate, todayISO } from "@/lib/dates"
import type { TrainingLogEntry } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Clock, GraduationCap, Pencil, Trash2, Star, ThumbsUp, Target } from "lucide-react"

type Program = "RADAR" | "TOWER"

const RATING_LABELS: Record<number, string> = {
  1: "Well below standard",
  2: "Below standard",
  3: "At standard",
  4: "Above standard",
  5: "Well above standard",
}

export function TrainingLog() {
  const store = useStore()
  const canManage = can(store.currentRole, "manage_training")

  // OJTI-qualified staff (holders of the OJTI qualification).
  const ojtiIds = useMemo(() => {
    const ojtiQual = store.qualifications.find((q) => q.code === "OJTI")
    if (!ojtiQual) return new Set<string>()
    return new Set(
      store.staffQualifications.filter((q) => q.qualificationId === ojtiQual.id).map((q) => q.staffId),
    )
  }, [store.qualifications, store.staffQualifications])

  // Editable position groups come from the store (DIM Lists → Training Groups).
  const trainingGroups = store.trainingGroups
  const groupsFor = useMemo(
    () => (p: Program) => trainingGroups.filter((g) => g.program === p),
    [trainingGroups],
  )
  const groupById = useMemo(
    () => (id: string) => trainingGroups.find((g) => g.id === id),
    [trainingGroups],
  )

  const [programFilter, setProgramFilter] = useState<"All" | Program>("All")

  // ── Add / edit dialog state ─────────────────────────────────────────────
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [program, setProgram] = useState<Program>("RADAR")
  const [groupId, setGroupId] = useState<string>(trainingGroups.find((g) => g.program === "RADAR")?.id ?? "")
  const [positionIds, setPositionIds] = useState<string[]>([])
  const [ojtiId, setOjtiId] = useState<string>("")
  const [traineeId, setTraineeId] = useState<string>("")
  const [hours, setHours] = useState<number>(2)
  const [rating, setRating] = useState<number>(3)
  const [strengths, setStrengths] = useState("")
  const [areasToImprove, setAreasToImprove] = useState("")
  const [feedback, setFeedback] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<TrainingLogEntry | null>(null)

  // Staff selectable for the chosen program (a person can be in both programs).
  const programStaff = useMemo(
    () => store.staff.filter((s) => s.active && s.programs.includes(program)),
    [store.staff, program],
  )
  // Only OJTI-qualified staff may be selected as the instructor.
  const qualifiedOjtiStaff = useMemo(
    () => programStaff.filter((s) => ojtiIds.has(s.id)),
    [programStaff, ojtiIds],
  )
  const groupPositions = groupById(groupId)?.positionIds ?? []

  // Base list follows the top-bar YEAR slicer (reportTrainingLogs); the local
  // All/RADAR/TOWER buttons remain a manual PROGRAM override on top of it.
  const entries = useMemo(() => {
    const list =
      programFilter === "All"
        ? store.reportTrainingLogs
        : store.reportTrainingLogs.filter((e) => e.program === programFilter)
    return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }, [store.reportTrainingLogs, programFilter])

  const countFor = (p: Program) => store.reportTrainingLogs.filter((e) => e.program === p).length

  const resetForm = () => {
    setDate(todayISO())
    setProgram("RADAR")
    setGroupId(groupsFor("RADAR")[0]?.id ?? "")
    setPositionIds([])
    setOjtiId("")
    setTraineeId("")
    setHours(2)
    setRating(3)
    setStrengths("")
    setAreasToImprove("")
    setFeedback("")
  }

  const openAdd = () => {
    setEditId(null)
    resetForm()
    setOpen(true)
  }

  const openEdit = (e: TrainingLogEntry) => {
    setEditId(e.id)
    setDate(e.date)
    setProgram(e.program)
    setGroupId(e.groupId)
    setPositionIds(e.positionIds)
    setOjtiId(e.ojtiId)
    setTraineeId(e.traineeId)
    setHours(e.hours)
    setRating(e.rating ?? 3)
    setStrengths(e.strengths ?? "")
    setAreasToImprove(e.areasToImprove ?? "")
    setFeedback(e.feedback ?? "")
    setOpen(true)
  }

  // Switching program resets the group + positions to that program's first group.
  const onProgramChange = (p: Program) => {
    setProgram(p)
    const first = groupsFor(p)[0]?.id ?? ""
    setGroupId(first)
    setPositionIds([])
    // The instructor must be OJTI-qualified for the newly selected program.
    setOjtiId((prev) => (prev && ojtiIds.has(prev) && store.staffById(prev)?.programs.includes(p) ? prev : ""))
  }
  const onGroupChange = (id: string) => {
    setGroupId(id)
    setPositionIds([])
  }
  const togglePosition = (id: string) =>
    setPositionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const submit = () => {
    if (!traineeId) {
      toast.error("Select a trainee")
      return
    }
    if (!ojtiId) {
      toast.error("Select an OJTI")
      return
    }
    if (traineeId === ojtiId) {
      toast.error("Trainee and OJTI must be different people")
      return
    }
    if (positionIds.length === 0) {
      toast.error("Select at least one position")
      return
    }
    if (!(hours > 0)) {
      toast.error("Enter the hours trained")
      return
    }
    if (editId) {
      const existing = store.trainingLogs.find((e) => e.id === editId)
      store.updateTrainingLog({
        ...(existing as TrainingLogEntry),
        id: editId,
        date,
        program,
        groupId,
        positionIds,
        ojtiId,
        traineeId,
        hours,
        rating,
        strengths: strengths.trim() || undefined,
        areasToImprove: areasToImprove.trim() || undefined,
        feedback: feedback.trim() || undefined,
      })
      toast.success("Log entry updated")
    } else {
      store.addTrainingLog({
        id: `tlog-${Date.now()}`,
        date,
        program,
        groupId,
        positionIds,
        ojtiId,
        traineeId,
        hours,
        rating,
        strengths: strengths.trim() || undefined,
        areasToImprove: areasToImprove.trim() || undefined,
        feedback: feedback.trim() || undefined,
        createdAt: new Date().toISOString(),
      })
      toast.success("Log entry added")
    }
    setOpen(false)
    setEditId(null)
    resetForm()
  }

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter training log by program">
          {(["All", "RADAR", "TOWER"] as const).map((p) => {
            const active = programFilter === p
            return (
              <Button
                key={p}
                type="button"
                role="tab"
                aria-selected={active}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setProgramFilter(p)}
                className="gap-2"
              >
                {p === "All" ? "All" : p === "RADAR" ? "Radar" : "Tower"}
                <Badge variant={active ? "secondary" : "outline"} className="px-1.5 tabular-nums">
                  {p === "All" ? store.reportTrainingLogs.length : countFor(p)}
                </Badge>
              </Button>
            )
          })}
        </div>
        <Button disabled={!canManage} onClick={openAdd}>
          <Plus className="size-4" /> New Log Entry
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {entries.length} entr{entries.length === 1 ? "y" : "ies"}
        {entries.length > 0 && (
          <>
            {" · "}
            <span className="font-medium text-foreground tabular-nums">{totalHours.toFixed(1)}</span> training hours logged
          </>
        )}
      </p>

      {entries.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No log entries yet"
          description={canManage ? "Add a daily OJT record for a trainee." : "OJTIs will add daily training records here."}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {entries.map((e) => {
            const trainee = store.staffById(e.traineeId)
            const ojti = store.staffById(e.ojtiId)
            const group = groupById(e.groupId)
            return (
              <Card key={e.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {trainee ? `${trainee.firstName} ${trainee.lastName}` : "Unknown trainee"}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="secondary">{e.program === "RADAR" ? "Radar" : "Tower"}</Badge>
                        {group && <Badge variant="outline">{group.label}</Badge>}
                        <span>{formatDate(e.date)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className="gap-1 tabular-nums">
                        <Clock className="size-3" /> {e.hours}h
                      </Badge>
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label="Edit log entry"
                            onClick={() => openEdit(e)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            aria-label="Delete log entry"
                            onClick={() => setDeleteTarget(e)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      OJTI: <span className="text-foreground">{ojti ? `${ojti.firstName} ${ojti.lastName}` : "—"}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1">
                      Positions:
                      {e.positionIds.map((pid) => (
                        <Badge key={pid} variant="outline" className="font-mono text-[10px]">
                          {store.positionById(pid)?.code ?? pid}
                        </Badge>
                      ))}
                    </span>
                  </div>

                  {e.rating != null && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5" aria-label={`Rating ${e.rating} of 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={
                              n <= e.rating!
                                ? "size-3.5 fill-amber-500 text-amber-500"
                                : "size-3.5 text-muted-foreground/40"
                            }
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">{RATING_LABELS[e.rating]}</span>
                    </div>
                  )}

                  {(e.strengths || e.areasToImprove || e.feedback) && (
                    <div className="space-y-2 border-t pt-3">
                      {e.strengths && (
                        <div className="flex gap-2">
                          <ThumbsUp className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">Strengths. </span>
                            {e.strengths}
                          </p>
                        </div>
                      )}
                      {e.areasToImprove && (
                        <div className="flex gap-2">
                          <Target className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground">To improve. </span>
                            {e.areasToImprove}
                          </p>
                        </div>
                      )}
                      {e.feedback && <p className="text-sm leading-relaxed text-muted-foreground">{e.feedback}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / edit dialog */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setEditId(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Log Entry" : "New Training Log Entry"}</DialogTitle>
            <DialogDescription>
              Record a trainee&apos;s daily on-the-job training: position pool, hours, rating and feedback.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Program</Label>
              <Select value={program} onValueChange={(v) => onProgramChange(v as Program)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RADAR">Radar</SelectItem>
                  <SelectItem value="TOWER">Tower</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Position pool</Label>
              <Select value={groupId} onValueChange={(v) => v && onGroupChange(v)}>
                <SelectTrigger>
                  <SelectValue>
                    {(value) => {
                      const g = groupById(typeof value === "string" ? value : groupId)
                      return g
                        ? `${g.label} — ${g.positionIds.map((pid) => store.positionById(pid)?.code ?? pid).join(", ")}`
                        : "Select pool"
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {groupsFor(program).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.label} — {g.positionIds.map((pid) => store.positionById(pid)?.code ?? pid).join(", ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Positions trained</Label>
              <div className="flex flex-wrap gap-1.5 rounded-md border p-2">
                {groupPositions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No positions in this pool.</p>
                ) : (
                  groupPositions.map((pid) => {
                    const on = positionIds.includes(pid)
                    const pos = store.positionById(pid)
                    return (
                      <button key={pid} type="button" onClick={() => togglePosition(pid)}>
                        <Badge
                          variant={on ? "default" : "outline"}
                          className={`cursor-pointer font-mono ${on ? "" : "text-muted-foreground"}`}
                          title={pos?.name}
                        >
                          {pos?.code ?? pid}
                        </Badge>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Trainee</Label>
              <Select value={traineeId} onValueChange={(v) => setTraineeId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trainee">
                    {(value) => {
                      const s = store.staff.find((x) => x.id === value)
                      return s ? `${s.firstName} ${s.lastName} (${s.initials})` : "Select trainee"
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {programStaff
                    .filter((s) => s.id !== ojtiId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.initials})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>OJTI (instructor)</Label>
              <Select value={ojtiId} onValueChange={(v) => setOjtiId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select OJTI">
                    {(value) => {
                      const s = store.staff.find((x) => x.id === value)
                      return s ? `${s.firstName} ${s.lastName} (${s.initials})` : "Select OJTI"
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {qualifiedOjtiStaff.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No OJTI-qualified staff for {program === "RADAR" ? "Radar" : "Tower"}.
                    </div>
                  ) : (
                    qualifiedOjtiStaff
                      .filter((s) => s.id !== traineeId)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} ({s.initials}) · OJTI
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tl-date">Date</Label>
              <Input id="tl-date" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tl-hours">Hours trained</Label>
              <Input
                id="tl-hours"
                type="number"
                min={0.5}
                step={0.5}
                value={hours}
                onChange={(ev) => setHours(Math.max(0, Number(ev.target.value) || 0))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Overall rating</Label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} of 5`}
                      onClick={() => setRating(n)}
                      className="p-0.5"
                    >
                      <Star
                        className={
                          n <= rating ? "size-5 fill-amber-500 text-amber-500" : "size-5 text-muted-foreground/40"
                        }
                      />
                    </button>
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">{RATING_LABELS[rating]}</span>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tl-strengths">Strengths</Label>
              <Textarea
                id="tl-strengths"
                value={strengths}
                onChange={(ev) => setStrengths(ev.target.value)}
                placeholder="What the trainee did well today"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tl-improve">Areas to improve</Label>
              <Textarea
                id="tl-improve"
                value={areasToImprove}
                onChange={(ev) => setAreasToImprove(ev.target.value)}
                placeholder="Development points for next session"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tl-feedback">General remarks</Label>
              <Textarea
                id="tl-feedback"
                value={feedback}
                onChange={(ev) => setFeedback(ev.target.value)}
                placeholder="Debrief notes / overall summary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>{editId ? "Save changes" : "Add entry"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete log entry"
        description="Remove this OJT log entry? This cannot be undone."
        onConfirm={() => deleteTarget && store.deleteTrainingLog(deleteTarget.id)}
      />
    </div>
  )
}
