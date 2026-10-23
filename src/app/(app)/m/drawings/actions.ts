"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/current";
import { DRAWING_RELEASE_ROLES, releaseForConstruction } from "@/lib/drawings/server";

export async function release(form: FormData) {
  const me = await requireRole(DRAWING_RELEASE_ROLES);
  const id = z.string().parse(form.get("revisionId"));
  await releaseForConstruction(me, id);
  redirect(`/m/drawings?project=${form.get("project") ?? ""}&released=1`);
}
