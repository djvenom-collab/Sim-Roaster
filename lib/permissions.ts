import type { RoleCode } from "./types"

/* ===========================================================================
 * PERMISSIONS — who is allowed to see and do what
 * ===========================================================================
 * This is the single place that controls access for the four roles
 * (SP, SUP, TL, Admin). It answers two questions:
 *   1. "Can this role open this page?"  (the page_* permissions)
 *   2. "Can this role perform this action?"  (everything else, e.g. edit_run)
 *
 * THE MOST COMMON CHANGE you will make is in DEFAULT_MATRIX near the bottom:
 * that lists exactly which permissions each role gets. Add or remove a
 * permission from a role's list to grant or revoke it. (Admins on the live
 * Admin page can also tweak this at runtime.)
 *
 * TO ADD A BRAND-NEW PERMISSION you must touch three spots, all in this file:
 *   1. add the key to the `Permission` union below,
 *   2. add it to the matching group in PERMISSION_GROUPS,
 *   3. add a human label in PERMISSION_LABELS,
 *   then grant it to the roles that should have it in DEFAULT_MATRIX.
 * =========================================================================== */

// All possible permission keys, grouped by family. Page access controls which
// routes a role can open; the rest control individual actions.
export type Permission =
  // ── Page access ───────────────────────────────────────────────────────
  | "page_dashboard"
  | "page_monthly"
  | "page_daily"
  | "page_exercises"
  | "page_seating"
  | "page_training"
  | "page_validity"
  | "page_staff"
  | "page_leave"
  | "page_other_tasks"
  | "page_notifications"
  | "page_messages"
  | "page_gantt"
  | "page_sim_hours"
  | "page_projections"
  | "page_import"
  | "page_reports"
  | "page_management"
  | "page_admin"
  | "page_settings"
  | "page_logs"
  | "page_backup"
  | "page_monitor"
  // ── Scheduling & assignments ────────────────────────────────────────────
  | "edit_run"
  | "edit_assignment"
  | "confirm_cancel"
  | "fill_positions"
  | "manual_override"
  | "manage_other_tasks"
  // ── Notifications ─────────────────────────────────────────────────────
  | "notify_staff"
  | "push_notifications"
  | "view_read_status"
  // ── Leave & training ──────────────────────────────────────────────────
  | "manage_leave"
  | "approve_leave"
  | "manage_training"
  | "manage_qualifications"
  // ── Data & administration ───────────────────────────────────────────────
  | "import_excel"
  | "export_reports"
  | "manage_dim"
  | "manage_staff"
  | "manage_exercises"
  | "manage_users"
  | "view_audit"

export interface PermissionGroup {
  label: string
  description: string
  permissions: Permission[]
}

// Grouped for display in the Admin permission matrix. ALL_PERMISSIONS and the
// labels are derived from this single source of truth.
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Page access",
    description: "Which pages each access level can open",
    permissions: [
      "page_dashboard",
      "page_monthly",
      "page_daily",
      "page_exercises",
      "page_seating",
      "page_training",
      "page_validity",
      "page_staff",
      "page_leave",
      "page_other_tasks",
      "page_notifications",
      "page_messages",
      "page_gantt",
      "page_sim_hours",
      "page_projections",
      "page_import",
      "page_reports",
      "page_management",
      "page_admin",
      "page_settings",
      "page_logs",
      "page_backup",
      "page_monitor",
    ],
  },
  {
    label: "Scheduling & assignments",
    description: "Editing runs, exercises and seat assignments",
    permissions: ["edit_run", "edit_assignment", "confirm_cancel", "fill_positions", "manual_override", "manage_other_tasks"],
  },
  {
    label: "Notifications",
    description: "Sending and tracking staff notifications",
    permissions: ["notify_staff", "push_notifications", "view_read_status"],
  },
  {
    label: "Leave & training",
    description: "Managing leave requests and training records",
    permissions: ["manage_leave", "approve_leave", "manage_training", "manage_qualifications"],
  },
  {
    label: "Data & administration",
    description: "Imports, reports, reference data and user management",
    permissions: [
      "import_excel",
      "export_reports",
      "manage_dim",
      "manage_staff",
      "manage_exercises",
      "manage_users",
      "view_audit",
    ],
  },
]

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions)

