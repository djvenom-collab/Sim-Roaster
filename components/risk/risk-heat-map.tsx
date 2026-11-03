"use client"

import { cn } from "@/lib/utils"
import { band, IMPACT_LABELS, LIKELIHOOD_LABELS, score, type Risk } from "@/lib/risk/model"
import { BAND_CLASS } from "./risk-ui"

export type Cell = { likelihood: number; impact: number } | null

export function RiskHeatMap({
  risks,
  mode,
  selected,
  onSelect,
}: {
  risks: Risk[]
  mode: "inherent" | "residual"
  selected: Cell
  onSelect: (cell: Cell) => void
}) {
  const counts = new Map<string, number>()
  for (const r of risks) {
    const key = mode === "inherent" ? `${r.likelihood}:${r.impact}` : `${r.residualLikelihood}:${r.residualImpact}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (
    <div className="flex gap-2">
      <div className="flex items-center">
        <span className="text-xs font-medium text-muted-foreground [writing-mode:vertical-rl] rotate-180">Likelihood</span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div role="grid" aria-label={`${mode} risk heat map`} className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1">
          {[5, 4, 3, 2, 1].map((l) => (
            <div role="row" key={l} className="contents">
              <div className="flex items-center justify-end pr-1 text-right text-xs text-muted-foreground">
                <span className="hidden sm:inline">{LIKELIHOOD_LABELS[l - 1]}</span>
                <span className="font-mono sm:ml-1">{l}</span>
              </div>
              {[1, 2, 3, 4, 5].map((i) => {
                const n = counts.get(`${l}:${i}`) ?? 0
                const active = selected?.likelihood === l && selected?.impact === i
                return (
                  <button
                    key={i}
                    role="gridcell"
                    type="button"
                    disabled={n === 0}
                    aria-pressed={active}
                    aria-label={`Likelihood ${l}, impact ${i}, score ${score(l, i)}: ${n} risk${n === 1 ? "" : "s"}`}
                    onClick={() => onSelect(active ? null : { likelihood: l, impact: i })}
                    className={cn(
                      "flex aspect-[2/1] items-center justify-center rounded font-mono text-sm tabular-nums transition-[box-shadow,opacity]",
                      BAND_CLASS[band(score(l, i))],
                      n === 0 ? "opacity-40" : "cursor-pointer hover:ring-2 hover:ring-ring",
                      active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    {n > 0 ? n : ""}
                  </button>
                )
              })}
            </div>
          ))}
          <div />
          {IMPACT_LABELS.map((label, idx) => (
            <div key={label} className="text-center text-xs text-muted-foreground">
              <span className="font-mono">{idx + 1}</span> <span className="hidden md:inline">{label}</span>
            </div>
          ))}
        </div>
        <span className="text-center text-xs font-medium text-muted-foreground">Impact</span>
      </div>
    </div>
  )
}
