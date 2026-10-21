import { z } from "zod";
import { withUser, jsonFor, ApiError } from "@/lib/api";
import { ATTENDANCE_ROLES, getAttendanceDay } from "@/lib/attendance/server";
import { db } from "@/lib/db";

const q = z.object({ site: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const { site, date } = q.parse({ site: sp.get("site"), date: sp.get("date") });
  if (!(await db.site.findUnique({ where: { id: site } }))) throw new ApiError(404, "site_not_found");
  return jsonFor(user, await getAttendanceDay(user, site, date));
}, ATTENDANCE_ROLES);
