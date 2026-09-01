"use client"

/* ===========================================================================
 * NOTIFICATION VIEWER PAGE ("/admin/notifications") — sent-message log
 * ===========================================================================
 * Lists every notification the app has sent or handed off (assignment, daily
 * and weekly digests), who it went to, the channel, and whether it was
 * opened/read.
 *
 * Notifications are created by the useNotify hook (lib/use-notify.ts) and the
 * wording lives in lib/notify.ts. In demo mode (no email key) sends are
 * "simulated" and flagged as such here.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { can } from "@/lib/permissions"
import { PageHeader, EmptyState } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TrainingAttachmentsList } from "@/components/training-attachments"
import { Mail, MessageSquare, Copy, Inbox, ShieldAlert, CalendarRange, CheckCheck, MailOpen, Megaphone, CalendarClock, GraduationCap, ClipboardCheck } from "lucide-react"
import type { NotificationChannel, NotificationKind, NotificationRecord } from "@/lib/types"

const channelMeta: Record<
  NotificationChannel,
  { icon: typeof Mail; label: string; className: string }
> = {
  email: { icon: Mail, label: "Email", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  sms: { icon: MessageSquare, label: "SMS", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  copy: { icon: Copy, label: "Copied", className: "bg-muted text-muted-foreground border-border" },
}

const kindMeta: Record<NotificationKind, { icon: typeof Mail; label: string }> = {
  assignment: { icon: ClipboardCheck, label: "Assignment" },
  weekly: { icon: CalendarRange, label: "Weekly schedule" },
  daily: { icon: CalendarClock, label: "Daily schedule" },
  training: { icon: GraduationCap, label: "Training" },
  custom: { icon: Megaphone, label: "Message" },
}

function formatSentAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function NotificationCard({ n, showReadStatus }: { n: NotificationRecord; showReadStatus: boolean }) {
  const meta = channelMeta[n.channel]
  const Icon = meta.icon
  const kind = kindMeta[n.kind] ?? kindMeta.assignment
  const KindIcon = kind.icon
  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={meta.className}>
            <Icon className="size-3" /> {meta.label}
          </Badge>
          <Badge variant="outline">
            <KindIcon className="size-3" /> {kind.label}
          </Badge>
          {n.simulated && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
              Demo / hand-off
            </Badge>
          )}
          {showReadStatus &&
            (n.readAt ? (
              <Badge
                variant="outline"
                className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                title={`Read ${formatSentAt(n.readAt)}`}
              >
                <CheckCheck className="size-3" /> Read · {formatSentAt(n.readAt)}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <MailOpen className="size-3" /> Unread
              </Badge>
            ))}
          <span className="ml-auto text-xs text-muted-foreground">{formatSentAt(n.sentAt)}</span>
        </div>
        <CardTitle className="text-sm font-medium">{n.subject}</CardTitle>
        <CardDescription className="text-xs">
          To {n.to} · sent by {n.sentBy}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-sans text-xs leading-relaxed text-foreground">
          {n.body}
        </pre>
        {n.attachments && n.attachments.length > 0 && <TrainingAttachmentsList attachments={n.attachments} />}
      </CardContent>
    </Card>
  )
}

export default function NotificationsViewerPage() {
  const store = useStore()
  // Opening the viewer is gated by page access; read receipts are an additional
  // capability (view_read_status) granted to TL and Admin by default.
  const canView = can(store.currentRole, "page_notifications")
  const canSeeReadStatus = can(store.currentRole, "view_read_status")
  const [staffId, setStaffId] = useState<string>("")

  const staffSorted = useMemo(
    () => [...store.staff].sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [store.staff],
  )

  const selected = staffId ? store.staffById(staffId) : undefined
  const received = staffId ? store.notificationsForStaff(staffId) : []

  if (!canView) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader
          title="Notification Viewer"
          description="Preview the notifications each person has received"
        />
        <div className="mt-6">
          <EmptyState
            icon={ShieldAlert}
            title="Team Leader access required"
            description="Only Team Leaders and Admins can view the notification inbox and read receipts. Switch role in the top bar to preview."
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Notification Viewer"
        description="Sample inbox — select a person to see every booking and weekly schedule notification they have received."
      />

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Select a staff member</CardTitle>
          <CardDescription>Their received notifications appear below.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={staffId} onValueChange={(v) => setStaffId(v ?? "")}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="Choose a staff member…" />
            </SelectTrigger>
            <SelectContent>
              {staffSorted.map((s) => {
                const count = store.notificationsForStaff(s.id).length
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {s.lastName}, {s.firstName} ({s.initials}){count ? ` — ${count}` : ""}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {!selected ? (
        <EmptyState
          icon={Inbox}
          title="No staff member selected"
          description="Pick someone from the dropdown to view their notification history."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback>{selected.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {selected.firstName} {selected.lastName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selected.email} · {selected.phone}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto">
              {received.length} notification{received.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {received.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No notifications yet"
              description="This person has not received any notifications. Send one from the Seating Plan, or push a weekly schedule above."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {received.map((n) => (
                <NotificationCard key={n.id} n={n} showReadStatus={canSeeReadStatus} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
