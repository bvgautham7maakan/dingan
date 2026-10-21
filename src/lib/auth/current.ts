import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "./constants";
import { validateSession } from "./session";
import { hasAnyRole, type Role } from "../roles";

export type CurrentUser = {
  id: string;
  sessionId: string;
  username: string;
  displayName: string;
  locale: string;
  roles: string[];
  mustChangePassword: boolean;
  prevSeenAt: Date | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const s = await validateSession(token);
  if (!s) return null;
  return {
    id: s.user.id,
    sessionId: s.id,
    username: s.user.username,
    displayName: s.user.displayName,
    locale: s.user.locale,
    roles: s.user.roles.map((r) => r.role),
    mustChangePassword: s.user.mustChangePassword,
    prevSeenAt: s.user.prevSeenAt,
  };
});

/** For pages: redirects to /login (or /change-password) when needed. */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  return u;
}

export async function requireRole(allowed: readonly Role[]) {
  const u = await requireUser();
  if (!hasAnyRole(u.roles, allowed)) redirect("/?denied=1");
  return u;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local"
  );
}
