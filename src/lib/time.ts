export const TZ = "Asia/Dubai";

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour === "24" ? "00" : p.hour, min: p.minute };
}

/** dd-mm-yyyy in Asia/Dubai */
export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "–";
  const p = parts(d);
  return `${p.d}-${p.m}-${p.y}`;
}

/** dd-mm-yyyy HH:mm in Asia/Dubai */
export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "–";
  const p = parts(d);
  return `${p.d}-${p.m}-${p.y} ${p.h}:${p.min}`;
}

/** yyyy-mm-dd → dd-mm-yyyy */
export function fmtIsoDay(day: string | null | undefined): string {
  if (!day) return "–";
  const [y, m, d] = day.split("-");
  return `${d}-${m}-${y}`;
}

/** Today's calendar day in Asia/Dubai as yyyy-mm-dd */
export function todayDubai(now = new Date()): string {
  const p = parts(now);
  return `${p.y}-${p.m}-${p.d}`;
}

/** Asia/Dubai is UTC+4 all year (no DST). */
const DUBAI_OFFSET_H = 4;

/** Calendar day + "HH:MM" in Dubai → UTC Date. `addDays` shifts the day (night shift ends next day). */
export function dubaiDateTime(day: string, hhmm: string, addDays = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d + addDays, h - DUBAI_OFFSET_H, min));
}

/** UTC Date → "HH:MM" in Dubai */
export function dubaiHHMM(dt: Date): string {
  const p = parts(dt);
  return `${p.h}:${p.min}`;
}

/** "HH:MM" + minutes → "HH:MM" (wraps past midnight) */
export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function addDaysIso(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a yyyy-mm-dd calendar day */
export function weekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
