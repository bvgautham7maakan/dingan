import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { ATTENDANCE_ROLES } from "@/lib/attendance/server";
import { db } from "@/lib/db";
import { todayDubai } from "@/lib/time";
import AttendanceScreen from "./AttendanceScreen";

// Site defaults to the user's assigned project site (others via the site picker).
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ site?: string; date?: string }> }) {
  const me = await requireRole(ATTENDANCE_ROLES);
  const sp = await searchParams;
  const t = await getTranslations("nav");
  const today = todayDubai();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const assigned = await db.projectMember.findFirst({
    where: { userId: me.id, project: { status: "ACTIVE" } },
    include: { project: true },
    orderBy: { project: { code: "asc" } },
  });
  const site =
    (sp.site && (await db.site.findUnique({ where: { id: sp.site } }))) ||
    (assigned && (await db.site.findUnique({ where: { id: assigned.project.siteId } }))) ||
    (await db.site.findFirstOrThrow({ where: { kind: "PROJECT", active: true }, orderBy: { name: "asc" } }));
  return (
    <>
      <h1>{t("attendance")}</h1>
      <AttendanceScreen initialSiteId={site.id} date={date} today={today} />
    </>
  );
}
