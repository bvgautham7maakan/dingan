import { z } from "zod";
import { attendanceMutations } from "../attendance/types";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const base = { id: z.string().uuid(), at: z.string() };
const clientFile = z.string().uuid();

export const MOVE_REASONS = ["EMERGENCY", "EXTRA", "MATERIAL", "OTHER"] as const;
export const BILL_TYPES = ["FUEL", "SALIK", "FINE"] as const;

/**
 * Every change a phone can make offline. Each carries a client UUID, so a retry never applies twice.
 * Photos/voice notes are uploaded first (POST /api/files with their own client id) and referenced here.
 */
export const mutationSchema = z.discriminatedUnion("type", [
  ...attendanceMutations,
  z.object({
    ...base,
    type: z.literal("move.create"),
    payload: z.object({
      date: day,
      fromSiteId: z.string().min(1),
      toSiteId: z.string().min(1),
      workerIds: z.array(z.string().min(1)).min(1).max(60),
      moveTime: hhmm,
      reason: z.enum(MOVE_REASONS),
      note: z.string().max(1000).optional(),
      voiceClientId: clientFile.optional(),
      vehicleId: z.string().optional(),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("approval.act"),
    payload: z.object({ flowId: z.string().min(1), action: z.enum(["APPROVE", "RETURN"]), comment: z.string().max(1000).optional() }),
  }),
  z.object({
    ...base,
    type: z.literal("vehicle.check"),
    payload: z.object({
      date: day,
      vehicleId: z.string().min(1),
      tyresOk: z.boolean(),
      oilOk: z.boolean(),
      lightsOk: z.boolean(),
      damageNote: z.string().max(1000).optional(),
      photoClientId: clientFile,
    }),
  }),
  z.object({
    ...base,
    type: z.literal("trip.status"),
    payload: z.object({ tripId: z.string().min(1), status: z.enum(["STARTED", "DELIVERED", "RETURNED"]), photoClientId: clientFile.optional() }),
  }),
  z.object({
    ...base,
    type: z.literal("bill.create"),
    payload: z.object({
      date: day,
      type: z.enum(BILL_TYPES),
      vehicleId: z.string().min(1),
      amount: z.number().positive().max(100_000).optional(),
      odometer: z.number().int().min(0).max(5_000_000).optional(),
      photoClientId: clientFile,
      voiceClientId: clientFile.optional(),
      note: z.string().max(1000).optional(),
    }),
  }),
]);

export type Mutation = z.infer<typeof mutationSchema>;
export type MutationOf<T extends Mutation["type"]> = Extract<Mutation, { type: T }>;
