"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import PhotoInput from "@/components/PhotoInput";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue, enqueueFile } from "@/lib/offline/outbox";
import { SAFETY_ITEMS, SAFETY_RESULTS, type MutationOf } from "@/lib/sync/schema";

type Result = (typeof SAFETY_RESULTS)[number];
type Data = { date: string; projects: { id: string; code: string; name: string; mine: boolean }[]; done: { id: string; project: string; projectId: string; by: string; issues: number; time: string }[] };

export default function SafetyForm({ date }: { date: string }) {
  const t = useTranslations("safety");
  const { data, queue } = useCachedApi<Data>(`/api/safety?date=${date}`);
  const [projectId, setProjectId] = useState("");
  const [res, setRes] = useState<Record<string, Result>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [sent, setSent] = useState(false);
  if (!data) return <p className="muted">…</p>;
  const pid = projectId || data.projects[0]?.id || "";
  const issues = SAFETY_ITEMS.filter((k) => res[k] === "ISSUE");
  const complete = SAFETY_ITEMS.every((k) => res[k]);
  const notesOk = issues.every((k) => notes[k]?.trim());
  const ready = pid && complete && notesOk && (issues.length === 0 || photo);
  const queuedHere = queue.filter((m): m is MutationOf<"safety.submit"> => m.type === "safety.submit");

  const submit = async () => {
    const photoClientId = photo ? await enqueueFile(photo, "safety", pid) : undefined;
    await enqueue({
      id: crypto.randomUUID(), type: "safety.submit", at: new Date().toISOString(),
      payload: { projectId: pid, date, items: SAFETY_ITEMS.map((key) => ({ key, result: res[key], note: notes[key]?.trim() || undefined })), photoClientId },
    });
    setRes({}); setNotes({}); setPhoto(null); setSent(true);
  };

  return (
    <div className="att">
      <SyncStatus />
      {sent && <p className="notice notice-ok" role="status">✓ {t("sent")}</p>}
      <div className="field">
        <label htmlFor="s-proj">{t("project")}</label>
        <select id="s-proj" value={pid} onChange={(e) => setProjectId(e.target.value)}>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.mine ? "★ " : ""}{p.code} – {p.name}</option>)}
        </select>
      </div>
      {[...queuedHere.map((m) => ({ id: m.id, project: data.projects.find((p) => p.id === m.payload.projectId)?.code ?? "", queued: true })), ...data.done.map((d) => ({ ...d, queued: false }))]
        .filter((d) => d.project === data.projects.find((p) => p.id === pid)?.code)
        .slice(0, 1)
        .map((d) => (
          <p key={d.id} className="notice">
            {d.queued ? `● ${t("onPhone")}` : `✓ ${t("doneToday")}`}
          </p>
        ))}

      <button type="button" className="btn btn-big" onClick={() => setRes(Object.fromEntries(SAFETY_ITEMS.map((k) => [k, res[k] ?? "OK"])))}>
        ✓ {t("allOk")}
      </button>
      <ul className="att-list">
        {SAFETY_ITEMS.map((k) => (
          <li key={k} className={`att-row ${res[k] === "ISSUE" ? "att-unmarked" : ""}`} data-testid={`safety-${k}`}>
            <fieldset className="chips-row" style={{ margin: 0 }}>
              <legend className="label">{t(`item_${k}`)}</legend>
              {SAFETY_RESULTS.map((r) => (
                <button key={r} type="button" className={`chip ${r === "ISSUE" ? "chip-alert" : ""}`} aria-pressed={res[k] === r} onClick={() => setRes({ ...res, [k]: r })}>
                  {r === "OK" ? "✓ " : r === "ISSUE" ? "⚠ " : ""}
                  {t(`r_${r}`)}
                </button>
              ))}
            </fieldset>
            {res[k] === "ISSUE" && (
              <div className="field">
                <label htmlFor={`sn-${k}`}>{t("whatIsWrong")} *</label>
                <input id={`sn-${k}`} value={notes[k] ?? ""} onChange={(e) => setNotes({ ...notes, [k]: e.target.value })} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <PhotoInput label={t("photo")} required={issues.length > 0} value={photo} onChange={setPhoto} />
      <button type="button" className="btn btn-primary btn-big" disabled={!ready} onClick={() => void submit()}>
        ✓ {issues.length ? t("submitIssues", { count: issues.length }) : t("submit")}
      </button>
    </div>
  );
}
