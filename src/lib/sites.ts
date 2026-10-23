import "server-only";
import { db } from "./db";

/** The user's assigned project site, else the first project site. */
export async function defaultSiteFor(userId: string, requested?: string | null) {
  if (requested) {
    const s = await db.site.findUnique({ where: { id: requested } });
    if (s) return s;
  }
  const m = await db.projectMember.findFirst({
    where: { userId, project: { status: "ACTIVE" } },
    include: { project: { include: { site: true } } },
    orderBy: { project: { code: "asc" } },
  });
  return m?.project.site ?? db.site.findFirstOrThrow({ where: { kind: "PROJECT", active: true }, orderBy: { name: "asc" } });
}
