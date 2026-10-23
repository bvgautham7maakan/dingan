"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { act, ApprovalError } from "@/lib/flows";
import { PLAN_APPROVER, submitPlan, touchPlan, TRIP_EDIT_ROLES } from "@/lib/logistics/server";
import { dubaiDateTime } from "@/lib/time";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const back = (date: string, q = "") => redirect(`/m/vehicle-plan?date=${date}${q}`);

export async function addTrip(form: FormData) {
  const me = await requireRole(TRIP_EDIT_ROLES);
  const d = z
    .object({
      date: day, vehicleId: z.string().min(1), driverId: z.string().optional(), fromSiteId: z.string().min(1), toSiteId: z.string().min(1),
      out: hhmm, back: hhmm, purpose: z.string().max(200).optional(), materials: z.string().max(1000).optional(),
      passengers: z.array(z.string()),
    })
    .parse({
      date: form.get("date"), vehicleId: form.get("vehicleId"), driverId: form.get("driverId") || undefined,
      fromSiteId: form.get("fromSiteId"), toSiteId: form.get("toSiteId"), out: form.get("out"), back: form.get("back"),
      purpose: form.get("purpose") || undefined, materials: form.get("materials") || undefined, passengers: form.getAll("passengers").map(String),
    });
  const plannedOut = dubaiDateTime(d.date, d.out);
  const plannedReturn = dubaiDateTime(d.date, d.back, d.back <= d.out ? 1 : 0);
  const plan = await touchPlan(me, d.date);
  const trip = await db.trip.create({
    data: {
      planId: plan.id, date: d.date, vehicleId: d.vehicleId, driverId: d.driverId ?? null, fromSiteId: d.fromSiteId, toSiteId: d.toSiteId,
      plannedOut, plannedReturn, purpose: d.purpose ?? null, materialsText: d.materials ?? null, createdById: me.id,
      passengers: { create: d.passengers.map((workerId) => ({ workerId })) },
    },
  });
  await audit({ actorId: me.id, action: "CREATE", entityType: "Trip", entityId: trip.id, after: d });
  back(d.date, "&saved=1");
}

export async function cancelTrip(form: FormData) {
  const me = await requireRole(TRIP_EDIT_ROLES);
  const id = z.string().parse(form.get("id"));
  const trip = await db.trip.update({ where: { id }, data: { status: "CANCELLED" } });
  await touchPlan(me, trip.date);
  await audit({ actorId: me.id, action: "EDIT", entityType: "Trip", entityId: id, after: { status: "CANCELLED" } });
  back(trip.date);
}

export async function submitForApproval(form: FormData) {
  const me = await requireRole(TRIP_EDIT_ROLES);
  const date = day.parse(form.get("date"));
  await submitPlan(me, date);
  back(date, "&submitted=1");
}

// One action per button: the clicked button's name/value is not sent with a server action form.
export async function approvePlan(form: FormData) {
  await decidePlan(form, "APPROVE");
}
export async function returnPlan(form: FormData) {
  await decidePlan(form, "RETURN");
}

async function decidePlan(form: FormData, action: "APPROVE" | "RETURN") {
  const me = await requireRole([PLAN_APPROVER]);
  const date = day.parse(form.get("date"));
  const flowId = z.string().parse(form.get("flowId"));
  try {
    await act(me, flowId, action, String(form.get("comment") ?? ""));
  } catch (e) {
    if (e instanceof ApprovalError) back(date, `&error=${e.message}`);
    throw e;
  }
  back(date);
}
