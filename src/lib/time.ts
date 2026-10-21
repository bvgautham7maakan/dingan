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
