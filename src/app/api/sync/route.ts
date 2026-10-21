import { z } from "zod";
import { withUser, jsonFor } from "@/lib/api";
import { mutationSchema } from "@/lib/attendance/types";
import { applyMutation, MutationError } from "@/lib/attendance/server";

const body = z.object({ mutations: z.array(z.unknown()).max(500) });

/**
 * Offline outbox endpoint. Each mutation is applied on its own; the result per id tells the
 * phone which ones to drop (applied / duplicate / rejected) and which to retry later (error).
 */
export const POST = withUser(async (user, req) => {
  const { mutations } = body.parse(await req.json());
  const results: { id: string; result: "applied" | "duplicate" | "rejected" | "error"; reason?: string }[] = [];
  for (const raw of mutations) {
    const parsed = mutationSchema.safeParse(raw);
    const id = (raw as { id?: string })?.id ?? "?";
    if (!parsed.success) {
      results.push({ id, result: "rejected", reason: "invalid" });
      continue;
    }
    try {
      results.push({ id, result: await applyMutation(user, parsed.data) });
    } catch (e) {
      if (e instanceof MutationError) results.push({ id, result: "rejected", reason: e.message });
      else {
        console.error(e);
        results.push({ id, result: "error" });
      }
    }
  }
  return jsonFor(user, { results });
});
