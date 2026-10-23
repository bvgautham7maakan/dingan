import { withUser, ApiError } from "@/lib/api";
import { buildTimesheet } from "@/lib/timesheet/build";
import { timesheetWorkbook } from "@/lib/timesheet/export";
import { cycleFor } from "@/lib/timesheet/rules";
import { loadSettings } from "@/lib/timesheet/build";
import { TIMESHEET_ROLES } from "@/lib/timesheet/access";
import { audit } from "@/lib/audit";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${Number(iso.slice(8))}-${MON[Number(iso.slice(5, 7)) - 1]}`;

// GET /api/timesheet/export?start=2026-09-26 → KEM Timesheet 26-Sep to 25-Oct 2026.xlsx
export const GET = withUser(async (user, req) => {
  const start = new URL(req.url).searchParams.get("start") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new ApiError(400, "start_required");
  const cycle = cycleFor(start, await loadSettings());
  if (cycle.start !== start) throw new ApiError(400, "start_must_be_cycle_start");
  const ts = await buildTimesheet(cycle.start, cycle.end);
  const buf = await timesheetWorkbook(ts);
  const name = `KEM Timesheet ${short(cycle.start)} to ${short(cycle.end)} ${cycle.end.slice(0, 4)}.xlsx`;
  await audit({ actorId: user.id, action: "EXPORT", entityType: "Timesheet", entityId: cycle.start });
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}, TIMESHEET_ROLES);
