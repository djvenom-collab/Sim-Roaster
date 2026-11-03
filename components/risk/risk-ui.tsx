"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import { band, BAND_LABEL, IMPACT_LABELS, LIKELIHOOD_LABELS, type Band } from "@/lib/risk/model"

export const BAND_CLASS: Record<Band, string> = {
  low: "bg-muted text-foreground",
  medium: "bg-destructive/20 text-foreground",
  high: "bg-destructive/50 text-foreground",
  critical: "bg-destructive text-primary-foreground",
}

export function ScoreChip({ value, className }: { value: number; className?: string }) {
  const b = band(value)
  return (
    <span
      className={cn("inline-flex min-w-16 items-center justify-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums", BAND_CLASS[b], className)}
      title={`${BAND_LABEL[b]} (${value})`}
    >
      {value}
      <span className="font-sans">{BAND_LABEL[b]}</span>
    </span>
  )
}

export function NativeSelect({
  className,
  options,
  ...props
}: Omit<React.ComponentProps<"select">, "children"> & { options: readonly { value: string; label: string }[] }) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export const LIKELIHOOD_OPTIONS = LIKELIHOOD_LABELS.map((l, i) => ({ value: String(i + 1), label: `${i + 1} · ${l}` }))
export const IMPACT_OPTIONS = IMPACT_LABELS.map((l, i) => ({ value: String(i + 1), label: `${i + 1} · ${l}` }))

export const toOptions = (values: readonly string[], labels?: Record<string, string>) =>
  values.map((v) => ({ value: v, label: labels?.[v] ?? v.replaceAll("_", " ") }))

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  treating: "Treatment in progress",
  mitigated: "Mitigated",
  accepted: "Accepted",
  closed: "Closed",
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export async function riskRequest<T = unknown>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `http_${res.status}`)
  return json as T
}

export const riskFetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(res.status === 403 ? "forbidden" : `http_${res.status}`)
  return res.json()
}

export const ERROR_TEXT: Record<string, string> = {
  version_conflict: "Someone else changed this risk. It has been reloaded; reapply your change.",
  risk_closed: "Closed risks are read-only.",
  audit_unavailable: "The audit trail is unavailable, so the change was not saved.",
  invalid_input: "Some fields are invalid.",
}
