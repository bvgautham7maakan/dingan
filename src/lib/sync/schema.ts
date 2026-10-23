import { z } from "zod";
import { attendanceMutations } from "../attendance/types";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const base = { id: z.string().uuid(), at: z.string() };
const clientFile = z.string().uuid();

export const SAFETY_ITEMS = [
  "ppe", "toolbox", "housekeeping", "access", "workAtHeight", "electrical", "tools", "fire", "firstAid", "permits", "barricade", "welfare",
] as const;
export const SAFETY_RESULTS = ["OK", "ISSUE", "NA"] as const;
export const DISCIPLINES = ["ELE", "PLB", "HVAC", "FLS", "GEN"] as const;

export const MOVE_REASONS = ["EMERGENCY", "EXTRA", "MATERIAL", "OTHER"] as const;
export const BILL_TYPES = ["FUEL", "SALIK", "FINE"] as const;

/**
 * Every change a phone can make offline. Each carries a client UUID, so a retry never applies twice.
 * Photos/voice notes are uploaded first (POST /api/files with their own client id) and referenced here.
 */
const mutationSchemas = [
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
  z.object({
    ...base,
    type: z.literal("duty.done"),
    payload: z.object({ dutyId: z.string().min(1), photoClientId: clientFile, note: z.string().max(1000).optional() }),
  }),
  z.object({
    ...base,
    type: z.literal("report.submit"),
    payload: z.object({
      projectId: z.string().min(1),
      date: day,
      manpower: z.object({
        own: z.number().int().min(0).max(500),
        subs: z.array(z.object({ name: z.string().max(60), count: z.number().int().min(0).max(500) })).max(10),
        remarks: z.string().max(1000).optional(),
      }),
      workDone: z.string().min(1).max(4000),
      issues: z.string().max(4000).optional(),
      materialsNeeded: z.string().max(2000).optional(),
      nextDay: z.string().max(4000).optional(),
      photoClientIds: z.array(clientFile).max(10),
      voiceClientId: clientFile.optional(),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("safety.submit"),
    payload: z.object({
      projectId: z.string().min(1),
      date: day,
      items: z.array(z.object({ key: z.enum(SAFETY_ITEMS), result: z.enum(SAFETY_RESULTS), note: z.string().max(500).optional() })).length(SAFETY_ITEMS.length),
      photoClientId: clientFile.optional(),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("query.create"),
    payload: z.object({
      projectId: z.string().min(1),
      subject: z.string().min(1).max(200),
      question: z.string().min(1).max(4000),
      discipline: z.enum(DISCIPLINES).optional(),
      drawingRef: z.string().max(100).optional(),
      photoClientIds: z.array(clientFile).max(6),
      voiceClientId: clientFile.optional(),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("mr.create"),
    payload: z.object({
      projectId: z.string().min(1),
      neededBy: day.optional(),
      note: z.string().max(1000).optional(),
      lines: z
        .array(
          z.object({
            materialId: z.string().min(1),
            brand: z.string().max(100).optional(),
            qty: z.number().positive().max(1_000_000),
            unit: z.string().max(20).optional(),
            note: z.string().max(500).optional(),
          }),
        )
        .min(1)
        .max(40),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("drawing.calibrate"),
    payload: z.object({
      revisionId: z.string().min(1),
      page: z.number().int().min(1),
      points: z.tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])]),
      realMm: z.number().positive().max(1_000_000),
    }),
  }),
  z.object({
    ...base,
    type: z.literal("drawing.measure"),
    payload: z.object({
      revisionId: z.string().min(1),
      page: z.number().int().min(1),
      points: z.array(z.tuple([z.number(), z.number()])).min(2).max(200),
      label: z.string().max(100).optional(),
    }),
  }),
] as const;

export const mutationSchema = z.discriminatedUnion("type", mutationSchemas);

// Inferred per member: inferring from the union itself widens `type` to string.
export type Mutation = z.infer<(typeof mutationSchemas)[number]>;
export type MutationOf<T extends Mutation["type"]> = Extract<Mutation, { type: T }>;
