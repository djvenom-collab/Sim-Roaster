"use client"

/* ===========================================================================
 * THEME PROVIDER — enables light/dark mode app-wide
 * ===========================================================================
 * A thin wrapper around next-themes that sits near the root of the app so any
 * component can read or change the current theme. You normally won't touch this;
 * the user-facing switch is the ThemeToggle in the top bar.
 * =========================================================================== */
import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
