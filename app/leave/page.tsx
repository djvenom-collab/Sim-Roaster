"use client"

/* ===========================================================================
 * STAFF LEAVE PAGE ("/leave") — leave requests & approvals
 * ===========================================================================
 * Add, view, approve or reject leave (Annual, Sick, Course, Training, etc.).
 * Approved or pending leave makes a person unavailable on those days, so the
 * scheduler and seating plan will not place them on a run.
 *
 * CHANGEABLE: the leave types come from the LeaveType list in lib/types.ts.
 * Approval/rejection is handled by store actions in lib/store.tsx.
 * =========================================================================== */
import { useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { can, roleLevel } from "@/lib/permissions"
import { PageHeader, StatusBadge, EmptyState } from "@/components/shared"
import { LeaveTrendChart } from "@/components/charts/leave-trend-chart"
import { LeaveTypeCharts } from "@/components/charts/leave-type-charts"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Check, X, CalendarOff, Pencil, Trash2, CalendarRange, Sun, Clock } from "lucide-react"
import { formatShort, todayISO, addDaysISO, daysBetween } from "@/lib/dates"
import type { LeaveRecord, LeaveType } from "@/lib/types"

const LEAVE_TYPES: LeaveType[] = ["Annual", "Sick", "Training", "Course", "Compassionate", "Other"]

