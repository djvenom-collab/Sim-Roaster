"use client"

/* ===========================================================================
 * THEME TOGGLE — the light/dark mode button in the top bar
 * ===========================================================================
 * The sun/moon button that flips between light and dark themes. It waits until
 * after mount before showing an icon to avoid a hydration mismatch.
 * =========================================================================== */
import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch — only render the resolved icon after mount.
  React.useEffect(() => setMounted(true), [])

  // Treat as light until mounted so SSR and the first client render match.
  const isDark = mounted && resolvedTheme === "dark"
  const label = isDark ? "Switch to light mode" : "Switch to dark mode"

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={label}
      title={label}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
