import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { fileByClientId } from "../files";
import { notifyRole } from "../notify";
import { hasAnyRole, type Role } from "../roles";
import { MutationError } from "../attendance/server";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const SAFETY_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP", "SE", "PE", "ADMIN"];

/** Daily safety checklist. Any "Issue" needs a note and a photo, and alerts Renjith + SE. */
export async function submitSafety(user: CurrentUser, m: MutationOf<"safety.submit">) {
  if (!hasAnyRole(user.roles, SAFETY_ROLES)) throw new MutationError("forbidden");
  const p = m.payload;
  const issues = p.items.filter((i) => i.result === "ISSUE");
  if (issues.some((i) => !i.note?.trim())) throw new MutationError("issue_note_required");
  const photo = await fileByClientId(p.photoClientId, user.id);
  if (issues.length && !photo) throw new MutationError("issue_photo_required");
  const row = await db.safetyChecklist.create({
    data: { projectId: p.projectId, date: p.date, byId: user.id, items: p.items, issues: issues.length, photoId: photo?.id ?? null, clientId: m.id },
    include: { project: true },
  });
  if (issues.length)
    await notifyRole(["HEAD_SUP", "SE"], {
      type: "SAFETY", title: `${row.project.code}: ${issues.length} safety issue(s) – ${user.displayName}`, link: "/m/safety", entityType: "SAFETY", entityId: row.id,
    });
  await audit({ actorId: user.id, action: "CREATE", entityType: "SafetyChecklist", entityId: row.id, after: p });
}
