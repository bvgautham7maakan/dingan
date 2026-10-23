"use server";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isLoginBlocked, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { clientIp } from "@/lib/auth/current";
import { LOCALE_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/constants";
import { audit } from "@/lib/audit";

const schema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(200),
});

export type LoginState = { error?: "invalid" | "blocked" | "inactive" };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ username: form.get("username"), password: form.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const { username, password } = parsed.data;
  const ip = await clientIp();

  if (await isLoginBlocked(username, ip)) return { error: "blocked" };

  const user = await db.user.findUnique({ where: { username } });
  const ok = user ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) {
    await recordLoginAttempt(username, ip, false);
    return { error: "invalid" };
  }
  if (!user.active) return { error: "inactive" };

  await recordLoginAttempt(username, ip, true);
  const ua = (await headers()).get("user-agent");
  const token = await createSession(user.id, ua, ip);
  await db.user.update({
    where: { id: user.id },
    data: { prevSeenAt: user.lastSeenAt, lastSeenAt: new Date() },
  });
  await audit({ actorId: user.id, action: "LOGIN", entityType: "User", entityId: user.id });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  jar.set(LOCALE_COOKIE, user.locale, { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax" });

  redirect(user.mustChangePassword ? "/change-password" : "/");
}
