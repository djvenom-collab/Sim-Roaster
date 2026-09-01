"use client"

/* ===========================================================================
 * WEEKLY PUSH DIALOG — send everyone their week ahead
 * ===========================================================================
 * Builds a Mon–Fri digest for each active person (their seating, training, and
 * any expiring/expired currency) and lets a manager email/SMS it, one person at
 * a time or "Push to all". Conceptually sent the Sunday before the week.
 * Hidden unless the role has the push_notifications permission.
 *
 * CHANGEABLE: the working-week length (currently Mon + 4 days) and the
 * "worth sending" rule (hasContent) are defined near the top of the component.
 * =========================================================================== */
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { useNotify } from "@/lib/use-notify"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { CalendarRange, ChevronLeft, ChevronRight, Send, Loader2, Mail, MessageSquare } from "lucide-react"
import { TODAY, toISO, addDays, parseISO, formatShort } from "@/lib/dates"
import { buildWeeklySmsBody, smsHref } from "@/lib/notify"
import { can } from "@/lib/permissions"

// Monday of the week containing `d`. Weeks run Mon–Sun; the digest is sent the
// day before (the preceding Sunday) to cover the upcoming week.
function mondayOf(d: Date): Date {
  const day = d.getDay() // 0 Sun .. 6 Sat
  const offset = (day + 6) % 7
  return addDays(d, -offset)
}

// The Sunday immediately before a given Monday week-start (i.e. the send date).
function sendDateFor(weekStartISO: string): string {
  return toISO(addDays(parseISO(weekStartISO), -1))
}

