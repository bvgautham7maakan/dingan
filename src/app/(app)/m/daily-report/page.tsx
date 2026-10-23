import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { REPORT_VIEW_ROLES, REPORT_WRITE_ROLES } from "@/lib/site/reports";
import { hasAnyRole, isSiteUser } from "@/lib/roles";
import { fmtIsoDay, todayDubai } from "@/lib/time";
import ReportWizard from "./ReportWizard";

const STATUS: Record<string, [string, string]> = {
  UNDER_REVIEW: ["status-blue", "◔"], APPROVED: ["status-green", "✓"], RETURNED: ["status-red", "↩"], DRAFT: ["status-grey", "○"],
};

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const me = await requireRole(REPORT_VIEW_ROLES);
  const t = await getTranslations("report");
  const tn = await getTranslations("nav");
  const sp = await searchParams;
  const writer = hasAnyRole(me.roles, ["SUP", "HVAC_SUP"]);
  const reports = await db.dailyReport.findMany({
    where: isSiteUser(me.roles) && !hasAnyRole(me.roles, ["HEAD_SUP"]) ? { authorId: me.id } : {},
    include: { project: true, author: { select: { displayName: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 60,
  });
  const flows = await db.approvalFlow.findMany({
    where: { entityType: "DAILY_REPORT", entityId: { in: reports.map((r) => r.id) } },
    include: { steps: true },
  });
  const flowBy = new Map(flows.map((f) => [f.entityId, f]));
  return (
    <>
      <h1>{tn("dailyReport")}</h1>
      {writer && <ReportWizard date={todayDubai()} initialProject={sp.project} />}
      {hasAnyRole(me.roles, REPORT_WRITE_ROLES) && writer && <h2>{t("myReports")}</h2>}
      <div className="table-wrap" tabIndex={0} style={{ marginTop: 12 }}>
        <table className="kem">
          <thead>
            <tr><th>{t("date")}</th><th>{t("project")}</th><th>{t("by")}</th><th>{t("status")}</th><th>{t("waitingFor")}</th></tr>
          </thead>
          <tbody>
            {reports.length === 0 && <tr><td colSpan={5} className="muted">–</td></tr>}
            {reports.map((r) => {
              const f = flowBy.get(r.id);
              const cur = f?.status === "IN_PROGRESS" ? f.steps.find((s) => s.seq === f.currentSeq) : null;
              const [cls, icon] = STATUS[r.status] ?? STATUS.DRAFT;
              return (
                <tr key={r.id}>
                  <td><Link href={`/m/daily-report/${r.id}`}>{fmtIsoDay(r.date)}</Link></td>
                  <td>{r.project.code}</td>
                  <td>{r.author.displayName}</td>
                  <td><span className={`status ${cls}`}>{icon} {t(`status_${r.status}`)}</span></td>
                  <td>{cur?.label ?? "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
