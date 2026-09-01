"use client"

/* ===========================================================================
 * USER EDITOR DIALOG — create or edit a login account & its role
 * ===========================================================================
 * Manages app users (as opposed to "staff"): name, the role they act as
 * (SP/SUP/TL/Admin), and an optional link to a staff record. The chosen role
 * controls what that user can see and do via the permission matrix. Saves to
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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStore } from "@/lib/store"
import type { RoleCode, User } from "@/lib/types"
import { todayISO } from "@/lib/dates"

const ROLES: { code: RoleCode; name: string }[] = [
  { code: "SP", name: "Sim Pilot" },
  { code: "SUP", name: "Supervisor" },
  { code: "SOO", name: "Simulator Operational Officer" },
  { code: "STO", name: "Simulator Training Officer" },
  { code: "TL", name: "Team Lead" },
  { code: "Admin", name: "Administrator" },
]

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  user?: User | null
}

export function UserEditorDialog({ open, onOpenChange, user }: Props) {
  const store = useStore()
  const [form, setForm] = useState<Partial<User>>(
    user ?? {
      name: "",
      email: "",
      role: "SP",
      staffId: undefined,
      active: true,
    },
  )

  const save = () => {
    if (!form.name?.trim() || !form.email?.trim()) {
      toast.error("Name and email are required")
      return
    }
    if (user) {
      store.updateUser({ ...(user as User), ...form } as User)
      toast.success("User updated")
    } else {
      store.addUser({
        id: `u-${Date.now()}`,
        name: form.name!.trim(),
        email: form.email!.trim(),
        role: (form.role as RoleCode) ?? "SP",
        staffId: form.staffId,
        active: form.active ?? true,
        lastLogin: `${todayISO()} —`,
      })
      toast.success("User added")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit User" : "Add User"}</DialogTitle>
          <DialogDescription>Manage account details, role and linked staff profile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="u-name">Full name</Label>
            <Input
              id="u-name"
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as RoleCode }))}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    const r = ROLES.find((x) => x.code === value)
                    return r ? `${r.code} · ${r.name}` : "Select role"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.code} value={r.code}>
                    {r.code} · {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Linked staff</Label>
            <Select
              value={form.staffId ?? "none"}
              onValueChange={(v) =>
                setForm((f) => {
                  if (v === "none") return { ...f, staffId: undefined }
                  // Auto-populate the account's name and email from the linked
                  // staff record so the two always match by default. The admin
                  // can still edit either field afterwards.
                  const s = store.staff.find((x) => x.id === v)
                  return s
                    ? { ...f, staffId: v, name: `${s.firstName} ${s.lastName}`, email: s.email }
                    : { ...f, staffId: v }
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value) => {
                    if (!value || value === "none") return "None"
                    const s = store.staff.find((x) => x.id === value)
                    return s ? `${s.firstName} ${s.lastName}` : "None"
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {store.staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="u-active">Active</Label>
              <p className="text-xs text-muted-foreground">Disabled users cannot sign in.</p>
            </div>
            <Switch
              id="u-active"
              checked={form.active ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{user ? "Save changes" : "Add user"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
