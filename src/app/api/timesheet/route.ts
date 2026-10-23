import { withUser, jsonFor, ApiError } from "@/lib/api";
import { buildTimesheet, loadSettings } from "@/lib/timesheet/build";
import { cycleFor } from "@/lib/timesheet/rules";
import { TIMESHEET_ROLES } from "@/lib/timesheet/access";

// GET /api/timesheet?start=yyyy-mm-dd[&emp=E01] → computed days (with hours per site) and totals
export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const start = sp.get("start") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new ApiError(400, "start_required");
  const cycle = cycleFor(start, await loadSettings());
  const ts = await buildTimesheet(cycle.start, cycle.end);
  const emp = sp.get("emp");
  return jsonFor(user, {
    start: cycle.start,
    end: cycle.end,
    grand: ts.grand,
    workers: ts.workers
      .filter((w) => !emp || w.empCode === emp)
      .map((w) => ({
        empCode: w.empCode,
        name: w.name,
        totals: w.totals,
        days: w.days.map((d) => ({ ...d, bySite: Object.fromEntries(d.bySite) })),
      })),
  });
}, TIMESHEET_ROLES);
