"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import VoiceNote from "@/components/VoiceNote";
import FlowSteps from "@/components/FlowSteps";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue, enqueueFile } from "@/lib/offline/outbox";
import { MOVE_REASONS, type MutationOf } from "@/lib/sync/schema";

type MovesDay = {
  date: string;
  siteId: string;
  sites: { id: string; name: string }[];
  vehicles: { id: string; name: string }[];
  workers: { workerId: string; empCode: string; name: string }[];
  moves: {
    id: string; date: string; time: string; from: string; to: string; reason: string; note: string | null; voiceFileId: string | null;
    status: string; by: string; vehicle: string | null; workers: string[];
    flow: { id: string; status: string; canAct: boolean; steps: { seq: number; label: string; status: string; actedBy: string | null; comment: string | null }[] } | null;
  }[];
};

const nowHHMM = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

export default function MovesScreen({ initialSiteId, date }: { initialSiteId: string; date: string }) {
  const t = useTranslations("moves");
  const [siteId, setSiteId] = useState(initialSiteId);
  const { data, fromCache, failed, queue, reload } = useCachedApi<MovesDay>(`/api/moves?site=${encodeURIComponent(siteId)}&date=${date}`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [to, setTo] = useState("");
  const [time, setTime] = useState(nowHHMM());
  const [reason, setReason] = useState<(typeof MOVE_REASONS)[number] | "">("");
  const [note, setNote] = useState("");
  const [voice, setVoice] = useState<Blob | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [returning, setReturning] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  if (failed)
    return (
      <p className="notice notice-error" role="alert">
        {t("noData")} <button className="btn" onClick={() => void reload()}>{t("retry")}</button>
      </p>
    );
  if (!data) return <p className="muted">…</p>;

  const queuedMoves = queue.filter((m): m is MutationOf<"move.create"> => m.type === "move.create");
  const movedNow = new Set(queuedMoves.flatMap((m) => m.payload.workerIds));
  const available = data.workers.filter((w) => !movedNow.has(w.workerId));
  const canSend = picked.size > 0 && to && reason && time;
  const siteName = (id: string) => data.sites.find((s) => s.id === id)?.name ?? "";

  const submit = async () => {
    if (!canSend) return;
    const voiceClientId = voice ? await enqueueFile(voice, "moves") : undefined;
    await enqueue({
      id: crypto.randomUUID(),
      type: "move.create",
      at: new Date().toISOString(),
      payload: {
        date, fromSiteId: siteId, toSiteId: to, workerIds: [...picked], moveTime: time, reason: reason as (typeof MOVE_REASONS)[number],
        note: note.trim() || undefined, voiceClientId, vehicleId: vehicleId || undefined,
      },
    });
    setPicked(new Set());
    setTo("");
    setReason("");
    setNote("");
    setVoice(null);
    setVehicleId("");
    setSent(true);
  };

  const decide = async (flowId: string, action: "APPROVE" | "RETURN") => {
    await enqueue({ id: crypto.randomUUID(), type: "approval.act", at: new Date().toISOString(), payload: { flowId, action, comment: comment.trim() || undefined } });
    setReturning(null);
    setComment("");
  };
  const actedOffline = new Set(queue.filter((m) => m.type === "approval.act").map((m) => (m as MutationOf<"approval.act">).payload.flowId));

  return (
    <div className="att">
      <SyncStatus />
      {fromCache && <p className="notice notice-warn">{t("fromPhone")}</p>}

      <div className="field">
        <label htmlFor="mv-site">{t("from")}</label>
        <select id="mv-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {data.sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <section aria-labelledby="mv-new">
        <h2 id="mv-new">{t("newMove")}</h2>
        {sent && <p className="notice notice-ok" role="status">✓ {t("queued")}</p>}

        <fieldset className="chips-row">
          <legend className="label">1. {t("pickWorkers")} ({picked.size})</legend>
          {available.length === 0 && <span className="muted">{t("noneOnSite")}</span>}
          {available.map((w) => (
            <button
              key={w.workerId}
              type="button"
              className="chip"
              aria-pressed={picked.has(w.workerId)}
              onClick={() => {
                setSent(false);
                const n = new Set(picked);
                if (n.has(w.workerId)) n.delete(w.workerId);
                else n.add(w.workerId);
                setPicked(n);
              }}
            >
              {picked.has(w.workerId) ? "✓ " : ""}
              {w.name} <span className="caption">{w.empCode}</span>
            </button>
          ))}
        </fieldset>

        <fieldset className="chips-row">
          <legend className="label">2. {t("to")}</legend>
          {data.sites.filter((s) => s.id !== siteId).map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={to === s.id} onClick={() => setTo(s.id)}>
              {s.name}
            </button>
          ))}
        </fieldset>

        <fieldset className="chips-row">
          <legend className="label">3. {t("reason")}</legend>
          {MOVE_REASONS.map((r) => (
            <button key={r} type="button" className={`chip ${r === "EMERGENCY" ? "chip-alert" : ""}`} aria-pressed={reason === r} onClick={() => setReason(r)}>
              {r === "EMERGENCY" ? "⚡ " : ""}
              {t(`reason_${r}`)}
            </button>
          ))}
        </fieldset>
        {reason === "EMERGENCY" && <p className="notice notice-warn">{t("emergencyNote")}</p>}

        <div className="field">
          <label htmlFor="mv-time">4. {t("time")}</label>
          <input id="mv-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="mv-note">{t("note")}</label>
          <textarea id="mv-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <VoiceNote value={voice} onChange={setVoice} />
        <fieldset className="chips-row">
          <legend className="label">{t("vehicle")}</legend>
          <button type="button" className="chip" aria-pressed={vehicleId === ""} onClick={() => setVehicleId("")}>
            {t("noVehicle")}
          </button>
          {data.vehicles.map((v) => (
            <button key={v.id} type="button" className="chip" aria-pressed={vehicleId === v.id} onClick={() => setVehicleId(v.id)}>
              {v.name}
            </button>
          ))}
        </fieldset>

        <button type="button" className="btn btn-primary btn-big" disabled={!canSend} onClick={() => void submit()}>
          {canSend ? t("send", { count: picked.size, to: siteName(to) }) : t("fillAll")}
        </button>
      </section>

      <section aria-labelledby="mv-list">
        <h2 id="mv-list">{t("today")}</h2>
        {queuedMoves.map((m) => (
          <div key={m.id} className="card move-card">
            <b>{m.payload.moveTime} · {siteName(m.payload.fromSiteId)} → {siteName(m.payload.toSiteId)}</b>
            <div>{t(`reason_${m.payload.reason}`)} · {m.payload.workerIds.length} {t("workers")}</div>
            <div className="status status-amber">● {t("onPhone")}</div>
          </div>
        ))}
        {data.moves.length === 0 && queuedMoves.length === 0 && <p className="muted">{t("none")}</p>}
        {data.moves.map((m) => (
          <div key={m.id} className="card move-card" data-testid="move-card">
            <b>
              {m.date !== date && `${m.date.split("-").reverse().join("-")} `}
              {m.time} · {m.from} → {m.to}
            </b>
            <div>
              <span className={m.reason === "EMERGENCY" ? "status status-red" : ""}>{m.reason === "EMERGENCY" ? "⚡ " : ""}{t(`reason_${m.reason}`)}</span>
              {m.vehicle && ` · ${m.vehicle}`} · {t("by")} {m.by}
            </div>
            <div className="caption">{m.workers.join(", ")}</div>
            {m.note && <div>“{m.note}”</div>}
            {m.voiceFileId && <audio controls src={`/api/files/${m.voiceFileId}`} />}
            <div className={`status ${m.status === "APPROVED" ? "status-green" : m.status === "RETURNED" ? "status-red" : "status-blue"}`}>
              {t(`status_${m.status}`)}
            </div>
            {m.flow && <FlowSteps steps={m.flow.steps} />}
            {m.flow?.canAct && !actedOffline.has(m.flow.id) && (
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => void decide(m.flow!.id, "APPROVE")}>
                  ✓ {t("approve")}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setReturning(m.flow!.id)}>
                  ↩ {t("return")}
                </button>
              </div>
            )}
            {m.flow && actedOffline.has(m.flow.id) && <div className="status status-amber">● {t("onPhone")}</div>}
            {returning === m.flow?.id && (
              <div className="field">
                <label htmlFor={`c-${m.id}`}>{t("returnComment")}</label>
                <input id={`c-${m.id}`} value={comment} onChange={(e) => setComment(e.target.value)} />
                <button type="button" className="btn btn-danger" disabled={!comment.trim()} onClick={() => void decide(m.flow!.id, "RETURN")}>
                  {t("returnSend")}
                </button>
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
