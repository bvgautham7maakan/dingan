import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { QUERY_ANSWER_ROLES, QUERY_VIEW_ROLES } from "@/lib/site/queries";
import { attachmentsOf } from "@/lib/site/projects";
import { hasAnyRole, isSiteUser } from "@/lib/roles";
import { fmtDateTime } from "@/lib/time";
import Submit from "@/components/Submit";
import { answer, close } from "../actions";

export default async function QueryDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ answered?: string }> }) {
  const me = await requireRole(QUERY_VIEW_ROLES);
  const t = await getTranslations("query");
  const { id } = await params;
  const sp = await searchParams;
  const q = await db.siteQuery.findUnique({ where: { id }, include: { project: true, raisedBy: true, answeredBy: true } });
  if (!q) notFound();
  if (isSiteUser(me.roles) && !hasAnyRole(me.roles, ["HEAD_SUP"]) && q.raisedById !== me.id) redirect("/?denied=1");
  const files = await attachmentsOf("SITE_QUERY", id);
  const canAnswer = hasAnyRole(me.roles, QUERY_ANSWER_ROLES) && q.status !== "CLOSED";
  const canClose = q.status !== "CLOSED" && (q.raisedById === me.id || hasAnyRole(me.roles, ["SE", "PE", "ADMIN"]));
  return (
    <>
      <h1>{q.ref} – {q.subject}</h1>
      <p className="muted">
        {q.project.code} · {q.raisedBy.displayName} · {fmtDateTime(q.createdAt)}
        {q.discipline && ` · ${q.discipline}`}
        {q.drawingRef && ` · ${t("drawingRef")}: ${q.drawingRef}`}
      </p>
      <p className={`status ${q.status === "OPEN" ? "status-blue" : q.status === "ANSWERED" ? "status-green" : "status-black"}`}>{t(`status_${q.status}`)}</p>
      {sp.answered && <p className="notice notice-ok" role="status">✓ {t("answerSent")}</p>}
      <h2>{t("question")}</h2>
      <p style={{ whiteSpace: "pre-wrap" }}>{q.question}</p>
      <div className="thumbs">
        {files.filter((f) => f.kind === "PHOTO").map((f) => (
          <a key={f.id} className="thumb" href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${f.id}`} alt={t("photos")} />
          </a>
        ))}
      </div>
      {files.filter((f) => f.kind === "VOICE").map((f) => <audio key={f.id} controls src={`/api/files/${f.id}`} />)}

      <h2>{t("answer")}</h2>
      {q.answer ? (
        <p style={{ whiteSpace: "pre-wrap" }}>
          {q.answer}
          <br />
          <span className="caption">{q.answeredBy?.displayName} · {fmtDateTime(q.answeredAt)}</span>
        </p>
      ) : (
        <p className="muted">{t("noAnswer")}</p>
      )}
      {canAnswer && (
        <form action={answer} className="form">
          <input type="hidden" name="id" value={q.id} />
          <div className="field">
            <label htmlFor="ans">{q.answer ? t("updateAnswer") : t("yourAnswer")}</label>
            <textarea id="ans" name="answer" rows={5} required defaultValue={q.answer ?? ""} />
          </div>
          <Submit>{t("sendAnswer")}</Submit>
        </form>
      )}
      {canClose && (
        <form action={close} style={{ marginTop: 16 }}>
          <input type="hidden" name="id" value={q.id} />
          <Submit className="btn">{t("close")}</Submit>
        </form>
      )}
    </>
  );
}
