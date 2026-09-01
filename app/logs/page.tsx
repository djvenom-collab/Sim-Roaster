"use client"

import { useState, useMemo } from "react"
import {
  AlertTriangle, BookOpen, Shield, ServerCrash, UserCog, Search, X,
  ChevronLeft, ChevronRight, Clock,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { PageHeader } from "@/components/shared"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FaultLog, OperatorLog, FirewallLog, AdminLog, AuditLog } from "@/lib/types"

const PAGE_SIZE = 20

// ── Shared helpers ────────────────────────────────────────────────────────────
function Timestamp({ ts }: { ts: string }) {
  return <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">{ts}</span>
}

function Pagination({
  page, total, pageSize, onChange,
}: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
      <span>{total} record{total !== 1 ? "s" : ""}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="size-7" onClick={() => onChange(page - 1)} disabled={page === 1}>
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="w-20 text-center">{page} / {pages}</span>
        <Button variant="outline" size="icon" className="size-7" onClick={() => onChange(page + 1)} disabled={page >= pages}>
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="pl-8 pr-8 text-sm"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <Clock className="mb-3 size-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ── Severity + status badges ──────────────────────────────────────────────────
const SEVERITY_VARIANT: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  major:    "bg-orange-500/15 text-orange-500 border-orange-500/30",
  minor:    "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  info:     "bg-blue-500/15 text-blue-500 border-blue-500/30",
}
const STATUS_VARIANT: Record<string, string> = {
  open:        "bg-destructive/15 text-destructive border-destructive/30",
  "in-progress":"bg-orange-500/15 text-orange-500 border-orange-500/30",
  resolved:    "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  closed:      "bg-muted text-muted-foreground border-border",
}
const ACTION_VARIANT: Record<string, string> = {
  allow:  "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  deny:   "bg-destructive/15 text-destructive border-destructive/30",
  drop:   "bg-orange-500/15 text-orange-500 border-orange-500/30",
  alert:  "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
}
function Chip({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

// ── 1. Fault Log ──────────────────────────────────────────────────────────────
function FaultLogTab({ logs }: { logs: FaultLog[] }) {
  const [search, setSearch] = useState("")
  const [severity, setSeverity] = useState("ALL")
  const [status, setStatus] = useState("ALL")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs.filter((r) =>
      (severity === "ALL" || r.severity === severity) &&
      (status   === "ALL" || r.status   === status)   &&
      (!q || r.system.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.reportedBy.toLowerCase().includes(q))
    )
  }, [logs, search, severity, status])

  const page_rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search system, description, reporter…" />
        <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All severities</SelectItem>
            {["critical","major","minor","info"].map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {["open","in-progress","resolved","closed"].map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {page_rows.length === 0 ? <EmptyState message="No fault log entries match the current filters." /> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">System</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Reported by</th>
              </tr>
            </thead>
            <tbody>
              {page_rows.map((r, i) => (
                <tr key={r.id} className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                  <td className="px-3 py-2"><Timestamp ts={r.timestamp} /></td>
                  <td className="px-3 py-2"><Chip label={r.severity} cls={SEVERITY_VARIANT[r.severity] ?? ""} /></td>
                  <td className="px-3 py-2"><Chip label={r.status} cls={STATUS_VARIANT[r.status] ?? ""} /></td>
                  <td className="px-3 py-2 font-medium">{r.system}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                  <td className="px-3 py-2">{r.reportedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}

// ── 2. Audit Log ──────────────────────────────────────────────────────────────
function AuditLogTab({ logs }: { logs: AuditLog[] }) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs.filter((r) => !q || r.user.toLowerCase().includes(q) || r.action.includes(q) || r.detail.toLowerCase().includes(q))
  }, [logs, search])

  const page_rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search user, action, detail…" />
      {page_rows.length === 0 ? <EmptyState message="No audit log entries match the current filters." /> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {page_rows.map((r, i) => (
                <tr key={r.id} className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                  <td className="px-3 py-2"><Timestamp ts={r.timestamp} /></td>
                  <td className="px-3 py-2 font-medium">{r.user}</td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</code>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}

// ── 3. Operator Log ───────────────────────────────────────────────────────────
function OperatorLogTab({ logs }: { logs: OperatorLog[] }) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("ALL")
  const [shift, setShift] = useState("ALL")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs.filter((r) =>
      (category === "ALL" || r.category === category) &&
      (shift    === "ALL" || r.shift    === shift)    &&
      (!q || r.operator.toLowerCase().includes(q) || r.entry.toLowerCase().includes(q))
    )
  }, [logs, search, category, shift])

  const page_rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const SHIFT_CLS: Record<string, string> = {
    morning:   "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    afternoon: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    night:     "bg-purple-500/15 text-purple-500 border-purple-500/30",
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search operator, entry…" />
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {["briefing","run","handover","incident","maintenance","note"].map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={shift} onValueChange={(v) => { setShift(v); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All shifts</SelectItem>
            {["morning","afternoon","night"].map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {page_rows.length === 0 ? <EmptyState message="No operator log entries match the current filters." /> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Shift</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Operator</th>
                <th className="px-3 py-2">Entry</th>
              </tr>
            </thead>
            <tbody>
              {page_rows.map((r, i) => (
                <tr key={r.id} className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                  <td className="px-3 py-2"><Timestamp ts={r.timestamp} /></td>
                  <td className="px-3 py-2"><Chip label={r.shift} cls={SHIFT_CLS[r.shift] ?? ""} /></td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs">{r.category}</Badge>
                  </td>
                  <td className="px-3 py-2 font-medium">{r.operator}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.entry}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}

// ── 4. Firewall / Security Log ────────────────────────────────────────────────
function FirewallLogTab({ logs }: { logs: FirewallLog[] }) {
  const [search, setSearch] = useState("")
  const [action, setAction] = useState("ALL")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs.filter((r) =>
      (action === "ALL" || r.action === action) &&
      (!q || r.sourceIp.includes(q) || r.destinationIp.includes(q) || r.rule.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
    )
  }, [logs, search, action])

  const page_rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search IP, rule, description…" />
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {["allow","deny","drop","alert"].map((a) => <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase()+a.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {page_rows.length === 0 ? <EmptyState message="No firewall log entries match the current filters." /> : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Source IP</th>
                <th className="px-3 py-2">Dest IP</th>
                <th className="px-3 py-2">Port</th>
                <th className="px-3 py-2">Proto</th>
                <th className="px-3 py-2">Rule</th>
                <th className="px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {page_rows.map((r, i) => (
                <tr key={r.id} className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                  <td className="px-3 py-2"><Timestamp ts={r.timestamp} /></td>
                  <td className="px-3 py-2"><Chip label={r.action} cls={ACTION_VARIANT[r.action] ?? ""} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{r.sourceIp}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.destinationIp}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.port}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.protocol}</td>
                  <td className="px-3 py-2"><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.rule}</code></td>
                  <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}

// ── 5. Administrator Log ──────────────────────────────────────────────────────
function AdminLogTab({ logs }: { logs: AdminLog[] }) {
  const [search, setSearch] = useState("")
  const [action, setAction] = useState("ALL")
  const [page, setPage] = useState(1)

  const allActions = useMemo(() => Array.from(new Set(logs.map((r) => r.action))).sort(), [logs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return logs.filter((r) =>
      (action === "ALL" || r.action === action) &&
      (!q || r.user.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q) || r.ipAddress.includes(q))
    )
  }, [logs, search, action])

  const page_rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Search user, detail, IP…" />
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {allActions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {page_rows.length === 0 ? <EmptyState message="No administrator log entries match the current filters." /> : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {page_rows.map((r, i) => (
                <tr key={r.id} className={`border-b last:border-0 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                  <td className="px-3 py-2"><Timestamp ts={r.timestamp} /></td>
                  <td className="px-3 py-2 font-medium">{r.user}</td>
                  <td className="px-3 py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{r.action}</code>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.detail}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
    </div>
  )
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, title, count, sub, color }: {
  icon: typeof AlertTriangle; title: string; count: number; sub: string; color: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className={`flex size-10 items-center justify-center rounded-lg ${color}`}>
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{count.toLocaleString()}</p>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LogsPage() {
  const { auditLogs, faultLogs, operatorLogs, firewallLogs, adminLogs } = useStore()

  const openFaults = faultLogs.filter((f) => f.status === "open" || f.status === "in-progress").length
  const criticalFaults = faultLogs.filter((f) => f.severity === "critical").length
  const securityAlerts = firewallLogs.filter((f) => f.action === "alert" || f.action === "deny").length

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="System Logs"
        description="Centralised view of all operational, security, fault and administrative log entries."
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard icon={AlertTriangle}  title="Fault Log"          count={faultLogs.length}     sub={`${openFaults} open · ${criticalFaults} critical`} color="bg-destructive/15 text-destructive" />
        <SummaryCard icon={BookOpen}       title="Audit Log"          count={auditLogs.length}     sub="All user actions"  color="bg-blue-500/15 text-blue-500" />
        <SummaryCard icon={ServerCrash}    title="Operator Log"       count={operatorLogs.length}  sub="Shift entries"     color="bg-yellow-500/15 text-yellow-600" />
        <SummaryCard icon={Shield}         title="Firewall Log"       count={firewallLogs.length}  sub={`${securityAlerts} alerts/denies`} color="bg-orange-500/15 text-orange-500" />
        <SummaryCard icon={UserCog}        title="Administrator Log"  count={adminLogs.length}     sub="Admin actions"     color="bg-purple-500/15 text-purple-500" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fault">
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="fault"    className="gap-1.5"><AlertTriangle className="size-3.5" />Fault Log</TabsTrigger>
          <TabsTrigger value="audit"    className="gap-1.5"><BookOpen      className="size-3.5" />Audit Log</TabsTrigger>
          <TabsTrigger value="operator" className="gap-1.5"><ServerCrash   className="size-3.5" />Operator Log</TabsTrigger>
          <TabsTrigger value="firewall" className="gap-1.5"><Shield        className="size-3.5" />Firewall &amp; Security</TabsTrigger>
          <TabsTrigger value="admin"    className="gap-1.5"><UserCog       className="size-3.5" />Administrator Log</TabsTrigger>
        </TabsList>

        <TabsContent value="fault" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
                Fault Log
              </CardTitle>
              <CardDescription>Hardware and software faults reported against simulator systems, with severity and resolution status.</CardDescription>
            </CardHeader>
            <CardContent><FaultLogTab logs={faultLogs} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4 text-blue-500" aria-hidden="true" />
                Audit Log
              </CardTitle>
              <CardDescription>A complete chronological trail of every user-initiated data change across the system.</CardDescription>
            </CardHeader>
            <CardContent><AuditLogTab logs={auditLogs} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operator" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ServerCrash className="size-4 text-yellow-600" aria-hidden="true" />
                Operator Log
              </CardTitle>
              <CardDescription>Shift-based entries written by operators covering briefings, run events, handovers, incidents and maintenance notes.</CardDescription>
            </CardHeader>
            <CardContent><OperatorLogTab logs={operatorLogs} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="firewall" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="size-4 text-orange-500" aria-hidden="true" />
                Firewall &amp; Security Device Log
              </CardTitle>
              <CardDescription>Network firewall and security appliance events — allowed, denied, dropped and alerted traffic at the perimeter.</CardDescription>
            </CardHeader>
            <CardContent><FirewallLogTab logs={firewallLogs} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCog className="size-4 text-purple-500" aria-hidden="true" />
                Administrator Log
              </CardTitle>
              <CardDescription>System administrator actions — logins, logouts, user management, role and permission changes, backups and restarts.</CardDescription>
            </CardHeader>
            <CardContent><AdminLogTab logs={adminLogs} /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
