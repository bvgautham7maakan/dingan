import { Prisma } from "@prisma/client";
import { db } from "./db";

type Json = Prisma.InputJsonValue | undefined;

const SECRET_KEYS = new Set(["passwordHash", "tokenHash"]);

function clean(v: unknown): Json {
  if (v == null) return undefined;
  return JSON.parse(
    JSON.stringify(v, (k, val) => (SECRET_KEYS.has(k) ? "[redacted]" : val)),
  ) as Prisma.InputJsonValue;
}

export async function audit(entry: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: clean(entry.before),
      after: clean(entry.after),
    },
  });
}
