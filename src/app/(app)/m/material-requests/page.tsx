import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { MR_CREATE_ROLES, MR_VIEW_ROLES } from "@/lib/materials/server";
import { canSeeMoney, hasAnyRole, HIGH_ALERT_ROLES, isSiteUser } from "@/lib/roles";
import { formatAed } from "@/lib/money";
import { fmtDate } from "@/lib/time";
import Status from "@/components/Status";
import HighAlertPanel from "@/components/HighAlertPanel";
import MRForm from "./MRForm";

export default async function MaterialRequestsPage() {
  const me = await requireRole(MR_VIEW_ROLES);
  const t = await getTranslations("mr");
  const tn = await getTranslations("nav");
  const money = canSeeMoney(me.roles);
  const seesAlerts = hasAnyRole(me.roles, HIGH_ALERT_ROLES);
  const requests = await db.materialRequest.findMany({
    where: isSiteUser(me.roles) && !hasAnyRole(me.roles, ["HEAD_SUP"]) ? { requesterId: me.id } : {},
    include: {
      project: true,
      requester: { select: { displayName: true } },
      _count: { select: { lines: true } },
      lines: { select: { _count: { select: { highAlerts: { where: { resolvedAt: null } } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const flows = await db.approvalFlow.findMany({ where: { entityType: "MATERIAL_REQUEST", entityId: { in: requests.map((r) => r.id) } }, include: { steps: true } });
  const flowBy = new Map(flows.map((f) => [f.entityId, f]));
  return (
    <>
      <h1>{tn("materialRequests")}</h1>
      {seesAlerts && <HighAlertPanel user={me} />}
      {hasAnyRole(me.roles, MR_CREATE_ROLES) && (
        <details className="panel" open={isSiteUser(me.roles)} style={{ marginBottom: 16 }}>
          <summary><b>+ {t("new")}</b></summary>
          <MRForm />
        </details>
      )}
      <div className="table-wrap">
        <table className="kem">
          <thead>
            <tr>
              <th>{t("ref")}</th><th>{t("project")}</th><th>{t("by")}</th><th>{t("date")}</th><th>{t("lines")}</th>
              <th>{t("status")}</th><th>{t("waitingFor")}</th>{money && <th>{t("value")}</th>}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && <tr><td colSpan={8} className="muted">–</td></tr>}
            {requests.map((r) => {
              const f = flowBy.get(r.id);
              const cur = f?.status === "IN_PROGRESS" ? f.steps.find((s) => s.seq === f.currentSeq) : null;
              const alerts = r.lines.reduce((a, l) => a + l._count.highAlerts, 0);
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/m/material-requests/${r.id}`}>{r.ref}</Link>
                    {seesAlerts && alerts > 0 && <div className="status status-red">⚠ HIGH-ALERT ({alerts})</div>}
                  </td>
                  <td>{r.project.code}</td>
                  <td>{r.requester.displayName}</td>
                  <td>{fmtDate(r.createdAt)}</td>
                  <td>{r._count.lines}</td>
                  <td><Status code={r.status} label={t(`status_${r.status}`)} />{r.lpoNo && <div className="caption">LPO {r.lpoNo}</div>}</td>
                  <td>{cur?.label ?? "–"}</td>
                  {money && <td>{formatAed(r.totalFils)}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
