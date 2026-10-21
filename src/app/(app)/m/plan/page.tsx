import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { PLAN_ROLES } from "@/lib/attendance/server";
import { addDaysIso, fmtIsoDay, todayDubai } from "@/lib/time";
import Submit from "@/components/Submit";
import { copyPrevious, savePlan } from "./actions";

const SHIFT_LABEL = { DAY: "Day 08:00", NIGHT: "Night 23:00", EVE: "20:00", OTHER: "Other" } as const;

// Head supervisor's plan for a day: which workers go to which site, by which vehicle.
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; saved?: string; nofrom?: string }>;
}) {
  await requireRole(PLAN_ROLES);
  const t = await getTranslations("plan");
  const tc = await getTranslations("common");
  const sp = await searchParams;
  const today = todayDubai();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : addDaysIso(today, 1);
  const source = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : date;
  const [workers, sites, vehicles, plan] = await Promise.all([
    db.worker.findMany({ where: { status: "ACTIVE" }, orderBy: { empCode: "asc" } }),
    db.site.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.dayPlan.findUnique({ where: { date: source }, include: { lines: true } }),
  ]);
  const lineBy = new Map(plan?.lines.map((l) => [l.workerId, l]) ?? []);
  const perSite = new Map<string, number>();
  for (const l of plan?.lines ?? []) perSite.set(l.siteId, (perSite.get(l.siteId) ?? 0) + 1);

  return (
    <>
      <h1>{t("title")}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn" href={`/m/plan?date=${addDaysIso(date, -1)}`} aria-label={t("prevDay")}>‹</Link>
        <b style={{ fontSize: 18 }}>
          {fmtIsoDay(date)} {date === today ? `· ${t("today")}` : date === addDaysIso(today, 1) ? `· ${t("tomorrow")}` : ""}
        </b>
        <Link className="btn" href={`/m/plan?date=${addDaysIso(date, 1)}`} aria-label={t("nextDay")}>›</Link>
      </div>
      {sp.saved && <p className="notice notice-ok" role="status">✓ {t("saved")}</p>}
      {sp.from && <p className="notice notice-warn">{t("copied", { from: fmtIsoDay(sp.from) })}</p>}
      {sp.nofrom && <p className="notice notice-warn">{t("noPrevious")}</p>}
      {!plan && !sp.from && <p className="muted">{t("empty")}</p>}

      {perSite.size > 0 && (
        <p className="caption">
          {sites.filter((s) => perSite.has(s.id)).map((s) => `${s.name}: ${perSite.get(s.id)}`).join(" · ")}
        </p>
      )}

      <form action={copyPrevious} style={{ marginBottom: 12 }}>
        <input type="hidden" name="date" value={date} />
        <Submit className="btn">{t("copyPrevious")}</Submit>
      </form>

      <form action={savePlan}>
        <input type="hidden" name="date" value={date} />
        <ul className="plan-list">
          {workers.map((w) => {
            const l = lineBy.get(w.id);
            return (
              <li key={w.id} className="plan-row">
                <input type="hidden" name="worker" value={w.id} />
                <div className="plan-who">
                  <b>{w.name}</b> <span className="caption">{w.empCode}</span>
                </div>
                <div className="field">
                  <label htmlFor={`site-${w.id}`}>{t("site")}</label>
                  <select id={`site-${w.id}`} name={`site:${w.id}`} defaultValue={l?.siteId ?? ""}>
                    <option value="">– {t("notPlanned")}</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`veh-${w.id}`}>{t("vehicle")}</label>
                  <select id={`veh-${w.id}`} name={`vehicle:${w.id}`} defaultValue={l?.vehicleId ?? ""}>
                    <option value="">–</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`shift-${w.id}`}>{t("shift")}</label>
                  <select id={`shift-${w.id}`} name={`shift:${w.id}`} defaultValue={l?.shift ?? "DAY"}>
                    {Object.entries(SHIFT_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="plan-save">
          <Submit className="btn btn-primary btn-big">{tc("save")}</Submit>
        </div>
      </form>
    </>
  );
}
