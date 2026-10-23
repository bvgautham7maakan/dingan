import { z } from "zod";
import { withUser, jsonFor } from "@/lib/api";
import { getMovesDay, MOVE_ROLES } from "@/lib/moves/server";

const q = z.object({ site: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const { site, date } = q.parse({ site: sp.get("site"), date: sp.get("date") });
  return jsonFor(user, await getMovesDay(user, site, date));
}, MOVE_ROLES);
