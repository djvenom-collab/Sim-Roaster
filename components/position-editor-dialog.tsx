"use client"

/* ===========================================================================
 * POSITION EDITOR DIALOG — create or edit a position (a seat type)
 * ===========================================================================
 * The form behind the DIM Lists / Settings page. A "position" is a role someone
 * sits (e.g. a radar or tower seat). Set its code, name, program, and how long
 * currency lasts for it (validityDays). That validity period feeds the
 * Validity/Currency page and the eligibility checks. Saves to the store.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStore } from "@/lib/store"
import { programDisplay } from "@/lib/program"
import type { Position } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  position?: Position | null
}

export function PositionEditorDialog({ open, onOpenChange, position }: Props) {
  const store = useStore()
  const [form, setForm] = useState<Partial<Position>>(
    position ?? {
      code: "",
      name: "",
      description: "",
      validityDays: 60,
      program: "RADAR",
      group: "",
      category: "",
      simulatorUnit: "",
      airport: "",
      active: true,
    },
  )

  const isTower = form.program === "TOWER"

  const save = () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and name are required")
      return
    }
    if (position) {
      store.updatePosition({ ...(position as Position), ...form } as Position)
      toast.success("Position updated")
    } else {
      store.addPosition({
        id: `pos-${Date.now()}`,
        code: form.code!.trim(),
        name: form.name!.trim(),
        description: form.description ?? "",
        validityDays: Number(form.validityDays) || 60,
        program: form.program || "RADAR",
        group: form.group?.trim() || undefined,
        category: form.category?.trim() || undefined,
        simulatorUnit: form.simulatorUnit?.trim() || undefined,
        airport: form.airport?.trim() || undefined,
        active: form.active ?? true,
      })
      toast.success("Position added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{position ? "Edit Position" : "Add Position"}</DialogTitle>
          <DialogDescription>Define the position, its program, and operational details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="AMR"
                value={form.code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Program</Label>
              <Select
                value={form.program ?? "RADAR"}
                onValueChange={(v) => setForm((f) => ({ ...f, program: v ?? "RADAR" }))}
              >
                <SelectTrigger>
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat">Category</Label>
              <Input
                id="cat"
                placeholder="Ground / Aerodrome…"
                value={form.category ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vd">Validity (days)</Label>
              <Input
                id="vd"
                type="number"
                value={form.validityDays ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, validityDays: Number(e.target.value) }))}
              />
            </div>
          </div>
          {isTower && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="grp">Group</Label>
                <Input
                  id="grp"
                  placeholder="Group 1"
                  value={form.group ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Simulator unit</Label>
                <Select
                  value={form.simulatorUnit ?? ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, simulatorUnit: v ?? "" }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit">
                      {(value) => (value ? (value as string) : "Select unit")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tower Sim 1">Tower Sim 1</SelectItem>
                    <SelectItem value="Tower Sim 2">Tower Sim 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="apt">Simulated airport</Label>
                <Input
                  id="apt"
                  placeholder="DXB"
                  value={form.airport ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, airport: e.target.value }))}
                />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={form.description ?? ""}
              placeholder="Optional description…"
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive positions are hidden from new plans.</p>
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
          <Button onClick={save}>{position ? "Save changes" : "Add position"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
