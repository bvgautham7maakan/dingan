import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { flowView, registerFlow, startFlow, type StepSpec } from "../approvals";
import { notifyRole, notifyUsers } from "../notify";
import { hasAnyRole, HIGH_ALERT_ROLES, type Role } from "../roles";
import { MutationError } from "../attendance/server";
import { APPROVED_MS, checkLine, needsBul } from "./rules";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const MR_CREATE_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP", "SE", "PE", "ADMIN"];
export const MR_VIEW_ROLES: readonly Role[] = [...MR_CREATE_ROLES, "EST", "PM", "OPS", "BUL", "PROC", "COORD"];
export const MASTER_EDIT_ROLES: readonly Role[] = ["ADMIN", "PE", "SE", "COORD"];
export const BOQ_EDIT_ROLES: readonly Role[] = ["ADMIN", "PE", "SE", "EST"];
export const LABEL = { check: "SE / PE check", est: "Estimator – budget & rates", pm: "Project Manager", ops: "Operations Manager", bul: "BUL (above threshold)", proc: "Procurement – order / LPO" };

export async function bulThreshold(projectId: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (p.bulThresholdFils != null) return p.bulThresholdFils;
  const s = await db.setting.findUnique({ where: { key: "bulThresholdFils" } });
  return typeof s?.value === "number" ? s.value : 100_000 * 100;
}

async function totalOf(requestId: string) {
  const lines = await db.materialRequestLine.findMany({ where: { requestId } });
  if (lines.some((l) => l.rateFils == null)) return null;
  return Math.round(lines.reduce((a, l) => a + l.qty * (l.rateFils ?? 0), 0));
}

registerFlow("MATERIAL_REQUEST", {
  link: (id) => `/m/material-requests/${id}`,
  title: async (id) => {
    const r = await db.materialRequest.findUnique({ where: { id } });
    return r ? `Material request ${r.ref}` : "Material request";
  },
  canApprove: async (id, step) => {
    if (step.label === LABEL.est) {
      const lines = await db.materialRequestLine.findMany({ where: { requestId: id } });
      if (lines.some((l) => l.rateFils == null)) return "rates_required";
    }
    if (step.label === LABEL.proc) {
      const r = await db.materialRequest.findUniqueOrThrow({ where: { id } });
      if (!r.lpoNo) return "lpo_required";
    }
    return null;
  },
  shouldSkip: async (id, step) => {
    if (step.label !== LABEL.bul) return false;
    const r = await db.materialRequest.findUniqueOrThrow({ where: { id } });
    return !needsBul(r.totalFils, await bulThreshold(r.projectId));
  },
  onApproved: async (id) => {
    await db.materialRequest.update({ where: { id }, data: { status: "ORDERED", orderedAt: new Date() } });
  },
  onReturnedToRequester: async (id) => {
    await db.materialRequest.update({ where: { id }, data: { status: "RETURNED" } });
  },
});

/** Approved brands (and the MS entry) per material for a project; GENERAL entries apply everywhere. */
export async function approvedBrands(projectId: string, materialIds?: string[]) {
  const rows = await db.materialSubmittal.findMany({
    where: { status: { in: [...APPROVED_MS] }, OR: [{ projectId }, { projectId: null }], ...(materialIds ? { materialId: { in: materialIds } } : {}) },
    orderBy: [{ projectId: "desc" }, { brand: "asc" }],
  });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.materialId, [...(by.get(r.materialId) ?? []), r]);
  return by;
}

/** Quantity already requested for a material on a project (open and ordered requests). */
async function alreadyRequested(projectId: string, materialId: string, excludeRequestId?: string) {
  const agg = await db.materialRequestLine.aggregate({
    where: { materialId, request: { projectId, status: { in: ["UNDER_REVIEW", "ORDERED"] }, ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}) } },
    _sum: { qty: true },
  });
  return agg._sum.qty ?? 0;
}

async function nextRef(projectId: string) {
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const n = await db.materialRequest.count({ where: { projectId } });
  for (let i = n + 1; ; i++) {
    const ref = `${p.code}-MR-${String(i).padStart(3, "0")}`;
    if (!(await db.materialRequest.findUnique({ where: { ref } }))) return ref;
  }
}

/** Chain (brief 6): SE/PE → Estimator → PM (if the project has one) else Ops → BUL if > threshold → Procurement. */
export async function chainFor(projectId: string): Promise<StepSpec[]> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  return [
    { label: LABEL.check, role: ["SE", "PE"] },
    { label: LABEL.est, role: "EST" },
    project.pmUserId ? { label: LABEL.pm, role: "PM", assigneeId: project.pmUserId } : { label: LABEL.ops, role: "OPS" },
    { label: LABEL.bul, role: "BUL" },
    { label: LABEL.proc, role: "PROC" },
  ];
}

