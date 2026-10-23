import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { reportDetail, REPORT_VIEW_ROLES } from "@/lib/site/reports";
import { hasAnyRole, isSiteUser } from "@/lib/roles";
import { fmtIsoDay } from "@/lib/time";
import StepBar from "@/components/StepBar";
import { approveReport, returnReport } from "../actions";

type Manpower = {
  own?: number;
  subs?: { name: string; count: number }[];
  remarks?: string;
  materialsNeeded?: string | null;
  attendance?: { present: number; late: number; leave: string[]; movedIn: number; movedOut: number };
};

export default async function ReportDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const me = await requireRole(REPORT_VIEW_ROLES);
  const t = await getTranslations("report");
  const { id } = await params;
  const sp = await searchParams;
  const r = await reportDetail(me, id);
  if (!r) notFound();
  if (isSiteUser(me.roles) && !hasAnyRole(me.roles, ["HEAD_SUP"]) && r.authorId !== me.id) redirect("/?denied=1");
  const mp = (r.manpower ?? {}) as Manpower;
  return (
    <>
      <h1>
        {t("title")} – {r.project.code} {fmtIsoDay(r.date)}
      </h1>
      <p className="muted">{t("by")} {r.author.displayName}</p>
      {sp.error && <p className="notice notice-error" role="alert">{t(`err_${sp.error}`)}</p>}
      {sp.done && <p className="notice notice-ok" role="status">✓ {t("decided")}</p>}
      {r.flow && <StepBar flow={r.flow} />}

      {r.flow?.canAct && (
        <form action={approveReport} className="panel form" style={{ maxWidth: 640, margin: "12px 0" }}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="flowId" value={r.flow.id} />
          <div className="field">
            <label htmlFor="rc">{t("comment")}</label>
            <textarea id="rc" name="comment" rows={2} />
          </div>
          <div className="row">
            <button className="btn btn-primary">✓ {t("checked")}</button>
            <button className="btn btn-danger" formAction={returnReport}>↩ {t("return")}</button>
          </div>
        </form>
      )}

      <h2>1. {t("step_manpower")}</h2>
      <p>
        {t("ownWorkers")}: <b>{mp.own ?? "–"}</b>
        {mp.subs?.map((s) => ` · ${s.name}: ${s.count}`)}
      </p>
      {mp.attendance && (
        <p className="caption">
          {t("fromAttendance", { present: mp.attendance.present, late: mp.attendance.late })}
          {mp.attendance.leave.length > 0 && ` · ${t("onLeave")}: ${mp.attendance.leave.join(", ")}`}
        </p>
      )}
      {mp.remarks && <p>{mp.remarks}</p>}

      <h2>2. {t("step_work")}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{r.workDone}</p>
      <div className="thumbs">
        {r.attachments.filter((a) => a.kind === "PHOTO").map((a) => (
          <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer" className="thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${a.id}`} alt={t("photo")} />
          </a>
        ))}
      </div>
      {r.attachments.filter((a) => a.kind === "VOICE").map((a) => <audio key={a.id} controls src={`/api/files/${a.id}`} />)}

      <h2>3. {t("step_issues")}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{r.issues || "–"}</p>
      {mp.materialsNeeded && <p><b>{t("materials")}:</b> {mp.materialsNeeded}</p>}

      <h2>4. {t("step_tomorrow")}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{r.nextDay || "–"}</p>
    </>
  );
}
