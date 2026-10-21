import { hasAnyRole, type Role } from "./roles";

/**
 * `stage` says when the screen arrives: a pilot milestone (M2–M7) or phase 2/3.
 * Items without a stage are live now.
 */
export type NavItem = {
  key: string; // i18n key under "nav"
  href: string;
  roles: readonly Role[];
  stage?: "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "P2" | "P3";
};

export type NavGroup = { key: string; icon: string; items: NavItem[] };

const ALL: readonly Role[] = [
  "ADMIN", "PE", "BUL", "OPS", "PM", "SE", "EST", "DESIGN", "COORD", "PROC", "HEAD_SUP", "SUP", "HVAC_SUP", "DRIVER",
];
const OFFICE_SITE: readonly Role[] = ["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "COORD", "HEAD_SUP", "SUP", "HVAC_SUP"];
const COMMERCIAL: readonly Role[] = ["ADMIN", "PE", "BUL", "OPS", "PM", "EST", "COORD"];

export const NAV: NavGroup[] = [
  {
    key: "home",
    icon: "⌂",
    items: [{ key: "dashboard", href: "/", roles: ALL }],
  },
  {
    key: "site",
    icon: "◧",
    items: [
      { key: "attendance", href: "/m/attendance", roles: OFFICE_SITE, stage: "M2" },
      { key: "timesheet", href: "/m/timesheet", roles: ["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "COORD", "HEAD_SUP"], stage: "M2" },
      { key: "moves", href: "/m/moves", roles: OFFICE_SITE, stage: "M3" },
      { key: "duties", href: "/m/duties", roles: OFFICE_SITE, stage: "M4" },
      { key: "dailyReport", href: "/m/daily-report", roles: OFFICE_SITE, stage: "M4" },
      { key: "safety", href: "/m/safety", roles: OFFICE_SITE, stage: "M4" },
    ],
  },
  {
    key: "logistics",
    icon: "⛟",
    items: [
      { key: "vehiclePlan", href: "/m/vehicle-plan", roles: [...OFFICE_SITE, "DRIVER"], stage: "M3" },
      { key: "trips", href: "/m/trips", roles: [...OFFICE_SITE, "DRIVER"], stage: "M3" },
      { key: "vehicleCheck", href: "/m/vehicle-check", roles: ["DRIVER", "HEAD_SUP", "ADMIN"], stage: "M3" },
      { key: "bills", href: "/m/bills", roles: ["DRIVER", "ADMIN", "PE", "OPS", "BUL", "PM", "HEAD_SUP", "SUP", "HVAC_SUP"], stage: "M3" },
    ],
  },
  {
    key: "materials",
    icon: "▤",
    items: [
      { key: "materialRequests", href: "/m/material-requests", roles: [...OFFICE_SITE, "EST", "PROC"], stage: "M5" },
      { key: "materialMaster", href: "/m/material-master", roles: ["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "EST", "COORD", "PROC", "DESIGN"], stage: "M5" },
      { key: "priceList", href: "/m/price-list", roles: ["ADMIN", "PE", "BUL", "OPS", "EST", "PROC"], stage: "P2" },
    ],
  },
  {
    key: "documents",
    icon: "▦",
    items: [
      { key: "drawings", href: "/m/drawings", roles: [...OFFICE_SITE, "DESIGN", "EST"], stage: "M6" },
      { key: "siteQueries", href: "/m/site-queries", roles: [...OFFICE_SITE, "DESIGN"], stage: "M4" },
      { key: "authority", href: "/m/authority", roles: ["ADMIN", "PE", "OPS", "PM", "DESIGN", "COORD"], stage: "P3" },
    ],
  },
  {
    key: "commercial",
    icon: "◈",
    items: [
      { key: "estimation", href: "/m/estimation", roles: COMMERCIAL, stage: "P2" },
      { key: "variations", href: "/m/variations", roles: COMMERCIAL, stage: "P2" },
      { key: "ipa", href: "/m/ipa", roles: COMMERCIAL, stage: "P2" },
      { key: "subBills", href: "/m/sub-bills", roles: COMMERCIAL, stage: "P2" },
      { key: "accounts", href: "/m/accounts", roles: ["ADMIN", "BUL", "OPS"], stage: "P3" },
    ],
  },
  {
    key: "admin",
    icon: "⚙",
    items: [
      { key: "users", href: "/admin/users", roles: ["ADMIN", "PM"] },
      { key: "projects", href: "/admin/projects", roles: ["ADMIN"] },
      { key: "sites", href: "/admin/sites", roles: ["ADMIN"] },
      { key: "workers", href: "/admin/workers", roles: ["ADMIN"] },
      { key: "vehicles", href: "/admin/vehicles", roles: ["ADMIN"] },
      { key: "holidays", href: "/admin/holidays", roles: ["ADMIN"] },
      { key: "auditLog", href: "/admin/audit", roles: ["ADMIN"] },
    ],
  },
];

export function navFor(roles: readonly string[]): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => hasAnyRole(roles, i.roles)) })).filter(
    (g) => g.items.length > 0,
  );
}

export type Tab = { key: string; href: string; icon: string };

/** Max 5 bottom tabs on mobile; last is always "More". */
export function tabsFor(roles: readonly string[]): Tab[] {
  const has = (r: Role[]) => hasAnyRole(roles, r);
  const more = { key: "more", href: "/more", icon: "☰" };
  if (has(["DRIVER"]) && roles.length === 1)
    return [
      { key: "home", href: "/", icon: "⌂" },
      { key: "trips", href: "/m/trips", icon: "⛟" },
      { key: "vehicleCheck", href: "/m/vehicle-check", icon: "✓" },
      { key: "bills", href: "/m/bills", icon: "▭" },
      more,
    ];
  if (has(["SUP", "HVAC_SUP", "HEAD_SUP"]))
    return [
      { key: "home", href: "/", icon: "⌂" },
      { key: "attendance", href: "/m/attendance", icon: "✓" },
      { key: "moves", href: "/m/moves", icon: "⇄" },
      { key: "dailyReport", href: "/m/daily-report", icon: "▤" },
      more,
    ];
  if (has(["PROC"]) && roles.length === 1)
    return [
      { key: "home", href: "/", icon: "⌂" },
      { key: "materialRequests", href: "/m/material-requests", icon: "▤" },
      { key: "materialMaster", href: "/m/material-master", icon: "▦" },
      { key: "account", href: "/account", icon: "◉" },
      more,
    ];
  if (has(["DESIGN"]) && roles.length === 1)
    return [
      { key: "home", href: "/", icon: "⌂" },
      { key: "drawings", href: "/m/drawings", icon: "▦" },
      { key: "siteQueries", href: "/m/site-queries", icon: "?" },
      { key: "account", href: "/account", icon: "◉" },
      more,
    ];
  return [
    { key: "home", href: "/", icon: "⌂" },
    { key: "materialRequests", href: "/m/material-requests", icon: "▤" },
    { key: "drawings", href: "/m/drawings", icon: "▦" },
    { key: "account", href: "/account", icon: "◉" },
    more,
  ];
}

/** Every module slug the placeholder route knows about, with its stage. */
export function findNavItem(href: string): NavItem | undefined {
  for (const g of NAV) for (const i of g.items) if (i.href === href) return i;
  return undefined;
}
