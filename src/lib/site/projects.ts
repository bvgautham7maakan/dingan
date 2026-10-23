import "server-only";
import { db } from "../db";
import type { CurrentUser } from "../auth/current";

/** Projects for site pickers: the user's assigned ones first (flagged), then the rest. */
export async function projectChoices(user: CurrentUser) {
  const projects = await db.project.findMany({
    where: { status: "ACTIVE" },
    include: { members: { where: { userId: user.id } } },
    orderBy: { code: "asc" },
  });
  return projects
    .map((p) => ({ id: p.id, code: p.code, name: p.name, siteId: p.siteId, mine: p.members.length > 0 || p.pmUserId === user.id }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.code.localeCompare(b.code));
}

/** Users holding a role on a project (e.g. the SE and PE to notify). Falls back to everyone with the role. */
export async function projectPeople(projectId: string, roles: string[]) {
  const members = await db.projectMember.findMany({
    where: { projectId, role: { in: roles }, user: { active: true } },
    select: { userId: true },
  });
  if (members.length) return [...new Set(members.map((m) => m.userId))];
  const users = await db.user.findMany({ where: { active: true, roles: { some: { role: { in: roles } } } }, select: { id: true } });
  return users.map((u) => u.id);
}

export async function attachFiles(entityType: string, entityId: string, fileIds: string[]) {
  if (fileIds.length) await db.attachment.createMany({ data: fileIds.map((fileId) => ({ entityType, entityId, fileId })) });
}

export async function attachmentsOf(entityType: string, entityId: string) {
  const rows = await db.attachment.findMany({ where: { entityType, entityId }, include: { file: true }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.fileId, kind: r.file.kind }));
}
