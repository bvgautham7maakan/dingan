import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { BILL_ROLES } from "@/lib/logistics/server";
import DriverScreen from "@/components/driver/DriverScreen";

export default async function TripsPage() {
  await requireRole([...BILL_ROLES, "ADMIN"]);
  const t = await getTranslations("nav");
  return (
    <>
      <h1>{t("trips")}</h1>
      <DriverScreen />
    </>
  );
}
