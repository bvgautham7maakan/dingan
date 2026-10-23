import "server-only";
import { z } from "zod";
import { db } from "../db";
import { hasAnyRole } from "../roles";

/**
 * Config-driven admin CRUD for master data. Each entity lists its form fields,
 * how to load rows, and how to save a validated form.
 */
export type FieldType = "text" | "number" | "time" | "date" | "select" | "checkbox" | "aed" | "users";
export type Option = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Option[];
  help?: string;
};
export type Column = { label: string; value: (row: Row) => string };
export type Row = Record<string, unknown> & { id: string };

export type EntityConfig = {
  title: string;
  fields: () => Promise<Field[]>;
  rows: () => Promise<Row[]>;
  columns: Column[];
  /** form values for editing a row */
  toForm: (row: Row) => Record<string, string | string[] | boolean>;
  save: (id: string | null, form: FormData) => Promise<{ id: string; before: unknown; after: unknown }>;
};

const str = (form: FormData, k: string) => {
  const v = form.get(k);
  return v == null || v === "" ? undefined : String(v);
};
const opt = <T extends z.ZodTypeAny>(t: T) => t.optional().nullable();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function siteOptions(): Promise<Option[]> {
  const sites = await db.site.findMany({ orderBy: { name: "asc" } });
  return sites.map((s) => ({ value: s.id, label: s.name }));
}
async function userOptions(filter?: (roles: string[]) => boolean): Promise<Option[]> {
  const users = await db.user.findMany({ where: { active: true }, include: { roles: true }, orderBy: { displayName: "asc" } });
  return users
    .filter((u) => !filter || filter(u.roles.map((r) => r.role)))
    .map((u) => ({ value: u.id, label: `${u.displayName} (${u.roles.map((r) => r.role).join("/")})` }));
}