export async function createRequest(user: CurrentUser, m: MutationOf<"mr.create">) {
  if (!hasAnyRole(user.roles, MR_CREATE_ROLES)) throw new MutationError("forbidden");
  const p = m.payload;
  const materials = await db.material.findMany({ where: { id: { in: p.lines.map((l) => l.materialId) } } });
  if (materials.length !== new Set(p.lines.map((l) => l.materialId)).size) throw new MutationError("material_not_found");
  const approved = await approvedBrands(p.projectId, materials.map((x) => x.id));
  const boq = await db.boqLine.findMany({ where: { projectId: p.projectId, materialId: { in: materials.map((x) => x.id) } } });

  const req = await db.materialRequest.create({
    data: { ref: await nextRef(p.projectId), projectId: p.projectId, requesterId: user.id, neededBy: p.neededBy ?? null, note: p.note ?? null, status: "UNDER_REVIEW", clientId: m.id },
  });
  let alertCount = 0;
  for (const l of p.lines) {
    const mat = materials.find((x) => x.id === l.materialId)!;
    const ok = approved.get(mat.id) ?? [];
    // brand + spec auto-fill from the approved MS when the requester did not name another brand
    const ms = l.brand ? ok.find((s) => s.brand.trim().toLowerCase() === l.brand!.trim().toLowerCase()) : ok[0];
    const brand = l.brand?.trim() || ms?.brand || null;
    const line = await db.materialRequestLine.create({
      data: {
        requestId: req.id, materialId: mat.id, submittalId: ms?.id ?? null, brand, spec: ms?.spec ?? mat.keySpec, qty: l.qty,
        unit: l.unit ?? mat.unit, note: l.note ?? null, rateFils: boq.find((b) => b.materialId === mat.id)?.rateFils ?? null,
      },
    });
    const b = boq.find((x) => x.materialId === mat.id);
    const alerts = checkLine({
      material: mat.name, brand, approvedBrands: [...new Set(ok.map((s) => s.brand))], qty: l.qty,
      alreadyRequested: await alreadyRequested(p.projectId, mat.id, req.id), boqQty: b?.qty ?? null, unit: line.unit,
    });
    for (const a of alerts) await db.highAlert.create({ data: { requestLineId: line.id, type: a.type, detail: a.detail } });
    alertCount += alerts.length;
  }
  await db.materialRequest.update({ where: { id: req.id }, data: { totalFils: await totalOf(req.id) } });
  await startFlow("MATERIAL_REQUEST", req.id, "MR", await chainFor(p.projectId), user);
  if (alertCount) {
    // HIGH-ALERT goes to SE and PE only – never to supervisors
    const members = await db.projectMember.findMany({ where: { projectId: p.projectId, role: { in: ["SE", "PE"] } }, select: { userId: true } });
    const n = { type: "HIGH_ALERT", title: `HIGH-ALERT ${req.ref}: ${alertCount} issue(s)`, link: `/m/material-requests/${req.id}`, entityType: "MATERIAL_REQUEST", entityId: req.id };
    if (members.length) await notifyUsers(members.map((x) => x.userId), n);
    else await notifyRole(HIGH_ALERT_ROLES, n);
  }
  await audit({ actorId: user.id, action: "CREATE", entityType: "MaterialRequest", entityId: req.id, after: p });
  return req;
}

/** Estimator enters / corrects rates (AED per unit); total is recalculated. */
export async function setRates(user: CurrentUser, requestId: string, rates: Record<string, number>) {
  const flow = await flowView(user, "MATERIAL_REQUEST", requestId);
  if (!flow?.canAct || flow.currentLabel !== LABEL.est) throw new MutationError("not_your_step");
  const lines = await db.materialRequestLine.findMany({ where: { requestId } });
  for (const l of lines) {
    const aed = rates[l.id];
    if (aed != null && aed >= 0) await db.materialRequestLine.update({ where: { id: l.id }, data: { rateFils: Math.round(aed * 100) } });
  }
  const total = await totalOf(requestId);
  await db.materialRequest.update({ where: { id: requestId }, data: { totalFils: total } });
  await audit({ actorId: user.id, action: "EDIT", entityType: "MaterialRequest", entityId: requestId, after: { rates, totalFils: total } });
}

export async function setLpo(user: CurrentUser, requestId: string, lpoNo: string) {
  const flow = await flowView(user, "MATERIAL_REQUEST", requestId);
  if (!flow?.canAct || flow.currentLabel !== LABEL.proc) throw new MutationError("not_your_step");
  await db.materialRequest.update({ where: { id: requestId }, data: { lpoNo } });
  await audit({ actorId: user.id, action: "EDIT", entityType: "MaterialRequest", entityId: requestId, after: { lpoNo } });
}

export async function resolveAlert(user: CurrentUser, alertId: string, resolution: string) {
  if (!hasAnyRole(user.roles, HIGH_ALERT_ROLES)) throw new MutationError("forbidden");
  await db.highAlert.update({ where: { id: alertId }, data: { resolvedById: user.id, resolvedAt: new Date(), resolution } });
  await audit({ actorId: user.id, action: "EDIT", entityType: "HighAlert", entityId: alertId, after: { resolution } });
}

/** Open HIGH-ALERTs for SE / PE (pinned on their dashboard). */
export async function openAlerts(user: CurrentUser) {
  if (!hasAnyRole(user.roles, HIGH_ALERT_ROLES)) return [];
  const rows = await db.highAlert.findMany({
    where: { resolvedAt: null, requestLine: { request: { status: { in: ["UNDER_REVIEW", "ORDERED"] } } } },
    include: { requestLine: { include: { request: { include: { project: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({ id: a.id, type: a.type, detail: a.detail, ref: a.requestLine.request.ref, requestId: a.requestLine.request.id, project: a.requestLine.request.project.code }));
}

/** Material catalogue for the request form: approved brands per material for the project. */
export async function catalogue(projectId: string) {
  const [materials, approved, boq] = await Promise.all([
    db.material.findMany({ orderBy: [{ discipline: "asc" }, { name: "asc" }] }),
    approvedBrands(projectId),
    db.boqLine.findMany({ where: { projectId } }),
  ]);
  return materials.map((m) => ({
    id: m.id, name: m.name, discipline: m.discipline, unit: boq.find((b) => b.materialId === m.id)?.unit ?? m.unit, keySpec: m.keySpec,
    approved: (approved.get(m.id) ?? []).map((s) => ({ brand: s.brand, msNo: s.msNo, spec: s.spec, status: s.status })),
  }));
}
