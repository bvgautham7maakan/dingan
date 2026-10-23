"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import PhotoList from "@/components/PhotoList";
import VoiceNote from "@/components/VoiceNote";
import FlowSteps from "@/components/FlowSteps";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { cacheGet, cacheSet, enqueue, enqueueFile } from "@/lib/offline/outbox";
import type { MutationOf } from "@/lib/sync/schema";

type Data = {
  date: string;
  projectId: string;
  projects: { id: string; code: string; name: string; mine: boolean }[];
  subs: string[];
  attendance: { present: number; late: number; leave: string[]; movedIn: number; movedOut: number } | null;
  existing: {
    id: string; status: string; workDone: string | null; issues: string | null; nextDay: string | null;
    manpower: { own?: number; subs?: { name: string; count: number }[]; remarks?: string; materialsNeeded?: string | null } | null;
    returnedComment: string | null;
    flow: { steps: { seq: number; label: string; status: string; actedBy: string | null; comment: string | null }[] } | null;
  } | null;
};

type Draft = { own: string; subs: Record<string, number>; remarks: string; workDone: string; issues: string; materials: string; nextDay: string };
const STEPS = ["manpower", "work", "issues", "tomorrow"] as const;

export default function ReportWizard({ date, initialProject }: { date: string; initialProject?: string }) {
  const t = useTranslations("report");
  const [projectId, setProjectId] = useState(initialProject ?? "");
  const url = `/api/daily-report?date=${date}${projectId ? `&project=${projectId}` : ""}`;
  const { data, queue } = useCachedApi<Data>(url);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  const [sent, setSent] = useState(false);
  const pid = projectId || data?.projectId || "";
  const draftKey = `draft:report:${pid}:${date}`;

  // start from the saved draft, else the returned report, else attendance
  useEffect(() => {
    if (!data || !pid) return;
    void (async () => {
      const saved = await cacheGet<Draft>(draftKey);
      const e = data.existing;
      const a = data.attendance;
      setDraft(
        saved ?? {
          own: String(e?.manpower?.own ?? (a ? a.present + a.movedIn - a.movedOut : 0)),
          subs: Object.fromEntries(data.subs.map((s) => [s, e?.manpower?.subs?.find((x) => x.name === s)?.count ?? 0])),
          remarks: e?.manpower?.remarks ?? "",
          workDone: e?.workDone ?? "",
          issues: e?.issues ?? "",
          materials: e?.manpower?.materialsNeeded ?? "",
          nextDay: e?.nextDay ?? "",
        },
      );
    })();
  }, [data, pid, draftKey]);

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft!, ...patch };
    setDraft(next);
    void cacheSet(draftKey, next);
  };

  if (!data || !draft) return <p className="muted">…</p>;
  const queued = queue.some((m) => m.type === "report.submit" && (m as MutationOf<"report.submit">).payload.projectId === pid && (m as MutationOf<"report.submit">).payload.date === date);
  const locked = data.existing && data.existing.status !== "RETURNED";

  const submit = async () => {
    const photoClientIds = [];
    for (const p of photos) photoClientIds.push(await enqueueFile(p, "reports", pid));
    const voiceClientId = voice ? await enqueueFile(voice, "reports", pid) : undefined;
    await enqueue({
      id: crypto.randomUUID(), type: "report.submit", at: new Date().toISOString(),
      payload: {
        projectId: pid, date,
        manpower: { own: Number(draft.own) || 0, subs: Object.entries(draft.subs).filter(([, c]) => c > 0).map(([name, count]) => ({ name, count })), remarks: draft.remarks.trim() || undefined },
        workDone: draft.workDone.trim(), issues: draft.issues.trim() || undefined, materialsNeeded: draft.materials.trim() || undefined,
        nextDay: draft.nextDay.trim() || undefined, photoClientIds, voiceClientId,
      },
    });
    await cacheSet(draftKey, null);
    setSent(true);
  };

  return (
    <div className="att">
      <SyncStatus />
      <div className="field">
        <label htmlFor="r-proj">{t("project")}</label>
        <select id="r-proj" value={pid} onChange={(e) => (setProjectId(e.target.value), setStep(0), setDraft(null))}>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.mine ? "★ " : ""}{p.code} – {p.name}</option>)}
        </select>
      </div>
      <p className="muted">{date.split("-").reverse().join("-")}</p>

      {(sent || queued) && <p className="notice notice-ok" role="status">✓ {t("sent")}</p>}
      {data.existing?.status === "RETURNED" && <p className="notice notice-warn">↩ {t("returned")}: “{data.existing.returnedComment}”</p>}
      {locked && !sent && !queued && (
        <>
          <p className="notice">{t(`status_${data.existing!.status}`)}</p>
          {data.existing!.flow && <FlowSteps steps={data.existing!.flow.steps} />}
        </>
      )}

      {!locked && !sent && !queued && (
        <>
          <ol className="wizard-steps" aria-label={t("steps")}>
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : i === step ? "now" : ""}>
                <span aria-hidden="true">{i < step ? "✓" : i === step ? "●" : "○"}</span> {i + 1}. {t(`step_${s}`)}
              </li>
            ))}
          </ol>

          {step === 0 && (
            <section>
              {data.attendance && (
                <p className="panel">
                  {t("fromAttendance", { present: data.attendance.present, late: data.attendance.late })}
                  {data.attendance.movedIn + data.attendance.movedOut > 0 && ` · ${t("moves", { in: data.attendance.movedIn, out: data.attendance.movedOut })}`}
                  {data.attendance.leave.length > 0 && <><br />{t("onLeave")}: {data.attendance.leave.join(", ")}</>}
                </p>
              )}
              <div className="field">
                <label htmlFor="r-own">{t("ownWorkers")}</label>
                <input id="r-own" type="number" inputMode="numeric" min={0} value={draft.own} onChange={(e) => update({ own: e.target.value })} />
              </div>
              {data.subs.map((s) => (
                <div key={s} className="stepper">
                  <span className="label">{s}</span>
                  <button type="button" className="btn" aria-label={`${s} −`} onClick={() => update({ subs: { ...draft.subs, [s]: Math.max(0, draft.subs[s] - 1) } })}>−</button>
                  <b aria-live="polite">{draft.subs[s]}</b>
                  <button type="button" className="btn" aria-label={`${s} +`} onClick={() => update({ subs: { ...draft.subs, [s]: draft.subs[s] + 1 } })}>+</button>
                </div>
              ))}
              <div className="field">
                <label htmlFor="r-rem">{t("remarks")}</label>
                <input id="r-rem" value={draft.remarks} onChange={(e) => update({ remarks: e.target.value })} />
              </div>
            </section>
          )}
          {step === 1 && (
            <section>
              <div className="field">
                <label htmlFor="r-work">{t("workDone")} *</label>
                <textarea id="r-work" rows={5} value={draft.workDone} onChange={(e) => update({ workDone: e.target.value })} />
              </div>
              <PhotoList label={t("photos")} value={photos} onChange={setPhotos} />
              <VoiceNote value={voice} onChange={setVoice} />
            </section>
          )}
          {step === 2 && (
            <section>
              <div className="field">
                <label htmlFor="r-iss">{t("issues")}</label>
                <textarea id="r-iss" rows={4} value={draft.issues} onChange={(e) => update({ issues: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="r-mat">{t("materials")}</label>
                <textarea id="r-mat" rows={3} value={draft.materials} onChange={(e) => update({ materials: e.target.value })} />
              </div>
            </section>
          )}
          {step === 3 && (
            <section>
              <div className="field">
                <label htmlFor="r-next">{t("nextDay")}</label>
                <textarea id="r-next" rows={4} value={draft.nextDay} onChange={(e) => update({ nextDay: e.target.value })} />
              </div>
              <div className="panel">
                <b>{t("summary")}</b>
                <div>{t("ownWorkers")}: {draft.own} · {Object.entries(draft.subs).filter(([, c]) => c).map(([n, c]) => `${n} ${c}`).join(" · ")}</div>
                <div>{t("workDone")}: {draft.workDone || "–"}</div>
                <div>{t("photos")}: {photos.length}</div>
              </div>
            </section>
          )}

          <div className="wizard-nav">
            {step > 0 && <button type="button" className="btn btn-big" onClick={() => setStep(step - 1)}>‹ {t("back")}</button>}
            {step < 3 ? (
              <button type="button" className="btn btn-primary btn-big" disabled={step === 1 && !draft.workDone.trim()} onClick={() => setStep(step + 1)}>
                {t("next")} ›
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-big" disabled={!draft.workDone.trim()} onClick={() => void submit()}>
                ✓ {t("submit")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
