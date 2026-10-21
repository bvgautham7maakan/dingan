"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { hashPassword, tempPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { ROLES } from "@/lib/roles";

/** Temporary passwords are handed to the next page in a 2-minute httpOnly cookie, never in the URL. */
async function flashPassword(userId: string, pw: string) {
  (await cookies()).set("kem_flash_pw", JSON.stringify({ userId, pw }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/admin/users",
    maxAge: 120,
  });
}

const roleList = z.array(z.enum(ROLES)).min(1);

const newUser = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/),
  displayName: z.string().trim().min(1).max(60),
  fullName: z.string().trim().max(100).optional(),
  roles: roleList,
});

export async function createUser(form: FormData) {
  const me = await requireRole(["ADMIN"]);
  const data = newUser.parse({
    username: form.get("username"),
    displayName: form.get("displayName"),
    fullName: form.get("fullName") || undefined,
    roles: form.getAll("roles"),
  });
  const pw = tempPassword();
  const u = await db.user.create({
    data: {
      username: data.username,
      displayName: data.displayName,
      fullName: data.fullName,
      passwordHash: await hashPassword(pw),
      mustChangePassword: true,
      roles: { create: data.roles.map((role) => ({ role })) },
    },
  });
  await audit({ actorId: me.id, action: "CREATE", entityType: "User", entityId: u.id, after: { ...data } });
  await flashPassword(u.id, pw);
  redirect(`/admin/users/${u.id}`);
}

export async function updateRoles(form: FormData) {
  const me = await requireRole(["ADMIN"]);
  const id = z.string().parse(form.get("id"));
  const roles = roleList.parse(form.getAll("roles"));
  const before = await db.userRole.findMany({ where: { userId: id } });
  await db.$transaction([
    db.userRole.deleteMany({ where: { userId: id } }),
    db.userRole.createMany({ data: roles.map((role) => ({ userId: id, role })) }),
  ]);
  await audit({
    actorId: me.id,
    action: "EDIT",
    entityType: "User",
    entityId: id,
    before: { roles: before.map((r) => r.role) },
    after: { roles },
  });
  revalidatePath(`/admin/users/${id}`);
}

export async function resetPassword(form: FormData) {
  const me = await requireRole(["ADMIN"]);
  const id = z.string().parse(form.get("id"));
  const pw = tempPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true } });
  await revokeAllSessions(id, me.id);
  await audit({ actorId: me.id, action: "PASSWORD_RESET", entityType: "User", entityId: id });
  await flashPassword(id, pw);
  redirect(`/admin/users/${id}`);
}

/** ADMIN or PM: sign a user out of every device. */
export async function signOutAllDevices(form: FormData) {
  const me = await requireRole(["ADMIN", "PM"]);
  const id = z.string().parse(form.get("id"));
  const count = await revokeAllSessions(id, me.id);
  await audit({ actorId: me.id, action: "REVOKE", entityType: "User", entityId: id, after: { count } });
  redirect(`/admin/users/${id}?revoked=${count}`);
}

export async function setActive(form: FormData) {
  const me = await requireRole(["ADMIN"]);
  const id = z.string().parse(form.get("id"));
  const active = form.get("active") === "true";
  if (id === me.id && !active) redirect(`/admin/users/${id}`);
  await db.user.update({ where: { id }, data: { active } });
  if (!active) await revokeAllSessions(id, me.id);
  await audit({ actorId: me.id, action: "EDIT", entityType: "User", entityId: id, after: { active } });
  redirect(`/admin/users/${id}${active ? "" : "?deactivated=1"}`);
}
