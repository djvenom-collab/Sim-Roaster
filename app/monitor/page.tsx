"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import useSWR from "swr"
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Database,
  History,
  CalendarDays,
  ChevronDown,
} from "lucide-react"
import { PageHeader } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { cn } from "@/lib/utils"
import type { MetricSnapshot, MonitorPayload } from "@/app/api/monitor/route"

// ── Constants ─────────────────────────────────────────────────────────────────
const HISTORY_SIZE   = 60     // rolling live window size
const POLL_INTERVAL  = 3_000  // ms

const THRESHOLDS = {
  cpu:       { warn: 60, crit: 85 },
  memory:    { warn: 70, crit: 90 },
  disk:      { warn: 75, crit: 90 },
  bandwidth: { warn: 60, crit: 90 },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fetcher = (url: string) => fetch(url).then((r) => r.json())

function formatBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

type Level = "normal" | "warn" | "critical"

function getLevel(value: number, thresholds: { warn: number; crit: number }): Level {
  if (value >= thresholds.crit) return "critical"
  if (value >= thresholds.warn) return "warn"
  return "normal"
}

const levelColors: Record<Level, { text: string; bg: string; stroke: string; fill: string; badge: string }> = {
  normal:   { text: "text-emerald-400", bg: "bg-emerald-500/10", stroke: "#34d399", fill: "rgba(52,211,153,0.15)",  badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  warn:     { text: "text-amber-400",   bg: "bg-amber-500/10",   stroke: "#fbbf24", fill: "rgba(251,191,36,0.15)",  badge: "bg-amber-500/20 text-amber-400 border-amber-500/30"   },
  critical: { text: "text-red-400",     bg: "bg-red-500/10",     stroke: "#f87171", fill: "rgba(248,113,113,0.15)", badge: "bg-red-500/20 text-red-400 border-red-500/30"         },
}

function LevelIcon({ level, className }: { level: Level; className?: string }) {
  if (level === "critical") return <XCircle className={cn("size-4", className)} />
  if (level === "warn")     return <AlertTriangle className={cn("size-4", className)} />
  return <CheckCircle2 className={cn("size-4", className)} />
}

// ── Gauge bar ─────────────────────────────────────────────────────────────────
function GaugeBar({ value, thresholds }: { value: number; thresholds: { warn: number; crit: number } }) {
  const level  = getLevel(value, thresholds)
  const colors = levelColors[level]
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.min(100, value)}%`,
          background: colors.stroke,
          boxShadow: level !== "normal" ? `0 0 6px ${colors.stroke}` : undefined,
        }}
      />
    </div>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({
  data, dataKey, thresholds, unit = "%", domain = [0, 100],
}: {
  data: Array<Record<string, number | string>>
  dataKey: string
  thresholds: { warn: number; crit: number }
  unit?: string
  domain?: [number, number]
}) {
  const latestVal = typeof data.at(-1)?.[dataKey] === "number" ? (data.at(-1)![dataKey] as number) : 0
  const level  = getLevel(latestVal, thresholds)
  const colors = levelColors[level]

  return (
    <ResponsiveContainer width="100%" height={96}>
      <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={colors.stroke} stopOpacity={0.3} />
            <stop offset="95%" stopColor={colors.stroke} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="t" hide />
        <YAxis domain={domain} hide />
        <Tooltip
          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
          formatter={(v: unknown) => [`${v}${unit}`, undefined]}
          labelFormatter={() => ""}
        />
        <ReferenceLine y={thresholds.warn} stroke="#fbbf24" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.6} />
        <ReferenceLine y={thresholds.crit} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} strokeOpacity={0.6} />
        <Area type="monotoneX" dataKey={dataKey} stroke={colors.stroke} strokeWidth={1.5}
          fill={`url(#fill-${dataKey})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
  icon: Icon, title, value, unit, subtitle, thresholds,
  history, historyKey, historyUnit, historyDomain, extra,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string; value: number; unit: string; subtitle: string
  thresholds: { warn: number; crit: number }
  history: Array<Record<string, number | string>>
  historyKey: string; historyUnit?: string; historyDomain?: [number, number]
  extra?: React.ReactNode
}) {
  const level  = getLevel(value, thresholds)
  const colors = levelColors[level]

  return (
    <Card className="flex flex-col gap-0 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn("flex size-8 items-center justify-center rounded-md", colors.bg)}>
              <Icon className={cn("size-4", colors.text)} />
            </div>
            <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          </div>
          <Badge variant="outline" className={cn("gap-1 text-xs", colors.badge)}>
            <LevelIcon level={level} className={colors.text} />
            {level === "normal" ? "Normal" : level === "warn" ? "Warning" : "Critical"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div>
          <div className="flex items-baseline gap-1">
            <span className={cn("text-4xl font-bold tabular-nums tracking-tight", colors.text)}>
              {value.toFixed(1)}
            </span>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          {extra && <div className="mt-1">{extra}</div>}
          <GaugeBar value={value} thresholds={thresholds} />
          <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
            <span>0</span>
            <span className="text-amber-400/70">Warn {thresholds.warn}</span>
            <span className="text-red-400/70">Crit {thresholds.crit}</span>
            <span>100</span>
          </div>
        </div>
        <Sparkline data={history} dataKey={historyKey}
          thresholds={thresholds} unit={historyUnit ?? unit} domain={historyDomain} />
      </CardContent>
    </Card>
  )
}

// ── Readings table row ────────────────────────────────────────────────────────
function SnapRow({ snap, index, showDate = false }: { snap: MetricSnapshot; index: number; showDate?: boolean }) {
  const cpuLvl = getLevel(snap.cpu,       THRESHOLDS.cpu)
  const memLvl = getLevel(snap.memory,    THRESHOLDS.memory)
  const dskLvl = getLevel(snap.disk,      THRESHOLDS.disk)
  const bwLvl  = getLevel(snap.bandwidth, THRESHOLDS.bandwidth)
  const anyAlert = [cpuLvl, memLvl, dskLvl, bwLvl].some((l) => l !== "normal")

  return (
    <tr className={cn("border-b border-border/50 text-xs transition-colors hover:bg-muted/40", index === 0 && "bg-muted/20")}>
      <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
        {showDate ? formatDateTime(snap.timestamp) : formatTime(snap.timestamp)}
      </td>
      <td className={cn("px-3 py-2 text-right tabular-nums", levelColors[cpuLvl].text)}>{snap.cpu.toFixed(1)}%</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", levelColors[memLvl].text)}>{snap.memory.toFixed(1)}%</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-[10px]">{snap.memoryUsedMB.toLocaleString()} MB</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", levelColors[dskLvl].text)}>{snap.disk.toFixed(1)}%</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground text-[10px]">{snap.diskUsedGB.toFixed(1)} GB</td>
      <td className={cn("px-3 py-2 text-right tabular-nums", levelColors[bwLvl].text)}>{snap.bandwidth.toFixed(1)} Mbps</td>
      <td className="px-3 py-2 text-center">
        {anyAlert && <span className="inline-flex size-2 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />}
      </td>
    </tr>
  )
}

function SnapTable({ rows, showDate = false }: { rows: MetricSnapshot[]; showDate?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b bg-muted/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <th className="px-3 py-2">Time</th>
            <th className="px-3 py-2 text-right">CPU %</th>
            <th className="px-3 py-2 text-right">Mem %</th>
            <th className="px-3 py-2 text-right">Mem Used</th>
            <th className="px-3 py-2 text-right">Disk %</th>
            <th className="px-3 py-2 text-right">Disk Used</th>
            <th className="px-3 py-2 text-right">BW Mbps</th>
            <th className="px-3 py-2 text-center">Alert</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((snap, i) => (
            <SnapRow key={snap.timestamp} snap={snap} index={i} showDate={showDate} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">
                No data available
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Archive lookback panel ────────────────────────────────────────────────────
interface ArchiveFile { date: string; size: number; url: string; uploadedAt: string }

function ArchivePanel() {
  const { data: listData, isLoading: listLoading } =
    useSWR<{ files: ArchiveFile[] }>("/api/monitor/history", fetcher, { revalidateOnFocus: false })

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [archiveRows, setArchiveRows]   = useState<MetricSnapshot[]>([])
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const files = listData?.files ?? []

  // Auto-select the most recent date when the list loads
  useEffect(() => {
    if (files.length > 0 && !selectedDate) setSelectedDate(files[0].date)
  }, [files, selectedDate])

  // Load archive data when date changes
  useEffect(() => {
    if (!selectedDate) return
    setArchiveLoading(true)
    setArchiveError(null)
    fetch(`/api/monitor/history?date=${selectedDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setArchiveRows((d.snapshots as MetricSnapshot[]).reverse())
      })
      .catch((e) => setArchiveError(e.message))
      .finally(() => setArchiveLoading(false))
  }, [selectedDate])

  // Chart data for the archive day
  const archiveChartData = useMemo(() =>
    [...archiveRows].reverse().map((s) => ({
      t:    formatDateTime(s.timestamp),
      cpu:  s.cpu, memory: s.memory, disk: s.disk,
      bandwidth: s.bandwidth,
      bwIn: s.bandwidthInMbps, bwOut: s.bandwidthOutMbps,
    })), [archiveRows])

  const archiveAlerts = useMemo(() =>
    archiveRows.filter((s) =>
      getLevel(s.cpu,       THRESHOLDS.cpu)       !== "normal" ||
      getLevel(s.memory,    THRESHOLDS.memory)    !== "normal" ||
      getLevel(s.disk,      THRESHOLDS.disk)      !== "normal" ||
      getLevel(s.bandwidth, THRESHOLDS.bandwidth) !== "normal"
    ), [archiveRows])

  if (listLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
        <RefreshCw className="size-4 animate-spin" /> Loading archive index&hellip;
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <History className="size-8 opacity-40" />
        <p className="font-medium">No archive data yet</p>
        <p className="text-xs max-w-sm">
          The monitor collects samples in the background and archives them every ~60 seconds.
          Check back after the system has been running for a while.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Date selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          <span>Select archive date:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <button
              key={f.date}
              onClick={() => setSelectedDate(f.date)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-mono transition-colors",
                selectedDate === f.date
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {f.date}
              <span className="ml-1.5 text-[10px] opacity-60">({formatBytes(f.size)})</span>
            </button>
          ))}
        </div>
      </div>

      {archiveLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" /> Loading {selectedDate}&hellip;
        </div>
      )}

      {archiveError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {archiveError}
        </div>
      )}

      {!archiveLoading && !archiveError && archiveRows.length > 0 && (
        <>
          {/* Summary strip */}
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Samples</span>
              <span className="font-semibold tabular-nums">{archiveRows.length.toLocaleString()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Alerts</span>
              <span className={cn("font-semibold tabular-nums", archiveAlerts.length > 0 ? "text-amber-400" : "text-emerald-400")}>
                {archiveAlerts.length}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Time range</span>
              <span className="font-mono text-xs">
                {formatTime(archiveRows.at(-1)!.timestamp)} &rarr; {formatTime(archiveRows[0].timestamp)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Peak CPU</span>
              <span className={cn("font-semibold tabular-nums", levelColors[getLevel(Math.max(...archiveRows.map((s) => s.cpu)), THRESHOLDS.cpu)].text)}>
                {Math.max(...archiveRows.map((s) => s.cpu)).toFixed(1)}%
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Peak Memory</span>
              <span className={cn("font-semibold tabular-nums", levelColors[getLevel(Math.max(...archiveRows.map((s) => s.memory)), THRESHOLDS.memory)].text)}>
                {Math.max(...archiveRows.map((s) => s.memory)).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* History charts */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { key: "cpu",       label: "CPU %",          t: THRESHOLDS.cpu,       unit: "%" },
              { key: "memory",    label: "Memory %",       t: THRESHOLDS.memory,    unit: "%" },
              { key: "disk",      label: "Disk %",         t: THRESHOLDS.disk,      unit: "%" },
              { key: "bandwidth", label: "Bandwidth Mbps", t: THRESHOLDS.bandwidth, unit: " Mbps", domain: [0, 100] as [number, number] },
            ].map(({ key, label, t, unit, domain }) => (
              <Card key={key}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <Sparkline data={archiveChartData} dataKey={key} thresholds={t} unit={unit} domain={domain} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Readings table */}
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ChevronDown className="size-3" />
              Showing {Math.min(archiveRows.length, 200)} of {archiveRows.length} readings (newest first)
            </div>
            <SnapTable rows={archiveRows.slice(0, 200)} showDate />
          </div>
        </>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MonitorPage() {
  const { data: payload, isLoading, mutate } = useSWR<MonitorPayload>(
    "/api/monitor",
    fetcher,
    {
      refreshInterval: POLL_INTERVAL,
      revalidateOnFocus: false,
      dedupingInterval: POLL_INTERVAL - 500,
    },
  )

  // Rolling live history — seeded from the server ring buffer on first load
  const historyRef  = useRef<MetricSnapshot[]>([])
  const seededRef   = useRef(false)
  const [history, setHistory] = useState<MetricSnapshot[]>([])

  useEffect(() => {
    if (!payload) return

    // On the very first successful response, pre-fill with the server's ring
    // buffer so the page shows the last 60 samples immediately instead of
    // starting empty.
    if (!seededRef.current && payload.buffer.length > 0) {
      seededRef.current = true
      historyRef.current = payload.buffer.slice(-HISTORY_SIZE)
      setHistory(historyRef.current)
      return
    }

    const prev = historyRef.current
    const snap = payload.latest

    // Deduplicate: same 3-second bucket already recorded
    if (prev.length > 0 && prev[prev.length - 1].timestamp === snap.timestamp) return

    const next = [...prev, snap].slice(-HISTORY_SIZE)
    historyRef.current = next
    setHistory(next)
  }, [payload])

  const handleRefresh = useCallback(() => mutate(), [mutate])

  const chartData = useMemo(() => history.map((s) => ({
    t:         formatTime(s.timestamp),
    cpu:       s.cpu,
    memory:    s.memory,
    disk:      s.disk,
    bandwidth: s.bandwidth,
    bwIn:      s.bandwidthInMbps,
    bwOut:     s.bandwidthOutMbps,
  })), [history])

  const tableRows = useMemo(() => history.slice(-20).reverse(), [history])

  const snap = payload?.latest ?? {
    cpu: 0, memory: 0, memoryUsedMB: 0, memoryTotalMB: 32768,
    disk: 0, diskUsedGB: 0, diskTotalGB: 500,
    bandwidth: 0, bandwidthInMbps: 0, bandwidthOutMbps: 0,
    blobFiles: 0, blobStorageBytes: 0, timestamp: new Date().toISOString(),
  }

  const overallLevel: Level = (() => {
    const levels = [
      getLevel(snap.cpu,       THRESHOLDS.cpu),
      getLevel(snap.memory,    THRESHOLDS.memory),
      getLevel(snap.disk,      THRESHOLDS.disk),
      getLevel(snap.bandwidth, THRESHOLDS.bandwidth),
    ]
    if (levels.includes("critical")) return "critical"
    if (levels.includes("warn"))     return "warn"
    return "normal"
  })()

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="System Monitor"
        description="Live resource utilisation — refreshes every 3 seconds. Background collection runs continuously; archive updated every ~60 s."
        actions={
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={cn("gap-1.5 px-3 py-1 text-sm font-medium", levelColors[overallLevel].badge)}
            >
              <LevelIcon level={overallLevel} className={levelColors[overallLevel].text} />
              {overallLevel === "normal" ? "All systems normal" : overallLevel === "warn" ? "Warning" : "Critical alert"}
            </Badge>
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={isLoading} className="gap-1.5">
              <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Live indicator strip */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        Live &mdash; last updated {payload ? formatTime(payload.latest.timestamp) : "—"}
        <span className="ml-1 text-muted-foreground/50">|</span>
        <span className="flex items-center gap-1">
          <History className="size-3" />
          {history.length} / {HISTORY_SIZE} samples loaded
        </span>
        <span className="ml-1 text-muted-foreground/50">|</span>
        <span className="flex items-center gap-1">
          <Database className="size-3" />
          {snap.blobFiles} blob files &nbsp;/&nbsp; {formatBytes(snap.blobStorageBytes)} stored
        </span>
      </div>

      <Tabs defaultValue="live" className="flex flex-col gap-6">
        <TabsList className="w-fit">
          <TabsTrigger value="live" className="gap-1.5">
            <Activity className="size-3.5" />
            Live Monitor
          </TabsTrigger>
          <TabsTrigger value="archive" className="gap-1.5">
            <History className="size-3.5" />
            Archive Lookback
          </TabsTrigger>
        </TabsList>

        {/* ── Live tab ──────────────────────────────────────────────────────── */}
        <TabsContent value="live" className="flex flex-col gap-6 mt-0">

          {/* 4 metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Cpu} title="CPU Utilisation"
              value={snap.cpu} unit="%" subtitle="Processor load across all cores"
              thresholds={THRESHOLDS.cpu} history={chartData} historyKey="cpu" />

            <MetricCard icon={MemoryStick} title="Memory Utilisation"
              value={snap.memory} unit="%"
              subtitle={`${snap.memoryUsedMB.toLocaleString()} MB / ${snap.memoryTotalMB.toLocaleString()} MB`}
              thresholds={THRESHOLDS.memory} history={chartData} historyKey="memory" />

            <MetricCard icon={HardDrive} title="Disk Utilisation"
              value={snap.disk} unit="%"
              subtitle={`${snap.diskUsedGB.toFixed(1)} GB / ${snap.diskTotalGB} GB used`}
              thresholds={THRESHOLDS.disk} history={chartData} historyKey="disk" />

            <MetricCard icon={Wifi} title="Bandwidth Utilisation"
              value={snap.bandwidth} unit=" Mbps" subtitle="Total in + out throughput"
              thresholds={THRESHOLDS.bandwidth} history={chartData} historyKey="bandwidth"
              historyUnit=" Mbps" historyDomain={[0, 100]}
              extra={
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <ArrowDown className="size-2.5 text-sky-400" />
                    {snap.bandwidthInMbps.toFixed(1)} Mbps in
                  </span>
                  <span className="flex items-center gap-0.5">
                    <ArrowUp className="size-2.5 text-violet-400" />
                    {snap.bandwidthOutMbps.toFixed(1)} Mbps out
                  </span>
                </div>
              }
            />
          </div>

          {/* In / Out breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium">Bandwidth In / Out Breakdown</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="fill-bwIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="fill-bwOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="t" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} minTickGap={40} interval="preserveStartEnd" />
                  <YAxis tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={36} unit=" M" />
                  <Tooltip
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                    formatter={(v: unknown, name: unknown) => [`${Number(v).toFixed(1)} Mbps`, name === "bwIn" ? "Inbound" : "Outbound"]}
                    labelFormatter={() => ""}
                  />
                  <Area type="monotoneX" dataKey="bwIn"  stroke="#38bdf8" strokeWidth={1.5} fill="url(#fill-bwIn)"  dot={false} isAnimationActive={false} />
                  <Area type="monotoneX" dataKey="bwOut" stroke="#a78bfa" strokeWidth={1.5} fill="url(#fill-bwOut)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-sky-400" /> Inbound</span>
                <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-violet-400" /> Outbound</span>
              </div>
            </CardContent>
          </Card>

          {/* Recent readings table */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium">
                  Recent Readings
                  <span className="ml-2 font-normal text-muted-foreground">
                    ({history.length} / {HISTORY_SIZE} samples)
                  </span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <SnapTable rows={tableRows} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Archive tab ───────────────────────────────────────────────────── */}
        <TabsContent value="archive" className="mt-0">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <History className="size-4 text-primary" />
                <CardTitle className="text-sm font-medium">Archive Lookback</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Historical metric archives stored to Blob. Each daily file contains all samples
                collected by the background monitor that day.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <ArchivePanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
