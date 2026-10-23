export const ROLES = [
  "ADMIN",
  "PE",
  "BUL",
  "OPS",
  "PM",
  "SE",
  "EST",
  "DESIGN",
  "COORD",
  "PROC",
  "HEAD_SUP",
  "SUP",
  "HVAC_SUP",
  "DRIVER",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  PE: "Project Engineer",
  BUL: "Business Unit Leader",
  OPS: "Operations Manager",
  PM: "Project Manager",
  SE: "Site Engineer",
  EST: "Estimator",
  DESIGN: "Design",
  COORD: "Coordinator / Document Controller",
  PROC: "Procurement",
  HEAD_SUP: "Head Supervisor",
  SUP: "Site Supervisor",
  HVAC_SUP: "HVAC Supervisor",
  DRIVER: "Driver",
};

/** Roles that must never receive AED values from the API. */
export const NO_AED_ROLES: readonly Role[] = ["SUP", "HEAD_SUP", "HVAC_SUP", "DRIVER", "DESIGN"];

/** Field roles: mobile-first layout, phone UX rules. */
export const SITE_ROLES: readonly Role[] = ["SUP", "HEAD_SUP", "HVAC_SUP", "DRIVER"];

/** Roles whose default project view is "My projects" (assigned only). */
export const ASSIGNED_VIEW_ROLES: readonly Role[] = ["PM", "PE", "SE", "SUP"];

/** HIGH-ALERT panel audience. */
export const HIGH_ALERT_ROLES: readonly Role[] = ["SE", "PE"];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function hasAnyRole(roles: readonly string[], allowed: readonly Role[]): boolean {
  return roles.some((r) => (allowed as readonly string[]).includes(r));
}

export function canSeeMoney(roles: readonly string[]): boolean {
  // A user with several roles sees money if any role is allowed to (e.g. ADMIN + PE).
  return roles.some((r) => isRole(r) && !NO_AED_ROLES.includes(r));
}

export function isSiteUser(roles: readonly string[]): boolean {
  return roles.length > 0 && roles.every((r) => isRole(r) && SITE_ROLES.includes(r));
}

export function defaultProjectScope(roles: readonly string[]): "mine" | "all" {
  return hasAnyRole(roles, ASSIGNED_VIEW_ROLES) ? "mine" : "all";
}

/** Who may sign out all devices of another user. */
export function canRevokeOthers(roles: readonly string[]): boolean {
  return hasAnyRole(roles, ["ADMIN", "PM"]);
}
