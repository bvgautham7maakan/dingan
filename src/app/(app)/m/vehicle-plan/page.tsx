import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { getVehiclePlan, PLAN_APPROVER, TRIP_EDIT_ROLES, TRIP_VIEW_ROLES } from "@/lib/logistics/server";
import { clashedTripIds } from "@/lib/logistics/clash";
import { hasAnyRole } from "@/lib/roles";
import { addDaysIso, dubaiHHMM, fmtIsoDay, todayDubai } from "@/lib/time";
import StepBar from "@/components/StepBar";
import Submit from "@/components/Submit";
import { addTrip, approvePlan, cancelTrip, returnPlan, submitForApproval } from "./actions";

export default async function VehiclePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; saved?: string; submitted?: string; error?: string }>;
}) {
  const me = await requireRole(TRIP_VIEW_ROLES);
  const t = await getTranslations("veh");
  const tc = await getTranslations("common");
  const sp = await searchParams;
  const today = todayDubai();
  const tomorrow = addDaysIso(today, 1);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const canEdit = hasAnyRole(me.roles, TRIP_EDIT_ROLES);
  const isApprover = hasAnyRole(me.roles, [PLAN_APPROVER]);
  const { plan, trips, clashes, flow } = await getVehiclePlan(me, date);
  const clashed = clashedTripIds(clashes);
  const [vehicles, sites, drivers, workers] = canEdit
    ? await Promise.all([
        db.vehicle.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        db.site.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
        db.user.findMany({ where: { active: true, roles: { some: { role: { in: ["DRIVER", "SUP", "HVAC_SUP", "HEAD_SUP"] } } } }, orderBy: { displayName: "asc" } }),
        db.worker.findMany({ where: { status: "ACTIVE" }, orderBy: { empCode: "asc" } }),
      ])
    : [[], [], [], []];
  const status = plan?.status ?? "DRAFT";

  return (
    <>
      <h1>{t("title")}</h1>
      <div className="seg" role="group" aria-label={t("day")}>
        <Link href={`/m/vehicle-plan?date=${today}`} aria-current={date === today}>{t("today")}</Link>
        <Link href={`/m/vehicle-plan?date=${tomorrow}`} aria-current={date === tomorrow}>{t("tomorrow")}</Link>
      </div>
      <p>
        <b>{fmtIsoDay(date)}</b> · {t("planStatus")}:{" "}
        <span className={`status ${status === "APPROVED" ? "status-green" : status === "SUBMITTED" ? "status-blue" : "status-grey"}`}>
          {status === "APPROVED" ? "✓" : status === "SUBMITTED" ? "◔" : "○"} {t(`status_${status}`)}
        </span>
      </p>
      {sp.saved && <p className="notice notice-ok" role="status">✓ {t("tripSaved")}</p>}
      {sp.submitted && <p className="notice notice-ok" role="status">✓ {t("submitted")}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{sp.error}</p>}

      {clashes.length > 0 && (
        <div className="clash-banner" role="alert" data-testid="clash-banner">
          <b>⚠ {t("clashTitle", { count: clashes.length })}</b>
          <ul>
            {clashes.map((c, i) => (
              <li key={i}>
                {c.kind === "vehicle" ? t("clashVehicle", { who: c.who }) : t("clashDriver", { who: c.who })}:{" "}
                {dubaiHHMM(c.a.out)}–{dubaiHHMM(c.a.back)} {c.a.from} → {c.a.to} {t("and")} {dubaiHHMM(c.b.out)}–{dubaiHHMM(c.b.back)} {c.b.from} → {c.b.to}
              </li>
            ))}
          </ul>
        </div>
      )}

      {flow && <StepBar flow={flow} />}
      {flow?.canAct && (
        <form action={approvePlan} className="form-inline" style={{ marginBottom: 16 }}>
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="flowId" value={flow.id} />
          <div className="field">
            <label htmlFor="plan-comment">{t("comment")}</label>
            <input id="plan-comment" name="comment" />
          </div>
          <button className="btn btn-primary">✓ {t("approve")}</button>
          <button className="btn btn-danger" formAction={returnPlan}>↩ {t("return")}</button>
        </form>
      )}

      <div className="table-wrap" tabIndex={0}>
        <table className="kem">
          <thead>
            <tr>
              <th>{t("vehicle")}</th>
              <th>{t("time")}</th>
              <th>{t("route")}</th>
              <th>{t("driver")}</th>
              <th>{t("purpose")}</th>
              <th>{t("status")}</th>
              {canEdit && <th>{tc("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {trips.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">{t("noTrips")}</td>
              </tr>
            )}
            {trips.map((tr) => (
              <tr key={tr.id} className={clashed.has(tr.id) ? "row-clash" : undefined}>
                <td>
                  <b>{tr.vehicle.name}</b>
                  {clashed.has(tr.id) && <div className="status status-red">⚠ {t("clash")}</div>}
                </td>
                <td>{dubaiHHMM(tr.plannedOut)}–{dubaiHHMM(tr.plannedReturn)}</td>
                <td>
                  {tr.fromSite.name} → {tr.toSite.name}
                  {tr.passengers.length > 0 && <div className="caption">{tr.passengers.map((p) => p.worker.name).join(", ")}</div>}
                  {tr.materialsText && <div className="caption">▤ {tr.materialsText}</div>}
                </td>
                <td>{tr.driver?.displayName ?? "–"}</td>
                <td>{tr.purpose ?? "–"}</td>
                <td>{t(`trip_${tr.status}`)}</td>
                {canEdit && (
                  <td>
                    {tr.status === "PLANNED" && (
                      <form action={cancelTrip}>
                        <input type="hidden" name="id" value={tr.id} />
                        <Submit className="btn" confirm={t("cancelConfirm")}>{t("cancel")}</Submit>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && status !== "APPROVED" && trips.length > 0 && (
        <form action={submitForApproval} style={{ margin: "12px 0" }}>
          <input type="hidden" name="date" value={date} />
          {(!flow || flow.status !== "IN_PROGRESS") && (
            <Submit className="btn btn-primary btn-big">{isApprover ? `✓ ${t("approvePlan")}` : t("submit")}</Submit>
          )}
        </form>
      )}
      {!canEdit && <p className="caption">{t("viewOnly")}</p>}

      {canEdit && (
        <details className="panel" style={{ marginTop: 16 }} open={trips.length === 0}>
          <summary><b>+ {t("addTrip")}</b></summary>
          <form action={addTrip} className="form" style={{ marginTop: 12 }}>
            <input type="hidden" name="date" value={date} />
            <div className="field">
              <label htmlFor="t-veh">{t("vehicle")} *</label>
              <select id="t-veh" name="vehicleId" required>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="t-drv">{t("driver")}</label>
              <select id="t-drv" name="driverId">
                <option value="">–</option>
                {drivers.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="t-from">{t("from")} *</label>
              <select id="t-from" name="fromSiteId" required>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="t-to">{t("to")} *</label>
              <select id="t-to" name="toSiteId" required>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="t-out">{t("out")} *</label>
                <input id="t-out" name="out" type="time" required defaultValue="08:00" />
              </div>
              <div className="field">
                <label htmlFor="t-back">{t("back")} *</label>
                <input id="t-back" name="back" type="time" required defaultValue="10:00" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="t-purpose">{t("purpose")}</label>
              <input id="t-purpose" name="purpose" />
            </div>
            <div className="field">
              <label htmlFor="t-mat">{t("materials")}</label>
              <textarea id="t-mat" name="materials" rows={2} />
            </div>
            <details>
              <summary>{t("passengers")}</summary>
              <div className="checks" style={{ marginTop: 8 }}>
                {workers.map((w) => (
                  <label key={w.id} className="check-chip">
                    <input type="checkbox" name="passengers" value={w.id} /> {w.name}
                  </label>
                ))}
              </div>
            </details>
            <Submit>{t("addTrip")}</Submit>
          </form>
        </details>
      )}
    </>
  );
}
