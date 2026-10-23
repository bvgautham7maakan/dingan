import "server-only";
import { db } from "./db";
import { audit } from "./audit";
import { notifyRole, notifyUsers } from "./notify";
import { hasAnyRole, type Role } from "./roles";
import type { CurrentUser } from "./auth/current";

/**
 * Generic approval chains (brief section 6).
 * Steps run in order. Only the user(s) holding a step's role – or its named assignee – see the action.
 * Approve → next step (or the flow is APPROVED). Return → back to the previous step,
 * or to the requester (flow RETURNED) from the first step.
 */
export type StepSpec = { label: string; role: Role; assigneeId?: string | null };

export type FlowView = {
  id: string;
  status: string;
  steps: { seq: number; label: string; role: string; status: string; actedBy: string | null; actedAt: Date | null; comment: string | null }[];
  canAct: boolean;
  currentLabel: string | null;
};

type Hooks = {
  onApproved?: (entityId: string, by: CurrentUser) => Promise<void>;
  onReturnedToRequester?: (entityId: string, by: CurrentUser, comment: string | null) => Promise<void>;
  link: (entityId: string) => string;
  title: (entityId: string) => Promise<string>;
};

const hooks = new Map<string, Hooks>();
export function registerFlow(entityType: string, h: Hooks) {
  hooks.set(entityType, h);
}

export class ApprovalError extends Error {}

export async function startFlow(entityType: string, entityId: string, chainCode: string, steps: StepSpec[], by: CurrentUser) {
  const flow = await db.approvalFlow.create({
    data: {
      entityType, entityId, chainCode, createdById: by.id,
      steps: {
        create: steps.map((s, i) => ({ seq: i + 1, label: s.label, role: s.role, assigneeId: s.assigneeId ?? null, status: i === 0 ? "PENDING" : "WAITING" })),
      },
    },
  });
  const h = hooks.get(entityType);
  if (h && steps[0]) {
    await notifyRole([steps[0].role], { type: "APPROVAL", title: `${await h.title(entityId)} – waiting for you`, link: h.link(entityId), entityType, entityId }, steps[0].assigneeId);
  }
  return flow;
}

export function canActOnStep(user: CurrentUser, step: { role: string; assigneeId: string | null; status: string }) {
  if (step.status !== "PENDING") return false;
  if (step.assigneeId) return step.assigneeId === user.id;
  return hasAnyRole(user.roles, [step.role as Role]);
}

export async function act(user: CurrentUser, flowId: string, action: "APPROVE" | "RETURN", comment?: string | null) {
  const flow = await db.approvalFlow.findUnique({ where: { id: flowId }, include: { steps: { orderBy: { seq: "asc" } } } });
  if (!flow || flow.status !== "IN_PROGRESS") throw new ApprovalError("not_open");
  const step = flow.steps.find((s) => s.seq === flow.currentSeq);
  if (!step || !canActOnStep(user, step)) throw new ApprovalError("not_your_step");
  if (action === "RETURN" && !comment?.trim()) throw new ApprovalError("comment_required");
  const h = hooks.get(flow.entityType);
  const now = new Date();

  await db.approvalStep.update({
    where: { id: step.id },
    data: { status: action === "APPROVE" ? "APPROVED" : "RETURNED", actedById: user.id, actedAt: now, comment: comment?.trim() || null },
  });

  const title = h ? await h.title(flow.entityId) : flow.entityType;
  const link = h?.link(flow.entityId);
  if (action === "APPROVE") {
    const next = flow.steps.find((s) => s.seq === step.seq + 1);
    if (next) {
      await db.approvalStep.update({ where: { id: next.id }, data: { status: "PENDING" } });
      await db.approvalFlow.update({ where: { id: flow.id }, data: { currentSeq: next.seq } });
      await notifyRole([next.role as Role], { type: "APPROVAL", title: `${title} – waiting for you`, link, entityType: flow.entityType, entityId: flow.entityId }, next.assigneeId);
    } else {
      await db.approvalFlow.update({ where: { id: flow.id }, data: { status: "APPROVED" } });
      await h?.onApproved?.(flow.entityId, user);
      if (flow.createdById) await notifyUsers([flow.createdById], { type: "APPROVED", title: `${title} – approved`, link, entityType: flow.entityType, entityId: flow.entityId });
    }
  } else {
    const prev = flow.steps.find((s) => s.seq === step.seq - 1);
    if (prev) {
      await db.approvalStep.update({ where: { id: prev.id }, data: { status: "PENDING", actedById: null, actedAt: null } });
      await db.approvalStep.update({ where: { id: step.id }, data: { status: "WAITING" } });
      await db.approvalFlow.update({ where: { id: flow.id }, data: { currentSeq: prev.seq } });
      await notifyRole([prev.role as Role], { type: "RETURNED", title: `${title} – returned: ${comment}`, link, entityType: flow.entityType, entityId: flow.entityId }, prev.assigneeId);
    } else {
      await db.approvalFlow.update({ where: { id: flow.id }, data: { status: "RETURNED" } });
      await h?.onReturnedToRequester?.(flow.entityId, user, comment ?? null);
      if (flow.createdById) await notifyUsers([flow.createdById], { type: "RETURNED", title: `${title} – returned: ${comment}`, link, entityType: flow.entityType, entityId: flow.entityId });
    }
  }
  await audit({ actorId: user.id, action, entityType: flow.entityType, entityId: flow.entityId, after: { step: step.label, comment: comment ?? null } });
}

export async function flowView(user: CurrentUser, entityType: string, entityId: string): Promise<FlowView | null> {
  const flow = await db.approvalFlow.findUnique({
    where: { entityType_entityId: { entityType, entityId } },
    include: { steps: { orderBy: { seq: "asc" }, include: { actedBy: { select: { displayName: true } } } } },
  });
  if (!flow) return null;
  const current = flow.steps.find((s) => s.seq === flow.currentSeq);
  return {
    id: flow.id,
    status: flow.status,
    steps: flow.steps.map((s) => ({ seq: s.seq, label: s.label, role: s.role, status: s.status, actedBy: s.actedBy?.displayName ?? null, actedAt: s.actedAt, comment: s.comment })),
    canAct: flow.status === "IN_PROGRESS" && !!current && canActOnStep(user, current),
    currentLabel: flow.status === "IN_PROGRESS" ? (current?.label ?? null) : null,
  };
}

/** Open steps this user can act on (for dashboards). */
export async function pendingFor(user: CurrentUser) {
  const steps = await db.approvalStep.findMany({
    where: { status: "PENDING", flow: { status: "IN_PROGRESS" }, OR: [{ assigneeId: user.id }, { assigneeId: null, role: { in: user.roles } }] },
    include: { flow: true },
    orderBy: { flow: { createdAt: "asc" } },
  });
  return steps;
}