export const PERMISSION_LABELS: Record<Permission, string> = {
  // Page access
  page_dashboard: "Dashboard",
  page_monthly: "SIM Monthly Planner",
  page_daily: "SIM Daily Planner",
  page_exercises: "SIM Exercises",
  page_seating: "SIM Seating Plan / Availability",
  page_training: "SIM OPS Training",
  page_validity: "SIM OPS Validity / Currency",
  page_staff: "Staff Details",
  page_leave: "Staff Leave",
  page_other_tasks: "Other Tasks",
  page_notifications: "Notification Viewer",
  page_messages: "Send Message",
  page_gantt: "Yearly Gantt",
  page_sim_hours: "SIM Hours Utilization",
  page_projections: "Forecasting / Projections",
  page_import: "SIM Excel Import",
  page_reports: "Reports / Power BI",
  page_management: "Management Overview",
  page_admin: "Admin / Permissions",
  page_settings: "DIM Lists / Settings",
  page_logs: "System Logs",
  page_backup: "Backup & Restore",
  page_monitor: "System Monitor",
  // Scheduling & assignments
  edit_run: "Edit runs",
  edit_assignment: "Edit assignments",
  confirm_cancel: "Confirm / cancel exercises",
  fill_positions: "Fill positions",
  manual_override: "Manual override",
  manage_other_tasks: "Manage other tasks",
  // Notifications
  notify_staff: "Notify staff (runs & training)",
  push_notifications: "Push weekly digest",
  view_read_status: "View read / opened status",
  // Leave & training
  manage_leave: "Manage leave",
  approve_leave: "Approve leave",
  manage_training: "Manage training",
  manage_qualifications: "Manage qualifications",
  // Data & administration
  import_excel: "Import Excel",
  export_reports: "Export reports",
  manage_dim: "Manage DIM lists",
  manage_staff: "Manage staff",
  manage_exercises: "Manage exercises",
  manage_users: "Manage users",
  view_audit: "View audit log",
}

// Map each route to the page-access permission that gates it. Used by the
// sidebar (visibility) and the central page-access guard (URL entry).
export const ROUTE_PERMISSIONS: { prefix: string; perm: Permission }[] = [
  { prefix: "/monthly", perm: "page_monthly" },
  { prefix: "/daily", perm: "page_daily" },
  { prefix: "/exercises", perm: "page_exercises" },
  { prefix: "/seating", perm: "page_seating" },
  { prefix: "/training", perm: "page_training" },
  { prefix: "/validity", perm: "page_validity" },
  { prefix: "/staff", perm: "page_staff" },
  { prefix: "/leave", perm: "page_leave" },
  { prefix: "/other-tasks", perm: "page_other_tasks" },
  { prefix: "/admin/notifications", perm: "page_notifications" },
  { prefix: "/messages", perm: "page_messages" },
  { prefix: "/gantt", perm: "page_gantt" },
  { prefix: "/sim-hours", perm: "page_sim_hours" },
  { prefix: "/projections", perm: "page_projections" },
  { prefix: "/import", perm: "page_import" },
  { prefix: "/reports", perm: "page_reports" },
  { prefix: "/management", perm: "page_management" },
  { prefix: "/admin", perm: "page_admin" },
  { prefix: "/settings", perm: "page_settings" },
  { prefix: "/logs", perm: "page_logs" },
  { prefix: "/backup", perm: "page_backup" },
  { prefix: "/monitor", perm: "page_monitor" },
  { prefix: "/", perm: "page_dashboard" },
]

