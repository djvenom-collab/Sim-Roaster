"use client"

/* ===========================================================================
 * CANCEL RUN DIALOG — cancel a scheduled run
 * ===========================================================================
 * Asks for a mandatory cancellation reason (recorded in the audit log) and
 * marks the run cancelled via the store. Cancelling frees everyone who was
 * assigned, which feeds the "freed staff" figures on the Daily Planner.
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useStore } from "@/lib/store"
import type { Run } from "@/lib/types"

export function CancelRunDialog({
  open,
  onOpenChange,
  run,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  run: Run | null
}) {
  const store = useStore()
  const [reason, setReason] = useState("")

  const confirm = () => {
    if (!run) return
    if (!reason.trim()) {
      toast.error("A cancellation reason is required")
      return
    }
    store.updateRunStatus(run.id, "cancelled", reason.trim())
    toast.success(`${run.id.toUpperCase()} cancelled`)
    setReason("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel run {run?.id.toUpperCase()}</DialogTitle>
          <DialogDescription>
            This will mark the exercise as cancelled and notify affected staff. A reason is mandatory and recorded in
            the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Cancellation reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Simulator hardware fault, staff shortage…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep run
          </Button>
          <Button variant="destructive" onClick={confirm}>
            Confirm cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