export function WeeklyPushDialog({ trigger }: { trigger?: React.ReactElement }) {
  const store = useStore()
  const { buildWeekContext, sendWeeklyEmail, recordHandoff } = useNotify()
  const [open, setOpen] = useState(false)
  // Pushing weekly schedules is restricted to SUP and above via the matrix.
  const canPush = can(store.currentRole, "push_notifications")
  const [weekStart, setWeekStart] = useState<string>(() => toISO(mondayOf(TODAY)))
  const [includeEmpty, setIncludeEmpty] = useState(false)
  const [sending, setSending] = useState(false)

  // Working week is Mon–Fri; the digest covers Monday + 4 days = Friday.
  const weekEndISO = toISO(addDays(parseISO(weekStart), 4))

  // Build a weekly context for every active staff member.
  const rows = useMemo(() => {
    return store.staff
      .filter((s) => s.active)
      .map((s) => buildWeekContext(s.id, weekStart))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => b.items.length - a.items.length || a.staff.lastName.localeCompare(b.staff.lastName))
  }, [store.staff, buildWeekContext, weekStart])

  // A digest is worth sending if the person has seating, training, or any
  // currency that is expiring/expired in the snapshot.
  const atRiskCount = (ctx: (typeof rows)[number]) =>
    ctx.currency.filter((c) => c.status === "expiring" || c.status === "expired").length
  const hasContent = (ctx: (typeof rows)[number]) =>
    ctx.items.length > 0 || ctx.trainings.length > 0 || ctx.otherTasks.length > 0 || atRiskCount(ctx) > 0

  const visible = includeEmpty ? rows : rows.filter(hasContent)
  const sendable = rows.filter(hasContent)

  const shiftWeek = (n: number) => setWeekStart(toISO(addDays(parseISO(weekStart), n * 7)))

  // After a weekly digest reaches someone, every run/training it covered counts
  // as notified — so the "changes not notified" warning clears for those items.
  // needsNotify() still re-flags anything edited AFTER this stamp, because it
  // compares the change time against this notifiedAt time.
  const markWeeklyNotified = (ctx: (typeof rows)[number]) => {
    ctx.items.forEach((it) => store.markNotified(`run:${it.runId}`))
    ctx.trainings.forEach((t) => store.markNotified(`training:${t.sessionId}`))
  }

  // Hidden entirely for roles without the push permission (SP / Level 1).
  if (!canPush) return null

  const handleSendAll = async () => {
    setSending(true)
    let ok = 0
    let fail = 0
    let simulated = false
    for (const ctx of sendable) {
      try {
        const res = await sendWeeklyEmail(ctx)
        if (res.simulated) simulated = true
        markWeeklyNotified(ctx)
        ok++
      } catch {
        fail++
      }
    }
    setSending(false)
    if (ok > 0 && fail === 0)
      toast.success(
        simulated
          ? `Prepared ${ok} weekly schedule(s) (demo mode — no key configured)`
          : `Pushed weekly schedule to ${ok} staff`,
      )
    else if (ok > 0) toast.warning(`Sent ${ok}, failed ${fail}`)
    else toast.error("No weekly schedules to send")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline" size="sm">
              <CalendarRange className="size-4" /> Weekly push
            </Button>
          )
        }
      />
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Push weekly digest</DialogTitle>
          <DialogDescription>
            Sent the Sunday before each week: a full working-week (Mon–Fri) digest of every person&apos;s
            seating, training, and a snapshot of their currency status with days remaining.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2">
          <Button variant="ghost" size="icon" onClick={() => shiftWeek(-1)} aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="text-center text-sm font-medium">
            {formatShort(weekStart)} – {formatShort(weekEndISO)}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {sendable.length} to notify
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              Sends {formatShort(sendDateFor(weekStart))} (Sun)
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => shiftWeek(1)} aria-label="Next week">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Switch id="include-empty" checked={includeEmpty} onCheckedChange={setIncludeEmpty} />
          <Label htmlFor="include-empty" className="text-sm font-normal text-muted-foreground">
            Show staff with nothing scheduled this week
          </Label>
        </div>

        <ScrollArea className="h-[45vh] pr-3">
          {visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No staff have seating, training, other tasks, or at-risk currency this week.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((ctx) => (
                <div
                  key={ctx.staff.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">
                      {ctx.staff.firstName} {ctx.staff.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{ctx.staff.email || "no email"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {ctx.items.length} session{ctx.items.length === 1 ? "" : "s"}
                    </Badge>
                    {ctx.trainings.length > 0 && (
                      <Badge variant="outline">
                        {ctx.trainings.length} training
                      </Badge>
                    )}
                    {ctx.otherTasks.length > 0 && (
                      <Badge variant="outline">
                        {ctx.otherTasks.length} task{ctx.otherTasks.length === 1 ? "" : "s"}
                      </Badge>
                    )}
                    {atRiskCount(ctx) > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-amber-700 dark:text-amber-400"
                      >
                        {atRiskCount(ctx)} currency
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Open SMS for ${ctx.staff.firstName}`}
                      disabled={!ctx.staff.phone || !hasContent(ctx)}
                      render={
                        <a
                          href={smsHref(ctx.staff.phone, buildWeeklySmsBody(ctx))}
                          onClick={() => {
                            recordHandoff({
                              staffId: ctx.staff.id,
                              channel: "sms",
                              kind: "weekly",
                              subject: `Weekly schedule — week of ${formatShort(weekStart)}`,
                              body: buildWeeklySmsBody(ctx),
                              to: ctx.staff.phone,
                            })
                            markWeeklyNotified(ctx)
                          }}
                        />
                      }
                    >
                      <MessageSquare className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!ctx.staff.email || !hasContent(ctx)}
                      onClick={async () => {
                        try {
                          const res = await sendWeeklyEmail(ctx)
                          markWeeklyNotified(ctx)
                          toast.success(
                            res.simulated
                              ? `Prepared weekly schedule for ${ctx.staff.firstName} (demo mode)`
                              : `Sent weekly schedule to ${ctx.staff.firstName}`,
                          )
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Failed to send")
                        }
                      }}
                    >
                      <Mail className="size-4" /> Email
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button onClick={handleSendAll} disabled={sending || sendable.length === 0}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Push to all ({sendable.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
