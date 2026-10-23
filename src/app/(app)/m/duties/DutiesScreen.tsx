"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import PhotoInput from "@/components/PhotoInput";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue, enqueueFile } from "@/lib/offline/outbox";
import type { MutationOf } from "@/lib/sync/schema";

type Duty = {
  id: string; project: string; title: string; detail: string | null; assignee: string; assignedBy: string; deadline: string;
  status: string; overdue: boolean; doneAt: string | null; donePhotoId: string | null; doneNote: string | null; mine: boolean;
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(iso))
    .replaceAll("/", "-")
    .replace(",", "");

/** Overdue → today → this week → later, then done. */
function group(d: Duty, now: Date) {
  if (d.status !== "OPEN") return 4;
  if (d.overdue) return 0;
  const days = (new Date(d.deadline).getTime() - now.getTime()) / 86_400_000;
  return days < 1 ? 1 : days < 7 ? 2 : 3;
}

export default function DutiesScreen() {
  const t = useTranslations("duty");
  const { data, queue } = useCachedApi<{ duties: Duty[]; now: string }>("/api/duties");
  const [doing, setDoing] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [note, setNote] = useState("");
  if (!data) return <p className="muted">…</p>;
  const doneOffline = new Set(queue.filter((m): m is MutationOf<"duty.done"> => m.type === "duty.done").map((m) => m.payload.dutyId));
  const now = new Date();
  const labels = [t("overdue"), t("today"), t("thisWeek"), t("later"), t("done")];
  const sorted = [...data.duties].sort((a, b) => group(a, now) - group(b, now) || a.deadline.localeCompare(b.deadline));

  const markDone = async (id: string) => {
    if (!photo) return;
    const photoClientId = await enqueueFile(photo, "duties");
    await enqueue({ id: crypto.randomUUID(), type: "duty.done", at: new Date().toISOString(), payload: { dutyId: id, photoClientId, note: note.trim() || undefined } });
    setDoing(null);
    setPhoto(null);
    setNote("");
  };

  let last = -1;
  return (
    <div className="att">
      <SyncStatus />
      {sorted.length === 0 && <p className="muted">{t("none")}</p>}
      <ul className="att-list">
        {sorted.map((d) => {
          const g = doneOffline.has(d.id) ? 4 : group(d, now);
          const head = g !== last ? <h2 className="duty-group">{labels[g]}</h2> : null;
          last = g;
          return (
            <li key={d.id} style={{ listStyle: "none" }}>
              {head}
              <div className={`att-row ${g === 0 ? "att-unmarked" : ""}`} data-testid="duty">
                <div className="att-who">
                  <b>{d.title}</b>
                  <span className="caption">{d.project} · {t("for")} {d.assignee} · {t("by")} {d.assignedBy}</span>
                  {d.detail && <span>{d.detail}</span>}
                  <span className={`status ${g === 0 ? "status-red" : g === 4 ? "status-green" : "status-blue"}`}>
                    {g === 0 ? "⚠ " : g === 4 ? "✓ " : "◔ "}
                    {t("deadline")} {fmt(d.deadline)}
                  </span>
                  {doneOffline.has(d.id) && <span className="status status-amber">● {t("onPhone")}</span>}
                  {d.status === "DONE" && (
                    <span>
                      ✓ {t("doneAt")} {fmt(d.doneAt!)}
                      {d.doneNote && ` – ${d.doneNote}`}{" "}
                      {d.donePhotoId && <a href={`/api/files/${d.donePhotoId}`} target="_blank" rel="noopener noreferrer">{t("photo")}</a>}
                    </span>
                  )}
                </div>
                {d.status === "OPEN" && d.mine && !doneOffline.has(d.id) && (
                  doing === d.id ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <PhotoInput label={t("photo")} required value={photo} onChange={setPhoto} />
                      <div className="field">
                        <label htmlFor={`n-${d.id}`}>{t("note")}</label>
                        <input id={`n-${d.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
                      </div>
                      <button type="button" className="btn btn-primary btn-big" disabled={!photo} onClick={() => void markDone(d.id)}>
                        ✓ {t("confirmDone")}
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-primary btn-big" onClick={() => setDoing(d.id)}>
                      ✓ {t("markDone")}
                    </button>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
