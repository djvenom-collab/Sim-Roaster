/* ===========================================================================
 * ROOT LAYOUT — the shell that wraps every page
 * ===========================================================================
 * This runs once and surrounds all screens. It sets up, from outside in:
 *   - the page fonts (Geist) and the <html>/<body> tags,
 *   - ThemeProvider  (light/dark mode),
 *   - StoreProvider  (loads all app data — see lib/store.tsx),
 *   - the sidebar + top bar (navigation), and
 *   - PageAccessGuard (blocks pages the current role may not open).
 *
 * AUTH: the layout reads the Better Auth session on the server. When there is
 * no session (e.g. the /login page), it renders the page bare with no app
 * chrome. When signed in, it renders the full shell and hands the account's
 * role + identity to the store so permissions follow the logged-in user.
 *
 * CHANGEABLE PARAMETERS:
 *   - metadata.title / description: the browser tab text and SEO description.
 *   - defaultTheme ("system") on ThemeProvider: change to "light" or "dark".
 * =========================================================================== */
import type { Metadata } from "next"
import { Suspense } from "react"
import { headers } from "next/headers"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { auth } from "@/lib/auth"
import { StoreProvider } from "@/lib/store"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { PageAccessGuard } from "@/components/page-access-guard"
import { Toaster } from "@/components/ui/sonner"
import { ThemeProvider } from "@/components/theme-provider"
import type { RoleCode } from "@/lib/types"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "SIM Roster · Simulator Scheduling & Rostering",
  description:
    "Aviation simulator scheduling and rostering tool — manage staff, exercises, runs, seating, validity, leave, training and Power BI export.",
  generator: "v0.app",
}

const VALID_ROLES: RoleCode[] = ["SP", "SUP", "SOO", "STO", "TL", "Admin"]

function normalizeRole(value: unknown): RoleCode {
  return VALID_ROLES.includes(value as RoleCode) ? (value as RoleCode) : "SP"
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth.api.getSession({ headers: await headers() })
  const account = session?.user as
    | { name?: string; email?: string; appRole?: string }
    | undefined

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {account ? (
            <StoreProvider
              initialRole={normalizeRole(account.appRole)}
              authName={account.name}
              authEmail={account.email}
            >
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                  <TopBar />
                  <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                    <Suspense fallback={null}>
                      <PageAccessGuard>{children}</PageAccessGuard>
                    </Suspense>
                  </div>
                </SidebarInset>
              </SidebarProvider>
              <Toaster position="top-right" />
            </StoreProvider>
          ) : (
            // No session — render the page (e.g. /login) with no app chrome.
            children
          )}
        </ThemeProvider>
      </body>
    </html>
  )
}
