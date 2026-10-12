// Shared permission catalogue (configurable per role in Settings → Roles & Permissions).
export type Role = "admin" | "staff" | "viewer";
export const ROLES: Role[] = ["admin", "staff", "viewer"];

export const PERMISSIONS = {
  "records.view": "View records",
  "records.create": "Create records",
  "records.edit": "Edit / correct records",
  "records.move": "Move records to next step",
  "records.archive": "Archive / restore records",
  "records.delete": "Permanently delete archived records",
  "records.import": "Import from Excel",
  "records.documents": "Upload / delete record documents",
  "reports.view": "View reports",
  "reports.export": "Export records & reports",
  "expiry.view": "View expiry monitoring",
  "errors.view": "View error log",
  "errors.resolve": "Resolve errors",
  "emails.view": "View email history",
  "emails.manage": "Retry / send emails",
  "audit.view": "View audit log",
  "users.manage": "Manage users",
  "settings.manage": "Manage system settings",
  "transport.manage": "Transporter, transport cost & extra charges (administrator only)",
  "agents.manage": "Create / edit / block / delete Clearing & Forwarding agents (administrator only)",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  staff: [
    "records.view",
    "records.create",
    "records.edit",
    "records.move",
    "records.import",
    "records.documents",
    "reports.view",
    "reports.export",
    "expiry.view",
    "errors.view",
    "emails.view",
  ],
  viewer: ["records.view", "reports.view", "reports.export", "expiry.view"],
};

/** Permissions that can never be granted to staff/viewer, whatever the matrix says. */
export const ADMIN_ONLY: Permission[] = ["transport.manage", "agents.manage"];

/** Validate an arbitrary value into a clean per-user permission list (never includes admin-only rights). */
export function normalizePermissions(input: unknown): Permission[] {
  const chosen = new Set(Array.isArray(input) ? input.filter((p): p is string => typeof p === "string") : []);
  return ALL_PERMISSIONS.filter((p) => chosen.has(p) && !ADMIN_ONLY.includes(p));
}
