"use client"

/* ===========================================================================
 * VALIDITY / CURRENCY PAGE ("/validity") — who is current on what
 * ===========================================================================
 * Shows each person's currency per position: valid, expiring soon, expired or
 * never sat. This is the early-warning screen for keeping people qualified.
 *
 * CHANGEABLE: the status thresholds (what counts as "expiring") and the maths
 * live in computeValidity() in lib/dates.ts — change the 14-day window there.
 * Each position's validityDays (how long currency lasts) is set in the DIM
 * positions list (lib/dim/sample.ts).
 * =========================================================================== */
import { Fragment, useMemo, useState } from "react"
import { useStore } from "@/lib/store"
import { PageHeader, StatusBadge } from "@/components/shared"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Search, CalendarCheck, Hourglass } from "lucide-react"
import { formatShort } from "@/lib/dates"
import { roleLevel } from "@/lib/permissions"
import type { ValidityStatus } from "@/lib/types"

export default function ValidityPage() {
  const store = useStore()
  const [search, setSearch] = useState("")
  const [posFilter, setPosFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  // "person" groups every row under its pilot; "days" keeps the flat list
  // sorted by soonest-to-expire.
  const [view, setView] = useState<"person" | "days">("person")

  // Viewing the whole team's currency is a SUP-and-above capability. Sim Pilots
  // (Level 1) only ever see their own validity.
  const canViewAll = roleLevel[store.currentRole] >= roleLevel.SUP
  const myStaffId = store.currentUser?.staffId

  // Scope rows to the active program: staff in-program AND position in-program.
  const scopedStaffIds = useMemo(() => new Set(store.scopedStaff.map((s) => s.id)), [store.scopedStaff])
  const scopedPositionIds = useMemo(
    () => new Set(store.scopedPositions.map((p) => p.id)),
    [store.scopedPositions],
  )

  const rows = useMemo(() => {
    return store.staffValidity
      .filter((sv) => scopedStaffIds.has(sv.staffId) && scopedPositionIds.has(sv.positionId))
      .filter((sv) => canViewAll || sv.staffId === myStaffId)
      .map((sv) => {
        const staff = store.staffById(sv.staffId)!
        const pos = store.positionById(sv.positionId)!
        const v = store.validityFor(sv.staffId, sv.positionId)
        return { staff, pos, v }
      })
      .filter((r) => r.staff && r.pos)
      .filter((r) =>
        `${r.staff.firstName} ${r.staff.lastName} ${r.staff.initials}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
      .filter((r) => posFilter === "all" || r.pos.id === posFilter)
      .filter((r) => statusFilter === "all" || r.v.status === statusFilter)
      .sort((a, b) => (a.v.daysRemaining ?? 9999) - (b.v.daysRemaining ?? 9999))
  }, [store, search, posFilter, statusFilter, scopedStaffIds, scopedPositionIds, canViewAll, myStaffId])

  // Group rows per pilot. Within each pilot, keep the soonest-to-expire first
  // (rows are already sorted by days remaining). Groups themselves are ordered
  // alphabetically by name so the list is easy to scan person-by-person.
  const groups = useMemo(() => {
    const byStaff = new Map<string, { staff: (typeof rows)[number]["staff"]; items: typeof rows }>()
    for (const r of rows) {
      const g = byStaff.get(r.staff.id)
      if (g) g.items.push(r)
      else byStaff.set(r.staff.id, { staff: r.staff, items: [r] })
    }
    return Array.from(byStaff.values()).sort((a, b) =>
      `${a.staff.firstName} ${a.staff.lastName}`.localeCompare(`${b.staff.firstName} ${b.staff.lastName}`),
    )
  }, [rows])

  const counts = useMemo(() => {
    const c: Record<ValidityStatus, number> = { valid: 0, expiring: 0, expired: 0, never: 0 }
    store.staffValidity
      .filter((sv) => scopedStaffIds.has(sv.staffId) && scopedPositionIds.has(sv.positionId))
      .filter((sv) => canViewAll || sv.staffId === myStaffId)
      .forEach((sv) => {
        c[store.validityFor(sv.staffId, sv.positionId).status]++
      })
    return c
  }, [store, scopedStaffIds, scopedPositionIds, canViewAll, myStaffId])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validity / Currency"
        description={
          canViewAll
            ? "Per-position currency based on last date sat. Default validity 60 days; auto-updates when a run completes."
            : "Your personal currency by position. Viewing the wider team's validity is available to Supervisors and above."
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Valid" value={counts.valid} status="valid" />
        <StatCard label="Expiring Soon" value={counts.expiring} status="expiring" />
        <StatCard label="Expired" value={counts.expired} status="expired" />
        <StatCard label="Never Sat" value={counts.never} status="never" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={posFilter} onValueChange={setPosFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Position">
              {(value) => {
                if (!value || value === "all") return "All positions"
                const p = store.scopedPositions.find((x) => x.id === value)
                return p ? `${p.code} — ${p.name}` : "All positions"
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All positions</SelectItem>
            {store.scopedPositions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.code} — {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status">
              {(value) => {
                const labels: Record<string, string> = {
                  all: "All statuses",
                  valid: "Valid",
                  expiring: "Expiring soon",
                  expired: "Expired",
                  never: "Never sat",
                }
                return labels[value as string] ?? "All statuses"
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="valid">Valid</SelectItem>
            <SelectItem value="expiring">Expiring soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="never">Never sat</SelectItem>
          </SelectContent>
        </Select>
        <Select value={view} onValueChange={(val) => setView(val as "person" | "days")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Group by">
              {(value) => (value === "days" ? "Sort by days left" : "Group by person")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="person">Group by person</SelectItem>
            <SelectItem value="days">Sort by days left</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Desktop: compact table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Last Sat</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Days Left</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view === "days"
                  ? rows.map(({ staff, pos, v }) => (
                      <TableRow key={`${staff.id}-${pos.id}`}>
                        <TableCell className="font-medium">
                          {staff.firstName} {staff.lastName}{" "}
                          <span className="text-muted-foreground">({staff.initials})</span>
                        </TableCell>
                        <ValidityCells pos={pos} v={v} />
                      </TableRow>
                    ))
                  : groups.map((g) => (
                      <Fragment key={g.staff.id}>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={7} className="py-2 font-semibold">
                            {g.staff.firstName} {g.staff.lastName}{" "}
                            <span className="text-muted-foreground">({g.staff.initials})</span>
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {g.items.length} position{g.items.length === 1 ? "" : "s"}
                            </span>
                          </TableCell>
                        </TableRow>
                        {g.items.map(({ staff, pos, v }) => (
                          <TableRow key={`${staff.id}-${pos.id}`}>
                            <TableCell className="text-muted-foreground">—</TableCell>
                            <ValidityCells pos={pos} v={v} />
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards — no sideways scroll */}
          {view === "days" ? (
            <ul className="divide-y md:hidden">
              {rows.map(({ staff, pos, v }) => (
                <li key={`${staff.id}-${pos.id}`} className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {staff.firstName} {staff.lastName}{" "}
                      <span className="text-muted-foreground">({staff.initials})</span>
                    </span>
                    <StatusBadge status={v.status} />
                  </div>
                  <MobileValidityMeta pos={pos} v={v} showCode />
                </li>
              ))}
            </ul>
          ) : (
            <div className="divide-y md:hidden">
              {groups.map((g) => (
                <section key={g.staff.id}>
                  <div className="flex items-center justify-between gap-2 bg-muted/50 px-3 py-2">
                    <span className="truncate font-semibold">
                      {g.staff.firstName} {g.staff.lastName}{" "}
                      <span className="text-muted-foreground">({g.staff.initials})</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {g.items.length} position{g.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="divide-y">
                    {g.items.map(({ staff, pos, v }) => (
                      <li key={`${staff.id}-${pos.id}`} className="space-y-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="font-mono">
                            {pos.code}
                          </Badge>
                          <StatusBadge status={v.status} />
                        </div>
                        <MobileValidityMeta pos={pos} v={v} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

type Position = ReturnType<ReturnType<typeof useStore>["positionById"]>
type Validity = ReturnType<ReturnType<typeof useStore>["validityFor"]>

// Shared desktop table cells (position → status) reused by both views.
function ValidityCells({ pos, v }: { pos: NonNullable<Position>; v: Validity }) {
  return (
    <>
      <TableCell>
        <Badge variant="outline" className="font-mono">
          {pos.code}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {v.lastDateSat ? formatShort(v.lastDateSat) : "—"}
      </TableCell>
      <TableCell className="tabular-nums">{pos.validityDays}d</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {v.expiry ? formatShort(v.expiry) : "—"}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${
          v.daysRemaining != null && v.daysRemaining < 0
            ? "text-red-600"
            : v.daysRemaining != null && v.daysRemaining <= 14
              ? "text-amber-600"
              : ""
        }`}
      >
        {v.daysRemaining ?? "—"}
      </TableCell>
      <TableCell>
        <StatusBadge status={v.status} />
      </TableCell>
    </>
  )
}

// Shared mobile meta row (dates + days left). `showCode` adds the position
// badge inline for the flat (days) view where there is no group header.
function MobileValidityMeta({
  pos,
  v,
  showCode,
}: {
  pos: NonNullable<Position>
  v: Validity
  showCode?: boolean
}) {
  const overdue = v.daysRemaining != null && v.daysRemaining < 0
  const soon = v.daysRemaining != null && v.daysRemaining <= 14
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {showCode && (
          <Badge variant="outline" className="font-mono">
            {pos.code}
          </Badge>
        )}
        <span className="inline-flex items-center gap-1 tabular-nums">
          <CalendarCheck className="size-3.5" />
          {v.lastDateSat ? formatShort(v.lastDateSat) : "—"}
          <span className="px-0.5">&rarr;</span>
          {v.expiry ? formatShort(v.expiry) : "—"}
        </span>
        <span className="tabular-nums">{pos.validityDays}d valid</span>
      </div>
      <div
        className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
          overdue ? "text-red-600" : soon ? "text-amber-600" : "text-muted-foreground"
        }`}
      >
        <Hourglass className="size-3.5" />
        {v.daysRemaining != null ? `${v.daysRemaining}d left` : "Never sat"}
      </div>
    </>
  )
}

function StatCard({ label, value, status }: { label: string; value: number; status: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
