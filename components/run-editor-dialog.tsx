"use client"

/* ===========================================================================
 * RUN EDITOR DIALOG — schedule or edit a single sim run
 * ===========================================================================
 * The form for creating/editing a run (a delivery of an exercise on a date).
 * Pick the exercise, date, slot time and status. Once created it shows on the
 * planners and its required positions become seats to fill. Editing is gated by
 * the edit_run permission. Saves to the store.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import type { Run } from "@/lib/types"
import { todayISO } from "@/lib/dates"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  run?: Run | null
  defaultDate?: string
}

export function RunEditorDialog({ open, onOpenChange, run, defaultDate }: Props) {
  const store = useStore()
  const editable = can(store.currentRole, "edit_run")
  const [form, setForm] = useState<Partial<Run>>(
    run ?? {
      date: defaultDate ?? todayISO(),
      slotTime: store.slotTimes[0]?.startTime ?? "08:00",
      simulatorId: store.simulators[0]?.id,
      exerciseId: store.exercises[0]?.id,
      status: "tentative",
      notes: "",
    },
  )

  // Exercises available depend on the selected simulator's program (RADAR/TOWER).
  const selectedSim = store.simulators.find((s) => s.id === form.simulatorId)
  const availableExercises = store.exercises.filter(
    (e) => !selectedSim?.program || e.program === selectedSim.program,
  )

  // When the simulator changes, keep the exercise selection valid for that program.
  const onSimulatorChange = (simId: string | null) => {
    if (!simId) return
    setForm((f) => {
      const sim = store.simulators.find((s) => s.id === simId)
      const stillValid = store.exercises.find(
        (e) => e.id === f.exerciseId && (!sim?.program || e.program === sim.program),
      )
      const firstForProgram = store.exercises.find((e) => !sim?.program || e.program === sim.program)
      return { ...f, simulatorId: simId, exerciseId: stillValid ? f.exerciseId : firstForProgram?.id }
    })
  }

  const save = () => {
    if (!editable) return
    const ex = store.exerciseById(form.exerciseId!)
    if (run) {
      store.updateRun({ ...(run as Run), ...form, requiredPositions: ex?.requiredPositions ?? run.requiredPositions, requiredStaff: ex?.requiredStaff ?? run.requiredStaff } as Run)
      toast.success("Run updated")
    } else {
      const id = `run-${Date.now()}`
      store.addRun({
        id,
        date: form.date!,
        slotTime: form.slotTime!,
        simulatorId: form.simulatorId!,
        exerciseId: form.exerciseId!,
        status: (form.status as Run["status"]) ?? "tentative",
        requiredPositions: ex?.requiredPositions ?? [],
        requiredStaff: ex?.requiredStaff,
        notes: form.notes,
      })
      toast.success("Run created")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{run ? "Edit Run" : "New Run"}</DialogTitle>
          <DialogDescription>
            {editable ? "Configure the simulator run details and required positions." : "You have read-only access to runs."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              disabled={!editable}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Slot Time</Label>
            <Select
              value={form.slotTime}
              disabled={!editable}
              onValueChange={(v) => setForm((f) => ({ ...f, slotTime: v }))}
            >
              <SelectTrigger>
                <SelectValue>
                  {(value) => {
                    const s = store.slotTimes.find((x) => x.startTime === value)
                    return s ? `${s.label} · ${s.startTime}–${s.endTime}` : "Select slot"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {store.slotTimes.map((s) => (
                  <SelectItem key={s.id} value={s.startTime}>
                    {s.label} · {s.startTime}–{s.endTime}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Simulator</Label>
            <Select
              value={form.simulatorId}
              disabled={!editable}
              onValueChange={onSimulatorChange}
            >
              <SelectTrigger>
                <SelectValue>
                  {(value) => {
                    const s = store.simulators.find((x) => x.id === value)
                    return s ? `${s.code} — ${s.name}` : "Select simulator"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {store.simulators.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Exercise</Label>
            <Select
              value={form.exerciseId}
              disabled={!editable}
              onValueChange={(v) => setForm((f) => ({ ...f, exerciseId: v }))}
            >
              <SelectTrigger>
                <SelectValue>
                  {(value) => store.exercises.find((x) => x.id === value)?.name ?? "Select exercise"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableExercises.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Status</Label>
            <Select
              value={form.status}
              disabled={!editable}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as Run["status"] }))}
            >
              <SelectTrigger>
                <SelectValue>
                  {(value) => (value ? String(value).charAt(0).toUpperCase() + String(value).slice(1) : "Select status")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {["tentative", "confirmed", "postponed", "completed", "cancelled"].map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes ?? ""}
              disabled={!editable}
              placeholder="Optional notes…"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!editable}>
            {run ? "Save changes" : "Create run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
