import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { QUERY_VIEW_ROLES } from "@/lib/site/queries";
import QueryScreen from "./QueryScreen";

export default async function SiteQueriesPage() {
  await requireRole(QUERY_VIEW_ROLES);
  const tn = await getTranslations("nav");
  return (
    <>
      <h1>{tn("siteQueries")}</h1>
      <QueryScreen />
    </>
  );
}
