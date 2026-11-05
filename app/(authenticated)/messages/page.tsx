"use client"

/* ===========================================================================
 * SEND MESSAGE PAGE ("/messages") — compose a custom message + attachments
 * ===========================================================================
 * Lets a manager write a free-text message, attach openable files, pick one or
 * more staff recipients, and send it. Each recipient receives it in their
 * notification bell and it appears in the Notification Viewer — with the
 * attachments openable from inside the message.
 *
 * Sending uses sendCustomEmail() from lib/use-notify.ts (one record per
 * recipient). Attachments are uploaded to Vercel Blob via the shared
 * TrainingAttachmentsEditor. The recipient list respects the active
 * RADAR/TOWER program (store.scopedStaff).
 * =========================================================================== */
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { useNotify } from "@/lib/use-notify"
import { programBadgeClass, programDisplay } from "@/lib/program"
import { PageHeader } from "@/components/shared"
import { TrainingAttachmentsEditor } from "@/components/training-attachments"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Search, Send, Loader2, Users, X, CheckCheck, MailCheck } from "lucide-react"
import type { Program } from "@/lib/program"
import type { TrainingAttachment } from "@/lib/types"

export default function SendMessagePage() {
  const store = useStore()
  const { sendCustomEmail } = useNotify()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<TrainingAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [lastSentCount, setLastSentCount] = useState<number | null>(null)

  // Active staff in the current program scope, sorted by surname.
  const roster = useMemo(
    () =>
      store.scopedStaff
        .filter((s) => s.active)
        .sort((a, b) => a.lastName.localeCompare(b.lastName)),
    [store.scopedStaff],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.initials} ${s.rank}`.toLowerCase().includes(q),
    )
  }, [roster, search])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAllFiltered = () => setSelected((prev) => new Set([...prev, ...filtered.map((s) => s.id)]))
  const clearSelection = () => setSelected(new Set())

  const canSend = selected.size > 0 && subject.trim().length > 0 && body.trim().length > 0 && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    setLastSentCount(null)
    const ids = [...selected]
    let ok = 0
    for (const staffId of ids) {
      try {
        await sendCustomEmail({ staffId, subject: subject.trim(), body: body.trim(), attachments })
        ok++
      } catch {
        const s = store.staffById(staffId)
        toast.error(`Failed to send to ${s ? `${s.firstName} ${s.lastName}` : "a recipient"}`)
      }
    }
    setSending(false)
    if (ok > 0) {
      store.log("message.send", `Sent custom message "${subject.trim()}" to ${ok} recipient(s)`)
      toast.success(`Message sent to ${ok} recipient${ok === 1 ? "" : "s"}`)
      setLastSentCount(ok)
      setSubject("")
      setBody("")
      setAttachments([])
      setSelected(new Set())
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Send Message"
        description="Compose a custom message with attachments and send it to staff. It lands in their notifications, where the files can be opened."
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* ── Recipients ─────────────────────────────────────────────── */}
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader className="gap-2 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" /> Recipients
              </CardTitle>
              <Badge variant="outline">{selected.size} selected</Badge>
            </div>
            <CardDescription>Choose who should receive this message.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff…"
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
                <CheckCheck className="size-4" /> Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={selected.size === 0}
              >
                <X className="size-4" /> Clear
              </Button>
            </div>
            <ScrollArea className="h-[22rem] rounded-md border">
              <ul className="divide-y">
                {filtered.length === 0 ? (
                  <li className="p-4 text-center text-sm text-muted-foreground">No staff match your search.</li>
                ) : (
                  filtered.map((s) => {
                    const checked = selected.has(s.id)
                    return (
                      <li key={s.id}>
                        <label
                          htmlFor={`rcpt-${s.id}`}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-accent hover:text-accent-foreground"
                        >
                          <Checkbox id={`rcpt-${s.id}`} checked={checked} onCheckedChange={() => toggle(s.id)} />
                          <Avatar className="size-7">
                            <AvatarFallback className="text-[10px]">{s.initials}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {s.lastName}, {s.firstName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{s.rank}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {(s.programs ?? []).map((p) => (
                              <Badge
                                key={p}
                                variant="outline"
                                className={`px-1 text-[10px] ${programBadgeClass(p as Program)}`}
                              >
                                {programDisplay(p)}
                              </Badge>
                            ))}
                          </div>
                        </label>
                      </li>
                    )
                  })
                )}
              </ul>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ── Compose ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compose</CardTitle>
            <CardDescription>Write your message and attach any documents to include.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="msg-subject">Subject</Label>
              <Input
                id="msg-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Updated simulator briefing pack"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg-body">Message</Label>
              <Textarea
                id="msg-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your message to staff here…"
                rows={9}
              />
            </div>
            <div className="space-y-2">
              <Label>Attachments</Label>
              <TrainingAttachmentsEditor attachments={attachments} onChange={setAttachments} />
            </div>

            {lastSentCount !== null && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <MailCheck className="size-4" />
                Message delivered to {lastSentCount} recipient{lastSentCount === 1 ? "" : "s"}. They can open it from their notifications.
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {selected.size > 0
                  ? `Sending to ${selected.size} recipient${selected.size === 1 ? "" : "s"}`
                  : "Select at least one recipient"}
                {attachments.length > 0 ? ` · ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}` : ""}
              </p>
              <Button type="button" onClick={handleSend} disabled={!canSend}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {sending ? "Sending…" : "Send message"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
