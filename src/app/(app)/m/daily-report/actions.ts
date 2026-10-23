"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { act, ApprovalError } from "@/lib/flows";

// One action per button: the clicked button's name/value is not sent with a server action form.
export async function approveReport(form: FormData) {
  await decideReport(form, "APPROVE");
}
export async function returnReport(form: FormData) {
  await decideReport(form, "RETURN");
}

async function decideReport(form: FormData, action: "APPROVE" | "RETURN") {
  const me = await requireUser();
  const id = z.string().parse(form.get("id"));
  const flowId = z.string().parse(form.get("flowId"));
  try {
    await act(me, flowId, action, String(form.get("comment") ?? ""));
  } catch (e) {
    if (e instanceof ApprovalError) redirect(`/m/daily-report/${id}?error=${e.message}`);
    throw e;
  }
  redirect(`/m/daily-report/${id}?done=1`);
}
