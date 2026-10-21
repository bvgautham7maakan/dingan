import { z } from "zod";

export const SHIFTS = ["DAY", "NIGHT", "EVE", "OTHER"] as const;
export type Shift = (typeof SHIFTS)[number];
export const SHIFT_START: Record<Exclude<Shift, "OTHER">, string> = { DAY: "08:00", NIGHT: "23:00", EVE: "20:00" };
export const LEAVE_CODES = ["AL", "SL", "CL", "A", "OFF"] as const;
export type LeaveCode = (typeof LEAVE_CODES)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Offline-capable mutations. Every one carries a client UUID so a retry never applies twice. */
export const mutationSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal("attendance.mark"),
    at: z.string(),
    payload: z.object({
      date: day,
      siteId: z.string().min(1),
      workerId: z.string().min(1),
      status: z.enum(["IN", "LATE", "OUT"]),
      shift: z.enum(SHIFTS),
      shiftStart: hhmm,
      inTime: hhmm.optional(),
      leaveCode: z.enum(LEAVE_CODES).optional(),
    }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("attendance.finish"),
    at: z.string(),
    payload: z.object({ date: day, workerId: z.string().min(1), outTime: hhmm }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("attendance.clear"),
    at: z.string(),
    payload: z.object({ date: day, workerId: z.string().min(1) }),
  }),
  z.object({
    id: z.string().uuid(),
    type: z.literal("site.startTime"),
    at: z.string(),
    payload: z.object({ siteId: z.string().min(1), time: hhmm }),
  }),
]);

export type Mutation = z.infer<typeof mutationSchema>;

export type DayRecord = {
  status: "IN" | "LATE" | "OUT";
  leaveCode: LeaveCode | null;
  shift: Shift;
  shiftStart: string;
  inTime: string | null;
  outTime: string | null;
  siteId: string;
};

export type DayRow = {
  workerId: string;
  empCode: string;
  name: string;
  trade: string | null;
  planned: boolean;
  vehicle: string | null;
  plannedShift: Shift | null;
  record: DayRecord | null;
};

export type AttendanceDay = {
  date: string;
  siteId: string;
  siteName: string;
  startTime: string;
  canEditStart: boolean;
  sites: { id: string; name: string; startTime: string }[];
  rows: DayRow[];
  others: { workerId: string; empCode: string; name: string; trade: string | null }[];
};

/** Apply a mutation to a cached day, so the phone shows its own unsynced taps. */
export function applyLocal(day: AttendanceDay, m: Mutation): AttendanceDay {
  if (m.type === "site.startTime") {
    if (m.payload.siteId !== day.siteId) return day;
    return { ...day, startTime: m.payload.time };
  }
  if (m.payload.date !== day.date) return day;
  const rows = [...day.rows];
  const idx = rows.findIndex((r) => r.workerId === m.payload.workerId);
  if (m.type === "attendance.mark") {
    const p = m.payload;
    const record: DayRecord = {
      status: p.status,
      leaveCode: p.status === "OUT" ? (p.leaveCode ?? null) : null,
      shift: p.shift,
      shiftStart: p.shiftStart,
      inTime: p.status === "OUT" ? null : (p.inTime ?? p.shiftStart),
      outTime: idx >= 0 ? (rows[idx].record?.outTime ?? null) : null,
      siteId: p.siteId,
    };
    if (idx >= 0) rows[idx] = { ...rows[idx], record };
    else {
      const w = day.others.find((o) => o.workerId === p.workerId);
      if (!w) return day;
      rows.push({ ...w, planned: false, vehicle: null, plannedShift: null, record });
      return { ...day, rows, others: day.others.filter((o) => o.workerId !== p.workerId) };
    }
  } else if (idx >= 0 && m.type === "attendance.finish") {
    const r = rows[idx].record;
    if (r && r.status !== "OUT") rows[idx] = { ...rows[idx], record: { ...r, outTime: m.payload.outTime } };
  } else if (idx >= 0 && m.type === "attendance.clear") {
    rows[idx] = { ...rows[idx], record: null };
  }
  return { ...day, rows };
}
