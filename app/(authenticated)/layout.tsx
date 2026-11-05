// Protected UI routes share a server-validated session boundary. The proxy
// checks cookie presence only; stale/invalid cookies must not reach a page
// without the StoreProvider it requires. API routes retain their own authz.
import { Suspense } from "react"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { StoreProvider } from "@/lib/store"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { PageAccessGuard } from "@/components/page-access-guard"
import { Toaster } from "@/components/ui/sonner"
import type { RoleCode } from "@/lib/types"

const VALID_ROLES: RoleCode[] = ["SP", "SUP", "SOO", "STO", "TL", "Admin"]

function normalizeRole(value: unknown): RoleCode {
  return VALID_ROLES.includes(value as RoleCode) ? (value as RoleCode) : "SP"
}

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/login")
  const account = session.user as { name?: string; email?: string; appRole?: string }

  const candidate = process.env.VERCEL_ENV === "preview" && process.env.VERCEL_GIT_COMMIT_REF === "storage/migration-candidate" && account.appRole === "Admin" && (await cookies()).get("migration_candidate")?.value === "1"

  return (
    <StoreProvider
      key={candidate ? "candidate" : "blob"}
      stateEndpoint={candidate ? "/api/admin/candidate-state" : "/api/state"}
      initialRole={normalizeRole(account.appRole)}
      authName={account.name}
      authEmail={account.email}
    >
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar />
          {candidate && <p role="status" className="border p-3 text-sm font-semibold">ISOLATED DATABASE COPY — rehearsal only. Operational roster is unchanged. Do not use backup/restore, messaging or file actions here.</p>}
          <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <Suspense fallback={null}>
              <PageAccessGuard>{children}</PageAccessGuard>
            </Suspense>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="top-right" />
    </StoreProvider>
  )
}
