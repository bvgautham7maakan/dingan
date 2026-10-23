import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { fileByClientId } from "../files";
import { flowView, registerFlow, startFlow } from "../approvals";
import { hasAnyRole, type Role } from "../roles";
import { dubaiDateTime, dubaiHHMM } from "../time";
import { MutationError } from "../attendance/server";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const MOVE_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP", "SE", "PE", "ADMIN"];
export const MOVE_APPROVER: Role = "HEAD_SUP";

async function projectIdForSite(siteId: string) {
  return (await db.project.findFirst({ where: { siteId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } }))?.id ?? null;
}

/** The work segment a worker is in at `at`, or null if not on site then. */
async function segmentAt(date: string, workerId: string, at: Date) {
  const att = await db.attendance.findUnique({ where: { date_workerId: { date, workerId } }, include: { segments: { orderBy: { startAt: "asc" } } } });
  if (!att || att.status === "OUT") return null;
  return att.segments.find((s) => s.startAt <= at && (!s.endAt || s.endAt > at)) ?? null;
}

/** Splits each worker's day at the move time: hours before stay with the old site, after go to the new one. */
async function applySegments(moveId: string) {
  const move = await db.manpowerMove.findUniqueOrThrow({ where: { id: moveId }, include: { workers: true } });
  const projectId = await projectIdForSite(move.toSiteId);
  const skipped: string[] = [];
  for (const { workerId } of move.workers) {
    const seg = await segmentAt(move.date, workerId, move.moveAt);
    if (!seg || seg.siteId !== move.fromSiteId) {
      skipped.push(workerId);
      continue;
    }
    if (seg.startAt.getTime() === move.moveAt.getTime()) {
      await db.workSegment.update({ where: { id: seg.id }, data: { siteId: move.toSiteId, projectId, source: "MOVE", moveId } });
    } else {
      await db.workSegment.update({ where: { id: seg.id }, data: { endAt: move.moveAt } });
      await db.workSegment.create({
        data: { attendanceId: seg.attendanceId, siteId: move.toSiteId, projectId, startAt: move.moveAt, endAt: seg.endAt, source: "MOVE", moveId },
      });
    }
  }
  await db.manpowerMove.update({ where: { id: moveId }, data: { appliedAt: new Date() } });
  return skipped;
}

/** Undoes an applied move (emergency move returned by the head supervisor). */
async function revertSegments(moveId: string) {
  const segs = await db.workSegment.findMany({ where: { moveId } });
  for (const seg of segs) {
    const prev = await db.workSegment.findFirst({
      where: { attendanceId: seg.attendanceId, endAt: seg.startAt, id: { not: seg.id } },
    });
    if (prev) {
      await db.workSegment.update({ where: { id: prev.id }, data: { endAt: seg.endAt } });
      await db.workSegment.delete({ where: { id: seg.id } });
    } else {
      const move = await db.manpowerMove.findUniqueOrThrow({ where: { id: moveId } });
      await db.workSegment.update({ where: { id: seg.id }, data: { siteId: move.fromSiteId, projectId: await projectIdForSite(move.fromSiteId), source: "ATTENDANCE", moveId: null } });
    }
  }
  await db.manpowerMove.update({ where: { id: moveId }, data: { appliedAt: null } });
}

const REASON_TEXT: Record<string, string> = { EMERGENCY: "Emergency", EXTRA: "Extra manpower", MATERIAL: "Material shifting", OTHER: "Other" };

registerFlow("MANPOWER_MOVE", {
  link: () => "/m/moves",
  title: async (id) => {
    const m = await db.manpowerMove.findUnique({ where: { id }, include: { fromSite: true, toSite: true, _count: { select: { workers: true } } } });
    return m ? `Move ${m._count.workers} worker(s) ${m.fromSite.name} → ${m.toSite.name} at ${dubaiHHMM(m.moveAt)} (${REASON_TEXT[m.reason]})` : "Manpower move";
  },
  onApproved: async (id) => {
    const m = await db.manpowerMove.findUniqueOrThrow({ where: { id } });
    if (!m.appliedAt) await applySegments(id);
    await db.manpowerMove.update({ where: { id }, data: { status: "APPROVED" } });
  },
  onReturnedToRequester: async (id) => {
    const m = await db.manpowerMove.findUniqueOrThrow({ where: { id } });
    if (m.appliedAt) await revertSegments(id);
    await db.manpowerMove.update({ where: { id }, data: { status: "RETURNED" } });
  },
});

