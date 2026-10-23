"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { BILL_OFFICE_ROLES } from "@/lib/logistics/server";

/** Office fills in / corrects the amount (supervisor bills have none) and marks the bill checked. */
export async function checkBill(form: FormData) {
  const me = await requireRole(BILL_OFFICE_ROLES);
  const id = z.string().parse(form.get("id"));
  const amount = z.coerce.number().positive().max(100_000).parse(form.get("amount"));
  const before = await db.driverBill.findUniqueOrThrow({ where: { id } });
  const after = await db.driverBill.update({ where: { id }, data: { amountFils: Math.round(amount * 100), status: "CHECKED" } });
  await audit({ actorId: me.id, action: "EDIT", entityType: "DriverBill", entityId: id, before: { amountFils: before.amountFils, status: before.status }, after: { amountFils: after.amountFils, status: after.status } });
  redirect("/m/bills?saved=1");
}
