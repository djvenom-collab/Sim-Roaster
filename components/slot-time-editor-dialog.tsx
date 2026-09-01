"use client"

/* ===========================================================================
 * SLOT TIME EDITOR DIALOG — create or edit a daily time slot
 * ===========================================================================
 * The form behind the DIM Lists / Settings page. A slot time is a named part of
 * the day (e.g. "AM 08:00–10:00") that runs are scheduled into. Set its label
 * and start/end times. This list feeds the run editor's time picker. Saves to
 * the store.
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
import { useStore } from "@/lib/store"
import type { SlotTime } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  slot?: SlotTime | null
}

export function SlotTimeEditorDialog({ open, onOpenChange, slot }: Props) {
  const store = useStore()
  const [label, setLabel] = useState(slot?.label ?? "")
  const [startTime, setStartTime] = useState(slot?.startTime ?? "08:00")
  const [endTime, setEndTime] = useState(slot?.endTime ?? "10:30")

  const save = () => {
    if (!label.trim()) {
      toast.error("Label is required")
      return
    }
    if (endTime <= startTime) {
      toast.error("End time must be after start time")
      return
    }
    if (slot) {
      store.updateSlotTime({ ...slot, label: label.trim(), startTime, endTime })
      toast.success("Slot time updated")
    } else {
      store.addSlotTime({ id: `st-${Date.now()}`, label: label.trim(), startTime, endTime })
      toast.success("Slot time added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{slot ? "Edit Slot Time" : "Add Slot Time"}</DialogTitle>
          <DialogDescription>Define a named scheduling slot for runs and sessions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="slot-label">Label</Label>
            <Input
              id="slot-label"
              value={label}
              placeholder="e.g. Morning 1"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="slot-start">Start time</Label>
              <Input
                id="slot-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-end">End time</Label>
              <Input id="slot-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{slot ? "Save changes" : "Add slot"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
