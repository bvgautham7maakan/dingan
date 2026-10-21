"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { PLAN_ROLES } from "@/lib/attendance/server";
import { SHIFTS } from "@/lib/attendance/types";
import { audit } from "@/lib/audit";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Saves the whole day plan: one line per worker that has a site. */
export async function savePlan(form: FormData) {
  const me = await requireRole(PLAN_ROLES);
  const date = day.parse(form.get("date"));
  const workerIds = z.array(z.string()).parse(form.getAll("worker"));
  const lines = workerIds
    .map((workerId) => ({
      workerId,
      siteId: String(form.get(`site:${workerId}`) ?? ""),
      vehicleId: String(form.get(`vehicle:${workerId}`) ?? "") || null,
      shift: z.enum(SHIFTS).catch("DAY").parse(form.get(`shift:${workerId}`)),
    }))
    .filter((l) => l.siteId);

  const before = await db.dayPlan.findUnique({ where: { date }, include: { lines: true } });
  const plan = await db.dayPlan.upsert({
    where: { date },
    update: { status: "FINAL" },
    create: { date, createdById: me.id, status: "FINAL" },
  });
  await db.$transaction([
    db.dayPlanLine.deleteMany({ where: { planId: plan.id } }),
    db.dayPlanLine.createMany({ data: lines.map((l) => ({ ...l, planId: plan.id })) }),
  ]);
  await audit({
    actorId: me.id, action: before ? "EDIT" : "CREATE", entityType: "DayPlan", entityId: plan.id,
    before: before?.lines.map(({ workerId, siteId, vehicleId, shift }) => ({ workerId, siteId, vehicleId, shift })),
    after: lines,
  });
  redirect(`/m/plan?date=${date}&saved=1`);
}

/** Copies the most recent earlier plan into this date (does not save until the user presses Save). */
export async function copyPrevious(form: FormData) {
  await requireRole(PLAN_ROLES);
  const date = day.parse(form.get("date"));
  const prev = await db.dayPlan.findFirst({ where: { date: { lt: date } }, orderBy: { date: "desc" } });
  redirect(`/m/plan?date=${date}${prev ? `&from=${prev.date}` : "&nofrom=1"}`);
}
