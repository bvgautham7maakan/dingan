import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { DUTY_ASSIGN_ROLES, DUTY_VIEW_ROLES } from "@/lib/site/duties";
import { hasAnyRole } from "@/lib/roles";
import { addDaysIso, todayDubai } from "@/lib/time";
import Submit from "@/components/Submit";
import DutiesScreen from "./DutiesScreen";
import { createDuty } from "./actions";

export default async function DutiesPage({ searchParams }: { searchParams: Promise<{ assigned?: string }> }) {
  const me = await requireRole(DUTY_VIEW_ROLES);
  const t = await getTranslations("duty");
  const tn = await getTranslations("nav");
  const sp = await searchParams;
  const canAssign = hasAnyRole(me.roles, DUTY_ASSIGN_ROLES);
  const [projects, people] = canAssign
    ? await Promise.all([
        db.project.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } }),
        db.user.findMany({ where: { active: true, roles: { some: { role: { in: ["SUP", "HVAC_SUP"] } } } }, orderBy: { displayName: "asc" } }),
      ])
    : [[], []];
  return (
    <>
      <h1>{tn("duties")}</h1>
      {sp.assigned && <p className="notice notice-ok" role="status">✓ {t("assigned")}</p>}
      {canAssign && (
        <details className="panel" style={{ marginBottom: 16 }}>
          <summary><b>+ {t("assign")}</b></summary>
          <form action={createDuty} className="form" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="d-title">{t("title")} *</label>
              <input id="d-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="d-detail">{t("detail")}</label>
              <textarea id="d-detail" name="detail" rows={2} />
            </div>
            <div className="field">
              <label htmlFor="d-proj">{t("project")} *</label>
              <select id="d-proj" name="projectId" required>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="d-who">{t("assignee")} *</label>
              <select id="d-who" name="assigneeId" required>
                {people.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="d-date">{t("deadlineDate")} *</label>
                <input id="d-date" name="date" type="date" required defaultValue={addDaysIso(todayDubai(), 1)} />
              </div>
              <div className="field">
                <label htmlFor="d-time">{t("deadlineTime")} *</label>
                <input id="d-time" name="time" type="time" required defaultValue="17:00" />
              </div>
            </div>
            <Submit>{t("assign")}</Submit>
          </form>
        </details>
      )}
      <DutiesScreen />
    </>
  );
}
