"use client"

/* ===========================================================================
 * useDeepLinkHighlight — open & focus a specific item from a URL query param
 * ===========================================================================
 * Lets one page link straight to a single item on another page (e.g. the
 * dashboard linking to a specific exercise / training session / run). On mount
 * it reads `?<param>=<id>` from the URL, lets the page resolve any view state
 * needed to make that item visible (selecting a tab, switching the date, …),
 * then scrolls the element `id="<prefix>-<id>"` into view and returns the id so
 * the page can apply a temporary highlight ring.
 * =========================================================================== */
import { useEffect, useState } from "react"

export function useDeepLinkHighlight(
  param: string,
  prefix: string,
  resolve?: (id: string) => void,
): string | null {
  const [highlightId, setHighlightId] = useState<string | null>(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(param)
    if (!id) return

    // Let the page set whatever view state is needed for the item to render.
    resolve?.(id)
    setHighlightId(id)

    // Scroll into view after the resolve-driven re-render has painted.
    const scrollTimer = setTimeout(() => {
      document.getElementById(`${prefix}-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }, 200)

    // Fade the highlight out so it reads as a one-time "here it is" cue.
    const clearTimer = setTimeout(() => setHighlightId(null), 3000)

    return () => {
      clearTimeout(scrollTimer)
      clearTimeout(clearTimer)
    }
    // Intentionally run once on mount; deep links are read from the entry URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return highlightId
}

/** Tailwind classes for the temporary "just navigated here" highlight ring. */
export const HIGHLIGHT_RING = "ring-2 ring-primary ring-offset-2 ring-offset-background"
