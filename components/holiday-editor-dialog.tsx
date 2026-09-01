"use client"

/* ===========================================================================
 * HOLIDAY EDITOR DIALOG — add or edit a public holiday
 * ===========================================================================
 * Simple form for the public-holiday list (date + name). Holidays show on the
 * calendars and affect scheduling/availability. Saves to the store.
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
import { todayISO } from "@/lib/dates"
import type { PublicHoliday } from "@/lib/types"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  holiday?: PublicHoliday | null
}

export function HolidayEditorDialog({ open, onOpenChange, holiday }: Props) {
  const store = useStore()
  const [name, setName] = useState(holiday?.name ?? "")
  const [date, setDate] = useState(holiday?.date ?? todayISO())

  const save = () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    if (holiday) {
      store.updatePublicHoliday({ ...holiday, name: name.trim(), date })
      toast.success("Public holiday updated")
    } else {
      store.addPublicHoliday({ id: `ph-${Date.now()}`, name: name.trim(), date })
      toast.success("Public holiday added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{holiday ? "Edit Public Holiday" : "Add Public Holiday"}</DialogTitle>
          <DialogDescription>Regional public holidays affect scheduling and availability.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ph-name">Name</Label>
            <Input
              id="ph-name"
              value={name}
              placeholder="e.g. National Day"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ph-date">Date</Label>
            <Input id="ph-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{holiday ? "Save changes" : "Add holiday"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
