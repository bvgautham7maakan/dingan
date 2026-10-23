"use client";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import PhotoList from "@/components/PhotoList";
import VoiceNote from "@/components/VoiceNote";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue, enqueueFile } from "@/lib/offline/outbox";
import { DISCIPLINES, type MutationOf } from "@/lib/sync/schema";

type Q = { id: string; ref: string; project: string; subject: string; status: string; raisedBy: string; createdAt: string; answer: string | null; answeredBy: string | null };
type Data = { canRaise: boolean; projects: { id: string; code: string; name: string; mine: boolean }[]; queries: Q[] };

export default function QueryScreen() {
  const t = useTranslations("query");
  const { data, queue } = useCachedApi<Data>("/api/site-queries");
  const [projectId, setProjectId] = useState("");
  const [discipline, setDiscipline] = useState<(typeof DISCIPLINES)[number] | "">("");
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [drawingRef, setDrawingRef] = useState("");
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [sent, setSent] = useState(false);
  if (!data) return <p className="muted">…</p>;
  const pid = projectId || data.projects[0]?.id || "";
  const ready = pid && subject.trim() && question.trim();
  const queued = queue.filter((m): m is MutationOf<"query.create"> => m.type === "query.create");

  const submit = async () => {
    const photoClientIds = [];
    for (const p of photos) photoClientIds.push(await enqueueFile(p, "queries", pid));
    const voiceClientId = voice ? await enqueueFile(voice, "queries", pid) : undefined;
    await enqueue({
      id: crypto.randomUUID(), type: "query.create", at: new Date().toISOString(),
      payload: { projectId: pid, subject: subject.trim(), question: question.trim(), discipline: discipline || undefined, drawingRef: drawingRef.trim() || undefined, photoClientIds, voiceClientId },
    });
    setSubject(""); setQuestion(""); setDrawingRef(""); setPhotos([]); setVoice(null); setDiscipline(""); setSent(true);
  };

  return (
    <div className="att">
      <SyncStatus />
      {data.canRaise && (
        <details className="panel" open>
          <summary><b>+ {t("ask")}</b></summary>
          {sent && <p className="notice notice-ok" role="status">✓ {t("sent")}</p>}
          <div className="field">
            <label htmlFor="q-proj">{t("project")}</label>
            <select id="q-proj" value={pid} onChange={(e) => setProjectId(e.target.value)}>
              {data.projects.map((p) => <option key={p.id} value={p.id}>{p.mine ? "★ " : ""}{p.code} – {p.name}</option>)}
            </select>
          </div>
          <fieldset className="chips-row">
            <legend className="label">{t("discipline")}</legend>
            {DISCIPLINES.map((d) => (
              <button key={d} type="button" className="chip" aria-pressed={discipline === d} onClick={() => setDiscipline(discipline === d ? "" : d)}>{d}</button>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="q-sub">{t("subject")} *</label>
            <input id="q-sub" value={subject} onChange={(e) => (setSubject(e.target.value), setSent(false))} />
          </div>
          <div className="field">
            <label htmlFor="q-q">{t("question")} *</label>
            <textarea id="q-q" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="q-dwg">{t("drawingRef")}</label>
            <input id="q-dwg" value={drawingRef} onChange={(e) => setDrawingRef(e.target.value)} placeholder="NBK-SHD-HVAC-005" />
          </div>
          <PhotoList label={t("photos")} value={photos} onChange={setPhotos} max={6} />
          <VoiceNote value={voice} onChange={setVoice} />
          <button type="button" className="btn btn-primary btn-big" disabled={!ready} onClick={() => void submit()}>
            ✓ {t("send")}
          </button>
        </details>
      )}

      <h2>{t("list")}</h2>
      <ul className="att-list">
        {queued.map((m) => (
          <li key={m.id} className="att-row">
            <b>{m.payload.subject}</b>
            <span className="status status-amber">● {t("onPhone")}</span>
          </li>
        ))}
        {data.queries.length === 0 && queued.length === 0 && <li className="muted">{t("none")}</li>}
        {data.queries.map((q) => (
          <li key={q.id} className={`att-row ${q.status === "OPEN" ? "att-unmarked" : ""}`} data-testid="query">
            <Link href={`/m/site-queries/${q.id}`}><b>{q.ref}</b> – {q.subject}</Link>
            <span className="caption">{q.project} · {q.raisedBy}</span>
            <span className={`status ${q.status === "OPEN" ? "status-blue" : q.status === "ANSWERED" ? "status-green" : "status-black"}`}>
              {q.status === "OPEN" ? "◔" : q.status === "ANSWERED" ? "✓" : "—"} {t(`status_${q.status}`)}
            </span>
            {q.answer && <span>💬 {q.answer}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
