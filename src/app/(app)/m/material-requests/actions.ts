"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { audit } from "@/lib/audit";
import { act, ApprovalError } from "@/lib/flows";
import { resolveAlert, setLpo, setRates } from "@/lib/materials/server";
import { MutationError } from "@/lib/attendance/server";

const back = (id: string, q: string): never => redirect(`/m/material-requests/${id}${q}`);

async function decide(form: FormData, action: "APPROVE" | "RETURN") {
  const me = await requireUser();
  const id = z.string().parse(form.get("id"));
  const flowId = z.string().parse(form.get("flowId"));
  try {
    // the estimator saves rates and the buyer the LPO number in the same click
    const rates = Object.fromEntries(
      [...form.entries()].filter(([k, v]) => k.startsWith("rate:") && v !== "").map(([k, v]) => [k.slice(5), Number(v)]),
    );
    if (Object.keys(rates).length) await setRates(me, id, rates);
    const lpo = String(form.get("lpoNo") ?? "").trim();
    if (lpo) await setLpo(me, id, lpo);
    await act(me, flowId, action, String(form.get("comment") ?? ""));
  } catch (e) {
    if (e instanceof ApprovalError || e instanceof MutationError) back(id, `?error=${e.message}`);
    throw e;
  }
  back(id, "?done=1");
}

// One action per button: the clicked button's value is not sent with a server action form.
export async function approveMR(form: FormData) {
  await decide(form, "APPROVE");
}
export async function returnMR(form: FormData) {
  await decide(form, "RETURN");
}

export async function resolve(form: FormData) {
  const me = await requireUser();
  const id = z.string().parse(form.get("id"));
  await resolveAlert(me, z.string().parse(form.get("alertId")), z.string().trim().min(1).max(500).parse(form.get("resolution")));
  back(id, "");
}

export async function closeMR(form: FormData) {
  const me = await requireUser();
  const id = z.string().parse(form.get("id"));
  const r = await db.materialRequest.findUniqueOrThrow({ where: { id } });
  if (r.requesterId !== me.id || r.status !== "RETURNED") back(id, "?error=forbidden");
  await db.materialRequest.update({ where: { id }, data: { status: "CLOSED" } });
  await audit({ actorId: me.id, action: "EDIT", entityType: "MaterialRequest", entityId: id, after: { status: "CLOSED" } });
  back(id, "");
}
