"use client"

import { useState } from "react"
import useSWR from "swr"
import { Download, ShieldCheck, ShieldAlert, Search, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/shared"

interface AuditRow {
  seq: number
  eventId: string
  occurredAt: string
  actorUserId: string | null
  actorEmail: string | null
  actorRole: string | null
  action: string
  entityType: string | null
  entityId: string | null
  entityLabel: string | null
  previousValue: unknown
  newValue: unknown
  reason: string | null
  correlationId: string
  result: "success" | "failure"
  failureReason: string | null
  source: string
  ipAddress: string | null
  userAgent: string | null
  hash: string
  prevHash: string | null
}

interface AuditPage {
  rows: AuditRow[]
  total: number
  page: number
  pages: number
}

interface Facets {
  actions: string[]
  entityTypes: string[]
  actors: { id: string; email: string | null }[]
}

type Filters = Record<"from" | "to" | "actor" | "action" | "entityType" | "result" | "q" | "correlationId", string>

const EMPTY: Filters = { from: "", to: "", actor: "", action: "", entityType: "", result: "", q: "", correlationId: "" }

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(res.status === 403 ? "forbidden" : `http_${res.status}`)
  return res.json()
}

function toQuery(filters: Filters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) p.set(k, v)
  return p.toString()
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
        {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export function ServerAuditLog() {
  const [draft, setDraft] = useState<Filters>(EMPTY)
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AuditRow | null>(null)
  const [verifying, setVerifying] = useState(false)

  const { data: facets } = useSWR<Facets>("/api/audit?facets=1", fetcher)
  const { data, error, isLoading } = useSWR<AuditPage>(
    `/api/audit?${toQuery(filters, { page: String(page), pageSize: "50" })}`,
    fetcher,
    { keepPreviousData: true },
  )

  const apply = (next: Filters) => {
    setFilters(next)
    setPage(1)
  }

  const verify = async () => {
    setVerifying(true)
    try {
      const res = await fetcher("/api/audit/verify")
      if (res.ok) toast.success(`Chain intact — ${res.checked.toLocaleString()} events verified`)
      else toast.error(`Chain broken at event #${res.brokenAtSeq}. Investigate immediately.`)
    } catch {
      toast.error("Verification failed to run")
    } finally {
      setVerifying(false)
    }
  }

  const traceCorrelation = (id: string) => {
    const next = { ...EMPTY, correlationId: id }
    setDraft(next)
    apply(next)
    setSelected(null)
  }

  if (error?.message === "forbidden") {
    return <EmptyState icon={ShieldAlert} title="Restricted" description="Only Admins can view the server audit trail." />
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Server audit trail {data ? `(${data.total.toLocaleString()})` : ""}</CardTitle>
          <CardDescription>
            Append-only, hash-chained record written by the server. Entries cannot be edited or deleted.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={verify} disabled={verifying}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            {verifying ? "Verifying…" : "Verify integrity"}
          </Button>
          <Button variant="outline" size="sm" render={<a href={`/api/audit/export?${toQuery(filters)}`} download />}>
            <Download className="size-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault()
            apply(draft)
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
            Search
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-8"
                placeholder="Entity, email, reason, value…"
                value={draft.q}
                onChange={(e) => setDraft({ ...draft, q: e.target.value })}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <Input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <Input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Actor
            <select className={selectClass} value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })}>
              <option value="">All actors</option>
              {facets?.actors.map((a) => (
                <option key={a.id} value={a.id}>{a.email ?? a.id}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Action
            <select className={selectClass} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
              <option value="">All actions</option>
              {facets?.actions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Entity type
            <select className={selectClass} value={draft.entityType} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })}>
              <option value="">All entities</option>
              {facets?.entityTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Result
            <select className={selectClass} value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value })}>
              <option value="">Any result</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" size="sm">Apply filters</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(EMPTY)
                apply(EMPTY)
              }}
            >
              Reset
            </Button>
            {filters.correlationId ? (
              <Badge variant="secondary" className="font-mono text-xs">
                request {filters.correlationId.slice(0, 8)}
              </Badge>
            ) : null}
          </div>
        </form>

        {error ? (
          <EmptyState icon={ShieldAlert} title="Audit trail unavailable" description="The audit store could not be reached." />
        ) : isLoading && !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading audit trail…</p>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No matching events" description="Adjust the filters to widen the search." />
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow
                      key={r.seq}
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => setSelected(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          setSelected(r)
                        }
                      }}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                        {formatTime(r.occurredAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{r.actorEmail ?? (r.actorUserId ? r.actorUserId : "system")}</span>
                          {r.actorRole ? <span className="text-xs text-muted-foreground">{r.actorRole}</span> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">{r.action}</Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {r.entityType ? `${r.entityType} · ` : ""}
                        {r.entityLabel ?? r.entityId ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.result === "success" ? "outline" : "destructive"} className="text-xs">
                          {r.result}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <nav className="flex items-center justify-between text-sm text-muted-foreground" aria-label="Audit pagination">
              <span>
                Page {data.page} of {data.pages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Newer</span>
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
                  <span className="sr-only sm:not-sr-only">Older</span>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </nav>
          </>
        )}
      </CardContent>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{selected.action}</SheetTitle>
                <SheetDescription>
                  Event #{selected.seq} · {formatTime(selected.occurredAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 pb-6">
                <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
                  {(
                    [
                      ["Actor", selected.actorEmail ?? selected.actorUserId ?? "system"],
                      ["Role", selected.actorRole],
                      ["Entity", [selected.entityType, selected.entityId].filter(Boolean).join(" / ")],
                      ["Label", selected.entityLabel],
                      ["Result", selected.failureReason ? `${selected.result} — ${selected.failureReason}` : selected.result],
                      ["Reason", selected.reason],
                      ["Source", selected.source],
                      ["IP", selected.ipAddress],
                      ["Event ID", selected.eventId],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="col-span-2 break-all font-mono text-xs leading-relaxed text-foreground">{v || "—"}</dd>
                    </div>
                  ))}
                  <dt className="text-muted-foreground">Request</dt>
                  <dd className="col-span-2">
                    <button
                      type="button"
                      className="break-all text-left font-mono text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => traceCorrelation(selected.correlationId)}
                    >
                      {selected.correlationId}
                    </button>
                  </dd>
                </dl>
                <JsonBlock label="Previous value" value={selected.previousValue} />
                <JsonBlock label="New value" value={selected.newValue} />
                <p className="break-all font-mono text-xs text-muted-foreground">hash {selected.hash}</p>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </Card>
  )
}
