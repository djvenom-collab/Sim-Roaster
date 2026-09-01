"use client"

/* ===========================================================================
 * PAGE ACCESS GUARD — blocks pages the current role can't see
 * ===========================================================================
 * Wraps every page. It looks up the permission required for the current URL
 * (via permissionForRoute in lib/permissions.ts) and, if the active role lacks
 * it, shows an "Access restricted" message instead of the page — even if the
 * user typed the URL directly. The sidebar/top bar stay visible so you can
 * switch role to preview. Change who can see what in lib/permissions.ts.
 * =========================================================================== */
import { usePathname } from "next/navigation"
import { ShieldAlert } from "lucide-react"
import { useStore } from "@/lib/store"
import { can, permissionForRoute, PERMISSION_LABELS } from "@/lib/permissions"
import { EmptyState } from "@/components/shared"

/**
 * Central route-level access control. Resolves the page-access permission for
 * the current pathname and blocks entry (even via direct URL) when the active
 * role lacks it. The sidebar and top bar remain visible so the user can switch
 * role to preview, mirroring the rest of the app's permission UX.
 */
export function PageAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { currentRole } = useStore()
  const perm = permissionForRoute(pathname ?? "/")

  if (perm && !can(currentRole, perm)) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Access restricted"
          description={`Your role (${currentRole}) does not have access to ${PERMISSION_LABELS[perm]}. Switch role in the top bar to preview, or ask an administrator to grant access in Admin / Permissions.`}
        />
      </div>
    )
  }

  return <>{children}</>
}
