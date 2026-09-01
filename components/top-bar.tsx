"use client"

/* ===========================================================================
 * TOP BAR — the header strip across the top of every page
 * ===========================================================================
 * Holds the sidebar toggle, the RADAR/TOWER/All program switch (which filters
 * what the whole app shows), the notifications bell, the dark-mode toggle, the
 * "Acting as <role>" picker for previewing permissions, and the current user.
 *
 * CHANGEABLE: the role display names live in roleLabels/roleShort below; the
 * program options come from lib/program.ts.
 * =========================================================================== */
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { UserNotificationsBell } from "@/components/user-notifications-bell"
import { SignOutButton } from "@/components/sign-out-button"
import { YearRangeSlicer } from "@/components/year-range-slicer"
import { useStore } from "@/lib/store"
import { roleLevel } from "@/lib/permissions"
import type { RoleCode } from "@/lib/types"
import { PROGRAM_VIEWS, programDisplay, type ProgramView } from "@/lib/program"
import { cn, initialsFromName } from "@/lib/utils"
import { Layers, Radar, TowerControl, type LucideIcon } from "lucide-react"

const programLabel = (p: ProgramView) => (p === "ALL" ? "All" : programDisplay(p))

const programIcon: Record<ProgramView, LucideIcon> = {
  ALL: Layers,
  RADAR: Radar,
  TOWER: TowerControl,
}

function ProgramSwitch() {
  const { activeProgram, setActiveProgram } = useStore()
  return (
    <div
      role="radiogroup"
      aria-label="Program scope"
      className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
    >
      {PROGRAM_VIEWS.map((p) => {
        const active = activeProgram === p
        const Icon = programIcon[p]
        const label = programLabel(p)
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setActiveProgram(p)}
            className={cn(
              "flex items-center justify-center rounded px-2 py-1 text-xs font-medium transition-colors sm:px-2.5",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

const roleLabels: Record<RoleCode, string> = {
  SP: "Sim Pilot · Level 1",
  SUP: "Supervisor · Level 2",
  SOO: "Sim Operational Officer · Level 3",
  STO: "Sim Training Officer · Level 4",
  TL: "Team Lead · Level 5",
  Admin: "Administrator · Level 6",
}

const roleShort: Record<RoleCode, string> = {
  SP: "Sim Pilot",
  SUP: "Supervisor",
  SOO: "Sim Ops Officer",
  STO: "Sim Training Officer",
  TL: "Team Lead",
  Admin: "Admin",
}

export function TopBar() {
  const { currentRole, currentUser, staffById } = useStore()
  // Prefer the linked staff member's 3-letter code; otherwise derive 3 letters
  // from the account name so every display picture shows three initials.
  const avatarInitials =
    (currentUser.staffId && staffById(currentUser.staffId)?.initials) || initialsFromName(currentUser.name)
  return (
    <header className="sticky top-0 z-20 flex min-h-14 shrink-0 flex-wrap content-center items-center gap-x-1 gap-y-1.5 border-b bg-background/95 px-2 py-2 backdrop-blur sm:h-14 sm:flex-nowrap sm:gap-2 sm:py-0 sm:px-4">
      <SidebarTrigger className="-ml-1 shrink-0" />
      <Separator orientation="vertical" className="mr-1 hidden h-5 shrink-0 sm:block" />
      <div className="flex min-w-0 shrink items-center gap-2">
        <ProgramSwitch />
        <YearRangeSlicer />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        <UserNotificationsBell />
        <ThemeToggle />
        <Separator orientation="vertical" className="hidden h-5 sm:block" />
        <div className="hidden items-center gap-2 sm:flex" title={roleLabels[currentRole]}>
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {avatarInitials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden flex-col leading-tight md:flex">
            <span className="text-xs font-medium">{currentUser.name}</span>
            <Badge variant="outline" className="h-4 px-1 text-[10px]">
              {roleShort[currentRole]} · LVL {roleLevel[currentRole]}
            </Badge>
          </div>
        </div>
        <SignOutButton />
      </div>
    </header>
  )
}
