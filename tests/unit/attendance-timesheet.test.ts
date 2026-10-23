import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { getAttendanceDay, MutationError } from "@/lib/attendance/server";
import { applyMutation } from "@/lib/sync/apply";
import { buildTimesheet } from "@/lib/timesheet/build";
import { timesheetWorkbook } from "@/lib/timesheet/export";
import { dubaiDateTime } from "@/lib/time";
import type { CurrentUser } from "@/lib/auth/current";
import type { Mutation } from "@/lib/sync/schema";
import { resetDb } from "./reset";

let sanu: CurrentUser;
let ali: CurrentUser;
const ids: Record<string, string> = {};
const START = "2026-09-26";
const END = "2026-10-25";

const user = (id: string, roles: string[]): CurrentUser => ({
  id, sessionId: "s", username: id, displayName: id, locale: "en", roles, mustChangePassword: false, prevSeenAt: null,
});
const mark = (date: string, worker: string, status: "IN" | "LATE" | "OUT", extra: Partial<{ inTime: string; leaveCode: "SL" | "AL"; shift: "DAY" | "NIGHT"; shiftStart: string }> = {}): Mutation => ({
  id: randomUUID(), type: "attendance.mark", at: new Date().toISOString(),
  payload: { date, siteId: ids.NBK, workerId: ids[worker], status, shift: extra.shift ?? "DAY", shiftStart: extra.shiftStart ?? "08:00", inTime: extra.inTime, leaveCode: extra.leaveCode },
});
const finish = (date: string, worker: string, outTime: string): Mutation => ({
  id: randomUUID(), type: "attendance.finish", at: new Date().toISOString(), payload: { date, workerId: ids[worker], outTime },
});

beforeAll(async () => {
  await resetDb();
  const u1 = await db.user.create({ data: { username: "sanu", displayName: "Sanu", passwordHash: "x", roles: { create: [{ role: "SUP" }] } } });
  const u2 = await db.user.create({ data: { username: "ali", displayName: "Ali", passwordHash: "x", roles: { create: [{ role: "DRIVER" }] } } });
  sanu = user(u1.id, ["SUP"]);
  ali = user(u2.id, ["DRIVER"]);
  ids.NBK = (await db.site.create({ data: { code: "NBK", name: "NBK" } })).id;
  ids.SAFE = (await db.site.create({ data: { code: "SAFE", name: "Safe Tower" } })).id;
  await db.project.create({ data: { code: "NBK", name: "NBK", siteId: ids.NBK } });
  for (const [code, name] of [["E01", "Abilash"], ["E02", "Asad"], ["E03", "Aneesh"], ["E04", "Azim"]])
    ids[code] = (await db.worker.create({ data: { empCode: code, name } })).id;
  ids.E13 = (await db.worker.create({ data: { empCode: "E13", name: "Nigesh", status: "LEFT", lastDay: "2026-10-01" } })).id;
});

describe("offline mutations", () => {
  it("applies once; a resent mutation is a duplicate", async () => {
    const m = mark("2026-09-28", "E01", "IN");
    expect(await applyMutation(sanu, m)).toBe("applied");
    expect(await applyMutation(sanu, m)).toBe("duplicate");
    expect(await db.attendance.count({ where: { workerId: ids.E01 } })).toBe(1);
  });

  it("driver cannot mark attendance", async () => {
    await expect(applyMutation(ali, mark("2026-09-28", "E02", "IN"))).rejects.toBeInstanceOf(MutationError);
  });

  it("late at 08:20 and SL are stored with times and reason", async () => {
    await applyMutation(sanu, mark("2026-09-28", "E02", "LATE", { inTime: "08:20" }));
    await applyMutation(sanu, mark("2026-09-28", "E03", "OUT", { leaveCode: "SL" }));
    const day = await getAttendanceDay(sanu, ids.NBK, "2026-09-28");
    const byCode = Object.fromEntries(day.rows.map((r) => [r.empCode, r.record]));
    expect(byCode.E02).toMatchObject({ status: "LATE", inTime: "08:20" });
    expect(byCode.E03).toMatchObject({ status: "OUT", leaveCode: "SL" });
    expect(day.others.map((o) => o.empCode)).toContain("E04");
  });

  it("site start time change is logged", async () => {
    await applyMutation(sanu, { id: randomUUID(), type: "site.startTime", at: new Date().toISOString(), payload: { siteId: ids.NBK, time: "07:30" } });
    const log = await db.auditLog.findFirst({ where: { entityType: "Site.startTime" } });
    expect(log?.before).toEqual({ defaultStartTime: "08:00" });
    expect(log?.after).toEqual({ defaultStartTime: "07:30" });
  });
});

