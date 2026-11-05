"use client"

import { useState, useCallback } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import {
  DatabaseBackup,
  Plus,
  RotateCcw,
  Trash2,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  HardDrive,
  Clock,
  CheckCircle2,
  Info,
  UploadCloud,
} from "lucide-react"
import { PageHeader } from "@/components/shared"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import type { BackupMeta } from "@/app/api/backup/route"

// ── Data fetching ─────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then((r) => r.json())

function useBackups() {
  const { data, error, isLoading, mutate } = useSWR<{ backups: BackupMeta[] }>(
    "/api/backup",
    fetcher,
    { revalidateOnFocus: false },
  )
  return {
    backups: data?.backups ?? [],
    isLoading,
    error,
    refresh: mutate,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub?: string
  accent?: "default" | "warning" | "success"
}) {
  const accentClass =
    accent === "warning" ? "text-amber-500" :
    accent === "success" ? "text-emerald-500" :
    "text-primary"
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div className={`mt-0.5 rounded-md bg-muted p-2 ${accentClass}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BackupPage() {
  const { backups, isLoading, refresh } = useBackups()

  // Create backup
  const [createLabel, setCreateLabel] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [lastCreated, setLastCreated] = useState<string | null>(null)

  // Restore dialog
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreSuccess, setRestoreSuccess] = useState(false)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<BackupMeta | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!createLabel.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: createLabel.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setCreateError(json.error ?? "Create failed")
      } else {
        setCreateLabel("")
        setLastCreated(json.backup?.label ?? createLabel.trim())
        await refresh()
      }
    } catch {
      setCreateError("Network error — please try again")
    } finally {
      setCreating(false)
    }
  }, [createLabel, refresh])

  // ── Restore ─────────────────────────────────────────────────────────────────
  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return
    setRestoring(true)
    setRestoreError(null)
    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: restoreTarget.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setRestoreError(json.error ?? "Restore failed")
      } else {
        setRestoreSuccess(true)
        // Invalidate the SWR state cache so the store reloads on next navigate.
        await globalMutate("/api/state")
        await refresh()
      }
    } catch {
      setRestoreError("Network error — please try again")
    } finally {
      setRestoring(false)
    }
  }, [restoreTarget, refresh])

  const closeRestoreDialog = () => {
    setRestoreTarget(null)
    setRestoreError(null)
    setRestoreSuccess(false)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch("/api/backup/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setDeleteError(json.error ?? "Delete failed")
      } else {
        setDeleteTarget(null)
        await refresh()
      }
    } catch {
      setDeleteError("Network error — please try again")
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, refresh])

  // ── Derived stats ────────────────────────────────────────────────────────────
  const totalSize = backups.reduce((s, b) => s + b.size, 0)
  const newest = backups[0] ?? null

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Backup & Restore"
        description="Create named snapshots of the full application state. Roll back to any previous backup instantly, or roll forward to a more recent one after testing a downgrade."
        actions={
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={isLoading}>
            <RefreshCw className={`mr-2 size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={DatabaseBackup} label="Total backups" value={backups.length} />
        <StatCard icon={HardDrive} label="Storage used" value={formatBytes(totalSize)} sub="all backups combined" />
        <StatCard
          icon={Clock}
          label="Latest backup"
          value={newest ? timeAgo(newest.createdAt) : "—"}
          sub={newest ? formatDate(newest.createdAt) : "No backups yet"}
          accent={newest ? "success" : "warning"}
        />
        <StatCard icon={ShieldCheck} label="Data coverage" value="100%" sub="full state snapshot" accent="success" />
      </div>

      {/* Create new backup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4 text-primary" />
            Create backup
          </CardTitle>
          <CardDescription>
            Captures the entire application state — staff, runs, schedule, training, logs, and all settings — into a named snapshot stored in private Blob storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex-1 space-y-1.5">
              <Input
                value={createLabel}
                onChange={(e) => { setCreateLabel(e.target.value); setCreateError(null); setLastCreated(null) }}
                onKeyDown={(e) => { if (!e.nativeEvent.isComposing && e.key === "Enter") handleCreate() }}
                placeholder="e.g. pre-v2-upgrade, after-staff-review, weekly-friday…"
                maxLength={60}
                className="max-w-lg"
              />
              <p className="text-xs text-muted-foreground">Give the backup a short descriptive name so you can identify it later.</p>
            </div>
            <Button onClick={handleCreate} disabled={creating || !createLabel.trim()}>
              <UploadCloud className={`mr-2 size-4 ${creating ? "animate-pulse" : ""}`} />
              {creating ? "Saving…" : "Create backup"}
            </Button>
          </div>

          {createError && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {createError}
            </div>
          )}
          {lastCreated && !createError && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              Backup &ldquo;{lastCreated}&rdquo; created successfully.
            </div>
          )}
        </CardContent>
      </Card>

      {/* What is included notice */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-muted-foreground">
            <p className="font-medium text-foreground">What every backup includes</p>
            <p>
              Staff, positions, simulators, exercises, courses, qualifications, run schedule, run assignments, leave
              records, other tasks, training sessions, training attendance, staff validity / currency, slot times,
              public holidays, permission matrix, audit logs, fault logs, operator logs, firewall logs, administrator
              logs, import history, notifications, and all system settings. No data is omitted.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Backup list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseBackup className="size-4 text-primary" />
            Saved backups
          </CardTitle>
          <CardDescription>
            Click <strong>Roll back</strong> to restore a previous backup (replaces the live state, then reload the app). Click <strong>Roll out</strong> to promote a backup as the new live state after confirming a roll-back was good.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <RefreshCw className="size-4 animate-spin" />
              Loading backups…
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <DatabaseBackup className="size-8 opacity-30" />
              <p>No backups yet. Create your first one above.</p>
            </div>
          ) : (
            <div className="divide-y">
              {backups.map((backup, idx) => (
                <div
                  key={backup.id}
                  className="flex flex-col gap-3 px-6 py-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <DatabaseBackup className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{backup.label}</span>
                        {idx === 0 && (
                          <Badge variant="secondary" className="text-xs">Latest</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(backup.createdAt)} &middot; {timeAgo(backup.createdAt)} &middot; {formatBytes(backup.size)}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setRestoreTarget(backup); setRestoreSuccess(false); setRestoreError(null) }}
                    >
                      <RotateCcw className="mr-1.5 size-3.5" />
                      {idx === 0 ? "Roll out" : "Roll back"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => { setDeleteTarget(backup); setDeleteError(null) }}
                    >
                      <Trash2 className="mr-1.5 size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Restore confirmation dialog ────────────────────────────────────────── */}
      <Dialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) closeRestoreDialog() }}>
        <DialogContent className="sm:max-w-md">
          {!restoreSuccess ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RotateCcw className="size-4 text-amber-500" />
                  {backups[0]?.id === restoreTarget?.id ? "Roll out" : "Roll back"} to &ldquo;{restoreTarget?.label}&rdquo;
                </DialogTitle>
                <DialogDescription className="space-y-2 text-left">
                  <span className="block">
                    This will replace the <strong>entire live application state</strong> with this backup. Every unsaved change made after this backup was created will be overwritten.
                  </span>
                  <span className="block">
                    Created: <strong>{restoreTarget ? formatDate(restoreTarget.createdAt) : ""}</strong>
                    <br />
                    Size: <strong>{restoreTarget ? formatBytes(restoreTarget.size) : ""}</strong>
                  </span>
                  <span className="block text-amber-600 dark:text-amber-400">
                    After restoring, refresh the browser to load the restored state.
                  </span>
                </DialogDescription>
              </DialogHeader>
              {restoreError && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {restoreError}
                </div>
              )}
              <Separator />
              <DialogFooter className="flex-row justify-end gap-2">
                <Button variant="outline" onClick={closeRestoreDialog} disabled={restoring}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleRestore}
                  disabled={restoring}
                >
                  <RotateCcw className={`mr-2 size-4 ${restoring ? "animate-spin" : ""}`} />
                  {restoring ? "Restoring…" : "Yes, restore this backup"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Restore complete
                </DialogTitle>
                <DialogDescription className="text-left">
                  The live state has been replaced with &ldquo;{restoreTarget?.label}&rdquo;. Refresh your browser now to load the restored snapshot.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  onClick={() => { closeRestoreDialog(); window.location.reload() }}
                >
                  Refresh now
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ─────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError(null) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" />
              Delete &ldquo;{deleteTarget?.label}&rdquo;?
            </DialogTitle>
            <DialogDescription>
              This backup will be permanently deleted from storage and cannot be recovered. The live application state is not affected.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {deleteError}
            </div>
          )}
          <Separator />
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteError(null) }} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              <Trash2 className={`mr-2 size-4 ${deleting ? "animate-pulse" : ""}`} />
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
