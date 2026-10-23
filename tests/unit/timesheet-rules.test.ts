import { describe, expect, it } from "vitest";
import samples from "../../reference/daily-log-samples.json";
import totalsSamples from "../../reference/timesheet-totals-samples.json";
import {
  computeDay,
  cycleFor,
  dayCell,
  dayType,
  daysInRange,
  spanFromTimes,
  splitBySite,
  totals,
  type StatusCode,
} from "@/lib/timesheet/rules";

// The reference workbook has one public holiday in the period.
const HOLIDAYS = new Set(["2026-08-28"]);

type Sample = (typeof samples)[number];
const status = (s: Sample) => (s.Status ?? "") as StatusCode;

describe("timesheet rules against real Daily Log rows (KEM Timesheet 26-Aug to 25-Sep 2026)", () => {
  it.each(samples.map((s) => [`${s.Key} – ${s._case}`, s] as const))("%s", (_name, s) => {
    expect(dayType(s.date, HOLIDAYS)).toBe(s["Day type"]);
    const span = s.timeIn && s.timeOut ? spanFromTimes(s.timeIn, s.timeOut) : 0;
    const h = computeDay(s["Day type"] as "Normal" | "Sunday" | "PH", status(s), span);
    expect(h.span).toBe(s["Shift span (hrs)"]);
    expect(h.worked).toBe(s["Worked (hrs)"]);
    expect(h.normal).toBe(s["Normal (hrs)"]);
    expect(h.ot125).toBe(s["OT 1.25 (hrs)"]);
    expect(h.ot150).toBe(s["OT 1.5 (hrs)"]);
  });

  it("covers every brief rule at least once", () => {
    const cases = new Set(samples.map((s) => s._case));
    for (const c of ["normal weekday 8h", "weekday OT 1h", "short shift <=5h (PH)", "night shift 23:00-07:00", "Sunday worked", "public holiday worked", "AL", "SL", "CL"])
      expect(cases.has(c), c).toBe(true);
  });
});

describe("brief rules (7.2), spelled out", () => {
  it("Mon–Sat 08:00–17:00 = 8 normal, no OT (lunch deducted)", () => {
    expect(computeDay("Normal", "P", 9)).toMatchObject({ worked: 8, normal: 8, ot125: 0, ot150: 0 });
  });
  it("lunch only deducted when shift > 5 h", () => {
    expect(computeDay("PH", "P", 5).worked).toBe(5);
    expect(computeDay("PH", "P", 5.5).worked).toBe(4.5);
  });
  it("OT ×1.25 = hours beyond a 9-hour shift on normal days", () => {
    expect(computeDay("Normal", "P", spanFromTimes("08:00", "20:00"))).toMatchObject({ normal: 8, ot125: 3 });
  });
  it("Sunday and public holiday: all worked hours at ×1.5", () => {
    expect(computeDay("Sunday", "P", 9)).toMatchObject({ normal: 0, ot125: 0, ot150: 8 });
    expect(computeDay("PH", "P", 4)).toMatchObject({ ot150: 4 });
  });
  it("night shift 23:00–07:00 = full 8-hour day, no OT", () => {
    expect(computeDay("Normal", "P", spanFromTimes("23:00", "07:00"))).toMatchObject({ worked: 7, normal: 8, ot125: 0, paid: 8 });
  });
  it("leave pay: AL and SL paid; CL, LV and A unpaid; OFF and LEFT not counted", () => {
    const days = (["AL", "SL", "CL", "LV", "A", "OFF", "LEFT"] as StatusCode[]).map((status) => ({ status, hours: computeDay("Normal", status, 0) }));
    const t = totals(days);
    expect(t.paidLeaveDays).toBe(2);
    expect(t.otherLeaveDays).toBe(3);
  });
  it("leave days carry no hours", () => {
    for (const st of ["AL", "SL", "CL", "A", "OFF", "LV", "LEFT", ""] as StatusCode[])
      expect(computeDay("Normal", st, 9).paid).toBe(0);
  });
  it("PH beats Sunday", () => {
    expect(dayType("2026-08-30", new Set(["2026-08-30"]))).toBe("PH");
    expect(dayType("2026-08-30", new Set())).toBe("Sunday");
  });
});

describe("cycle 26th → 25th", () => {
  it.each([
    ["2026-09-26", "2026-09-26", "2026-10-25"],
    ["2026-10-25", "2026-09-26", "2026-10-25"],
    ["2026-10-21", "2026-09-26", "2026-10-25"],
    ["2026-08-26", "2026-08-26", "2026-09-25"],
    ["2027-01-10", "2026-12-26", "2027-01-25"],
    ["2026-12-31", "2026-12-26", "2027-01-25"],
  ])("%s → %s … %s", (day, start, end) => {
    expect(cycleFor(day)).toEqual({ start, end });
  });
  it("26-Sep → 25-Oct has 30 days; 26-Aug → 25-Sep has 31", () => {
    expect(daysInRange("2026-09-26", "2026-10-25")).toHaveLength(30);
    expect(daysInRange("2026-08-26", "2026-09-25")).toHaveLength(31);
  });
});

describe("Timesheet sheet totals match the reference workbook", () => {
  const workers = (totalsSamples as Record<string, unknown>[]).filter((w) => "days" in w) as unknown as {
    empCode: string;
    days: Record<string, number | string | null>;
  } & Record<string, number>[];
  it.each(workers.map((w) => [w.empCode, w] as const))("%s", (_code, w) => {
    // Rebuild each day from its Timesheet cell: numbers are paid hours (P), text is the status code.
    const days = Object.entries(w.days).map(([day, cell]) => {
      const type = dayType(day, HOLIDAYS);
      if (typeof cell === "number") {
        const st: StatusCode = "P";
        // paid = normal + OT; span = paid + 1 h lunch (no lunch for Sun/PH shifts of 5 h or less)
        const span = type === "Normal" || cell > 5 ? cell + 1 : cell;
        const hours = computeDay(type, st, span);
        expect(dayCell(st, hours), day).toBe(cell);
        return { status: st, hours };
      }
      const st = (cell ?? "") as StatusCode;
      return { status: st, hours: computeDay(type, st, 0) };
    });
    const t = totals(days);
    expect(t.daysWorked).toBe(w["Days worked"]);
    expect(t.normal).toBe(w["Normal hrs"]);
    expect(t.ot125).toBe(w["OT 1.25 hrs"]);
    expect(t.ot150).toBe(w["OT 1.5 hrs"]);
    expect(t.alDays).toBe(w["AL days"]);
    expect(t.sickDays).toBe(w["Sick days"]);
    expect(t.otherLeaveDays).toBe(w["Other leave days"]);
  });
});

describe("hours split across sites (manpower move at 10:15)", () => {
  it("08:00–17:00 with a move at 10:15 splits 8 normal hours by time on site", () => {
    const day = computeDay("Normal", "P", 9);
    // NBK 08:00–10:15 = 135 min; Safe Tower 10:15–17:00 = 405 min
    const split = splitBySite(day, new Map([["NBK", 135], ["SAFE", 405]]));
    expect(split.get("NBK")!.normal).toBe(2);
    expect(split.get("SAFE")!.normal).toBe(6);
    expect(split.get("NBK")!.paid + split.get("SAFE")!.paid).toBe(8);
  });
  it("rounding remainder lands on the larger share so the total is exact", () => {
    const split = splitBySite(computeDay("Normal", "P", 10), new Map([["A", 100], ["B", 100], ["C", 100]]));
    const sum = [...split.values()].reduce((a, h) => a + h.paid, 0);
    expect(Math.round(sum * 100) / 100).toBe(9);
  });
});
