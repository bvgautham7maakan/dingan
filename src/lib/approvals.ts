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
export type StepSpec = { label: string; role: Role | Role[]; assigneeId?: string | null };

/** A step may accept several roles (e.g. "SE or PE"); stored comma-separated. */
const stepRoles = (role: string) => role.split(",") as Role[];

export type FlowView = {
  id: string;
  status: string;
  steps: { seq: number; label: string; role: string; status: string; actedBy: string | null; actedAt: Date | null; comment: string | null }[];
  canAct: boolean;
  currentLabel: string | null;
};

type Hooks = {
  onApproved?: (entityId: string, by: CurrentUser) => Promise<void>;
  /** Return an error code to block approval of this step (e.g. rates missing). */
  canApprove?: (entityId: string, step: { label: string; role: string }) => Promise<string | null>;
  /** Steps that turn out not to apply (e.g. BUL below the threshold) are skipped automatically. */
  shouldSkip?: (entityId: string, step: { label: string; role: string }) => Promise<boolean>;
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
        create: steps.map((s, i) => ({
          seq: i + 1, label: s.label, role: Array.isArray(s.role) ? s.role.join(",") : s.role, assigneeId: s.assigneeId ?? null,
          status: i === 0 ? "PENDING" : "WAITING",
        })),
      },
    },
  });
  const h = hooks.get(entityType);
  if (h && steps[0]) {
    await notifyRole(Array.isArray(steps[0].role) ? steps[0].role : [steps[0].role], { type: "APPROVAL", title: `${await h.title(entityId)} – waiting for you`, link: h.link(entityId), entityType, entityId }, steps[0].assigneeId);
  }
  return flow;
}

/** Only the step's role (or its named assignee) may act – and never the person who raised the item. */
export function canActOnStep(
  user: CurrentUser,
  step: { role: string; assigneeId: string | null; status: string },
  createdById?: string | null,
) {
  if (step.status !== "PENDING") return false;
  if (createdById && createdById === user.id) return false;
  if (step.assigneeId) return step.assigneeId === user.id;
  return hasAnyRole(user.roles, stepRoles(step.role));
}

export async function act(user: CurrentUser, flowId: string, action: "APPROVE" | "RETURN", comment?: string | null) {
  const flow = await db.approvalFlow.findUnique({ where: { id: flowId }, include: { steps: { orderBy: { seq: "asc" } } } });
  if (!flow || flow.status !== "IN_PROGRESS") throw new ApprovalError("not_open");
  const step = flow.steps.find((s) => s.seq === flow.currentSeq);
  if (!step || !canActOnStep(user, step, flow.createdById)) throw new ApprovalError("not_your_step");
  if (action === "RETURN" && !comment?.trim()) throw new ApprovalError("comment_required");
  const h = hooks.get(flow.entityType);
  if (action === "APPROVE" && h?.canApprove) {
    const blocked = await h.canApprove(flow.entityId, step);
    if (blocked) throw new ApprovalError(blocked);
  }
  const now = new Date();

  await db.approvalStep.update({
    where: { id: step.id },
    data: { status: action === "APPROVE" ? "APPROVED" : "RETURNED", actedById: user.id, actedAt: now, comment: comment?.trim() || null },
  });

  const title = h ? await h.title(flow.entityId) : flow.entityType;
  const link = h?.link(flow.entityId);
  if (action === "APPROVE") {
    // move to the next step that applies; steps that do not apply are marked SKIPPED
    let next = flow.steps.find((s) => s.seq === step.seq + 1);
    while (next && h?.shouldSkip && (await h.shouldSkip(flow.entityId, next))) {
      await db.approvalStep.update({ where: { id: next.id }, data: { status: "SKIPPED" } });
      const after: number = next.seq + 1;
      next = flow.steps.find((s) => s.seq === after);
    }
    if (next) {
      await db.approvalStep.update({ where: { id: next.id }, data: { status: "PENDING" } });
      await db.approvalFlow.update({ where: { id: flow.id }, data: { currentSeq: next.seq } });
      await notifyRole(stepRoles(next.role), { type: "APPROVAL", title: `${title} – waiting for you`, link, entityType: flow.entityType, entityId: flow.entityId }, next.assigneeId);
    } else {
      await db.approvalFlow.update({ where: { id: flow.id }, data: { status: "APPROVED" } });
      await h?.onApproved?.(flow.entityId, user);
      if (flow.createdById) await notifyUsers([flow.createdById], { type: "APPROVED", title: `${title} – approved`, link, entityType: flow.entityType, entityId: flow.entityId });
    }
  } else {
    // back to the previous step that was actually approved (skipped steps are passed over)
    const prev = [...flow.steps].reverse().find((s) => s.seq < step.seq && s.status === "APPROVED");
    if (prev) {
      await db.approvalStep.update({ where: { id: prev.id }, data: { status: "PENDING", actedById: null, actedAt: null } });
      await db.approvalStep.update({ where: { id: step.id }, data: { status: "WAITING" } });
      await db.approvalFlow.update({ where: { id: flow.id }, data: { currentSeq: prev.seq } });
      await notifyRole(stepRoles(prev.role), { type: "RETURNED", title: `${title} – returned: ${comment}`, link, entityType: flow.entityType, entityId: flow.entityId }, prev.assigneeId);
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
    canAct: flow.status === "IN_PROGRESS" && !!current && canActOnStep(user, current, flow.createdById),
    currentLabel: flow.status === "IN_PROGRESS" ? (current?.label ?? null) : null,
  };
}

/** Open steps this user can act on (for dashboards). */
export async function pendingFor(user: CurrentUser) {
  const steps = await db.approvalStep.findMany({
    where: { status: "PENDING", flow: { status: "IN_PROGRESS" }, OR: [{ assigneeId: user.id }, { assigneeId: null }] },
    include: { flow: true },
    orderBy: { flow: { createdAt: "asc" } },
  });
  return steps.filter((s) => canActOnStep(user, s, s.flow.createdById));
}
