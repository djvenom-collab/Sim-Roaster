"use client"

/* ===========================================================================
 * SIMULATOR EDITOR DIALOG — create or edit a simulator
 * ===========================================================================
 * The form behind the DIM Lists / Settings page. A simulator is the physical
 * device a run takes place on. Set its code, name and program. Exercises are
 * tied to a simulator, so this list feeds the exercise editor. Saves to the store.
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStore } from "@/lib/store"
import { programDisplay } from "@/lib/program"
import type { Simulator } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  simulator?: Simulator | null
}

export function SimulatorEditorDialog({ open, onOpenChange, simulator }: Props) {
  const store = useStore()
  const [form, setForm] = useState<Partial<Simulator>>(
    simulator ?? {
      code: "",
      name: "",
      location: "",
      active: true,
      program: "RADAR",
      simulatorType: "Radar",
      generation: "Current",
      transitionStatus: "Current",
    },
  )

  const save = () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and name are required")
      return
    }
    if (simulator) {
      store.updateSimulator({ ...(simulator as Simulator), ...form } as Simulator)
      toast.success("Simulator updated")
    } else {
      const maxOrder = store.simulators.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0)
      store.addSimulator({
        id: `sim-${Date.now()}`,
        code: form.code!.trim(),
        name: form.name!.trim(),
        location: form.location ?? "",
        active: form.active ?? true,
        program: form.program,
        simulatorType: form.simulatorType,
        siteAirport: form.siteAirport,
        coverageArea: form.coverageArea,
        generation: form.generation,
        transitionStatus: form.transitionStatus,
        replacedBy: form.replacedBy,
        notes: form.notes,
        sortOrder: maxOrder + 1,
      })
      toast.success("Simulator added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{simulator ? "Edit Simulator" : "Add Simulator"}</DialogTitle>
          <DialogDescription>Manage simulator details, coverage and availability.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              placeholder="RS1"
              value={form.code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Radar Sim 1"
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="program">Program</Label>
            <Select
              value={form.program ?? "RADAR"}
              onValueChange={(v) => setForm((f) => ({ ...f, program: v ?? "RADAR" }))}
            >
              <SelectTrigger id="program">
                <SelectValue>
                  {(value) => (value ? programDisplay(value as string) : "Select program")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RADAR">{programDisplay("RADAR")}</SelectItem>
                <SelectItem value="TOWER">{programDisplay("TOWER")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="simtype">Type</Label>
            <Select
              value={form.simulatorType ?? "Radar"}
              onValueChange={(v) => setForm((f) => ({ ...f, simulatorType: v ?? "Radar" }))}
            >
              <SelectTrigger id="simtype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Radar">Radar</SelectItem>
                <SelectItem value="Tower">Tower</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loc">Physical location</Label>
            <Input
              id="loc"
              placeholder="Sim Hall A / Training Wing"
              value={form.location ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="site">Site airport</Label>
            <Input
              id="site"
              placeholder="MTW"
              value={form.siteAirport ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, siteAirport: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coverage">Coverage area</Label>
            <Input
              id="coverage"
              placeholder="Central TMA / MET"
              value={form.coverageArea ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, coverageArea: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen">Generation</Label>
            <Select
              value={form.generation ?? "Current"}
              onValueChange={(v) => setForm((f) => ({ ...f, generation: v ?? "Current" }))}
            >
              <SelectTrigger id="gen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Legacy">Legacy</SelectItem>
                <SelectItem value="Current">Current</SelectItem>
                <SelectItem value="Future">Future</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trans">Transition status</Label>
            <Input
              id="trans"
              placeholder="Current"
              value={form.transitionStatus ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, transitionStatus: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="replaced">Replaced by</Label>
            <Input
              id="replaced"
              placeholder="RS1 / RS2"
              value={form.replacedBy ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, replacedBy: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Operational notes…"
              value={form.notes ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive sims cannot be scheduled.</p>
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
          <Button onClick={save}>{simulator ? "Save changes" : "Add simulator"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
