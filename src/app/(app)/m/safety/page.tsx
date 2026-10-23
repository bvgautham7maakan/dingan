import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { SAFETY_ROLES } from "@/lib/site/safety";
import { hasAnyRole } from "@/lib/roles";
import { addDaysIso, dubaiHHMM, fmtIsoDay, todayDubai } from "@/lib/time";
import SafetyForm from "./SafetyForm";

type Item = { key: string; result: string; note?: string };

export default async function SafetyPage() {
  const me = await requireRole(SAFETY_ROLES);
  const t = await getTranslations("safety");
  const tn = await getTranslations("nav");
  const today = todayDubai();
  const overview = hasAnyRole(me.roles, ["HEAD_SUP", "SE", "PE", "ADMIN"]);
  const recent = overview
    ? await db.safetyChecklist.findMany({
        where: { date: { gte: addDaysIso(today, -7) } },
        include: { project: true, by: { select: { displayName: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      })
    : [];
  const projects = overview ? await db.project.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } }) : [];
  const doneToday = new Set(recent.filter((r) => r.date === today).map((r) => r.projectId));
  return (
    <>
      <h1>{tn("safety")}</h1>
      {hasAnyRole(me.roles, ["SUP", "HVAC_SUP", "HEAD_SUP"]) && <SafetyForm date={today} />}
      {overview && (
        <>
          <h2>{t("overview")}</h2>
          <p>
            {projects.map((p) => (
              <span key={p.id} className={`status ${doneToday.has(p.id) ? "status-green" : "status-red"}`} style={{ marginRight: 14 }}>
                {doneToday.has(p.id) ? "✓" : "⚠"} {p.code}
              </span>
            ))}
          </p>
          <div className="table-wrap">
            <table className="kem">
              <thead><tr><th>{t("date")}</th><th>{t("project")}</th><th>{t("by")}</th><th>{t("issues")}</th><th>{t("photo")}</th></tr></thead>
              <tbody>
                {recent.length === 0 && <tr><td colSpan={5} className="muted">–</td></tr>}
                {recent.map((r) => {
                  const issues = (r.items as Item[]).filter((i) => i.result === "ISSUE");
                  return (
                    <tr key={r.id}>
                      <td>{fmtIsoDay(r.date)} {dubaiHHMM(r.createdAt)}</td>
                      <td>{r.project.code}</td>
                      <td>{r.by.displayName}</td>
                      <td>
                        {issues.length === 0 ? (
                          <span className="status status-green">✓ {t("noIssues")}</span>
                        ) : (
                          <span className="status status-red">⚠ {issues.map((i) => `${t(`item_${i.key}`)}: ${i.note}`).join(" · ")}</span>
                        )}
                      </td>
                      <td>{r.photoId ? <a href={`/api/files/${r.photoId}`} target="_blank" rel="noopener noreferrer">{t("view")}</a> : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
