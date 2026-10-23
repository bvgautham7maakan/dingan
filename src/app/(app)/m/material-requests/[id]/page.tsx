import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { flowView } from "@/lib/flows";
import { bulThreshold, LABEL, MR_VIEW_ROLES } from "@/lib/materials/server";
import { canSeeMoney, hasAnyRole, HIGH_ALERT_ROLES, isSiteUser } from "@/lib/roles";
import { formatAed } from "@/lib/money";
import { fmtDateTime, fmtIsoDay } from "@/lib/time";
import Status from "@/components/Status";
import StepBar from "@/components/StepBar";
import Submit from "@/components/Submit";
import { approveMR, closeMR, resolve, returnMR } from "../actions";

export default async function MRDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const me = await requireRole(MR_VIEW_ROLES);
  const t = await getTranslations("mr");
  const { id } = await params;
  const sp = await searchParams;
  const r = await db.materialRequest.findUnique({
    where: { id },
    include: {
      project: { include: { pm: { select: { displayName: true } } } },
      requester: { select: { displayName: true } },
      lines: { include: { material: true, submittal: true, highAlerts: { include: { resolvedBy: { select: { displayName: true } } } } } },
    },
  });
  if (!r) notFound();
  if (isSiteUser(me.roles) && !hasAnyRole(me.roles, ["HEAD_SUP"]) && r.requesterId !== me.id) redirect("/?denied=1");
  const money = canSeeMoney(me.roles);
  const seesAlerts = hasAnyRole(me.roles, HIGH_ALERT_ROLES);
  const flow = await flowView(me, "MATERIAL_REQUEST", id);
  const step = flow?.canAct ? flow.currentLabel : null;
  const alerts = r.lines.flatMap((l) => l.highAlerts.map((a) => ({ ...a, material: l.material.name })));
  const threshold = money ? await bulThreshold(r.projectId) : 0;

  return (
    <>
      <h1>{r.ref}</h1>
      <p>
        <Status code={r.status} label={t(`status_${r.status}`)} /> · {r.project.code} – {r.project.name} · {t("by")} {r.requester.displayName} · {fmtDateTime(r.createdAt)}
        {r.neededBy && ` · ${t("neededBy")} ${fmtIsoDay(r.neededBy)}`}
        {r.lpoNo && <> · <b>LPO {r.lpoNo}</b></>}
      </p>
      {r.note && <p>“{r.note}”</p>}
      {sp.error && <p className="notice notice-error" role="alert">{t(`err_${sp.error}`)}</p>}
      {sp.done && <p className="notice notice-ok" role="status">✓ {t("saved")}</p>}

      {seesAlerts && alerts.length > 0 && (
        <section className="alert-panel" role="alert" data-testid="high-alert">
          <h2>⚠ HIGH-ALERT</h2>
          {alerts.map((a) => (
            <div key={a.id} style={{ marginBottom: 10 }}>
              <b>{t(`alert_${a.type}`)}</b>: {a.detail}
              {a.resolvedAt ? (
                <div className="status status-green">✓ {t("checkedBy")} {a.resolvedBy?.displayName}: {a.resolution}</div>
              ) : (
                <form action={resolve} className="row" style={{ marginTop: 6 }}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="alertId" value={a.id} />
                  <input name="resolution" placeholder={t("resolutionHint")} aria-label={t("resolution")} required style={{ minWidth: 260 }} />
                  <Submit className="btn">{t("markChecked")}</Submit>
                </form>
              )}
            </div>
          ))}
        </section>
      )}

      {flow && <StepBar flow={flow} />}
      {money && <p className="caption">{t("routing", { pm: r.project.pm?.displayName ?? t("ops"), limit: formatAed(threshold) })}</p>}

      <form action={approveMR}>
        <input type="hidden" name="id" value={r.id} />
        {flow && <input type="hidden" name="flowId" value={flow.id} />}
        <div className="table-wrap">
          <table className="kem">
            <thead>
              <tr>
                <th>{t("material")}</th><th>{t("brand")}</th><th>{t("spec")}</th><th>{t("quantity")}</th>
                {money && <><th>{t("rate")}</th><th>{t("amount")}</th></>}
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.material.name}
                    <div className="caption">{l.material.discipline}</div>
                  </td>
                  <td>
                    {l.brand ?? "–"}
                    {l.submittal ? <div className="caption">{l.submittal.msNo} · {t(`ms_${l.submittal.status}`)}</div> : <div className="caption">{t("noMs")}</div>}
                  </td>
                  <td>{l.spec ?? "–"}</td>
                  <td>{l.qty} {l.unit}</td>
                  {money && (
                    <>
                      <td>
                        {step === LABEL.est ? (
                          <input name={`rate:${l.id}`} type="number" step="0.01" min="0" defaultValue={l.rateFils != null ? l.rateFils / 100 : ""} aria-label={`${t("rate")} ${l.material.name}`} style={{ width: 120 }} required />
                        ) : (
                          formatAed(l.rateFils)
                        )}
                      </td>
                      <td>{l.rateFils != null ? formatAed(Math.round(l.qty * l.rateFils)) : "–"}</td>
                    </>
                  )}
                </tr>
              ))}
              {money && (
                <tr>
                  <td colSpan={5}><b>{t("total")}</b></td>
                  <td><b>{formatAed(r.totalFils)}</b></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {step && (
          <div className="panel form" style={{ maxWidth: 640, marginTop: 16 }}>
            <b>{t("yourStep")}: {step}</b>
            {step === LABEL.est && <span className="caption">{t("estHint")}</span>}
            {step === LABEL.proc && (
              <div className="field">
                <label htmlFor="lpo">{t("lpoNo")} *</label>
                <input id="lpo" name="lpoNo" defaultValue={r.lpoNo ?? ""} />
              </div>
            )}
            <div className="field">
              <label htmlFor="mr-c">{t("comment")}</label>
              <textarea id="mr-c" name="comment" rows={2} />
            </div>
            <div className="row">
              <button className="btn btn-primary">✓ {step === LABEL.proc ? t("markOrdered") : t("approve")}</button>
              <button className="btn btn-danger" formAction={returnMR}>↩ {t("return")}</button>
            </div>
          </div>
        )}
      </form>

      {r.status === "RETURNED" && r.requesterId === me.id && (
        <form action={closeMR} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={r.id} />
          <p className="muted">{t("returnedHint")}</p>
          <Submit className="btn">{t("close")}</Submit>
        </form>
      )}
    </>
  );
}
