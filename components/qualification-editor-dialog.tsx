"use client"

/* ===========================================================================
 * QUALIFICATION EDITOR DIALOG — create or edit a qualification
 * ===========================================================================
 * The form behind the DIM Lists / Settings page. A qualification is a ticket a
 * person can hold (e.g. an instructor rating). Its "effect" controls how it's
 * used in eligibility — e.g. required for certain exercises. Saves to the store.
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
import { Textarea } from "@/components/ui/textarea"
import { useStore } from "@/lib/store"
import type { Qualification, QualEffect } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  qualification?: Qualification | null
}

export function QualificationEditorDialog({ open, onOpenChange, qualification }: Props) {
  const store = useStore()
  const [form, setForm] = useState<Partial<Qualification>>(
    qualification ?? { code: "", name: "", effect: "allow", description: "" },
  )

  const save = () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and name are required")
      return
    }
    if (qualification) {
      store.updateQualification({ ...(qualification as Qualification), ...form } as Qualification)
      toast.success("Qualification updated")
    } else {
      store.addQualification({
        id: `q-${Date.now()}`,
        code: form.code!.trim(),
        name: form.name!.trim(),
        effect: (form.effect as QualEffect) ?? "allow",
        description: form.description ?? "",
      })
      toast.success("Qualification added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{qualification ? "Edit Qualification" : "Add Qualification"}</DialogTitle>
          <DialogDescription>Qualifications allow or restrict staff for positions and exercises.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                placeholder="OJTI"
                value={form.code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="effect">Effect</Label>
              <Select
                value={form.effect ?? "allow"}
                onValueChange={(v) => setForm((f) => ({ ...f, effect: v as QualEffect }))}
              >
                <SelectTrigger id="effect">
                  <SelectValue>
                    {(value) => (value === "restrict" ? "Restrict" : "Allow")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="restrict">Restrict</SelectItem>
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
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={form.description ?? ""}
              placeholder="Optional description…"
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{qualification ? "Save changes" : "Add qualification"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
