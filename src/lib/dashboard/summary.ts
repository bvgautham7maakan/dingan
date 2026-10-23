import "server-only";
import { db } from "../db";
import { addDaysIso, todayDubai } from "../time";
import { findClashes } from "../logistics/clash";
import type { CurrentUser } from "../auth/current";

/** "Since your last visit": counts from the user's notifications plus changes on their projects. */
export async function sinceLastVisit(user: CurrentUser, since: Date | null) {
  if (!since) return null;
  const notes = await db.notification.groupBy({ by: ["type"], where: { userId: user.id, createdAt: { gt: since } }, _count: { _all: true } });
  const [mrs, moves, reports, queries, released] = await Promise.all([
    db.materialRequest.count({ where: { createdAt: { gt: since } } }),
    db.manpowerMove.count({ where: { createdAt: { gt: since } } }),
    db.dailyReport.count({ where: { updatedAt: { gt: since }, status: { not: "DRAFT" } } }),
    db.siteQuery.count({ where: { OR: [{ createdAt: { gt: since } }, { answeredAt: { gt: since } }] } }),
    db.drawingRevision.count({ where: { releasedAt: { gt: since } } }),
  ]);
  return { since, notes: Object.fromEntries(notes.map((n) => [n.type, n._count._all])), mrs, moves, reports, queries, released };
}

/** Today across the given projects (or all): attendance, moves, trips, safety, reports. */
export async function todaySummary(projectIds?: string[]) {
  const today = todayDubai();
  const projects = await db.project.findMany({ where: { status: "ACTIVE", ...(projectIds ? { id: { in: projectIds } } : {}) }, include: { site: true }, orderBy: { code: "asc" } });
  const siteIds = projects.map((p) => p.siteId);
  const [planned, present, out, moves, trips, safety, reports] = await Promise.all([
    db.dayPlanLine.groupBy({ by: ["siteId"], where: { plan: { date: today }, siteId: { in: siteIds } }, _count: { _all: true } }),
    db.attendance.groupBy({ by: ["siteId"], where: { date: today, siteId: { in: siteIds }, status: { in: ["IN", "LATE"] } }, _count: { _all: true } }),
    db.attendance.count({ where: { date: today, siteId: { in: siteIds }, status: "OUT" } }),
    db.manpowerMove.count({ where: { date: today, OR: [{ fromSiteId: { in: siteIds } }, { toSiteId: { in: siteIds } }] } }),
    db.trip.findMany({ where: { date: today, status: { not: "CANCELLED" } }, include: { vehicle: true, driver: true, fromSite: true, toSite: true } }),
    db.safetyChecklist.findMany({ where: { date: today, projectId: { in: projects.map((p) => p.id) } }, select: { projectId: true, issues: true } }),
    db.dailyReport.findMany({ where: { date: today, projectId: { in: projects.map((p) => p.id) }, status: { not: "DRAFT" } }, select: { projectId: true } }),
  ]);
  const cnt = (rows: { siteId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.siteId === id)?._count._all ?? 0;
  const clashes = findClashes(trips.map((t) => ({ id: t.id, vehicleId: t.vehicleId, vehicle: t.vehicle.name, driverId: t.driverId, driver: t.driver?.displayName ?? null, from: t.fromSite.name, to: t.toSite.name, out: t.plannedOut, back: t.plannedReturn })));
  return {
    date: today,
    tomorrow: addDaysIso(today, 1),
    sites: projects.map((p) => ({
      projectId: p.id, code: p.code, siteId: p.siteId, planned: cnt(planned, p.siteId), present: cnt(present, p.siteId),
      safety: safety.some((s) => s.projectId === p.id), safetyIssues: safety.filter((s) => s.projectId === p.id).reduce((a, s) => a + s.issues, 0),
      report: reports.some((r) => r.projectId === p.id),
    })),
    present: present.reduce((a, r) => a + r._count._all, 0),
    planned: planned.reduce((a, r) => a + r._count._all, 0),
    out,
    moves,
    trips: trips.length,
    delivered: trips.filter((t) => t.status === "DELIVERED" || t.status === "RETURNED").length,
    clashes: clashes.length,
  };
}

/** Man-days used on a project (moved workers count by share of the day) vs the manual budget. */
export async function manDays(projectId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const segs = await db.workSegment.findMany({ where: { OR: [{ projectId }, { siteId: project.siteId, projectId: null }] }, include: { attendance: { include: { segments: true } } } });
  let used = 0;
  for (const s of segs) {
    const end = (x: { startAt: Date; endAt: Date | null }) => (x.endAt ?? new Date(x.startAt.getTime() + 9 * 3_600_000)).getTime();
    const mine = end(s) - s.startAt.getTime();
    const all = s.attendance.segments.reduce((a, x) => a + (end(x) - x.startAt.getTime()), 0);
    if (all > 0) used += mine / all;
  }
  return { used: Math.round(used * 10) / 10, budget: project.manDayBudget };
}
