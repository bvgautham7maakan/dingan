import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { hasAnyRole, type Role } from "../roles";
import { addDaysIso, dubaiDateTime, dubaiHHMM } from "../time";
import type { CurrentUser } from "../auth/current";
import type { AttendanceDay, AttendanceMutation, DayRecord, LeaveCode, Shift } from "./types";

export const ATTENDANCE_ROLES: readonly Role[] = ["SUP", "HEAD_SUP", "HVAC_SUP", "SE", "PE", "PM", "ADMIN"];
export const START_TIME_ROLES: readonly Role[] = ["SUP", "PM", "SE", "HEAD_SUP", "ADMIN"];
export const PLAN_ROLES: readonly Role[] = ["HEAD_SUP", "SE", "PE", "PM", "ADMIN"];

export class MutationError extends Error {}

/** Out time on or before the in time means the shift ended the next morning. */
export function outDate(day: string, inTime: string, outTime: string): Date {
  return dubaiDateTime(day, outTime, outTime <= inTime ? 1 : 0);
}

async function projectIdForSite(siteId: string) {
  const p = await db.project.findFirst({ where: { siteId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  return p?.id ?? null;
}

/** The day's attendance screen for one site: planned workers + anyone already marked there. */
export async function getAttendanceDay(user: CurrentUser, siteId: string, date: string): Promise<AttendanceDay> {
  const [site, sites, plan, records, workers] = await Promise.all([
    db.site.findUniqueOrThrow({ where: { id: siteId } }),
    db.site.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.dayPlan.findUnique({ where: { date }, include: { lines: { include: { vehicle: true } } } }),
    db.attendance.findMany({ where: { date }, include: { segments: { orderBy: { startAt: "asc" } } } }),
    db.worker.findMany({ where: { status: "ACTIVE" }, orderBy: { empCode: "asc" } }),
  ]);
  const planBy = new Map(plan?.lines.map((l) => [l.workerId, l]) ?? []);
  const recBy = new Map(records.map((r) => [r.workerId, r]));

  const toRecord = (r: (typeof records)[number]): DayRecord => ({
    status: r.status as DayRecord["status"],
    leaveCode: (r.leaveCode as LeaveCode) ?? null,
    shift: r.shift as Shift,
    shiftStart: r.shiftStart,
    inTime: r.inAt ? dubaiHHMM(r.inAt) : null,
    outTime: r.outAt ? dubaiHHMM(r.outAt) : null,
    siteId: r.siteId,
  });

  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const rows: AttendanceDay["rows"] = [];
  const others: AttendanceDay["others"] = [];
  for (const w of workers) {
    const line = planBy.get(w.id);
    const rec = recBy.get(w.id);
    const moves = rec?.segments.filter((s) => s.source === "MOVE") ?? [];
    const movedIn = moves.find((s) => s.siteId === siteId && rec?.siteId !== siteId);
    const movedOut = rec?.siteId === siteId ? moves.find((s) => s.siteId !== siteId) : undefined;
    const here = rec ? rec.siteId === siteId || !!movedIn : line?.siteId === siteId;
    const base = { workerId: w.id, empCode: w.empCode, name: w.name, trade: w.trade };
    if (here)
      rows.push({
        ...base,
        planned: line?.siteId === siteId,
        vehicle: line?.vehicle?.name ?? null,
        plannedShift: (line?.shift as Shift) ?? null,
        record: rec ? toRecord(rec) : null,
        moved: movedIn
          ? `← ${siteName.get(rec!.siteId) ?? ""} ${dubaiHHMM(movedIn.startAt)}`
          : movedOut
            ? `→ ${siteName.get(movedOut.siteId) ?? ""} ${dubaiHHMM(movedOut.startAt)}`
            : null,
      });
    else if (!rec) others.push(base);
  }
  return {
    date,
    siteId,
    siteName: site.name,
    startTime: site.defaultStartTime,
    canEditStart: hasAnyRole(user.roles, START_TIME_ROLES),
    sites: sites.map((s) => ({ id: s.id, name: s.name, startTime: s.defaultStartTime })),
    rows,
    others,
  };
}

/** Applies one attendance mutation (idempotency is handled by lib/sync/apply.ts). */
export async function applyAttendanceMutation(user: CurrentUser, m: AttendanceMutation): Promise<void> {
  if (m.type === "site.startTime") {
    if (!hasAnyRole(user.roles, START_TIME_ROLES)) throw new MutationError("forbidden");
    const before = await db.site.findUniqueOrThrow({ where: { id: m.payload.siteId } });
    await db.site.update({ where: { id: before.id }, data: { defaultStartTime: m.payload.time } });
    await audit({
      actorId: user.id, action: "EDIT", entityType: "Site.startTime", entityId: before.id,
      before: { defaultStartTime: before.defaultStartTime }, after: { defaultStartTime: m.payload.time },
    });
  } else {
    if (!hasAnyRole(user.roles, ATTENDANCE_ROLES)) throw new MutationError("forbidden");
    const { date, workerId } = m.payload;
    if (date > addDaysIso(new Date().toISOString().slice(0, 10), 1)) throw new MutationError("future_date");
    const existing = await db.attendance.findUnique({ where: { date_workerId: { date, workerId } } });

    if (m.type === "attendance.mark") {
      const p = m.payload;
      const inTime = p.status === "OUT" ? null : (p.inTime ?? p.shiftStart);
      const inAt = inTime ? dubaiDateTime(date, inTime) : null;
      // keep an existing finish time if it still makes sense
      const outAt =
        inTime && existing?.outAt ? outDate(date, inTime, dubaiHHMM(existing.outAt)) : null;
      const data = {
        siteId: p.siteId, status: p.status, leaveCode: p.status === "OUT" ? (p.leaveCode ?? "A") : null,
        shift: p.shift, shiftStart: p.shiftStart, inAt, outAt, markedById: user.id,
      };
      const row = existing
        ? await db.attendance.update({ where: { id: existing.id }, data })
        : await db.attendance.create({ data: { ...data, date, workerId, clientId: m.id } });
      await db.workSegment.deleteMany({ where: { attendanceId: row.id, source: "ATTENDANCE" } });
      if (inAt)
        await db.workSegment.create({
          data: { attendanceId: row.id, siteId: p.siteId, projectId: await projectIdForSite(p.siteId), startAt: inAt, endAt: outAt },
        });
      await audit({ actorId: user.id, action: existing ? "EDIT" : "CREATE", entityType: "Attendance", entityId: row.id, before: existing, after: row });
    } else if (m.type === "attendance.finish") {
      if (!existing || !existing.inAt) throw new MutationError("not_marked_in");
      const inTime = dubaiHHMM(existing.inAt);
      const outAt = outDate(date, inTime, m.payload.outTime);
      const row = await db.attendance.update({ where: { id: existing.id }, data: { outAt } });
      // close the last segment of the day (moves in M3 may have split it)
      const last = await db.workSegment.findFirst({ where: { attendanceId: existing.id }, orderBy: { startAt: "desc" } });
      if (last) await db.workSegment.update({ where: { id: last.id }, data: { endAt: outAt } });
      await audit({ actorId: user.id, action: "EDIT", entityType: "Attendance", entityId: row.id, before: { outAt: existing.outAt }, after: { outAt } });
    } else if (m.type === "attendance.clear") {
      if (existing) {
        await db.attendance.delete({ where: { id: existing.id } });
        await audit({ actorId: user.id, action: "DELETE", entityType: "Attendance", entityId: existing.id, before: existing });
      }
    }
  }
}
