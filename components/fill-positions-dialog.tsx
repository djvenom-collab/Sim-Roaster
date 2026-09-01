"use client"

/* ===========================================================================
 * FILL POSITIONS DIALOG — the auto-assigner ("fill the seats for me")
 * ===========================================================================
 * Lets a manager auto-fill empty seats for one run, a whole day, or a week. It
 * asks the store to pick eligible, available, current staff for each open seat
 * using the same rules used everywhere (lib/assignment-eval.ts), and balances
 * workload fairly. The whole button is hidden unless the role can fill_positions.
 *
 * CHANGEABLE: the "Allow manual override" switch lets higher roles place
 * non-eligible staff with a warning; that's gated by the manual_override perm.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import { Wand2, Info, Eraser } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { addDaysISO } from "@/lib/dates"

export function FillPositionsDialog({
  scopeDate,
  singleRunId,
}: {
  scopeDate: string
  singleRunId?: string
}) {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<"run" | "day" | "week" | "all">(singleRunId ? "run" : "day")
  const [override, setOverride] = useState(false)

  const canFill = can(store.currentRole, "fill_positions")
  const canOverride = can(store.currentRole, "manual_override")

  // Filling positions is restricted to SUP and above — hide entirely otherwise.
  if (!canFill) return null

  // Resolve the selected scope to the set of run IDs it covers.
  const scopedRunIds = () => {
    if (scope === "run" && singleRunId) return [singleRunId]
    if (scope === "day") return store.runs.filter((r) => r.date === scopeDate).map((r) => r.id)
    if (scope === "all") return store.runs.map((r) => r.id)
    const end = addDaysISO(scopeDate, 6)
    return store.runs.filter((r) => r.date >= scopeDate && r.date <= end).map((r) => r.id)
  }

  const run = () => {
    const runIds = scopedRunIds()
    // A full-schedule run is a rebuild: clear every seat first so the rotation
    // rule is re-applied cleanly across the whole year from scratch.
    if (scope === "all") store.clearPositions(runIds)
    const { filled, skipped } = store.fillPositions(runIds, override && canOverride)
    if (filled === 0 && skipped === 0) toast.info("All positions already filled")
    else if (skipped > 0)
      toast.warning(`Filled ${filled} position(s); ${skipped} could not be filled (no eligible staff)`)
    else toast.success(`Filled ${filled} position(s)`)
    setOpen(false)
  }

  const clear = () => {
    const runIds = scopedRunIds()
    const { cleared } = store.clearPositions(runIds)
    if (cleared === 0) toast.info("No assigned positions to clear")
    else toast.success(`Cleared ${cleared} position(s)`)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        disabled={!canFill}
        render={
          <Button variant="secondary">
            <Wand2 className="size-4" /> Fill Positions
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-primary" /> Auto-Fill Positions
          </DialogTitle>
          <DialogDescription>
            Automatically assign eligible staff. Respects availability, leave, training, validity/currency and
            qualification rules, rotates people fairly through the positions they are validated for, and distributes
            workload fairly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
              <SelectTrigger>
                <SelectValue>
                  {(value) =>
                    value === "run"
                      ? "This run only"
                      : value === "week"
                        ? "This week (7 days)"
                        : value === "all"
                          ? "Entire schedule (rebuild)"
                          : "Entire day"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {singleRunId && <SelectItem value="run">This run only</SelectItem>}
                <SelectItem value="day">Entire day</SelectItem>
                <SelectItem value="week">This week (7 days)</SelectItem>
                <SelectItem value="all">Entire schedule (rebuild)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label className="text-sm">Allow manual override</Label>
              <p className="text-xs text-muted-foreground">
                {canOverride
                  ? "Permits assigning non-eligible staff with a warning."
                  : "SP and SUP roles cannot use override."}
              </p>
            </div>
            <Switch checked={override} onCheckedChange={setOverride} disabled={!canOverride} />
          </div>

          <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Priority order: currency due for refresh first, then rotation — people stay on one position for a whole day,
            move to a different one the next day, and cycle evenly through every position they are validated for, balanced
            for fair workload. &ldquo;Entire schedule (rebuild)&rdquo; clears all seats and re-plans the whole year with
            this rotation. Clearing empties every seat in the selected scope (cancelled runs are left untouched).
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={clear} disabled={!canFill}>
            <Eraser className="size-4" /> Clear positions
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={run} disabled={!canFill}>
              <Wand2 className="size-4" /> Run auto-fill
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
