/**
 * KEM timesheet rules – a direct port of the formulas in
 * "KEM Timesheet 26-Aug to 25-Sep 2026.xlsx" (Daily Log columns C, J–N).
 * See reference/timesheet-notes.md. Pure functions, no DB.
 */

export type TsSettings = {
  normalHours: number; // Settings!B6 – normal paid hours / day (Mon–Sat)
  lunchHours: number; // B7
  lunchAfterHours: number; // B8 – deduct lunch only if span is longer than this
  otNormalRate: number; // B9 – 1.25
  otHolidayRate: number; // B10 – 1.5
  cycleStartDay: number; // cycle runs 26th → 25th
};

export const DEFAULT_SETTINGS: TsSettings = {
  normalHours: 8,
  lunchHours: 1,
  lunchAfterHours: 5,
  otNormalRate: 1.25,
  otHolidayRate: 1.5,
  cycleStartDay: 26,
};

export type DayType = "Normal" | "Sunday" | "PH";

/** Status codes as used in the workbook. P = present. */
export type StatusCode = "P" | "OFF" | "AL" | "SL" | "CL" | "LV" | "A" | "LEFT" | "";

/**
 * Leave pay (confirmed by KEM, Oct 2026): annual leave (AL) and sick / medical leave (SL) are paid;
 * casual leave (CL), leave type to be confirmed (LV) and absent (A) are unpaid.
 * OFF (Sunday / public holiday / weekly off) and LEFT are not leave and are not counted.
 */
export const LEAVE_RULES: { code: StatusCode; meaning: string; paid: boolean | null }[] = [
  { code: "AL", meaning: "Annual leave", paid: true },
  { code: "SL", meaning: "Sick / medical leave", paid: true },
  { code: "CL", meaning: "Casual leave", paid: false },
  { code: "LV", meaning: "Leave – type to be confirmed", paid: false },
  { code: "A", meaning: "Absent", paid: false },
  { code: "OFF", meaning: "Sunday / public holiday / weekly off", paid: null },
  { code: "LEFT", meaning: "After last working day", paid: null },
];
export const UNPAID_CODES = new Set(LEAVE_RULES.filter((r) => r.paid === false).map((r) => r.code));

export type DayHours = { span: number; worked: number; normal: number; ot125: number; ot150: number; paid: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Column C: PH has priority over Sunday. `day` is yyyy-mm-dd. */
export function dayType(day: string, holidays: ReadonlySet<string>): DayType {
  if (holidays.has(day)) return "PH";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0 ? "Sunday" : "Normal";
}

/** Column J for "HH:MM" times: MOD(out − in, 1) × 24, so a shift past midnight works. */
export function spanFromTimes(timeIn: string, timeOut: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const diff = (((toMin(timeOut) - toMin(timeIn)) % 1440) + 1440) % 1440;
  return r2(diff / 60);
}

/** Columns J–N for one worker-day. Hours only count when status is P. */
export function computeDay(type: DayType, status: StatusCode, span: number, s: TsSettings = DEFAULT_SETTINGS): DayHours {
  const sp = status === "P" ? r2(span) : 0;
  const worked = sp === 0 ? 0 : r2(sp - (sp > s.lunchAfterHours ? s.lunchHours : 0));
  const normal = type !== "Normal" ? 0 : sp >= s.normalHours ? s.normalHours : worked;
  const ot125 = type !== "Normal" ? 0 : r2(Math.max(0, sp - (s.normalHours + s.lunchHours)));
  const ot150 = type === "Normal" ? 0 : worked;
  return { span: sp, worked, normal, ot125, ot150, paid: r2(normal + ot125 + ot150) };
}

/** The 26th→25th cycle containing `day`. */
export function cycleFor(day: string, s: TsSettings = DEFAULT_SETTINGS): { start: string; end: string } {
  const [y, m, d] = day.split("-").map(Number);
  const startMonth = d >= s.cycleStartDay ? m - 1 : m - 2; // 0-based month index
  const start = new Date(Date.UTC(y, startMonth, s.cycleStartDay));
  const end = new Date(Date.UTC(y, startMonth + 1, s.cycleStartDay - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function daysInRange(start: string, end: string): string[] {
  const out: string[] = [];
  const [y, m, d] = start.split("-").map(Number);
  for (let i = 0; ; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (day > end) break;
    out.push(day);
  }
  return out;
}

/** Timesheet day cell: paid hours when present, else the status code (blank = not entered). */
export function dayCell(status: StatusCode, h: DayHours): number | string | null {
  if (status === "P") return h.paid;
  return status === "" ? null : status;
}

export type WorkerTotals = {
  daysWorked: number;
  normal: number;
  ot125: number;
  ot150: number;
  alDays: number;
  sickDays: number;
  /** CL + LV + A – the unpaid days (same as the workbook's "Other leave days" column) */
  otherLeaveDays: number;
  /** AL + SL */
  paidLeaveDays: number;
};

/** Timesheet right-hand totals (AH:AN). OFF, LEFT and blank are not counted. */
export function totals(days: { status: StatusCode; hours: DayHours }[]): WorkerTotals {
  const t: WorkerTotals = { daysWorked: 0, normal: 0, ot125: 0, ot150: 0, alDays: 0, sickDays: 0, otherLeaveDays: 0, paidLeaveDays: 0 };
  for (const { status, hours } of days) {
    if (status === "P") t.daysWorked++;
    if (status === "AL") t.alDays++;
    if (status === "SL") t.sickDays++;
    if (UNPAID_CODES.has(status)) t.otherLeaveDays++;
    if (status === "AL" || status === "SL") t.paidLeaveDays++;
    t.normal += hours.normal;
    t.ot125 += hours.ot125;
    t.ot150 += hours.ot150;
  }
  t.normal = r2(t.normal);
  t.ot125 = r2(t.ot125);
  t.ot150 = r2(t.ot150);
  return t;
}

/**
 * Splits a day's paid hours across sites in proportion to time spent at each
 * (manpower moves). Rounded to 2 decimals; any rounding remainder goes to the largest share.
 */
export function splitBySite(hours: DayHours, minutesBySite: Map<string, number>): Map<string, DayHours> {
  const total = [...minutesBySite.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, DayHours>();
  if (total <= 0) return out;
  const keys = [...minutesBySite.keys()].sort((a, b) => minutesBySite.get(b)! - minutesBySite.get(a)!);
  const fields = ["span", "worked", "normal", "ot125", "ot150", "paid"] as const;
  for (const k of keys) {
    const share = minutesBySite.get(k)! / total;
    out.set(k, Object.fromEntries(fields.map((f) => [f, r2(hours[f] * share)])) as DayHours);
  }
  for (const f of fields) {
    const sum = r2(keys.reduce((a, k) => a + out.get(k)![f], 0));
    out.get(keys[0])![f] = r2(out.get(keys[0])![f] + hours[f] - sum);
  }
  return out;
}
