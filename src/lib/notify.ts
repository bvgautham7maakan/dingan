import "server-only";
import { db } from "./db";
import type { Role } from "./roles";

type Note = { type: string; title: string; body?: string; link?: string; entityType?: string; entityId?: string };

export async function notifyUsers(userIds: string[], n: Note) {
  const unique = [...new Set(userIds)];
  if (unique.length) await db.notification.createMany({ data: unique.map((userId) => ({ userId, ...n })) });
}

/** Notifies every active user holding one of the roles (optionally only one assignee). */
export async function notifyRole(roles: readonly Role[], n: Note, assigneeId?: string | null) {
  if (assigneeId) return notifyUsers([assigneeId], n);
  const users = await db.user.findMany({ where: { active: true, roles: { some: { role: { in: [...roles] } } } }, select: { id: true } });
  await notifyUsers(users.map((u) => u.id), n);
}