export default function LeavePage() {
  const store = useStore()
  const canManage = can(store.currentRole, "manage_leave")
  const canApprove = can(store.currentRole, "approve_leave")
  const isAdmin = store.currentRole === "Admin"
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [staffId, setStaffId] = useState(store.scopedStaff[0]?.id ?? "")
  const [type, setType] = useState<LeaveType>("Annual")
  const [start, setStart] = useState(todayISO())
  const [end, setEnd] = useState(addDaysISO(todayISO(), 1))
  const [fullDay, setFullDay] = useState(true)
  const [notes, setNotes] = useState("")
  const [deleteRec, setDeleteRec] = useState<LeaveRecord | null>(null)

  // Viewing other people's leave is a SUP-and-above capability. Sim Pilots
  // (Level 1) only ever see their own records.
  const canViewAll = roleLevel[store.currentRole] >= roleLevel.SUP
  const myStaffId = store.currentUser?.staffId
  const sorted = [...store.scopedLeaveRecords]
    .filter((l) => canViewAll || l.staffId === myStaffId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))

  const leaveDays = (l: LeaveRecord) => daysBetween(l.startDate, l.endDate) + 1

  const rowActions = (l: LeaveRecord) => {
    const hasPending = l.approval === "pending" && canApprove
    if (!hasPending && !isAdmin) {
      return l.approval !== "pending" ? <span className="text-xs text-muted-foreground">—</span> : null
    }
    return (
      <div className="flex justify-end gap-1">
        {hasPending && (
          <>
            <Button size="sm" variant="outline" onClick={() => setApproval(l, "approved")}>
              <Check className="size-3.5" /> Approve
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setApproval(l, "rejected")}>
              <X className="size-3.5" />
            </Button>
          </>
        )}
        {isAdmin && (
          <>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(l)} aria-label="Edit leave">
              <Pencil className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => setDeleteRec(l)} aria-label="Delete leave">
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
    )
  }

  const openAdd = () => {
    setEditId(null)
    setStaffId(store.scopedStaff[0]?.id ?? "")
    setType("Annual")
    setStart(todayISO())
    setEnd(addDaysISO(todayISO(), 1))
    setFullDay(true)
    setNotes("")
    setOpen(true)
  }

  const openEdit = (l: LeaveRecord) => {
    setEditId(l.id)
    setStaffId(l.staffId)
    setType(l.type)
    setStart(l.startDate)
    setEnd(l.endDate)
    setFullDay(l.fullDay)
    setNotes(l.notes ?? "")
    setOpen(true)
  }

  const submit = () => {
    if (end < start) {
      toast.error("End date cannot be before start date")
      return
    }
    if (editId) {
      const existing = store.leaveRecords.find((l) => l.id === editId)
      store.updateLeave({
        id: editId,
        staffId,
        type,
        startDate: start,
        endDate: end,
        fullDay,
        approval: existing?.approval ?? (canApprove ? "approved" : "pending"),
        notes: notes.trim() || undefined,
      })
      toast.success("Leave record updated")
    } else {
      store.addLeave({
        id: `lv-${Date.now()}`,
        staffId,
        type,
        startDate: start,
        endDate: end,
        fullDay,
        approval: canApprove ? "approved" : "pending",
        notes: notes.trim() || undefined,
      })
      toast.success("Leave record added")
    }
    setOpen(false)
    setNotes("")
  }

  const setApproval = (rec: LeaveRecord, approval: LeaveRecord["approval"]) => {
    store.updateLeave({ ...rec, approval })
    toast.success(`Leave ${approval}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave / Availability"
        description={
          canViewAll
            ? "Leave blocks scheduling unless an Admin overrides. Records appear on the calendars."
            : "Your personal leave records. Viewing the wider team's leave is available to Supervisors and above."
        }
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <Button disabled={!canManage} onClick={openAdd}>
              <Plus className="size-4" /> Add Leave
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editId ? "Edit Leave Record" : "Add Leave Record"}</DialogTitle>
                <DialogDescription>
                  {canApprove ? "As TL/Admin this will be auto-approved." : "Submitted as pending for approval."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Staff</Label>
                  <Select value={staffId} onValueChange={(v) => setStaffId(v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select staff">
                        {(value) => {
                          const s = store.scopedStaff.find((x) => x.id === value)
                          return s ? `${s.firstName} ${s.lastName} (${s.initials})` : "Select staff"
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {store.scopedStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.firstName} {s.lastName} ({s.initials})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Leave Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAVE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end justify-between rounded-lg border px-3 py-2">
                  <Label htmlFor="fd" className="text-sm">
                    Full day
                  </Label>
                  <Switch id="fd" checked={fullDay} onCheckedChange={setFullDay} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start">Start date</Label>
                  <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end">End date</Label>
                  <Input id="end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional…" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submit}>{editId ? "Save changes" : "Add record"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {canViewAll && (
        <>
          <LeaveTrendChart />
          <LeaveTypeCharts />
        </>
      )}

      <Card>
        <CardContent className="p-0">
          {sorted.length === 0 ? (
            <EmptyState icon={CalendarOff} title="No leave records" />
          ) : (
            <>
              {/* Desktop: compact table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((l) => {
                      const s = store.staffById(l.staffId)
                      const days = leaveDays(l)
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">
                            {s?.firstName} {s?.lastName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{l.type}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums">
                            {formatShort(l.startDate)}
                            <span className="px-1 text-muted-foreground">&rarr;</span>
                            {formatShort(l.endDate)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              {l.fullDay ? <Sun className="size-3.5" /> : <Clock className="size-3.5" />}
                              {days}d{!l.fullDay && " (part)"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={l.approval} />
                          </TableCell>
                          <TableCell className="text-right">{rowActions(l)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: stacked cards — no sideways scroll */}
              <ul className="divide-y md:hidden">
                {sorted.map((l) => {
                  const s = store.staffById(l.staffId)
                  const days = leaveDays(l)
                  return (
                    <li key={l.id} className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">
                          {s?.firstName} {s?.lastName}
                        </span>
                        <StatusBadge status={l.approval} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <Badge variant="outline">{l.type}</Badge>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <CalendarRange className="size-3.5" />
                          {formatShort(l.startDate)} &rarr; {formatShort(l.endDate)}
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          {l.fullDay ? <Sun className="size-3.5" /> : <Clock className="size-3.5" />}
                          {days}d{!l.fullDay && " (part)"}
                        </span>
                      </div>
                      {rowActions(l)}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!deleteRec}
        onOpenChange={(o) => !o && setDeleteRec(null)}
        title="Delete leave record?"
        description="This permanently removes the leave record and frees the staff member for scheduling. This cannot be undone."
        onConfirm={() => {
          if (deleteRec) {
            store.deleteLeave(deleteRec.id)
            toast.success("Leave record deleted")
            setDeleteRec(null)
          }
        }}
      />
    </div>
  )
}
