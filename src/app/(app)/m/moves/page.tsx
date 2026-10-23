import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { MOVE_ROLES } from "@/lib/moves/server";
import { defaultSiteFor } from "@/lib/sites";
import { todayDubai } from "@/lib/time";
import MovesScreen from "./MovesScreen";

export default async function MovesPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const me = await requireRole(MOVE_ROLES);
  const sp = await searchParams;
  const t = await getTranslations("nav");
  const site = await defaultSiteFor(me.id, sp.site);
  return (
    <>
      <h1>{t("moves")}</h1>
      <MovesScreen initialSiteId={site.id} date={todayDubai()} />
    </>
  );
}