export async function createMove(user: CurrentUser, m: MutationOf<"move.create">) {
  if (!hasAnyRole(user.roles, MOVE_ROLES)) throw new MutationError("forbidden");
  const p = m.payload;
  if (p.fromSiteId === p.toSiteId) throw new MutationError("same_site");
  const moveAt = dubaiDateTime(p.date, p.moveTime);
  for (const workerId of p.workerIds) {
    const seg = await segmentAt(p.date, workerId, moveAt);
    if (!seg || seg.siteId !== p.fromSiteId) throw new MutationError("worker_not_on_site");
  }
  const voice = await fileByClientId(p.voiceClientId, user.id);
  const approver = hasAnyRole(user.roles, [MOVE_APPROVER]);

  let tripId: string | null = null;
  if (p.vehicleId) {
    const vehicle = await db.vehicle.findUniqueOrThrow({ where: { id: p.vehicleId } });
    const plan = await db.vehiclePlan.upsert({ where: { date: p.date }, update: {}, create: { date: p.date } });
    const trip = await db.trip.create({
      data: {
        planId: plan.id, date: p.date, vehicleId: vehicle.id, driverId: vehicle.defaultDriverId, fromSiteId: p.fromSiteId, toSiteId: p.toSiteId,
        plannedOut: moveAt, plannedReturn: new Date(moveAt.getTime() + 60 * 60_000), purpose: `Manpower move (${REASON_TEXT[p.reason]})`,
        createdById: user.id, passengers: { create: p.workerIds.map((workerId) => ({ workerId })) },
      },
    });
    tripId = trip.id;
  }

  const move = await db.manpowerMove.create({
    data: {
      date: p.date, fromSiteId: p.fromSiteId, toSiteId: p.toSiteId, moveAt, reason: p.reason, note: p.note ?? null,
      voiceFileId: voice?.id ?? null, tripId, createdById: user.id, clientId: m.id,
      status: approver ? "APPROVED" : p.reason === "EMERGENCY" ? "APPLIED" : "PENDING",
      workers: { create: p.workerIds.map((workerId) => ({ workerId })) },
    },
  });
  // Emergency moves (and moves by the head supervisor) apply at once; others wait for approval.
  if (approver || p.reason === "EMERGENCY") await applySegments(move.id);
  if (!approver) await startFlow("MANPOWER_MOVE", move.id, "MOVE", [{ label: "Head supervisor", role: MOVE_APPROVER }], user);
  await audit({ actorId: user.id, action: "CREATE", entityType: "ManpowerMove", entityId: move.id, after: { ...p, status: move.status } });
  return move;
}

/** Moves screen data: workers on site now, today's moves with their approval state. */
export async function getMovesDay(user: CurrentUser, siteId: string, date: string) {
  const now = new Date();
  const [sites, vehicles, atts, moves] = await Promise.all([
    db.site.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.attendance.findMany({ where: { date, status: { in: ["IN", "LATE"] } }, include: { worker: true, segments: { orderBy: { startAt: "asc" } } } }),
    db.manpowerMove.findMany({
      // approvers also see moves from earlier days still waiting for them
      where: hasAnyRole(user.roles, [MOVE_APPROVER, "PE", "SE", "ADMIN"])
        ? { OR: [{ date }, { status: { in: ["PENDING", "APPLIED"] } }] }
        : { date, OR: [{ fromSiteId: siteId }, { toSiteId: siteId }] },
      include: { fromSite: true, toSite: true, createdBy: { select: { displayName: true } }, workers: { include: { worker: true } }, trip: { include: { vehicle: true } } },
      orderBy: { moveAt: "desc" },
    }),
  ]);
  // where each present worker is now (last segment that has started)
  const here = atts
    .map((a) => {
      const started = a.segments.filter((s) => s.startAt <= now);
      const cur = started.at(-1) ?? a.segments[0];
      return { workerId: a.workerId, empCode: a.worker.empCode, name: a.worker.name, siteId: cur?.siteId ?? a.siteId };
    })
    .filter((w) => w.siteId === siteId)
    .sort((a, b) => a.empCode.localeCompare(b.empCode));

  return {
    date,
    siteId,
    sites: sites.map((s) => ({ id: s.id, name: s.name })),
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.name })),
    workers: here,
    moves: await Promise.all(
      moves.map(async (mv) => ({
        id: mv.id,
        date: mv.date,
        time: dubaiHHMM(mv.moveAt),
        from: mv.fromSite.name,
        to: mv.toSite.name,
        reason: mv.reason,
        note: mv.note,
        voiceFileId: mv.voiceFileId,
        status: mv.status,
        by: mv.createdBy.displayName,
        vehicle: mv.trip?.vehicle.name ?? null,
        workers: mv.workers.map((w) => `${w.worker.name} (${w.worker.empCode})`),
        flow: await flowView(user, "MANPOWER_MOVE", mv.id),
      })),
    ),
  };
}
