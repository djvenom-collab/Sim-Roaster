"use client"

/* ===========================================================================
 * APP SIDEBAR — the left-hand navigation menu
 * ===========================================================================
 * Defines the grouped list of links down the left side. Links are split into
 * sections (Overview, SIM Operations, Administration, …) and each one is hidden
 * unless the current role has the matching `perm` permission.
 *
 * CHANGEABLE PARAMETERS: the link arrays below (overview, operations,
 * trainingStandards, administration, settings). To move a page between
 * sections, cut its { title, href, icon, perm } line and paste it into another
 * array. To rename a menu item, change its `title`.
 * =========================================================================== */
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Armchair,
  Users,
  GraduationCap,
  PlaneTakeoff,
  ShieldCheck,
  FileSpreadsheet,
  BarChart3,
  Settings,
  UserCog,
  CalendarOff,
  Layers,
  BellRing,
  ListTodo,
  Send,
  GanttChartSquare,
  MonitorPlay,
  TrendingUp,
  Building2,
  ScrollText,
  DatabaseBackup,
  Activity,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { useStore } from "@/lib/store"
import { programDisplay } from "@/lib/program"
import { can, type Permission } from "@/lib/permissions"

interface NavItem {
  title: string
  href: string
  icon: typeof LayoutDashboard
  perm?: Permission
}

const overview: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, perm: "page_dashboard" },
]

const operations: NavItem[] = [
  { title: "SIM Monthly Planner", href: "/monthly", icon: CalendarDays, perm: "page_monthly" },
  { title: "SIM Daily Planner", href: "/daily", icon: ClipboardList, perm: "page_daily" },
  { title: "SIM Seating Plan / Availability", href: "/seating", icon: Armchair, perm: "page_seating" },
  { title: "Other Tasks", href: "/other-tasks", icon: ListTodo, perm: "page_other_tasks" },
]

const trainingStandards: NavItem[] = [
  { title: "SIM OPS Training", href: "/training", icon: GraduationCap, perm: "page_training" },
  { title: "SIM OPS Validity / Currency", href: "/validity", icon: ShieldCheck, perm: "page_validity" },
]

const administration: NavItem[] = [
  { title: "SIM Exercises", href: "/exercises", icon: PlaneTakeoff, perm: "page_exercises" },
  { title: "Yearly Exercise Gantt", href: "/gantt", icon: GanttChartSquare, perm: "page_gantt" },
  { title: "Staff Details", href: "/staff", icon: Users, perm: "page_staff" },
  { title: "Staff Leave", href: "/leave", icon: CalendarOff, perm: "page_leave" },
  { title: "Send Message", href: "/messages", icon: Send, perm: "page_messages" },
  { title: "SIM Hours Utilization", href: "/sim-hours", icon: MonitorPlay, perm: "page_sim_hours" },
  { title: "Forecasting / Projections", href: "/projections", icon: TrendingUp, perm: "page_projections" },
  { title: "Management Overview", href: "/management", icon: Building2, perm: "page_management" },
  { title: "SIM Excel Import", href: "/import", icon: FileSpreadsheet, perm: "page_import" },
  { title: "Reports / Power BI", href: "/reports", icon: BarChart3, perm: "page_reports" },
]

const settings: NavItem[] = [
  { title: "Notification Viewer", href: "/admin/notifications", icon: BellRing, perm: "page_notifications" },
  { title: "Admin / Permissions", href: "/admin", icon: UserCog, perm: "page_admin" },
  { title: "DIM Lists", href: "/settings", icon: Settings, perm: "page_settings" },
  { title: "System Logs", href: "/logs", icon: ScrollText, perm: "page_logs" },
  { title: "Backup & Restore", href: "/backup", icon: DatabaseBackup, perm: "page_backup" },
  { title: "System Monitor", href: "/monitor", icon: Activity, perm: "page_monitor" },
]

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname()
  const { currentRole } = useStore()
  const visible = items.filter((i) => !i.perm || can(currentRole, i.perm))
  if (!visible.length) return null
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => {
            const active = pathname === item.href
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.title}
                  render={
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function ActiveProgramBadge() {
  const { activeProgram } = useStore()
  return (
    <div className="px-2 pb-1">
      <Badge
        variant="outline"
        className="w-full justify-center gap-1 border-sidebar-border bg-sidebar-accent/50 text-[11px] font-medium text-sidebar-foreground"
      >
        <Layers className="size-3" />
            {activeProgram === "ALL" ? "All Programs" : `${programDisplay(activeProgram)} only`}
      </Badge>
    </div>
  )
}

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/"
          aria-label="SIM Roster – go to Dashboard"
          className="flex items-center gap-2 rounded-lg px-2 py-3 transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <PlaneTakeoff className="size-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">SIM Roster</span>
            <span className="text-xs text-sidebar-foreground/60">Operations Control</span>
          </div>
        </Link>
        <ActiveProgramBadge />
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Overview" items={overview} />
        <NavGroup label="SIM Operations" items={operations} />
        <NavGroup label="SIM Training & Standards" items={trainingStandards} />
        <NavGroup label="SIM Administration" items={administration} />
        <NavGroup label="Settings" items={settings} />
      </SidebarContent>
      <SidebarFooter>
        <p className="px-2 py-1 text-xs text-sidebar-foreground/50">v1.0 · Prototype data</p>
      </SidebarFooter>
    </Sidebar>
  )
}
