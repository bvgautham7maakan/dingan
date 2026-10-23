import { z } from "zod";
import { withUser, jsonFor } from "@/lib/api";
import { db } from "@/lib/db";
import { flowView } from "@/lib/flows";
import { projectChoices } from "@/lib/site/projects";
import { manpowerFromAttendance, REPORT_WRITE_ROLES } from "@/lib/site/reports";

const q = z.object({ project: z.string().optional(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

// Data for the supervisor's 4-step daily report (cached on the phone).
export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const { project, date } = q.parse({ project: sp.get("project") || undefined, date: sp.get("date") });
  const projects = await projectChoices(user);
  const projectId = project ?? projects[0]?.id;
  const subs = await db.subcontractor.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const existing = projectId
    ? await db.dailyReport.findUnique({ where: { projectId_date_authorId: { projectId, date, authorId: user.id } } })
    : null;
  const flow = existing ? await flowView(user, "DAILY_REPORT", existing.id) : null;
  const returnedComment = flow?.steps.find((s) => s.status === "RETURNED")?.comment ?? null;
  return jsonFor(user, {
    date,
    projectId,
    projects,
    subs: subs.map((s) => s.name),
    attendance: projectId ? await manpowerFromAttendance(projectId, date) : null,
    existing: existing && { id: existing.id, status: existing.status, workDone: existing.workDone, issues: existing.issues, nextDay: existing.nextDay, manpower: existing.manpower, returnedComment, flow },
  });
}, REPORT_WRITE_ROLES);
