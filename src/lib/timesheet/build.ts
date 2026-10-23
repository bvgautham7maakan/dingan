import "server-only";
import { db } from "../db";
import { dubaiHHMM } from "../time";
import {
  computeDay,
  dayCell,
  dayType,
  daysInRange,
  DEFAULT_SETTINGS,
  splitBySite,
  totals,
  type DayHours,
  type DayType,
  type StatusCode,
  type TsSettings,
  type WorkerTotals,
} from "./rules";

export type LogRow = {
  date: string;
  dayType: DayType;
  empCode: string;
  name: string;
  status: StatusCode;
  timeIn: string | null;
  timeOut: string | null;
  site: string | null;
  hours: DayHours;
  remarks: string | null;
  bySite: Map<string, DayHours>;
};

export type WorkerSheet = {
  workerId: string;
  empCode: string;
  name: string;
  status: string;
  lastDay: string | null;
  days: LogRow[];
  cells: (number | string | null)[];
  totals: WorkerTotals;
};

export type Timesheet = {
  start: string;
  end: string;
  days: string[];
  dayTypes: DayType[];
  holidays: { date: string; name: string }[];
  settings: TsSettings;
  workers: WorkerSheet[];
  grand: WorkerTotals;
  /** site name → hours (for the site split sheet and man-days) */
  siteTotals: Map<string, { normal: number; ot125: number; ot150: number; manDays: number }>;
};

export async function loadSettings(): Promise<TsSettings> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "ts." } } });
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    const k = r.key.slice(3) as keyof TsSettings;
    if (k in s && typeof r.value === "number") s[k] = r.value;
  }
  const cycle = await db.setting.findUnique({ where: { key: "cycleStartDay" } });
  if (typeof cycle?.value === "number") s.cycleStartDay = cycle.value;
  return s;
}

const MISSING_FINISH = "Finish time not entered – standard shift assumed";

/** Builds the KEM timesheet for one cycle from attendance + work segments. */
export async function buildTimesheet(start: string, end: string): Promise<Timesheet> {
  const settings = await loadSettings();
  const days = daysInRange(start, end);
  const [holidayRows, workers, records, sites] = await Promise.all([
    db.publicHoliday.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    db.worker.findMany({ orderBy: { empCode: "asc" } }),
    db.attendance.findMany({ where: { date: { gte: start, lte: end } }, include: { segments: true } }),
    db.site.findMany(),
  ]);
  const holidays = new Set(holidayRows.map((h) => h.date));
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const recBy = new Map(records.map((r) => [`${r.workerId}|${r.date}`, r]));
  const standardSpan = settings.normalHours + settings.lunchHours;

  const siteTotals: Timesheet["siteTotals"] = new Map();
  const sheets: WorkerSheet[] = workers
    .filter((w) => !(w.status === "LEFT" && w.lastDay && w.lastDay < start))
    .map((w) => {
      const rows: LogRow[] = days.map((date) => {
        const type = dayType(date, holidays);
        const rec = recBy.get(`${w.id}|${date}`);
        let status: StatusCode = "";
        let span = 0;
        let timeIn: string | null = null;
        let timeOut: string | null = null;
        let remarks: string | null = null;
        const minutesBySite = new Map<string, number>();

        if (rec && (rec.status === "IN" || rec.status === "LATE") && rec.inAt) {
          status = "P";
          timeIn = dubaiHHMM(rec.inAt);
          if (rec.outAt) {
            timeOut = dubaiHHMM(rec.outAt);
            span = Math.round(((rec.outAt.getTime() - rec.inAt.getTime()) / 3_600_000) * 100) / 100;
          } else {
            span = standardSpan;
            remarks = MISSING_FINISH;
          }
          if (rec.status === "LATE") remarks = [`Late in ${timeIn}`, remarks].filter(Boolean).join(" · ");
          const end = rec.outAt ?? new Date(rec.inAt.getTime() + standardSpan * 3_600_000);
          for (const seg of rec.segments) {
            const mins = Math.max(0, ((seg.endAt ?? end).getTime() - seg.startAt.getTime()) / 60_000);
            const name = siteName.get(seg.siteId) ?? "?";
            minutesBySite.set(name, (minutesBySite.get(name) ?? 0) + mins);
          }
          if (minutesBySite.size === 0) minutesBySite.set(siteName.get(rec.siteId) ?? "?", 1);
        } else if (rec && rec.status === "OUT") {
          status = (rec.leaveCode ?? "A") as StatusCode;
        } else if (w.status === "LEFT" && w.lastDay && date > w.lastDay) {
          status = "LEFT";
        } else if (w.status !== "PLACEHOLDER" && type !== "Normal" && !rec) {
          status = "OFF";
        }

        const hours = computeDay(type, status, span, settings);
        const bySite = status === "P" ? splitBySite(hours, minutesBySite) : new Map<string, DayHours>();
        for (const [name, h] of bySite) {
          const t = siteTotals.get(name) ?? { normal: 0, ot125: 0, ot150: 0, manDays: 0 };
          t.normal += h.normal;
          t.ot125 += h.ot125;
          t.ot150 += h.ot150;
          t.manDays += hours.paid > 0 ? h.paid / hours.paid : 0;
          siteTotals.set(name, t);
        }
        return {
          date, dayType: type, empCode: w.empCode, name: w.name, status, timeIn, timeOut,
          site: bySite.size ? [...bySite.keys()].join(" / ") : null, hours, remarks, bySite,
        };
      });
      return {
        workerId: w.id, empCode: w.empCode, name: w.name, status: w.status, lastDay: w.lastDay,
        days: rows,
        cells: rows.map((r) => dayCell(r.status, r.hours)),
        totals: totals(rows.map((r) => ({ status: r.status, hours: r.hours }))),
      };
    });

  const grand = totals(sheets.flatMap((s) => s.days.map((r) => ({ status: r.status, hours: r.hours }))));
  return {
    start, end, days, dayTypes: days.map((d) => dayType(d, holidays)),
    holidays: holidayRows.map((h) => ({ date: h.date, name: h.name })),
    settings, workers: sheets, grand, siteTotals,
  };
}
