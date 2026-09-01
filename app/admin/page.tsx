"use client"

/* ===========================================================================
 * ADMIN / PERMISSIONS PAGE ("/admin") — users, roles & the audit log
 * ===========================================================================
 * Two jobs: (1) the permission matrix where an admin ticks which permissions
 * each role (SP/SUP/TL/Admin) has, and (2) the audit log of changes made
 * across the app (assignments, cancellations, overrides, edits…).
 *
 * CHANGEABLE: the available permissions and per-role defaults are defined in
 * lib/permissions.ts. Long audit "detail" strings written as "summary: a; b; c"
 * are rendered here as a heading plus a bulleted list.
 * =========================================================================== */
import React, { useState } from "react"
import { useStore } from "@/lib/store"
import { can, PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from "@/lib/permissions"
import { PageHeader, EmptyState } from "@/components/shared"
import { UserEditorDialog } from "@/components/user-editor-dialog"
import { ArchivePanel } from "@/components/archive-panel"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { initialsFromName } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Lock, ShieldAlert, Plus, Pencil, Trash2, RotateCcw } from "lucide-react"
import type { RoleCode, User } from "@/lib/types"
import { toast } from "sonner"

const ROLES: { code: RoleCode; level: number; name: string }[] = [
  { code: "SP", level: 1, name: "Sim Pilot" },
  { code: "SUP", level: 2, name: "Supervisor" },
  { code: "SOO", level: 3, name: "Simulator Operational Officer" },
  { code: "STO", level: 4, name: "Simulator Training Officer" },
  { code: "TL", level: 5, name: "Team Lead" },
  { code: "Admin", level: 6, name: "Administrator" },
]

export default function AdminPage() {
  const store = useStore()
  const isAdmin = can(store.currentRole, "manage_users")
  const canViewAudit = can(store.currentRole, "view_audit")
  const [addUser, setAddUser] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  function changeRole(userId: string, role: RoleCode) {
    const u = store.users.find((x) => x.id === userId)
    if (u) store.updateUser({ ...u, role })
    toast.success(`Role updated to ${role}`)
  }

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Admin / User Permissions" description="Manage users, roles and audit logs" />
        <EmptyState
          icon={ShieldAlert}
          title="Administrator access required"
          description="Only Admin (Level 4) users can manage permissions. Switch role in the top bar to preview."
        />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader title="Admin / User Permissions" description="Manage users, assign roles, and review the audit trail" />

      {addUser && <UserEditorDialog open={addUser} onOpenChange={setAddUser} />}
      {editUser && (
        <UserEditorDialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)} user={editUser} />
      )}
      <ConfirmDialog
        open={!!deleteUser}
        onOpenChange={(o) => !o && setDeleteUser(null)}
        title={`Remove ${deleteUser?.name}?`}
        description="This deletes the user account. This cannot be undone."
        onConfirm={() => {
          if (deleteUser) {
            store.deleteUser(deleteUser.id)
            toast.success("User removed")
            setDeleteUser(null)
          }
        }}
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users &amp; roles</TabsTrigger>
          <TabsTrigger value="matrix">Permission matrix</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
          <TabsTrigger value="archive">Data archive</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Users ({store.users.length})</CardTitle>
                <CardDescription>Add, edit or remove users and assign access levels</CardDescription>
              </div>
              <Button size="sm" onClick={() => setAddUser(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add user
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-44">Role</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {store.users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs">
                              {(u.staffId && store.staffById(u.staffId)?.initials) || initialsFromName(u.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{u.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">{u.lastLogin}</TableCell>
                      <TableCell>
                        <Badge variant={u.active ? "default" : "outline"}>
                          {u.active ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as RoleCode)}>
                          <SelectTrigger className="h-8">
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
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setEditUser(u)}
                            aria-label="Edit user"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setDeleteUser(u)}
                            aria-label="Delete user"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="text-base">Role permission matrix</CardTitle>
                <CardDescription>Tick a box to grant a capability to an access level</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => store.resetPermissions()}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset defaults
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Permission</TableHead>
                    {ROLES.map((r) => (
                      <TableHead key={r.code} className="text-center">
                        {r.code}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERMISSION_GROUPS.map((group) => (
                    <React.Fragment key={group.label}>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={ROLES.length + 1} className="py-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {group.label}
                          </span>
                          <span className="ml-2 text-xs font-normal text-muted-foreground">{group.description}</span>
                        </TableCell>
                      </TableRow>
                      {group.permissions.map((key) => (
                        <TableRow key={key}>
                          <TableCell className="font-medium">{PERMISSION_LABELS[key]}</TableCell>
                          {ROLES.map((r) => {
                            const checked = store.permissionMatrix[r.code].includes(key)
                            const locked = r.code === "Admin"
                            return (
                              <TableCell key={r.code} className="text-center">
                                <div className="flex justify-center">
                                  <Checkbox
                                    checked={checked}
                                    disabled={locked}
                                    onCheckedChange={() => store.togglePermission(r.code, key)}
                                    aria-label={`${r.code} ${PERMISSION_LABELS[key]}`}
                                  />
                                </div>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Administrator retains all permissions and cannot be modified.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit log ({store.auditLogs.length})</CardTitle>
              <CardDescription>Chronological record of system changes</CardDescription>
            </CardHeader>
            <CardContent>
              {!canViewAudit ? (
                <EmptyState icon={Lock} title="Restricted" description="TL or Admin access required." />
              ) : store.auditLogs.length === 0 ? (
                <EmptyState icon={ShieldAlert} title="No activity" description="Audit entries will appear here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {store.auditLogs.map((l) => {
                      // Long details are recorded as "summary: a; b; c". Split them so
                      // multi-item entries render as readable rows instead of one long line.
                      const colonIdx = l.detail.indexOf(": ")
                      const head = colonIdx > -1 ? l.detail.slice(0, colonIdx) : l.detail
                      const rest = colonIdx > -1 ? l.detail.slice(colonIdx + 2) : ""
                      const items = rest ? rest.split("; ").filter(Boolean) : []
                      const isMulti = items.length > 1
                      return (
                        <TableRow key={l.id} className="align-top">
                          <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {l.timestamp}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{l.user}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono text-xs">
                              {l.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xl text-muted-foreground">
                            {isMulti ? (
                              <div className="space-y-1">
                                <span className="font-medium text-foreground">{head}</span>
                                <ul className="ml-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed">
                                  {items.map((it, i) => (
                                    <li key={i} className="text-pretty">
                                      {it}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <span className="text-pretty">{l.detail}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <ArchivePanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
