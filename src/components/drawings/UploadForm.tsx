"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

type Props = { projects: { id: string; code: string }[]; drawings: { id: string; ref: string; title: string }[]; defaultProject?: string };

/** Upload a new drawing or a new revision (PDF). Posted to /api/drawings (no server-action size limit). */
export default function UploadForm({ projects, drawings, defaultProject }: Props) {
  const t = useTranslations("dwg");
  const router = useRouter();
  const [mode, setMode] = useState<"new" | "rev">("new");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/drawings", { method: "POST", body: new FormData(e.currentTarget) });
      const body = await res.json();
      if (!res.ok) setMsg({ ok: false, text: t(`err_${body.error}`) });
      else {
        setMsg({ ok: true, text: t("uploaded", { ref: body.ref }) });
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: t("err_network") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="form">
      <div className="seg" role="group">
        <a href="#" aria-current={mode === "new"} onClick={(e) => (e.preventDefault(), setMode("new"))}>{t("newDrawing")}</a>
        <a href="#" aria-current={mode === "rev"} onClick={(e) => (e.preventDefault(), setMode("rev"))}>{t("newRevision")}</a>
      </div>
      {msg && <p className={`notice ${msg.ok ? "notice-ok" : "notice-error"}`} role="status">{msg.text}</p>}
      {mode === "new" ? (
        <>
          <div className="field">
            <label htmlFor="u-p">{t("project")} *</label>
            <select id="u-p" name="projectId" defaultValue={defaultProject}>{projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor="u-t">{t("docType")} *</label>
              <select id="u-t" name="docType">{["SHD", "DD", "ASB", "SK"].map((x) => <option key={x} value={x}>{t(`type_${x}`)}</option>)}</select>
            </div>
            <div className="field">
              <label htmlFor="u-d">{t("discipline")} *</label>
              <select id="u-d" name="discipline">{["HVAC", "ELE", "PLB", "FLS", "GEN"].map((x) => <option key={x}>{x}</option>)}</select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="u-title">{t("titleField")} *</label>
            <input id="u-title" name="title" required />
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="u-dwg">{t("drawing")} *</label>
          <select id="u-dwg" name="drawingId" required>{drawings.map((d) => <option key={d.id} value={d.id}>{d.ref} – {d.title}</option>)}</select>
        </div>
      )}
      <div className="row">
        <div className="field">
          <label htmlFor="u-rev">{t("rev")} *</label>
          <input id="u-rev" name="rev" required defaultValue={mode === "new" ? "R0" : ""} style={{ width: 90 }} />
        </div>
        <div className="field">
          <label htmlFor="u-s">{t("status")} *</label>
          <select id="u-s" name="status" defaultValue="UNDER_REVIEW">
            {["DRAFT", "UNDER_REVIEW", "APPROVED", "APPROVED_WITH_COMMENTS", "REJECTED"].map((s) => <option key={s} value={s}>{t(`st_${s}`)}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="u-f">{t("pdf")} *</label>
        <input id="u-f" name="file" type="file" accept="application/pdf" required />
      </div>
      <div className="field">
        <label htmlFor="u-n">{t("notes")}</label>
        <input id="u-n" name="notes" />
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? "…" : t("upload")}</button>
    </form>
  );
}
