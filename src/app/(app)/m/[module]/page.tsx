import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/current";
import { findNavItem } from "@/lib/nav";
import { hasAnyRole } from "@/lib/roles";

// Placeholder for every module not built yet. Access rules still apply.
export default async function ModulePlaceholder({ params }: { params: Promise<{ module: string }> }) {
  const me = await requireUser();
  const { module } = await params;
  const item = findNavItem(`/m/${module}`);
  if (!item) notFound();
  if (!hasAnyRole(me.roles, item.roles)) redirect("/?denied=1");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const stage = item.stage ?? "M2";
  return (
    <>
      <h1>{tn(item.key)}</h1>
      <div className="card card-later" style={{ maxWidth: 520 }}>
        <h3>
          {stage.startsWith("P") ? tc("comingPhase", { phase: stage[1] }) : tc("comingStage", { stage })}
        </h3>
        <p className="muted">{tc("comingText")}</p>
      </div>
    </>
  );
}
