"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PDFDocumentProxy } from "pdfjs-dist";
import SyncStatus from "@/components/SyncStatus";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue } from "@/lib/offline/outbox";
import { fmtMm, lengthMm, scaleLabel, type Pt } from "@/lib/drawings/measure";
import type { MutationOf } from "@/lib/sync/schema";
import OfflineButton from "./OfflineButton";

type View = {
  id: string; rev: string; status: string; forConstruction: boolean; fileId: string; ref: string; title: string; project: string;
  otherRevisions: { id: string; rev: string; forConstruction: boolean }[];
  calibrations: { page: number; pxLength: number; realMm: number }[];
  measurements: { id: string; page: number; points: Pt[]; lengthMm: number; label: string | null; by: string; local?: boolean }[];
};
type Tool = "pan" | "calibrate" | "measure" | "chain";

export default function DrawingViewer({ revisionId }: { revisionId: string }) {
  const t = useTranslations("dwg");
  const { data, queue, failed } = useCachedApi<View>(`/api/drawings/rev/${revisionId}`);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [page, setPage] = useState(1);
  const [base, setBase] = useState<{ w: number; h: number } | null>(null);
  const [scale, setScale] = useState(0);
  const [tool, setTool] = useState<Tool>("pan");
  const [pts, setPts] = useState<Pt[]>([]);
  const [known, setKnown] = useState("1000");
  const [label, setLabel] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  // load the PDF (served from the phone's cache when offline)
  useEffect(() => {
    if (!data?.fileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url: `/api/files/${data.fileId}` }).promise;
        if (!cancelled) setPdf(doc);
      } catch {
        if (!cancelled) setPdfError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data?.fileId]);

  // page size at zoom 1, and fit-to-width on first show
  useEffect(() => {
    if (!pdf) return;
    void pdf.getPage(page).then((p) => {
      const v = p.getViewport({ scale: 1 });
      setBase({ w: v.width, h: v.height });
      setScale((s) => s || Math.max(0.2, (box.current?.clientWidth ?? v.width) / v.width));
    });
  }, [pdf, page]);

  // render the page at the current zoom (sharp on high-DPI phones)
  useEffect(() => {
    if (!pdf || !scale || !canvas.current) return;
    let task: { cancel: () => void } | null = null;
    void pdf.getPage(page).then((p) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const v = p.getViewport({ scale: scale * dpr });
      const c = canvas.current!;
      c.width = Math.floor(v.width);
      c.height = Math.floor(v.height);
      c.style.width = `${v.width / dpr}px`;
      c.style.height = `${v.height / dpr}px`;
      const r = p.render({ canvasContext: c.getContext("2d")!, viewport: v });
      task = r;
      r.promise.catch(() => {});
    });
    return () => task?.cancel();
  }, [pdf, page, scale]);

  // merge what is still waiting on the phone
  const view = useMemo(() => {
    if (!data) return null;
    let cal = data.calibrations;
    const ms = [...data.measurements];
    for (const m of queue) {
      if (m.type === "drawing.calibrate" && (m as MutationOf<"drawing.calibrate">).payload.revisionId === revisionId) {
        const p = (m as MutationOf<"drawing.calibrate">).payload;
        const [a, b] = p.points;
        cal = [...cal.filter((c) => c.page !== p.page), { page: p.page, pxLength: Math.hypot(b[0] - a[0], b[1] - a[1]), realMm: p.realMm }];
      }
    }
    for (const m of queue) {
      if (m.type === "drawing.measure" && (m as MutationOf<"drawing.measure">).payload.revisionId === revisionId) {
        const p = (m as MutationOf<"drawing.measure">).payload;
        const c = cal.find((x) => x.page === p.page);
        if (c) ms.push({ id: m.id, page: p.page, points: p.points as Pt[], lengthMm: lengthMm(p.points as Pt[], c), label: p.label ?? null, by: "", local: true });
      }
    }
    return { cal, ms };
  }, [data, queue, revisionId]);

  const cal = view?.cal.find((c) => c.page === page);
  const live = cal && pts.length >= 2 && tool !== "calibrate" ? lengthMm(pts, cal) : null;

  const onClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (tool === "pan" || !base) return;
      const r = e.currentTarget.getBoundingClientRect();
      const p: Pt = [((e.clientX - r.left) / r.width) * base.w, ((e.clientY - r.top) / r.height) * base.h];
      setPts((cur) => (tool === "chain" ? [...cur, p] : cur.length >= 2 ? [p] : [...cur, p]));
    },
    [tool, base],
  );

  const zoom = (f: number) => setScale((s) => Math.min(8, Math.max(0.2, s * f)));
  const fit = () => base && box.current && setScale(box.current.clientWidth / base.w);
  const pickTool = (x: Tool) => {
    setTool(x);
    setPts([]);
  };

  const saveCalibration = async () => {
    if (pts.length !== 2 || !(Number(known) > 0)) return;
    await enqueue({ id: crypto.randomUUID(), type: "drawing.calibrate", at: new Date().toISOString(), payload: { revisionId, page, points: [pts[0], pts[1]], realMm: Number(known) } });
    setPts([]);
    setTool("measure");
  };
  const saveMeasure = async () => {
    if (pts.length < 2) return;
    await enqueue({ id: crypto.randomUUID(), type: "drawing.measure", at: new Date().toISOString(), payload: { revisionId, page, points: pts, label: label.trim() || undefined } });
    setPts([]);
    setLabel("");
  };

  if (failed) return <p className="notice notice-error" role="alert">{t("notAvailable")}</p>;
  if (!data || !view) return <p className="muted">…</p>;
  const stroke = { vectorEffect: "non-scaling-stroke" as const };
  const pagesTotal = pdf?.numPages ?? 1;

  return (
    <div className="viewer">
      <div className="viewer-head">
        <div>
          <h1 style={{ marginBottom: 2 }}>{data.ref} · Rev {data.rev}</h1>
          <div className="muted">{data.title} · {data.project}</div>
          <div className={`status ${data.forConstruction ? "status-green" : "status-amber"}`}>
            {data.forConstruction ? `✓ ${t("fc")}` : `◔ ${t("notFc")}`}
          </div>
        </div>
        <OfflineButton revisionId={data.id} fileId={data.fileId} />
      </div>
      {data.otherRevisions.length > 1 && (
        <p className="caption">
          {t("revisions")}:{" "}
          {data.otherRevisions.map((r) => (
            <Link key={r.id} href={`/m/drawings/${r.id}`} style={{ marginRight: 10 }} aria-current={r.id === data.id ? "page" : undefined}>
              Rev {r.rev}{r.forConstruction ? " (FC)" : ""}
            </Link>
          ))}
        </p>
      )}
      <SyncStatus />

      <div className="viewer-bar" role="toolbar" aria-label={t("tools")}>
        <button type="button" className="btn vbtn" onClick={() => zoom(1 / 1.25)} aria-label={t("zoomOut")}>−</button>
        <button type="button" className="btn vbtn" onClick={() => zoom(1.25)} aria-label={t("zoomIn")}>+</button>
        <button type="button" className="btn vbtn" onClick={fit}>{t("fit")}</button>
        <span className="vzoom" aria-live="polite">{Math.round(scale * 100)}%</span>
        {pagesTotal > 1 && (
          <>
            <button type="button" className="btn vbtn" disabled={page <= 1} onClick={() => (setPage(page - 1), setPts([]))} aria-label={t("prevPage")}>◀</button>
            <span className="vzoom">{page}/{pagesTotal}</span>
            <button type="button" className="btn vbtn" disabled={page >= pagesTotal} onClick={() => (setPage(page + 1), setPts([]))} aria-label={t("nextPage")}>▶</button>
          </>
        )}
        <div className="chips-row" role="group" aria-label={t("tools")} style={{ margin: 0 }}>
          {(["pan", "calibrate", "measure", "chain"] as Tool[]).map((x) => (
            <button key={x} type="button" className="chip" aria-pressed={tool === x} onClick={() => pickTool(x)} disabled={x !== "pan" && x !== "calibrate" && !cal}>
              {t(`tool_${x}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel viewer-info" aria-live="polite">
        {cal ? (
          <span className="status status-green">✓ {t("calibrated", { mm: cal.realMm, scale: scaleLabel(cal) })}</span>
        ) : (
          <span className="status status-amber">⚠ {t("notCalibrated")}</span>
        )}
        {tool === "calibrate" && (
          <div>
            <p>{t("calHint", { n: pts.length })}</p>
            {pts.length === 2 && (
              <div className="row">
                <div className="field">
                  <label htmlFor="known">{t("knownMm")}</label>
                  <input id="known" type="number" inputMode="decimal" min="1" value={known} onChange={(e) => setKnown(e.target.value)} />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => void saveCalibration()}>✓ {t("saveCal")}</button>
              </div>
            )}
          </div>
        )}
        {(tool === "measure" || tool === "chain") && (
          <div>
            <p>{tool === "measure" ? t("measureHint") : t("chainHint")}</p>
            {live != null && (
              <p className="measure-live" data-testid="live-length"><b>{fmtMm(live)}</b></p>
            )}
            {pts.length >= 2 && (
              <div className="row">
                <div className="field">
                  <label htmlFor="mlabel">{t("label")}</label>
                  <input id="mlabel" value={label} onChange={(e) => setLabel(e.target.value)} />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => void saveMeasure()}>✓ {t("saveMeasure")}</button>
                <button type="button" className="btn" onClick={() => setPts([])}>{t("clear")}</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="viewer-box" ref={box}>
        {pdfError && <p className="notice notice-error">{t("pdfError")}</p>}
        {base && scale > 0 && (
          <div className="viewer-page" style={{ width: base.w * scale, height: base.h * scale }}>
            <canvas ref={canvas} aria-label={`${data.ref} ${t("page")} ${page}`} />
            <svg
              className={`viewer-overlay ${tool !== "pan" ? "picking" : ""}`}
              viewBox={`0 0 ${base.w} ${base.h}`}
              width={base.w * scale}
              height={base.h * scale}
              data-w={base.w}
              data-h={base.h}
              data-testid="overlay"
              onClick={onClick}
            >
              {view.ms.filter((m) => m.page === page).map((m) => (
                <g key={m.id}>
                  <polyline points={m.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="#1565C0" strokeWidth={3} style={stroke} />
                  <text x={m.points[0][0]} y={m.points[0][1] - 4} fontSize={12 / scale} fill="#1565C0" fontWeight="bold">{fmtMm(m.lengthMm)}</text>
                </g>
              ))}
              {pts.length > 0 && (
                <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={tool === "calibrate" ? "#A15C00" : "#B71C1C"} strokeWidth={3} style={stroke} />
              )}
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r={5 / scale} fill={tool === "calibrate" ? "#A15C00" : "#B71C1C"} />
              ))}
            </svg>
          </div>
        )}
      </div>

      <h2>{t("measurements")}</h2>
      <ul className="plain-list" data-testid="measurements">
        {view.ms.length === 0 && <li className="muted">{t("noMeasurements")}</li>}
        {view.ms.map((m) => (
          <li key={m.id}>
            <b>{fmtMm(m.lengthMm)}</b>
            {m.label && ` · ${m.label}`} · {t("page")} {m.page}
            {m.local ? <span className="status status-amber"> · ● {t("onPhone")}</span> : m.by && <span className="caption"> · {m.by}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
