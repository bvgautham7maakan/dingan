"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { revokeSession } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { audit } from "@/lib/audit";

export async function logout() {
  const me = await getCurrentUser();
  if (me) {
    await revokeSession(me.sessionId, me.id);
    await audit({ actorId: me.id, action: "LOGOUT", entityType: "Session", entityId: me.sessionId });
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
