import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { ATTENDANCE_ROLES } from "@/lib/attendance/server";
import { defaultSiteFor } from "@/lib/sites";
import { todayDubai } from "@/lib/time";
import AttendanceScreen from "./AttendanceScreen";

// Site defaults to the user's assigned project site (others via the site picker).
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ site?: string; date?: string }> }) {
  const me = await requireRole(ATTENDANCE_ROLES);
  const sp = await searchParams;
  const t = await getTranslations("nav");
  const today = todayDubai();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const site = await defaultSiteFor(me.id, sp.site);
  return (
    <>
      <h1>{t("attendance")}</h1>
      <AttendanceScreen initialSiteId={site.id} date={date} today={today} />
    </>
  );
}
