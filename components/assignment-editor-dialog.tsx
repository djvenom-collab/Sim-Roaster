"use client"

/* ===========================================================================
 * ASSIGNMENT EDITOR DIALOG — edit a roster "assignment code"
 * ===========================================================================
 * Pop-up form for the non-simulator allocation codes (leave, training, duties,
 * roster letters like "L" for Annual Leave). Set the code, description, group,
 * type, which program it applies to, and whether it's active. Saves to the
 * store; inactive codes are hidden from the assignment pickers elsewhere.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useStore } from "@/lib/store"
import { programDisplay } from "@/lib/program"
import type { Assignment } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  assignment?: Assignment | null
}

export function AssignmentEditorDialog({ open, onOpenChange, assignment }: Props) {
  const store = useStore()
  const [form, setForm] = useState<Partial<Assignment>>(
    assignment ?? {
      code: "",
      description: "",
      group: "Leave",
      type: "Leave",
      appliesTo: "RADAR / TOWER",
      active: true,
    },
  )

  // Existing groups/types/appliesTo values to offer as quick picks
  const groups = Array.from(new Set(store.assignments.map((a) => a.group))).sort()
  const types = Array.from(new Set(store.assignments.map((a) => a.type))).sort()

  const save = () => {
    if (!form.code?.trim() || !form.description?.trim()) {
      toast.error("Code and description are required")
      return
    }
    if (assignment) {
      store.updateAssignment({ ...(assignment as Assignment), ...form } as Assignment)
      toast.success("Assignment updated")
    } else {
      const maxOrder = store.assignments.reduce((m, a) => Math.max(m, a.sortOrder ?? 0), 0)
      store.addAssignment({
        id: `asn-${Date.now()}`,
        code: form.code!.trim(),
        description: form.description!.trim(),
        group: form.group?.trim() || "Other",
        type: form.type?.trim() || "Other",
        appliesTo: form.appliesTo ?? "RADAR / TOWER",
        active: form.active ?? true,
        sortOrder: maxOrder + 1,
      })
      toast.success("Assignment added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assignment ? "Edit Assignment" : "Add Assignment"}</DialogTitle>
          <DialogDescription>
            Non-simulator allocations (leave, training, duties, roster codes) that can be assigned to staff.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="L"
                value={form.code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="applies">Applies to</Label>
              <Select
                value={form.appliesTo ?? "RADAR / TOWER"}
                onValueChange={(v) => setForm((f) => ({ ...f, appliesTo: v ?? "RADAR / TOWER" }))}
              >
                <SelectTrigger id="applies">
                  <SelectValue>
                    {(value) => (value ? programDisplay(value as string) : "Select")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RADAR / TOWER">{programDisplay("RADAR / TOWER")}</SelectItem>
                  <SelectItem value="RADAR">{programDisplay("RADAR")}</SelectItem>
                  <SelectItem value="TOWER">{programDisplay("TOWER")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Input
              id="desc"
              placeholder="Annual Leave"
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="group">Group</Label>
              <Input
                id="group"
                list="assignment-groups"
                placeholder="Leave"
                value={form.group ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
              />
              <datalist id="assignment-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Input
                id="type"
                list="assignment-types"
                placeholder="Leave"
                value={form.type ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              />
              <datalist id="assignment-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label htmlFor="active">Active</Label>
              <p className="text-sm text-muted-foreground">Inactive codes are hidden from assignment pickers.</p>
            </div>
            <Switch
              id="active"
              checked={form.active ?? true}
              onCheckedChange={(c) => setForm((f) => ({ ...f, active: c }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{assignment ? "Save changes" : "Add assignment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