export const ENTITIES: Record<string, EntityConfig> = {
  sites: {
    title: "sitesTitle",
    fields: async () => [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "kind", label: "Type", type: "select", required: true, options: ["PROJECT", "OFFICE", "STORE"].map((v) => ({ value: v, label: v })) },
      { name: "defaultStartTime", label: "Default start time", type: "time", required: true },
      { name: "lat", label: "Latitude", type: "number" },
      { name: "lng", label: "Longitude", type: "number" },
      { name: "mapUrl", label: "Google Maps link", type: "text" },
      { name: "active", label: "Active", type: "checkbox" },
    ],
    rows: async () => (await db.site.findMany({ orderBy: { name: "asc" } })) as unknown as Row[],
    columns: [
      { label: "Code", value: (r) => String(r.code) },
      { label: "Name", value: (r) => String(r.name) },
      { label: "Type", value: (r) => String(r.kind) },
      { label: "Start", value: (r) => String(r.defaultStartTime) },
      { label: "Map", value: (r) => (r.mapUrl || r.lat ? "✓ set" : "– not set") },
      { label: "Active", value: (r) => (r.active ? "✓ Yes" : "✕ No") },
    ],
    toForm: (r) => ({
      code: String(r.code), name: String(r.name), kind: String(r.kind), defaultStartTime: String(r.defaultStartTime),
      lat: r.lat == null ? "" : String(r.lat), lng: r.lng == null ? "" : String(r.lng), mapUrl: String(r.mapUrl ?? ""), active: Boolean(r.active),
    }),
    save: async (id, f) => {
      const data = z
        .object({
          code: z.string().trim().toUpperCase().min(1).max(20),
          name: z.string().trim().min(1).max(80),
          kind: z.enum(["PROJECT", "OFFICE", "STORE"]),
          defaultStartTime: time,
          lat: opt(z.coerce.number().min(-90).max(90)),
          lng: opt(z.coerce.number().min(-180).max(180)),
          mapUrl: opt(z.string().url().max(500)),
          active: z.boolean(),
        })
        .parse({
          code: str(f, "code"), name: str(f, "name"), kind: str(f, "kind"), defaultStartTime: str(f, "defaultStartTime"),
          lat: str(f, "lat"), lng: str(f, "lng"), mapUrl: str(f, "mapUrl"), active: f.get("active") === "on",
        });
      const before = id ? await db.site.findUnique({ where: { id } }) : null;
      const row = id ? await db.site.update({ where: { id }, data }) : await db.site.create({ data });
      return { id: row.id, before, after: row };
    },
  },

  projects: {
    title: "projectsTitle",
    fields: async () => [
      { name: "code", label: "Code", type: "text", required: true, help: "Short code used in refs, e.g. NBK" },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "siteId", label: "Site", type: "select", required: true, options: await siteOptions() },
      { name: "client", label: "Client", type: "text" },
      { name: "status", label: "Status", type: "select", required: true, options: ["ACTIVE", "ON_HOLD", "CLOSED"].map((v) => ({ value: v, label: v })) },
      { name: "pmUserId", label: "Project Manager (blank = routes to Operations Manager)", type: "select", options: await userOptions((r) => r.includes("PM")) },
      { name: "oneDrivePath", label: "OneDrive job folder path", type: "text" },
      { name: "manDayBudget", label: "Man-day budget", type: "number" },
      { name: "bulThresholdFils", label: "BUL approval above (AED, blank = company default)", type: "aed" },
      { name: "members", label: "Assigned staff", type: "users", options: await userOptions((r) => hasAnyRole(r, ["PE", "SE", "SUP", "HVAC_SUP", "HEAD_SUP", "PM"])) },
    ],
    rows: async () =>
      (await db.project.findMany({
        include: { site: true, pm: true, members: { include: { user: true } } },
        orderBy: { code: "asc" },
      })) as unknown as Row[],
    columns: [
      { label: "Code", value: (r) => String(r.code) },
      { label: "Name", value: (r) => String(r.name) },
      { label: "Site", value: (r) => String((r.site as { name: string }).name) },
      { label: "Status", value: (r) => String(r.status) },
      { label: "PM", value: (r) => ((r.pm as { displayName: string } | null)?.displayName ?? "– (Ops)") },
      {
        label: "Assigned",
        value: (r) =>
          [...new Set((r.members as { user: { displayName: string } }[]).map((m) => m.user.displayName))].join(", ") || "–",
      },
    ],
    toForm: (r) => ({
      code: String(r.code), name: String(r.name), siteId: String(r.siteId), client: String(r.client ?? ""), status: String(r.status),
      pmUserId: String(r.pmUserId ?? ""), oneDrivePath: String(r.oneDrivePath ?? ""),
      manDayBudget: r.manDayBudget == null ? "" : String(r.manDayBudget),
      bulThresholdFils: r.bulThresholdFils == null ? "" : String(Number(r.bulThresholdFils) / 100),
      members: [...new Set((r.members as { userId: string }[]).map((m) => m.userId))],
    }),
    save: async (id, f) => {
      const data = z
        .object({
          code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/),
          name: z.string().trim().min(1).max(100),
          siteId: z.string().min(1),
          client: opt(z.string().max(100)),
          status: z.enum(["ACTIVE", "ON_HOLD", "CLOSED"]),
          pmUserId: opt(z.string()),
          oneDrivePath: opt(z.string().max(400)),
          manDayBudget: opt(z.coerce.number().int().min(0)),
          bulThresholdFils: opt(z.coerce.number().min(0).transform((aed) => Math.round(aed * 100))),
        })
        .parse({
          code: str(f, "code"), name: str(f, "name"), siteId: str(f, "siteId"), client: str(f, "client"), status: str(f, "status"),
          pmUserId: str(f, "pmUserId") ?? null, oneDrivePath: str(f, "oneDrivePath") ?? null,
          manDayBudget: str(f, "manDayBudget") ?? null, bulThresholdFils: str(f, "bulThresholdFils") ?? null,
        });
      const memberIds = z.array(z.string()).parse(f.getAll("members"));
      const before = id ? await db.project.findUnique({ where: { id }, include: { members: true } }) : null;
      const row = id ? await db.project.update({ where: { id }, data }) : await db.project.create({ data });
      // Members carry the user's site/engineering role on that project.
      const users = await db.user.findMany({ where: { id: { in: memberIds } }, include: { roles: true } });
      const memberRole = (roles: string[]) =>
        ["PM", "PE", "SE", "HEAD_SUP", "HVAC_SUP", "SUP"].find((r) => roles.includes(r)) ?? roles[0];
      await db.$transaction([
        db.projectMember.deleteMany({ where: { projectId: row.id } }),
        db.projectMember.createMany({
          data: users.map((u) => ({ projectId: row.id, userId: u.id, role: memberRole(u.roles.map((r) => r.role)) })),
        }),
      ]);
      return { id: row.id, before, after: { ...row, members: memberIds } };
    },
  },

  workers: {
    title: "workersTitle",
    fields: async () => [
      { name: "empCode", label: "Emp code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "trade", label: "Trade", type: "text" },
      { name: "designation", label: "Designation", type: "text" },
      { name: "status", label: "Status", type: "select", required: true, options: ["ACTIVE", "LEFT", "PLACEHOLDER"].map((v) => ({ value: v, label: v })) },
      { name: "joinDate", label: "Join date", type: "date" },
    ],
    rows: async () => (await db.worker.findMany({ orderBy: { empCode: "asc" } })) as unknown as Row[],
    columns: [
      { label: "Code", value: (r) => String(r.empCode) },
      { label: "Name", value: (r) => String(r.name) },
      { label: "Trade", value: (r) => String(r.trade ?? "–") },
      { label: "Designation", value: (r) => String(r.designation ?? "–") },
      { label: "Status", value: (r) => String(r.status) },
    ],
    toForm: (r) => ({
      empCode: String(r.empCode), name: String(r.name), trade: String(r.trade ?? ""), designation: String(r.designation ?? ""),
      status: String(r.status), joinDate: String(r.joinDate ?? ""),
    }),
    save: async (id, f) => {
      const data = z
        .object({
          empCode: z.string().trim().toUpperCase().regex(/^E\d{2,4}$/),
          name: z.string().trim().min(1).max(80),
          trade: opt(z.string().max(40)),
          designation: opt(z.string().max(60)),
          status: z.enum(["ACTIVE", "LEFT", "PLACEHOLDER"]),
          joinDate: opt(isoDay),
        })
        .parse({
          empCode: str(f, "empCode"), name: str(f, "name"), trade: str(f, "trade") ?? null, designation: str(f, "designation") ?? null,
          status: str(f, "status"), joinDate: str(f, "joinDate") ?? null,
        });
      const before = id ? await db.worker.findUnique({ where: { id } }) : null;
      const row = id ? await db.worker.update({ where: { id }, data }) : await db.worker.create({ data });
      return { id: row.id, before, after: row };
    },
  },

  vehicles: {
    title: "vehiclesTitle",
    fields: async () => [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "plate", label: "Plate no.", type: "text" },
      { name: "defaultDriverId", label: "Default driver", type: "select", options: await userOptions() },
      { name: "active", label: "Active", type: "checkbox" },
    ],
    rows: async () => (await db.vehicle.findMany({ include: { defaultDriver: true }, orderBy: { name: "asc" } })) as unknown as Row[],
    columns: [
      { label: "Name", value: (r) => String(r.name) },
      { label: "Plate", value: (r) => String(r.plate ?? "–") },
      { label: "Default driver", value: (r) => (r.defaultDriver as { displayName: string } | null)?.displayName ?? "–" },
      { label: "Active", value: (r) => (r.active ? "✓ Yes" : "✕ No") },
    ],
    toForm: (r) => ({ name: String(r.name), plate: String(r.plate ?? ""), defaultDriverId: String(r.defaultDriverId ?? ""), active: Boolean(r.active) }),
    save: async (id, f) => {
      const data = z
        .object({ name: z.string().trim().min(1).max(40), plate: opt(z.string().max(20)), defaultDriverId: opt(z.string()), active: z.boolean() })
        .parse({ name: str(f, "name"), plate: str(f, "plate") ?? null, defaultDriverId: str(f, "defaultDriverId") ?? null, active: f.get("active") === "on" });
      const before = id ? await db.vehicle.findUnique({ where: { id } }) : null;
      const row = id ? await db.vehicle.update({ where: { id }, data }) : await db.vehicle.create({ data });
      return { id: row.id, before, after: row };
    },
  },

  holidays: {
    title: "holidaysTitle",
    fields: async () => [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "name", label: "Name", type: "text", required: true },
    ],
    rows: async () => (await db.publicHoliday.findMany({ orderBy: { date: "asc" } })) as unknown as Row[],
    columns: [
      { label: "Date", value: (r) => String(r.date).split("-").reverse().join("-") },
      { label: "Name", value: (r) => String(r.name) },
    ],
    toForm: (r) => ({ date: String(r.date), name: String(r.name) }),
    save: async (id, f) => {
      const data = z.object({ date: isoDay, name: z.string().trim().min(1).max(80) }).parse({ date: str(f, "date"), name: str(f, "name") });
      const before = id ? await db.publicHoliday.findUnique({ where: { id } }) : null;
      const row = id ? await db.publicHoliday.update({ where: { id }, data }) : await db.publicHoliday.create({ data });
      return { id: row.id, before, after: row };
    },
  },
};
