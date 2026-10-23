import "server-only";
import { db } from "../db";
import type { CurrentUser } from "../auth/current";
import { applyAttendanceMutation, MutationError } from "../attendance/server";
import { isAttendanceMutation } from "../attendance/types";
import { act, ApprovalError } from "../approvals";
import { createMove } from "../moves/server";
import { createBill, recordVehicleCheck, setTripStatus } from "../logistics/server";
import type { Mutation } from "./schema";

export { MutationError };

/** Applies one offline mutation. Idempotent per mutation id. */
export async function applyMutation(user: CurrentUser, m: Mutation): Promise<"applied" | "duplicate"> {
  if (await db.syncReceipt.findUnique({ where: { clientMutationId: m.id } })) return "duplicate";
  try {
    if (isAttendanceMutation(m)) await applyAttendanceMutation(user, m);
    else if (m.type === "move.create") await createMove(user, m);
    else if (m.type === "approval.act") await act(user, m.payload.flowId, m.payload.action, m.payload.comment);
    else if (m.type === "vehicle.check") await recordVehicleCheck(user, m);
    else if (m.type === "trip.status") await setTripStatus(user, m);
    else if (m.type === "bill.create") await createBill(user, m);
  } catch (e) {
    if (e instanceof ApprovalError) throw new MutationError(e.message);
    throw e;
  }
  await db.syncReceipt.create({ data: { clientMutationId: m.id, userId: user.id } });
  return "applied";
}
