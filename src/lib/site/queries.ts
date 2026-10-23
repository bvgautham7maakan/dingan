import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { fileByClientId } from "../files";
import { notifyRole, notifyUsers } from "../notify";
import { hasAnyRole, type Role } from "../roles";
import { MutationError } from "../attendance/server";
import { attachFiles } from "./projects";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const QUERY_RAISE_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP", "SE", "PE", "ADMIN"];
export const QUERY_ANSWER_ROLES: readonly Role[] = ["DESIGN"];
export const QUERY_VIEW_ROLES: readonly Role[] = [...QUERY_RAISE_ROLES, "DESIGN", "PM", "OPS", "COORD"];

/** Next ref per project: NBK-SQ-001 … */
async function nextRef(projectId: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const n = await db.siteQuery.count({ where: { projectId } });
  for (let i = n + 1; ; i++) {
    const ref = `${p.code}-SQ-${String(i).padStart(3, "0")}`;
    if (!(await db.siteQuery.findUnique({ where: { ref } }))) return ref;
  }
}

export async function raiseQuery(user: CurrentUser, m: MutationOf<"query.create">) {
  if (!hasAnyRole(user.roles, QUERY_RAISE_ROLES)) throw new MutationError("forbidden");
  const p = m.payload;
  const q = await db.siteQuery.create({
    data: {
      ref: await nextRef(p.projectId), projectId: p.projectId, raisedById: user.id, subject: p.subject, question: p.question,
      discipline: p.discipline ?? null, drawingRef: p.drawingRef ?? null, clientId: m.id,
    },
  });
  const files = [];
  for (const c of [...p.photoClientIds, ...(p.voiceClientId ? [p.voiceClientId] : [])]) {
    const f = await fileByClientId(c, user.id);
    if (f) files.push(f.id);
  }
  await attachFiles("SITE_QUERY", q.id, files);
  await notifyRole(QUERY_ANSWER_ROLES, { type: "QUERY", title: `${q.ref}: ${p.subject}`, link: `/m/site-queries/${q.id}`, entityType: "SITE_QUERY", entityId: q.id });
  await audit({ actorId: user.id, action: "CREATE", entityType: "SiteQuery", entityId: q.id, after: { ...p, ref: q.ref } });
  return q;
}

export async function answerQuery(user: CurrentUser, id: string, answer: string) {
  if (!hasAnyRole(user.roles, QUERY_ANSWER_ROLES)) throw new MutationError("forbidden");
  const before = await db.siteQuery.findUniqueOrThrow({ where: { id } });
  if (before.status === "CLOSED") throw new MutationError("closed");
  const q = await db.siteQuery.update({ where: { id }, data: { answer, answeredById: user.id, answeredAt: new Date(), status: "ANSWERED" } });
  await notifyUsers([q.raisedById], { type: "QUERY_ANSWERED", title: `${q.ref} answered: ${q.subject}`, link: `/m/site-queries/${q.id}`, entityType: "SITE_QUERY", entityId: q.id });
  await audit({ actorId: user.id, action: "EDIT", entityType: "SiteQuery", entityId: id, before: { answer: before.answer, status: before.status }, after: { answer, status: "ANSWERED" } });
}

export async function closeQuery(user: CurrentUser, id: string) {
  const q = await db.siteQuery.findUniqueOrThrow({ where: { id } });
  if (q.raisedById !== user.id && !hasAnyRole(user.roles, ["SE", "PE", "ADMIN"])) throw new MutationError("forbidden");
  await db.siteQuery.update({ where: { id }, data: { status: "CLOSED", closedAt: new Date() } });
  await audit({ actorId: user.id, action: "EDIT", entityType: "SiteQuery", entityId: id, after: { status: "CLOSED" } });
}

export async function listQueries(user: CurrentUser, projectId?: string) {
  const own = !hasAnyRole(user.roles, ["DESIGN", "SE", "PE", "PM", "OPS", "COORD", "ADMIN", "HEAD_SUP"]);
  const rows = await db.siteQuery.findMany({
    where: { ...(projectId ? { projectId } : {}), ...(own ? { raisedById: user.id } : {}) },
    include: { project: true, raisedBy: { select: { displayName: true } }, answeredBy: { select: { displayName: true } } },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((q) => ({
    id: q.id, ref: q.ref, project: q.project.code, subject: q.subject, question: q.question, discipline: q.discipline, drawingRef: q.drawingRef,
    status: q.status, raisedBy: q.raisedBy.displayName, createdAt: q.createdAt.toISOString(), answer: q.answer,
    answeredBy: q.answeredBy?.displayName ?? null, answeredAt: q.answeredAt?.toISOString() ?? null,
  }));
}
