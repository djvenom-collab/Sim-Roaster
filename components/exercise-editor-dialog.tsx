"use client"

/* ===========================================================================
 * EXERCISE EDITOR DIALOG — create or edit an exercise/course
 * ===========================================================================
 * The form behind the SIM Exercises page. Set the code, name, program,
 * simulator, duration, required staff, required named positions (seats) and
 * required qualifications. Saves to the store. Toggle "Validation delivery" to
 * mark it as a "V" course; only positions in the chosen program can be picked.
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
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import { programDisplay } from "@/lib/program"
import type { Exercise } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  exercise?: Exercise | null
}

export function ExerciseEditorDialog({ open, onOpenChange, exercise }: Props) {
  const store = useStore()
  const [form, setForm] = useState<Partial<Exercise>>(
    exercise ?? {
      code: "",
      name: "",
      program: "RADAR",
      description: "",
      durationMin: 120,
      simulatorId: store.simulators[0]?.id ?? "",
      requiredStaff: 4,
      isValidation: false,
      requiredPositions: [],
      active: true,
    },
  )

  // Required qualifications come from the separate exercise qual-rule record.
  const existingRule = exercise ? store.exerciseQualRules.find((r) => r.exerciseId === exercise.id) : undefined
  const [requiredQuals, setRequiredQuals] = useState<string[]>(existingRule?.requiredQuals ?? [])

  const togglePos = (id: string) =>
    setForm((f) => {
      const set = new Set(f.requiredPositions ?? [])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, requiredPositions: [...set] }
    })

  const toggleQual = (id: string) =>
    setRequiredQuals((prev) => (prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]))

  // Distinct programs available, derived from configured positions (RADAR, TOWER, …).
  const programs = [...new Set(store.positions.map((p) => p.program))].filter(Boolean)

  // Only positions belonging to the selected program can be chosen as required seats.
  const availablePositions = store.positions.filter((p) => p.program === form.program)

  // Changing the program clears any selected positions that don't belong to it.
  const onProgramChange = (program: string | null) => {
    if (!program) return
    setForm((f) => ({
      ...f,
      program,
      requiredPositions: (f.requiredPositions ?? []).filter((id) =>
        store.positions.some((p) => p.id === id && p.program === program),
      ),
    }))
  }

  const save = () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and name are required")
      return
    }
    if (!form.simulatorId) {
      toast.error("Select a simulator")
      return
    }
    // Every exercise name must be unique (case-insensitive), excluding the one
    // being edited. Prevents reintroducing the duplicate names we just cleaned up.
    const nameKey = form.name!.trim().toLowerCase()
    const clashes = store.exercises.some((e) => e.id !== exercise?.id && e.name.trim().toLowerCase() === nameKey)
    if (clashes) {
      toast.error("An exercise with this name already exists")
      return
    }
    if (exercise) {
      store.updateExercise({ ...(exercise as Exercise), ...form } as Exercise)
      store.setExerciseQualRule(exercise.id, { requiredQuals })
      toast.success("Exercise updated")
    } else {
      const id = `ex-${Date.now()}`
      store.addExercise({
        id,
        code: form.code!.trim(),
        name: form.name!.trim(),
        program: form.program?.trim() || "RADAR",
        description: form.description ?? "",
        durationMin: Number(form.durationMin) || 120,
        simulatorId: form.simulatorId!,
        requiredStaff: Number(form.requiredStaff) || 1,
        isValidation: form.isValidation ?? false,
        requiredPositions: form.requiredPositions ?? [],
        active: form.active ?? true,
      })
      if (requiredQuals.length) store.setExerciseQualRule(id, { requiredQuals })
      toast.success("Exercise added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{exercise ? "Edit Exercise" : "Add Exercise"}</DialogTitle>
          <DialogDescription>
            Define the course: simulator, required staff, and optional named positions.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Course code</Label>
            <Input
              id="code"
              placeholder="RX-5"
              value={form.code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="program">Program</Label>
            <Select value={form.program ?? ""} onValueChange={onProgramChange}>
              <SelectTrigger id="program">
                <SelectValue placeholder="Select program">
                  {(value) => (value ? programDisplay(value as string) : "Select program")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p} value={p}>
                    {programDisplay(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Simulator</Label>
            <Select
              value={form.simulatorId ?? ""}
              onValueChange={(v) => setForm((f) => ({ ...f, simulatorId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select simulator">
                  {(value) => store.simulators.find((s) => s.id === value)?.code ?? "Select simulator"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {store.simulators.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reqstaff">Required staff / resources</Label>
            <Input
              id="reqstaff"
              type="number"
              min={1}
              value={form.requiredStaff ?? 1}
              onChange={(e) => setForm((f) => ({ ...f, requiredStaff: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dur">Duration (min)</Label>
            <Input
              id="dur"
              type="number"
              value={form.durationMin ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, durationMin: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={form.description ?? ""}
              placeholder="Optional description…"
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Required positions (optional named seats)</Label>
            <div className="flex flex-wrap gap-1.5">
              {availablePositions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No positions defined for {programDisplay(form.program)}.</p>
              ) : (
                availablePositions.map((p) => {
                  const on = form.requiredPositions?.includes(p.id)
                  return (
                    <button key={p.id} type="button" onClick={() => togglePos(p.id)}>
                      <Badge
                        variant={on ? "default" : "outline"}
                        className={cn("cursor-pointer font-mono", !on && "text-muted-foreground")}
                      >
                        {p.code}
                      </Badge>
                    </button>
                  )
                })
              )}
            </div>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Required qualifications</Label>
            <p className="text-xs text-muted-foreground">
              Staff must hold these to be eligible for this exercise. Tap to add or remove.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {store.qualifications.length === 0 ? (
                <p className="text-xs text-muted-foreground">No qualifications defined.</p>
              ) : (
                store.qualifications.map((q) => {
                  const on = requiredQuals.includes(q.id)
                  return (
                    <button key={q.id} type="button" onClick={() => toggleQual(q.id)}>
                      <Badge
                        variant={on ? "default" : "outline"}
                        className={cn("cursor-pointer", !on && "text-muted-foreground")}
                        title={q.name}
                      >
                        {q.code}
                      </Badge>
                    </button>
                  )
                })
              )}
            </div>
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="validation">Validation delivery</Label>
              <p className="text-xs text-muted-foreground">Marks this as a &quot;V&quot; validation course.</p>
            </div>
            <Switch
              id="validation"
              checked={form.isValidation ?? false}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isValidation: v }))}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="active">Active</Label>
              <p className="text-xs text-muted-foreground">Archived exercises are hidden from new runs.</p>
            </div>
            <Switch
              id="active"
              checked={form.active ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{exercise ? "Save changes" : "Add exercise"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
