"use client"

/* ===========================================================================
 * STAFF EDITOR DIALOG — create or edit a person
 * ===========================================================================
 * The form behind the Staff Details page. Set name, initials, rank, contact
 * details, which program(s) they belong to, and their home positions. Saves to
 * the store. A person's programs + home positions directly affect which seats
 * they can be scheduled into.
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
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import type { Staff } from "@/lib/types"
import { todayISO } from "@/lib/dates"
import { PROGRAMS, programBadgeClass, programDisplay, type Program } from "@/lib/program"

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  staff?: Staff | null
}

export function StaffEditorDialog({ open, onOpenChange, staff }: Props) {
  const store = useStore()
  // New staff default to the active program (or RADAR when viewing All).
  const defaultPrograms: string[] = store.activeProgram === "ALL" ? ["RADAR"] : [store.activeProgram]
  const [form, setForm] = useState<Partial<Staff>>(
    staff ?? {
      firstName: "",
      lastName: "",
      initials: "",
      rank: "Controller",
      email: "",
      phone: "",
      homePositions: [],
      programs: defaultPrograms,
      active: true,
      joined: todayISO(),
      notes: "",
    },
  )
  const [selectedQuals, setSelectedQuals] = useState<string[]>(() =>
    staff
      ? store.staffQualifications.filter((sq) => sq.staffId === staff.id).map((sq) => sq.qualificationId)
      : [],
  )

  const togglePos = (id: string) =>
    setForm((f) => {
      const set = new Set(f.homePositions ?? [])
      if (set.has(id)) set.delete(id)
      else set.add(id)
      return { ...f, homePositions: [...set] }
    })

  // Select / clear every position in a given department group at once.
  const setGroup = (ids: string[], on: boolean) =>
    setForm((f) => {
      const set = new Set(f.homePositions ?? [])
      if (on) ids.forEach((id) => set.add(id))
      else ids.forEach((id) => set.delete(id))
      return { ...f, homePositions: [...set] }
    })

  // Programs are derived automatically from the selected operational positions:
  // hold any RADAR position → RADAR member, any TOWER position → TOWER member.
  const derivedPrograms = Array.from(
    new Set(
      (form.homePositions ?? [])
        .map((id) => store.positionById(id)?.program)
        .filter((p): p is Program => p === "RADAR" || p === "TOWER"),
    ),
  )

  const toggleQual = (id: string) =>
    setSelectedQuals((prev) => (prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]))

  // A single toggleable operational-position chip, reused across the
  // Radar / Tower / shared groupings below.
  const renderPosBadge = (p: { id: string; code: string }) => {
    const on = form.homePositions?.includes(p.id)
    return (
      <button key={p.id} type="button" onClick={() => togglePos(p.id)}>
        <Badge
          variant={on ? "default" : "outline"}
          className={cn("cursor-pointer font-mono", !on && "text-muted-foreground")}
        >
          {p.code}
        </Badge>
      </button>
    )
  }

  const save = () => {
    if (!form.firstName?.trim() || !form.lastName?.trim()) {
      toast.error("First and last name are required")
      return
    }
    const initials =
      form.initials?.trim() || (form.firstName[0] + form.lastName[0]).toUpperCase()
    let staffId: string
    if (staff) {
      store.updateStaff({ ...(staff as Staff), ...form, programs: derivedPrograms, initials } as Staff)
      staffId = staff.id
      toast.success("Staff updated")
    } else {
      staffId = `staff-${Date.now()}`
      store.addStaff({
        id: staffId,
        firstName: form.firstName!,
        lastName: form.lastName!,
        initials,
        rank: form.rank ?? "Controller",
        email: form.email ?? "",
        phone: form.phone ?? "",
        homePositions: form.homePositions ?? [],
        programs: derivedPrograms,
        active: form.active ?? true,
        joined: form.joined ?? todayISO(),
        notes: form.notes,
      })
      toast.success("Staff added")
    }
    store.setStaffQualifications(
      staffId,
      selectedQuals.map((qualificationId) => ({ qualificationId })),
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{staff ? "Edit Staff" : "Add Staff"}</DialogTitle>
          <DialogDescription>
            Manage profile details, operational positions, qualifications and active status.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-2 gap-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="fn">First name</Label>
            <Input
              id="fn"
              value={form.firstName ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ln">Last name</Label>
            <Input
              id="ln"
              value={form.lastName ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="initials">Initials</Label>
            <Input
              id="initials"
              placeholder="Auto"
              value={form.initials ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, initials: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rank">Rank</Label>
            <Input
              id="rank"
              value={form.rank ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, rank: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={form.phone ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Programs</Label>
            <p className="text-xs text-muted-foreground">
              Set automatically from the operational positions selected below.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {derivedPrograms.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  None yet — select operational positions to assign a department.
                </span>
              ) : (
                derivedPrograms.map((p) => (
                  <Badge key={p} variant="outline" className={programBadgeClass(p)}>
                    {programDisplay(p)}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div className="col-span-2 space-y-3">
            <div className="space-y-0.5">
              <Label>Operational positions</Label>
              <p className="text-xs text-muted-foreground">
                Positions this person is operational on, grouped by department.
              </p>
            </div>
            {PROGRAMS.map((prog) => {
              const group = store.positions.filter((p) => p.program === prog)
              if (group.length === 0) return null
              const ids = group.map((p) => p.id)
              const selected = ids.filter((id) => form.homePositions?.includes(id)).length
              const allOn = selected === ids.length
              return (
                <div key={prog} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", programBadgeClass(prog))}>
                      {programDisplay(prog)}
                      <span className="ml-1 opacity-70">
                        {selected}/{ids.length}
                      </span>
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setGroup(ids, !allOn)}
                    >
                      {allOn ? "Clear all" : "Select all"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">{group.map(renderPosBadge)}</div>
                </div>
              )
            })}
            {(() => {
              const shared = store.positions.filter((p) => p.program !== "RADAR" && p.program !== "TOWER")
              if (shared.length === 0) return null
              return (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Other
                  </span>
                  <div className="flex flex-wrap gap-1.5">{shared.map(renderPosBadge)}</div>
                </div>
              )
            })()}
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Qualifications</Label>
            <p className="text-xs text-muted-foreground">
              Allow-type quals enable eligibility; restrict-type quals flag restrictions.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {store.qualifications.map((q) => {
                const on = selectedQuals.includes(q.id)
                return (
                  <button key={q.id} type="button" onClick={() => toggleQual(q.id)}>
                    <Badge
                      variant={on ? (q.effect === "restrict" ? "destructive" : "default") : "outline"}
                      className={cn("cursor-pointer font-mono", !on && "text-muted-foreground")}
                      title={q.name}
                    >
                      {q.code}
                    </Badge>
                  </button>
                )
              })}
              {store.qualifications.length === 0 && (
                <span className="text-xs text-muted-foreground">No qualifications defined yet.</span>
              )}
            </div>
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes ?? ""}
              placeholder="Optional notes…"
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="active">Active</Label>
              <p className="text-xs text-muted-foreground">Inactive staff are excluded from auto-fill.</p>
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
          <Button onClick={save}>{staff ? "Save changes" : "Add staff"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
