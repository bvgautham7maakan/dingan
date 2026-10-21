"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { revokeAllSessions, revokeSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export async function signOutOtherDevices() {
  const me = await requireUser();
  const count = await revokeAllSessions(me.id, me.id, me.sessionId);
  await audit({ actorId: me.id, action: "REVOKE", entityType: "Session", after: { userId: me.id, count } });
  revalidatePath("/account");
}

export async function signOutDevice(form: FormData) {
  const me = await requireUser();
  const id = z.string().min(1).parse(form.get("sessionId"));
  const s = await db.session.findFirst({ where: { id, userId: me.id } });
  if (!s) return;
  await revokeSession(id, me.id);
  await audit({ actorId: me.id, action: "REVOKE", entityType: "Session", entityId: id });
  revalidatePath("/account");
}
