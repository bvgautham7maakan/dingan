"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import {
  applyLocal,
  LEAVE_CODES,
  SHIFT_START,
  type AttendanceDay,
  type DayRow,
  type LeaveCode,
  type Mutation,
  type Shift,
} from "@/lib/attendance/types";
import { cacheGet, cacheSet, enqueue, pending, subscribeOutbox } from "@/lib/offline/outbox";
import { addMinutes } from "@/lib/time";

type Props = { initialSiteId: string; date: string; today: string };
type Open = { workerId: string; kind: "late" | "out" | "finish" } | null;

const SHIFT_KEYS: Shift[] = ["DAY", "NIGHT", "EVE", "OTHER"];
const FINISH_CHIPS = ["17:00", "18:00", "19:00", "20:00"];

function uuid() {
  return crypto.randomUUID();
}

export default function AttendanceScreen({ initialSiteId, date, today }: Props) {
  const t = useTranslations("att");
  const [siteId, setSiteId] = useState(initialSiteId);
  const [server, setServer] = useState<AttendanceDay | null>(null);
  const [queue, setQueue] = useState<Mutation[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [shift, setShift] = useState<Shift>("DAY");
  const [otherStart, setOtherStart] = useState("07:00");
  const [open, setOpen] = useState<Open>(null);
  const [customTime, setCustomTime] = useState("08:20");
  const [adding, setAdding] = useState(false);
  const [finishAll, setFinishAll] = useState("17:00");
  const key = `att:${siteId}:${date}`;

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch(`/api/attendance?site=${encodeURIComponent(siteId)}&date=${date}`, { cache: "no-store" });
      if (res.status === 401) return void (window.location.href = "/login");
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as AttendanceDay;
      setServer(data);
      setFromCache(false);
      await cacheSet(key, data);
    } catch {
      const cached = await cacheGet<AttendanceDay>(key);
      if (cached) {
        setServer(cached);
        setFromCache(true);
      } else setLoadError(true);
    }
  }, [siteId, date, key]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the list of unsent taps in view; reload from the server once they are all sent.
  useEffect(() => {
    let prev = -1;
    const refresh = async () => {
      const q = await pending();
      setQueue(q);
      if (prev > 0 && q.length === 0 && navigator.onLine) void load();
      prev = q.length;
    };
    void refresh();
    return subscribeOutbox(() => void refresh());
  }, [load]);

  const day = useMemo(() => (server ? queue.reduce(applyLocal, server) : null), [server, queue]);
  const startTime = shift === "OTHER" ? otherStart : shift === "DAY" ? (day?.startTime ?? SHIFT_START.DAY) : SHIFT_START[shift];

  const send = useCallback(async (m: Mutation) => {
    await enqueue(m);
  }, []);

  const mark = (row: DayRow, status: "IN" | "LATE" | "OUT", extra: { inTime?: string; leaveCode?: LeaveCode } = {}) => {
    setOpen(null);
    void send({
      id: uuid(),
      type: "attendance.mark",
      at: new Date().toISOString(),
      payload: { date, siteId, workerId: row.workerId, status, shift, shiftStart: startTime, ...extra },
    });
  };
  const finish = (workerId: string, outTime: string) => {
    setOpen(null);
    void send({ id: uuid(), type: "attendance.finish", at: new Date().toISOString(), payload: { date, workerId, outTime } });
  };
  const clear = (workerId: string) =>
    void send({ id: uuid(), type: "attendance.clear", at: new Date().toISOString(), payload: { date, workerId } });

  if (loadError)
    return (
      <div className="notice notice-error" role="alert">
        {t("noData")}{" "}
        <button className="btn" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!day) return <p className="muted">{t("loading")}</p>;

  const marked = day.rows.filter((r) => r.record);
  const unmarked = day.rows.filter((r) => !r.record);
  const present = day.rows.filter((r) => r.record && r.record.status !== "OUT");
  const sorted = [...unmarked, ...marked];

  return (
    <div className="att">
      <SyncStatus />
      {fromCache && <p className="notice notice-warn">{t("fromPhone")}</p>}

      <div className="att-head">
        <div className="field">
          <label htmlFor="att-site">{t("site")}</label>
          <select id="att-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {day.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="label">{t("date")}</span>
          <span className="att-date">
            {date.split("-").reverse().join("-")} {date === today && `· ${t("today")}`}
          </span>
        </div>
      </div>

      <fieldset className="chips-row" aria-label={t("shift")}>
        <legend className="label">{t("shift")}</legend>
        {SHIFT_KEYS.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={shift === s} onClick={() => setShift(s)}>
            {t(`shift_${s}`)} {s === "DAY" ? day.startTime : s === "OTHER" ? "" : SHIFT_START[s]}
          </button>
        ))}
        {shift === "OTHER" && (
          <input aria-label={t("startTime")} type="time" value={otherStart} onChange={(e) => setOtherStart(e.target.value)} className="chip-time" />
        )}
      </fieldset>

      {shift === "DAY" && day.canEditStart && (
        <details className="att-start">
          <summary>
            {t("siteStart", { time: day.startTime })} – {t("change")}
          </summary>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const v = String(new FormData(e.currentTarget).get("start"));
              void send({ id: uuid(), type: "site.startTime", at: new Date().toISOString(), payload: { siteId, time: v } });
            }}
          >
            <input name="start" type="time" defaultValue={day.startTime} aria-label={t("startTime")} className="chip-time" />
            <button className="btn">{t("save")}</button>
          </form>
          <p className="caption">{t("startLogged")}</p>
        </details>
      )}

      <p className="att-count" aria-live="polite">
        <b>{t("countMarked", { marked: marked.length, total: day.rows.length })}</b>
        {unmarked.length > 0 && <span className="status status-red"> · ⚠ {t("countUnmarked", { count: unmarked.length })}</span>}
      </p>

      {unmarked.length > 0 && (
        <button
          type="button"
          className="btn btn-primary btn-big"
          onClick={() => unmarked.forEach((r) => mark(r, "IN", { inTime: startTime }))}
        >
          {t("markAllIn", { time: startTime })}
        </button>
      )}

      <ul className="att-list">
        {sorted.map((r) => (
          <li key={r.workerId} className={`att-row ${r.record ? "" : "att-unmarked"}`} data-testid={`row-${r.empCode}`}>
            <div className="att-who">
              <b>{r.name}</b>
              <span className="caption">
                {r.empCode}
                {r.trade && ` · ${r.trade}`}
                {r.vehicle && ` · ${r.vehicle}`}
                {!r.planned && ` · ${t("notInPlan")}`}
              </span>
              <span className="att-state">
                {!r.record && <span className="status status-red">⚠ {t("notMarked")}</span>}
                {r.record?.status === "IN" && <span className="status status-green">✓ {t("in")} {r.record.inTime}</span>}
                {r.record?.status === "LATE" && <span className="status status-amber">◔ {t("late")} {r.record.inTime}</span>}
                {r.record?.status === "OUT" && <span className="status status-grey">✕ {t("out")} · {r.record.leaveCode}</span>}
                {r.record?.outTime && <span className="muted"> → {r.record.outTime}</span>}
              </span>
            </div>

            <div className="att-actions">
              <button type="button" className="btn att-btn att-in" aria-pressed={r.record?.status === "IN"} onClick={() => mark(r, "IN", { inTime: startTime })}>
                {t("in")}
              </button>
              <button type="button" className="btn att-btn" aria-pressed={r.record?.status === "LATE"} onClick={() => setOpen({ workerId: r.workerId, kind: "late" })}>
                {t("late")}
              </button>
              <button type="button" className="btn att-btn" aria-pressed={r.record?.status === "OUT"} onClick={() => setOpen({ workerId: r.workerId, kind: "out" })}>
                {t("out")}
              </button>
            </div>

            {open?.workerId === r.workerId && open.kind === "late" && (
              <div className="chips-row" role="group" aria-label={t("lateBy")}>
                <button type="button" className="chip" onClick={() => mark(r, "LATE", { inTime: addMinutes(startTime, 15) })}>
                  +15 m ({addMinutes(startTime, 15)})
                </button>
                <button type="button" className="chip" onClick={() => mark(r, "LATE", { inTime: addMinutes(startTime, 30) })}>
                  +30 m ({addMinutes(startTime, 30)})
                </button>
                <input type="time" aria-label={t("customTime")} value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="chip-time" />
                <button type="button" className="chip" onClick={() => mark(r, "LATE", { inTime: customTime })}>
                  {t("setTime")}
                </button>
              </div>
            )}
            {open?.workerId === r.workerId && open.kind === "out" && (
              <div className="chips-row" role="group" aria-label={t("reason")}>
                {LEAVE_CODES.map((c) => (
                  <button key={c} type="button" className="chip" onClick={() => mark(r, "OUT", { leaveCode: c })}>
                    <b>{c}</b> {t(`leave_${c}`)}
                  </button>
                ))}
              </div>
            )}
            {r.record && r.record.status !== "OUT" && (
              <div className="att-more">
                {open?.workerId === r.workerId && open.kind === "finish" ? (
                  <div className="chips-row" role="group" aria-label={t("finish")}>
                    {FINISH_CHIPS.map((f) => (
                      <button key={f} type="button" className="chip" onClick={() => finish(r.workerId, f)}>
                        {f}
                      </button>
                    ))}
                    <input type="time" aria-label={t("customTime")} value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="chip-time" />
                    <button type="button" className="chip" onClick={() => finish(r.workerId, customTime)}>
                      {t("setTime")}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="btn-link" onClick={() => setOpen({ workerId: r.workerId, kind: "finish" })}>
                    {r.record.outTime ? t("changeFinish") : t("setFinish")}
                  </button>
                )}
                {" · "}
                <button type="button" className="btn-link" onClick={() => clear(r.workerId)}>
                  {t("undo")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="field">
          <label htmlFor="add-worker">{t("addWorker")}</label>
          <select
            id="add-worker"
            defaultValue=""
            onChange={(e) => {
              const w = day.others.find((o) => o.workerId === e.target.value);
              if (w) mark({ ...w, planned: false, vehicle: null, plannedShift: null, record: null }, "IN", { inTime: startTime });
              setAdding(false);
            }}
          >
            <option value="" disabled>
              {t("pickWorker")}
            </option>
            {day.others.map((o) => (
              <option key={o.workerId} value={o.workerId}>
                {o.empCode} · {o.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <button type="button" className="btn btn-big" onClick={() => setAdding(true)} disabled={day.others.length === 0}>
          + {t("addWorker")}
        </button>
      )}

      {present.length > 0 && (
        <section className="att-finish">
          <h2>{t("endOfDay")}</h2>
          <div className="chips-row" role="group" aria-label={t("finish")}>
            {FINISH_CHIPS.map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={finishAll === f} onClick={() => setFinishAll(f)}>
                {f}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-big"
            onClick={() => present.filter((r) => !r.record?.outTime).forEach((r) => finish(r.workerId, finishAll))}
          >
            {t("finishAll", { time: finishAll })}
          </button>
        </section>
      )}
    </div>
  );
}
