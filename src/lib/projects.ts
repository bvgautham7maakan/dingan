import "server-only";
import { db } from "./db";
import { defaultProjectScope } from "./roles";
import type { CurrentUser } from "./auth/current";

export async function projectsFor(user: CurrentUser, scope?: "mine" | "all") {
  const s = scope ?? defaultProjectScope(user.roles);
  const where =
    s === "mine"
      ? { OR: [{ members: { some: { userId: user.id } } }, { pmUserId: user.id }] }
      : {};
  const projects = await db.project.findMany({
    where,
    include: { site: true, pm: { select: { displayName: true } } },
    orderBy: { code: "asc" },
  });
  return { scope: s, projects };
}