describe("timesheet from attendance", () => {
  beforeAll(async () => {
    await applyMutation(sanu, finish("2026-09-28", "E01", "17:00")); // Mon 9 h span → 8 normal
    await applyMutation(sanu, finish("2026-09-28", "E02", "19:00")); // late 08:20–19:00 → span 10.67 → OT 1.67
    // Tuesday night shift 23:00–07:00 → 8 h, no OT
    await applyMutation(sanu, mark("2026-09-29", "E01", "IN", { shift: "NIGHT", shiftStart: "23:00" }));
    await applyMutation(sanu, finish("2026-09-29", "E01", "07:00"));
    // Sunday 04-Oct 08:00–17:00 → 8 h at 1.5
    await applyMutation(sanu, mark("2026-10-04", "E02", "IN"));
    await applyMutation(sanu, finish("2026-10-04", "E02", "17:00"));
    // Wednesday: E04 moved NBK → Safe Tower at 10:15 (segments as M3 will write them)
    await applyMutation(sanu, mark("2026-09-30", "E04", "IN"));
    await applyMutation(sanu, finish("2026-09-30", "E04", "17:00"));
    const att = await db.attendance.findUniqueOrThrow({ where: { date_workerId: { date: "2026-09-30", workerId: ids.E04 } } });
    const move = dubaiDateTime("2026-09-30", "10:15");
    await db.workSegment.updateMany({ where: { attendanceId: att.id }, data: { endAt: move } });
    await db.workSegment.create({ data: { attendanceId: att.id, siteId: ids.SAFE, startAt: move, endAt: dubaiDateTime("2026-09-30", "17:00"), source: "MOVE" } });
  });

  it("applies the KEM rules per day", async () => {
    const ts = await buildTimesheet(START, END);
    const day = (code: string, date: string) => ts.workers.find((w) => w.empCode === code)!.days.find((d) => d.date === date)!;
    expect(day("E01", "2026-09-28").hours).toMatchObject({ normal: 8, ot125: 0 });
    expect(day("E02", "2026-09-28")).toMatchObject({ status: "P", timeIn: "08:20", timeOut: "19:00", remarks: "Late in 08:20" });
    expect(day("E02", "2026-09-28").hours).toMatchObject({ normal: 8, ot125: 1.67 });
    expect(day("E03", "2026-09-28").status).toBe("SL");
    expect(day("E01", "2026-09-29").hours).toMatchObject({ span: 8, normal: 8, ot125: 0, paid: 8 });
    expect(day("E02", "2026-10-04")).toMatchObject({ dayType: "Sunday", status: "P" });
    expect(day("E02", "2026-10-04").hours.ot150).toBe(8);
    expect(day("E01", "2026-10-04").status).toBe("OFF");
    expect(day("E01", "2026-09-30").status).toBe("");
    expect(day("E13", "2026-10-02").status).toBe("LEFT");
  });

  it("splits a moved worker's hours by site (move at 10:15)", async () => {
    const ts = await buildTimesheet(START, END);
    const d = ts.workers.find((w) => w.empCode === "E04")!.days.find((x) => x.date === "2026-09-30")!;
    expect(d.site).toBe("Safe Tower / NBK");
    expect(d.bySite.get("NBK")!.normal).toBe(2);
    expect(d.bySite.get("Safe Tower")!.normal).toBe(6);
    expect(ts.siteTotals.get("Safe Tower")!.manDays).toBeCloseTo(0.75, 2);
  });

  it("exports the same sheets and columns as the reference workbook", async () => {
    const ts = await buildTimesheet(START, END);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await timesheetWorkbook(ts)) as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Settings", "Employees", "Daily Log", "Timesheet", "Site hours"]);
    const headers = (ws: string, row: number) => (wb.getWorksheet(ws)!.getRow(row).values as unknown[]).slice(1);
    expect(headers("Daily Log", 1)).toEqual([
      "Date", "Day", "Day type", "Emp ID", "Name", "Status", "Time in", "Time out", "Site", "Shift span (hrs)", "Worked (hrs)",
      "Normal (hrs)", "OT 1.25 (hrs)", "OT 1.5 (hrs)", "Reported OT (hrs)", "Remarks", "Key",
    ]);
    expect(headers("Employees", 1)).toEqual(["Emp ID", "Name", "Status", "Last day", "Basic salary (AED/month)", "Hourly rate (AED)", "Remarks"]);
    const tsHead = headers("Timesheet", 5) as string[];
    expect(tsHead.slice(0, 3)).toEqual(["ID", "Name", "26"]);
    expect(tsHead.length).toBe(2 + 30 + 13);
    expect(tsHead.slice(32)).toEqual(["Days worked", "Normal hrs", "OT 1.25 hrs", "OT 1.5 hrs", "AL days", "Sick days", "Other leave days", "Basic (AED)", "Hourly rate", "OT 1.25 amt (AED)", "OT 1.5 amt (AED)", "Total OT (AED)", "Gross (AED)"]);
    expect(wb.getWorksheet("Summary")!.getCell("A2").value).toBe("Workers timesheet summary  |  26-Sep-2026 to 25-Oct-2026");
    // Daily Log: 30 days × 5 workers
    expect(wb.getWorksheet("Daily Log")!.actualRowCount).toBe(1 + 30 * 5);
    const e02 = wb.getWorksheet("Timesheet")!.getRow(7);
    expect(e02.getCell(1).value).toBe("E02");
    expect(e02.getCell(3 + 2).value).toBe(9.67); // 28-Sep: 8 + 1.67
  });
});
