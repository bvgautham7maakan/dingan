import "server-only";
import { db } from "../db";
import { describeFlow, pendingFor } from "../flows";
import { hasAnyRole } from "../roles";
import { dubaiDateTime, todayDubai } from "../time";
import type { CurrentUser } from "../auth/current";

/** One thing waiting for this user. `due` drives the Overdue / Today / This week grouping. */
export type PendingItem = { key: string; title: string; detail?: string; link: string; due: Date; kind: string };
export type Bucket = "overdue" | "today" | "week" | "later";

const HOUR = 3_600_000;
/** Approvals are expected within a working day. */
const APPROVAL_SLA_H = 24;
/** Site queries should be answered within two days. */
const QUERY_SLA_H = 48;

export function bucketOf(due: Date, now = new Date()): Bucket {
  if (due.getTime() < now.getTime()) return "overdue";
  const endToday = dubaiDateTime(todayDubai(now), "23:59");
  if (due <= endToday) return "today";
  return due.getTime() - now.getTime() <= 7 * 24 * HOUR ? "week" : "later";
}

export function groupPending(items: PendingItem[], now = new Date()) {
  const groups: Record<Bucket, PendingItem[]> = { overdue: [], today: [], week: [], later: [] };
  for (const i of [...items].sort((a, b) => a.due.getTime() - b.due.getTime())) groups[bucketOf(i.due, now)].push(i);
  return groups;
}

async function myProjectIds(user: CurrentUser) {
  const rows = await db.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } });
  return [...new Set(rows.map((r) => r.projectId))];
}

export async function pendingItems(user: CurrentUser, now = new Date()): Promise<PendingItem[]> {
  const items: PendingItem[] = [];
  const today = todayDubai(now);

  // approval steps waiting for me (any chain)
  for (const s of await pendingFor(user)) {
    const d = await describeFlow(s.flow.entityType, s.flow.entityId);
    const since = s.flow.updatedAt > s.flow.createdAt ? s.flow.updatedAt : s.flow.createdAt;
    items.push({ key: `step:${s.id}`, title: d.title, detail: s.label, link: d.link, due: new Date(since.getTime() + APPROVAL_SLA_H * HOUR), kind: "approval" });
  }

  // things returned to me
  const returned = await db.approvalFlow.findMany({ where: { createdById: user.id, status: "RETURNED", updatedAt: { gte: new Date(now.getTime() - 7 * 24 * HOUR) } } });
  for (const f of returned) {
    if (f.entityType === "MATERIAL_REQUEST" && (await db.materialRequest.findUnique({ where: { id: f.entityId } }))?.status === "CLOSED") continue;
    const d = await describeFlow(f.entityType, f.entityId);
    items.push({ key: `ret:${f.id}`, title: d.title, detail: "returned to you", link: d.link, due: new Date(f.updatedAt.getTime() + APPROVAL_SLA_H * HOUR), kind: "returned" });
  }

  // duties
  const duties = await db.duty.findMany({ where: { assigneeId: user.id, status: "OPEN" }, include: { project: true } });
  for (const d of duties) items.push({ key: `duty:${d.id}`, title: d.title, detail: `${d.project.code} · duty`, link: "/m/duties", due: d.deadline, kind: "duty" });

  // design: open site queries, drawings waiting for release
  if (hasAnyRole(user.roles, ["DESIGN"])) {
    const qs = await db.siteQuery.findMany({ where: { status: "OPEN" }, include: { project: true } });
    for (const q of qs) items.push({ key: `q:${q.id}`, title: `${q.ref}: ${q.subject}`, detail: "site query", link: `/m/site-queries/${q.id}`, due: new Date(q.createdAt.getTime() + QUERY_SLA_H * HOUR), kind: "query" });
    const revs = await db.drawingRevision.findMany({ where: { status: "UNDER_REVIEW", forConstruction: false }, include: { drawing: true } });
    for (const r of revs) items.push({ key: `dwg:${r.id}`, title: `${r.drawing.ref} Rev ${r.rev}`, detail: "drawing to review / release", link: "/m/drawings", due: new Date(r.createdAt.getTime() + 5 * 24 * HOUR), kind: "drawing" });
  }

  // supervisors: today's checklist for their projects (attendance by 10:00, safety by 12:00, report by 18:00)
  if (hasAnyRole(user.roles, ["SUP", "HVAC_SUP"])) {
    const projects = await db.project.findMany({ where: { id: { in: await myProjectIds(user) }, status: "ACTIVE" } });
    for (const p of projects) {
      const [planned, marked, safety, report] = await Promise.all([
        db.dayPlanLine.count({ where: { plan: { date: today }, siteId: p.siteId } }),
        db.attendance.count({ where: { date: today, siteId: p.siteId } }),
        db.safetyChecklist.count({ where: { date: today, projectId: p.id } }),
        db.dailyReport.count({ where: { date: today, projectId: p.id, authorId: user.id } }),
      ]);
      if (planned > marked)
        items.push({ key: `att:${p.id}`, title: `${p.code}: attendance – ${planned - marked} not marked`, link: `/m/attendance?site=${p.siteId}`, due: dubaiDateTime(today, "10:00"), kind: "attendance" });
      if (!safety) items.push({ key: `saf:${p.id}`, title: `${p.code}: safety checklist`, link: "/m/safety", due: dubaiDateTime(today, "12:00"), kind: "safety" });
      if (!report) items.push({ key: `rep:${p.id}`, title: `${p.code}: daily report`, link: `/m/daily-report?project=${p.id}`, due: dubaiDateTime(today, "18:00"), kind: "report" });
    }
  }

  // driver: vehicle check before the first trip
  if (hasAnyRole(user.roles, ["DRIVER"])) {
    const v = await db.vehicle.findFirst({ where: { defaultDriverId: user.id } });
    if (v && !(await db.vehicleCheck.count({ where: { vehicleId: v.id, date: today } })))
      items.push({ key: `vc:${v.id}`, title: `${v.name}: vehicle check`, link: "/m/vehicle-check", due: dubaiDateTime(today, "07:00"), kind: "vehicle" });
  }

  // office: bills to check
  if (hasAnyRole(user.roles, ["PE", "OPS", "ADMIN"])) {
    const n = await db.driverBill.count({ where: { status: "SUBMITTED" } });
    const oldest = await db.driverBill.findFirst({ where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } });
    if (n && oldest) items.push({ key: "bills", title: `${n} driver / supervisor bill(s) to check`, link: "/m/bills", due: new Date(oldest.createdAt.getTime() + 3 * 24 * HOUR), kind: "bills" });
  }
  return items;
}
