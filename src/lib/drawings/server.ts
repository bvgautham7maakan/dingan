import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { saveUpload } from "../files";
import { notifyRole } from "../notify";
import { hasAnyRole, type Role } from "../roles";
import { MutationError } from "../attendance/server";
import { dist, lengthMm, type Pt } from "./measure";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const DRAWING_VIEW_ROLES: readonly Role[] = ["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "COORD", "DESIGN", "EST", "HEAD_SUP", "SUP", "HVAC_SUP"];
export const DRAWING_UPLOAD_ROLES: readonly Role[] = ["DESIGN", "COORD", "PE", "ADMIN"];
export const DRAWING_RELEASE_ROLES: readonly Role[] = ["DESIGN"];
/** Site roles see only revisions released "For construction". */
export const FC_ONLY_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP"];
export const DOC_TYPES = ["SHD", "DD", "ASB", "SK"] as const;
export const DISCIPLINES = ["ELE", "PLB", "HVAC", "FLS", "GEN"] as const;
export const MAX_PDF_BYTES = 60 * 1024 * 1024;

export const fcOnly = (user: CurrentUser) => hasAnyRole(user.roles, FC_ONLY_ROLES) && !hasAnyRole(user.roles, ["SE", "PE", "ADMIN", "DESIGN", "COORD"]);

/** Ref like NBK-SHD-HVAC-005; number auto-increments per project / type / discipline. */
export async function nextDrawingRef(projectId: string, docType: string, discipline: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const prefix = `${p.code}-${docType}-${discipline}-`;
  const existing = await db.drawing.findMany({ where: { ref: { startsWith: prefix } }, select: { number: true } });
  const max = existing.reduce((a, d) => Math.max(a, Number(d.number) || 0), 0);
  const number = String(max + 1).padStart(3, "0");
  return { ref: prefix + number, number };
}

export async function uploadRevision(
  user: CurrentUser,
  d: { drawingId?: string; projectId?: string; docType?: string; discipline?: string; title?: string; rev: string; status: string; notes?: string; buf: Buffer; name?: string },
) {
  if (!hasAnyRole(user.roles, DRAWING_UPLOAD_ROLES)) throw new MutationError("forbidden");
  let drawing = d.drawingId ? await db.drawing.findUnique({ where: { id: d.drawingId } }) : null;
  if (!drawing) {
    if (!d.projectId || !d.docType || !d.discipline || !d.title) throw new MutationError("missing_fields");
    const { ref, number } = await nextDrawingRef(d.projectId, d.docType, d.discipline);
    drawing = await db.drawing.create({ data: { ref, number, projectId: d.projectId, title: d.title, discipline: d.discipline, docType: d.docType, createdById: user.id } });
  }
  if (await db.drawingRevision.findUnique({ where: { drawingId_rev: { drawingId: drawing.id, rev: d.rev } } })) throw new MutationError("revision_exists");
  const file = await saveUpload({ buf: d.buf, module: "drawings", userId: user.id, projectId: drawing.projectId, originalName: d.name, allow: ["PDF"] });
  const rev = await db.drawingRevision.create({
    data: { drawingId: drawing.id, rev: d.rev, status: d.status, fileId: file.id, notes: d.notes ?? null, uploadedById: user.id },
  });
  await audit({ actorId: user.id, action: "CREATE", entityType: "DrawingRevision", entityId: rev.id, after: { ref: drawing.ref, rev: d.rev, status: d.status } });
  return { drawing, rev };
}

/** Design marks a revision "For construction": it becomes the one site roles see. */
export async function releaseForConstruction(user: CurrentUser, revisionId: string) {
  if (!hasAnyRole(user.roles, DRAWING_RELEASE_ROLES)) throw new MutationError("forbidden");
  const rev = await db.drawingRevision.findUniqueOrThrow({ where: { id: revisionId }, include: { drawing: { include: { project: true } } } });
  await db.drawingRevision.updateMany({ where: { drawingId: rev.drawingId, forConstruction: true }, data: { forConstruction: false, status: "CLOSED" } });
  await db.drawingRevision.update({ where: { id: revisionId }, data: { forConstruction: true, status: "APPROVED", releasedById: user.id, releasedAt: new Date() } });
  await notifyRole(["SE", "HEAD_SUP", "SUP", "HVAC_SUP"], {
    type: "DRAWING", title: `${rev.drawing.ref} Rev ${rev.rev} released for construction`, link: `/m/drawings/${revisionId}`, entityType: "DRAWING", entityId: revisionId,
  });
  await audit({ actorId: user.id, action: "APPROVE", entityType: "DrawingRevision", entityId: revisionId, after: { forConstruction: true } });
}

export async function listDrawings(user: CurrentUser, projectId?: string) {
  const onlyFc = fcOnly(user);
  const drawings = await db.drawing.findMany({
    where: { ...(projectId ? { projectId } : {}), ...(onlyFc ? { revisions: { some: { forConstruction: true } } } : {}) },
    include: { project: true, revisions: { orderBy: { createdAt: "desc" }, include: { file: { select: { size: true } } } } },
    orderBy: [{ project: { code: "asc" } }, { ref: "asc" }],
  });
  return drawings.map((d) => {
    const revs = onlyFc ? d.revisions.filter((r) => r.forConstruction) : d.revisions;
    const fc = d.revisions.find((r) => r.forConstruction);
    return {
      id: d.id, ref: d.ref, title: d.title, discipline: d.discipline, docType: d.docType, project: d.project.code, projectId: d.projectId,
      fcRevisionId: fc?.id ?? null,
      revisions: revs.map((r) => ({ id: r.id, rev: r.rev, status: r.status, forConstruction: r.forConstruction, fileId: r.fileId, size: r.file.size, releasedAt: r.releasedAt?.toISOString() ?? null })),
    };
  });
}

export async function revisionView(user: CurrentUser, revisionId: string) {
  const rev = await db.drawingRevision.findUnique({
    where: { id: revisionId },
    include: {
      drawing: { include: { project: true, revisions: { select: { id: true, rev: true, forConstruction: true }, orderBy: { createdAt: "desc" } } } },
      calibrations: true,
      measurements: { include: { by: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!rev) return null;
  if (fcOnly(user) && !rev.forConstruction) return "forbidden" as const;
  return {
    id: rev.id, rev: rev.rev, status: rev.status, forConstruction: rev.forConstruction, fileId: rev.fileId,
    ref: rev.drawing.ref, title: rev.drawing.title, project: rev.drawing.project.code,
    otherRevisions: rev.drawing.revisions.filter((r) => !fcOnly(user) || r.forConstruction),
    calibrations: rev.calibrations.map((c) => ({ page: c.page, pxLength: c.pxLength, realMm: c.realMm })),
    measurements: rev.measurements.map((m) => ({ id: m.id, page: m.page, points: m.points as Pt[], lengthMm: m.lengthMm, label: m.label, by: m.by.displayName })),
  };
}

async function viewableRevision(user: CurrentUser, revisionId: string) {
  const rev = await db.drawingRevision.findUnique({ where: { id: revisionId } });
  if (!rev) throw new MutationError("revision_not_found");
  if (!hasAnyRole(user.roles, DRAWING_VIEW_ROLES) || (fcOnly(user) && !rev.forConstruction)) throw new MutationError("forbidden");
  return rev;
}

/** Calibration: two points on a known dimension. Saved per page; anyone who can view may calibrate. */
export async function calibrate(user: CurrentUser, m: MutationOf<"drawing.calibrate">) {
  await viewableRevision(user, m.payload.revisionId);
  const [a, b] = m.payload.points;
  const pxLength = dist(a, b);
  if (pxLength < 2) throw new MutationError("points_too_close");
  const data = { pxLength, realMm: m.payload.realMm, byId: user.id };
  await db.drawingCalibration.upsert({
    where: { revisionId_page: { revisionId: m.payload.revisionId, page: m.payload.page } },
    update: data,
    create: { revisionId: m.payload.revisionId, page: m.payload.page, ...data },
  });
  await audit({ actorId: user.id, action: "EDIT", entityType: "DrawingCalibration", entityId: m.payload.revisionId, after: { page: m.payload.page, pxLength, realMm: m.payload.realMm } });
}

/** Measurement in mm from the page's calibration; saved with the drawing. */
export async function measure(user: CurrentUser, m: MutationOf<"drawing.measure">) {
  await viewableRevision(user, m.payload.revisionId);
  const cal = await db.drawingCalibration.findUnique({ where: { revisionId_page: { revisionId: m.payload.revisionId, page: m.payload.page } } });
  if (!cal) throw new MutationError("calibrate_first");
  const mm = lengthMm(m.payload.points as Pt[], cal);
  await db.drawingMeasurement.create({
    data: { revisionId: m.payload.revisionId, page: m.payload.page, points: m.payload.points, lengthMm: mm, label: m.payload.label ?? null, byId: user.id, clientId: m.id },
  });
}
