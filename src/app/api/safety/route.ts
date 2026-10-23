import { z } from "zod";
import { withUser, jsonFor } from "@/lib/api";
import { db } from "@/lib/db";
import { projectChoices } from "@/lib/site/projects";
import { SAFETY_ROLES } from "@/lib/site/safety";
import { dubaiHHMM } from "@/lib/time";

export const GET = withUser(async (user, req) => {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(new URL(req.url).searchParams.get("date"));
  const done = await db.safetyChecklist.findMany({ where: { date }, include: { project: true, by: { select: { displayName: true } } }, orderBy: { createdAt: "desc" } });
  return jsonFor(user, {
    date,
    projects: await projectChoices(user),
    done: done.map((d) => ({ id: d.id, project: d.project.code, projectId: d.projectId, by: d.by.displayName, issues: d.issues, time: dubaiHHMM(d.createdAt) })),
  });
}, SAFETY_ROLES);
