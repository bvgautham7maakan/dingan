import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { fileByClientId } from "../files";
import { flowView, registerFlow, startFlow } from "../approvals";
import { hasAnyRole, type Role } from "../roles";
import { MutationError } from "../attendance/server";
import { attachFiles, attachmentsOf, projectPeople } from "./projects";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const REPORT_WRITE_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP"];
export const REPORT_VIEW_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP", "SE", "PE", "PM", "OPS", "BUL", "COORD", "ADMIN"];

registerFlow("DAILY_REPORT", {
  link: (id) => `/m/daily-report/${id}`,
  title: async (id) => {
    const r = await db.dailyReport.findUnique({ where: { id }, include: { project: true, author: true } });
    return r ? `Daily report ${r.project.code} ${r.date.split("-").reverse().join("-")} (${r.author.displayName})` : "Daily report";
  },
  onApproved: async (id) => void (await db.dailyReport.update({ where: { id }, data: { status: "APPROVED" } })),
  onReturnedToRequester: async (id) => void (await db.dailyReport.update({ where: { id }, data: { status: "RETURNED" } })),
});

/** Attendance at the project's site that day – the report's manpower step starts from this. */
export async function manpowerFromAttendance(projectId: string, date: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const rows = await db.attendance.findMany({ where: { date, siteId: project.siteId }, include: { worker: true } });
  const moves = await db.manpowerMove.findMany({
    where: { date, status: { not: "RETURNED" }, OR: [{ fromSiteId: project.siteId }, { toSiteId: project.siteId }] },
    include: { _count: { select: { workers: true } } },
  });
  return {
    present: rows.filter((r) => r.status !== "OUT").length,
    late: rows.filter((r) => r.status === "LATE").length,
    leave: rows.filter((r) => r.status === "OUT").map((r) => `${r.worker.name} (${r.leaveCode})`),
    movedIn: moves.filter((m) => m.toSiteId === project.siteId).reduce((a, m) => a + m._count.workers, 0),
    movedOut: moves.filter((m) => m.fromSiteId === project.siteId).reduce((a, m) => a + m._count.workers, 0),
  };
}

/** Supervisor submits (or re-submits after a return): Supervisor → Head supervisor → Site engineer. */
export async function submitReport(user: CurrentUser, m: MutationOf<"report.submit">) {
  if (!hasAnyRole(user.roles, REPORT_WRITE_ROLES)) throw new MutationError("forbidden");
  const p = m.payload;
  const existing = await db.dailyReport.findUnique({ where: { projectId_date_authorId: { projectId: p.projectId, date: p.date, authorId: user.id } } });
  if (existing && existing.status !== "RETURNED" && existing.status !== "DRAFT") throw new MutationError("already_submitted");
  const auto = await manpowerFromAttendance(p.projectId, p.date);
  const data = {
    manpower: { ...p.manpower, attendance: auto, materialsNeeded: p.materialsNeeded ?? null },
    workDone: p.workDone, issues: p.issues ?? null, nextDay: p.nextDay ?? null, status: "UNDER_REVIEW",
  };
  const report = existing
    ? await db.dailyReport.update({ where: { id: existing.id }, data })
    : await db.dailyReport.create({ data: { ...data, projectId: p.projectId, date: p.date, authorId: user.id, clientId: m.id } });

  const files = [];
  for (const c of [...p.photoClientIds, ...(p.voiceClientId ? [p.voiceClientId] : [])]) {
    const f = await fileByClientId(c, user.id);
    if (f) files.push(f.id);
  }
  await attachFiles("DAILY_REPORT", report.id, files);

  await db.approvalFlow.deleteMany({ where: { entityType: "DAILY_REPORT", entityId: report.id } });
  const se = await projectPeople(p.projectId, ["SE"]);
  const steps: { label: string; role: Role; assigneeId?: string | null }[] = [];
  if (!hasAnyRole(user.roles, ["HEAD_SUP"])) steps.push({ label: "Head supervisor check", role: "HEAD_SUP" });
  steps.push({ label: "Site engineer check", role: "SE", assigneeId: se.length === 1 ? se[0] : null });
  await startFlow("DAILY_REPORT", report.id, "DAILY_REPORT", steps, user);
  await audit({ actorId: user.id, action: existing ? "EDIT" : "CREATE", entityType: "DailyReport", entityId: report.id, after: p });
}

export async function reportDetail(user: CurrentUser, id: string) {
  const r = await db.dailyReport.findUnique({ where: { id }, include: { project: true, author: { select: { displayName: true } } } });
  if (!r) return null;
  return { ...r, attachments: await attachmentsOf("DAILY_REPORT", id), flow: await flowView(user, "DAILY_REPORT", id) };
}