// Resolve the permission for a pathname (longest matching prefix wins so that
// "/admin/notifications" is matched before "/admin" and "/").
export function permissionForRoute(pathname: string): Permission | null {
  const match = [...ROUTE_PERMISSIONS]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`) || (r.prefix === "/" && pathname === "/"))
  return match?.perm ?? null
}

const VIEW_PAGES: Permission[] = [
  "page_dashboard",
  "page_monthly",
  "page_daily",
  "page_exercises",
  "page_seating",
  "page_training",
  "page_validity",
  "page_staff",
  "page_leave",
  "page_other_tasks",
  "page_gantt",
  "page_sim_hours",
  "page_reports",
]

export const DEFAULT_MATRIX: Record<RoleCode, Permission[]> = {
  // SP (Level 1) can open the operational view pages and export reports only.
  SP: [...VIEW_PAGES, "export_reports"],
  // SUP (Level 2) can edit runs/assignments, fill, notify, push the digest, and import.
  SUP: [
    ...VIEW_PAGES,
    "page_import",
    "page_messages",
    "edit_run",
    "edit_assignment",
    "fill_positions",
    "manage_other_tasks",
    "notify_staff",
    "push_notifications",
    "manage_leave",
    "import_excel",
    "export_reports",
  ],
  // SOO (Level 3, Simulator Operational Officer) — mid-level operational officer.
  // Starts with the Supervisor permission set (edit runs/assignments, fill,
  // notify, push digest, manage other tasks, manage leave, import).
  SOO: [
    ...VIEW_PAGES,
    "page_import",
    "page_messages",
    "edit_run",
    "edit_assignment",
    "fill_positions",
    "manage_other_tasks",
    "notify_staff",
    "push_notifications",
    "manage_leave",
    "import_excel",
    "export_reports",
  ],
  // STO (Level 4, Simulator Training Officer) — mid-level training officer.
  // Starts with the Supervisor permission set (same baseline as SOO); Admins can
  // tailor training-specific grants at runtime on the Admin page.
  STO: [
    ...VIEW_PAGES,
    "page_import",
    "page_messages",
    "edit_run",
    "edit_assignment",
    "fill_positions",
    "manage_other_tasks",
    "notify_staff",
    "push_notifications",
    "manage_leave",
    "import_excel",
    "export_reports",
  ],
  // TL (Level 3) adds confirm/cancel, override, approvals, training, the
  // notification viewer with read receipts, and the audit log.
  TL: [
    ...VIEW_PAGES,
    "page_notifications",
    "page_messages",
    "page_projections",
    "page_import",
    "page_management",
    "edit_run",
    "edit_assignment",
    "confirm_cancel",
    "fill_positions",
    "manual_override",
    "manage_other_tasks",
    "notify_staff",
    "push_notifications",
    "view_read_status",
    "manage_leave",
    "approve_leave",
    "manage_training",
    "import_excel",
    "export_reports",
    "view_audit",
    "page_logs",
  ],
  // Admin (Level 4) holds every permission.
  Admin: [...ALL_PERMISSIONS],
}

// Mutable runtime matrix — the store keeps this in sync so edits made on the
// Admin page are reflected everywhere `can()` is called.
let matrix: Record<RoleCode, Permission[]> = {
  SP: [...DEFAULT_MATRIX.SP],
  SUP: [...DEFAULT_MATRIX.SUP],
  SOO: [...DEFAULT_MATRIX.SOO],
  STO: [...DEFAULT_MATRIX.STO],
  TL: [...DEFAULT_MATRIX.TL],
  Admin: [...DEFAULT_MATRIX.Admin],
}

export function setPermissionMatrix(next: Record<RoleCode, Permission[]>) {
  matrix = next
}

const ROLE_CODES: RoleCode[] = ["SP", "SUP", "SOO", "STO", "TL", "Admin"]

/**
 * Reconcile a persisted permission matrix with the current permission set so
 * older saved snapshots don't lock out newly-added permissions:
 *   - Admin ALWAYS holds every permission (documented invariant).
 *   - Any permission key that never appeared in the snapshot is treated as
 *     brand-new and granted to each role per DEFAULT_MATRIX (default-on).
 *   - Existing per-role edits are otherwise preserved (removals stick).
 * Pure and idempotent.
 */
export function reconcilePermissionMatrix(
  persisted: Partial<Record<RoleCode, Permission[]>> | null | undefined,
): Record<RoleCode, Permission[]> {
  if (!persisted) {
    return {
      SP: [...DEFAULT_MATRIX.SP],
      SUP: [...DEFAULT_MATRIX.SUP],
      SOO: [...DEFAULT_MATRIX.SOO],
      STO: [...DEFAULT_MATRIX.STO],
      TL: [...DEFAULT_MATRIX.TL],
      Admin: [...DEFAULT_MATRIX.Admin],
    }
  }
  // Every permission the snapshot was aware of. Admin is EXCLUDED here: the
  // Admin invariant means Admin always holds every permission, so counting it
  // would mark every key "known" and permanently disable the backfill below.
  // A key is therefore "brand-new" when no NON-admin role had heard of it.
  const known = new Set<Permission>()
  for (const role of ROLE_CODES) {
    if (role === "Admin") continue
    for (const p of persisted[role] ?? []) known.add(p)
  }
  const brandNew = ALL_PERMISSIONS.filter((p) => !known.has(p))

  const out = {} as Record<RoleCode, Permission[]>
  for (const role of ROLE_CODES) {
    const base = persisted[role] ?? [...DEFAULT_MATRIX[role]]
    const set = new Set<Permission>(base.filter((p): p is Permission => ALL_PERMISSIONS.includes(p)))
    // Auto-enrol brand-new permissions per the shipped defaults.
    for (const p of brandNew) if (DEFAULT_MATRIX[role].includes(p)) set.add(p)
    out[role] = [...set]
  }
  // Admin invariant: all permissions, always.
  out.Admin = [...ALL_PERMISSIONS]
  return out
}

export function getPermissionMatrix(): Record<RoleCode, Permission[]> {
  return matrix
}

export function can(role: RoleCode, perm: Permission): boolean {
  return matrix[role]?.includes(perm) ?? false
}

export const roleLevel: Record<RoleCode, number> = { SP: 1, SUP: 2, SOO: 3, STO: 4, TL: 5, Admin: 6 }
