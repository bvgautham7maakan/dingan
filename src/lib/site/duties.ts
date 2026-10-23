import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { fileByClientId } from "../files";
import { notifyUsers } from "../notify";
import { hasAnyRole, type Role } from "../roles";
import { MutationError } from "../attendance/server";
import { projectPeople } from "./projects";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const DUTY_ASSIGN_ROLES: readonly Role[] = ["HEAD_SUP", "ADMIN"];
export const DUTY_VIEW_ROLES: readonly Role[] = ["HEAD_SUP", "SUP", "HVAC_SUP", "SE", "PE", "PM", "ADMIN", "COORD"];

export async function assignDuty(user: CurrentUser, d: { projectId: string; assigneeId: string; title: string; detail?: string; deadline: Date }) {
  if (!hasAnyRole(user.roles, DUTY_ASSIGN_ROLES)) throw new MutationError("forbidden");
  const duty = await db.duty.create({ data: { ...d, detail: d.detail ?? null, assignedById: user.id } });
  await notifyUsers([d.assigneeId], { type: "DUTY", title: `New duty: ${d.title}`, link: "/m/duties", entityType: "DUTY", entityId: duty.id });
  await audit({ actorId: user.id, action: "CREATE", entityType: "Duty", entityId: duty.id, after: d });
  return duty;
}

/** Supervisor marks a duty done with a photo; SE and PE of the project are told. */
export async function completeDuty(user: CurrentUser, m: MutationOf<"duty.done">) {
  const duty = await db.duty.findUnique({ where: { id: m.payload.dutyId }, include: { project: true } });
  if (!duty) throw new MutationError("duty_not_found");
  if (duty.assigneeId !== user.id && !hasAnyRole(user.roles, DUTY_ASSIGN_ROLES)) throw new MutationError("not_your_duty");
  if (duty.status !== "OPEN") return;
  const photo = await fileByClientId(m.payload.photoClientId, user.id);
  if (!photo) throw new MutationError("photo_required");
  await db.duty.update({ where: { id: duty.id }, data: { status: "DONE", doneAt: new Date(), donePhotoId: photo.id, doneNote: m.payload.note ?? null } });
  const late = duty.deadline < new Date() ? " (after deadline)" : "";
  const people = await projectPeople(duty.projectId, ["SE", "PE"]);
  await notifyUsers([...people, duty.assignedById], {
    type: "DUTY_DONE", title: `${duty.project.code}: duty done${late} – ${duty.title}`, link: "/m/duties", entityType: "DUTY", entityId: duty.id,
  });
  await audit({ actorId: user.id, action: "EDIT", entityType: "Duty", entityId: duty.id, after: { status: "DONE", note: m.payload.note } });
}

export async function listDuties(user: CurrentUser) {
  const all = hasAnyRole(user.roles, ["HEAD_SUP", "SE", "PE", "PM", "ADMIN", "COORD"]);
  const since = new Date(Date.now() - 14 * 86_400_000);
  const duties = await db.duty.findMany({
    where: { ...(all ? {} : { assigneeId: user.id }), OR: [{ status: "OPEN" }, { doneAt: { gte: since } }] },
    include: { project: true, assignee: { select: { displayName: true } }, assignedBy: { select: { displayName: true } } },
    orderBy: [{ status: "desc" }, { deadline: "asc" }],
  });
  const now = Date.now();
  return duties.map((d) => ({
    id: d.id, project: d.project.code, title: d.title, detail: d.detail, assignee: d.assignee.displayName, assigneeId: d.assigneeId,
    assignedBy: d.assignedBy.displayName, deadline: d.deadline.toISOString(), status: d.status,
    overdue: d.status === "OPEN" && d.deadline.getTime() < now, doneAt: d.doneAt?.toISOString() ?? null,
    donePhotoId: d.donePhotoId, doneNote: d.doneNote, mine: d.assigneeId === user.id,
  }));
}
