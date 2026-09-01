"use client"

/* ===========================================================================
 * TRAINING GROUP EDITOR DIALOG — add or edit an OJTI position group
 * ===========================================================================
 * Position groups organise the seats a trainee is validated on during initial
 * OJT (e.g. RADAR "Pool 1 — ARR, DIR"). They drive the OJTI training log, the
 * trainee OJT progress on the staff page and the Trainers breakdown. Groups are
 * referenced by POSITION ID so renaming a position code doesn't break them.
 * =========================================================================== */
import { useMemo, useState } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useStore } from "@/lib/store"
import { programDisplay } from "@/lib/program"
import { cn } from "@/lib/utils"
import type { TrainingGroup } from "@/lib/training-groups"

type Program = "RADAR" | "TOWER"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  group?: TrainingGroup | null
}

export function TrainingGroupEditorDialog({ open, onOpenChange, group }: Props) {
  const store = useStore()
  const [label, setLabel] = useState(group?.label ?? "")
  const [program, setProgram] = useState<Program>(group?.program ?? "RADAR")
  const [positionIds, setPositionIds] = useState<string[]>(group?.positionIds ?? [])

  // Positions selectable for the chosen program, in display order.
  const programPositions = useMemo(
    () =>
      store.positions
        .filter((p) => p.program === program)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [store.positions, program],
  )

  const togglePosition = (id: string) =>
    setPositionIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const onProgramChange = (p: Program) => {
    setProgram(p)
    // Drop any positions that don't belong to the newly selected program.
    setPositionIds((prev) => prev.filter((id) => store.positionById(id)?.program === p))
  }

  const save = () => {
    if (!label.trim()) {
      toast.error("Pool name is required")
      return
    }
    if (positionIds.length === 0) {
      toast.error("Select at least one position")
      return
    }
    if (group) {
      store.updateTrainingGroup({ ...group, label: label.trim(), program, positionIds })
      toast.success("Training pool updated")
    } else {
      store.addTrainingGroup({
        id: `tg-${Date.now()}`,
        label: label.trim(),
        program,
        positionIds,
      })
      toast.success("Training pool added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? "Edit Training Pool" : "Add Training Pool"}</DialogTitle>
          <DialogDescription>
            Position pools define the seats worked during initial OJT validation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tg-label">Pool name</Label>
            <Input
              id="tg-label"
              value={label}
              placeholder="e.g. Pool 1"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Program</Label>
            <Select value={program} onValueChange={(v) => onProgramChange(v as Program)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RADAR">{programDisplay("RADAR")}</SelectItem>
                <SelectItem value="TOWER">{programDisplay("TOWER")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Positions <span className="text-muted-foreground">({positionIds.length} selected)</span>
            </Label>
            {programPositions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No positions defined for this program.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {programPositions.map((p) => {
                  const active = positionIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePosition(p.id)}
                      aria-pressed={active}
                      title={p.name}
                    >
                      <Badge
                        variant={active ? "default" : "outline"}
                        className={cn("cursor-pointer font-mono", !active && "text-muted-foreground")}
                      >
                        {p.code}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{group ? "Save changes" : "Add pool"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
