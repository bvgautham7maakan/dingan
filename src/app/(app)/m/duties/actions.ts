"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { assignDuty, DUTY_ASSIGN_ROLES } from "@/lib/site/duties";
import { dubaiDateTime } from "@/lib/time";

export async function createDuty(form: FormData) {
  const me = await requireRole(DUTY_ASSIGN_ROLES);
  const d = z
    .object({
      projectId: z.string().min(1),
      assigneeId: z.string().min(1),
      title: z.string().trim().min(1).max(200),
      detail: z.string().trim().max(2000).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    })
    .parse({
      projectId: form.get("projectId"), assigneeId: form.get("assigneeId"), title: form.get("title"),
      detail: form.get("detail") || undefined, date: form.get("date"), time: form.get("time"),
    });
  await assignDuty(me, { projectId: d.projectId, assigneeId: d.assigneeId, title: d.title, detail: d.detail, deadline: dubaiDateTime(d.date, d.time) });
  redirect("/m/duties?assigned=1");
}
