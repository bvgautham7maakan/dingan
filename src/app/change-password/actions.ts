"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

export type PwState = { error?: string };

export async function changePassword(_prev: PwState, form: FormData): Promise<PwState> {
  const me = await requireUser({ allowPasswordChange: true });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("new") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next !== confirm) return { error: "mismatch" };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await verifyPassword(user.passwordHash, current))) return { error: "wrongCurrent" };

  await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });
  // other devices must sign in again with the new password
  await revokeAllSessions(me.id, me.id, me.sessionId);
  await audit({ actorId: me.id, action: "PASSWORD_CHANGE", entityType: "User", entityId: me.id });
  redirect("/");
}
