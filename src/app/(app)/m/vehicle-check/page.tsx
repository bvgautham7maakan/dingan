import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import VehicleCheckForm from "@/components/driver/VehicleCheckForm";

export default async function VehicleCheckPage() {
  await requireRole(["DRIVER", "SUP", "HVAC_SUP", "HEAD_SUP", "ADMIN"]);
  const t = await getTranslations("nav");
  return (
    <>
      <h1>{t("vehicleCheck")}</h1>
      <VehicleCheckForm />
    </>
  );
}
