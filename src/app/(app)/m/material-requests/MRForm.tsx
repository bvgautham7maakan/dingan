"use client";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import SyncStatus from "@/components/SyncStatus";
import { useCachedApi } from "@/components/offline/useCachedApi";
import { enqueue } from "@/lib/offline/outbox";
import { DISCIPLINES, type MutationOf } from "@/lib/sync/schema";

type Mat = { id: string; name: string; discipline: string; unit: string | null; keySpec: string | null; approved: { brand: string; msNo: string | null; spec: string | null }[] };
type Data = { projectId: string; projects: { id: string; code: string; name: string; mine: boolean }[]; materials: Mat[] };
type Line = { materialId: string; brand: string; otherBrand: boolean; qty: string; unit: string };
const UNITS = ["nos", "m", "m²", "set", "roll", "length", "kg", "ltr", "box"];

/** Supervisor picks material, enters quantity + unit. Brand and spec come from the approved MS. No prices. */
export default function MRForm() {
  const t = useTranslations("mr");
  const [projectId, setProjectId] = useState("");
  const { data, queue } = useCachedApi<Data>(`/api/materials${projectId ? `?project=${projectId}` : ""}`);
  const [disc, setDisc] = useState<string>("");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [neededBy, setNeededBy] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const mats = useMemo(
    () => (data?.materials ?? []).filter((m) => (!disc || m.discipline === disc) && (!search || m.name.toLowerCase().includes(search.toLowerCase()))),
    [data, disc, search],
  );
  if (!data) return <p className="muted">…</p>;
  const pid = projectId || data.projectId;
  const byId = new Map(data.materials.map((m) => [m.id, m]));
  const queued = queue.filter((m): m is MutationOf<"mr.create"> => m.type === "mr.create").length;
  const ready = lines.length > 0 && lines.every((l) => Number(l.qty) > 0 && l.unit && (!l.otherBrand || l.brand.trim()));

  const add = (m: Mat) => {
    setSent(false);
    if (lines.some((l) => l.materialId === m.id)) return;
    setLines([...lines, { materialId: m.id, brand: m.approved[0]?.brand ?? "", otherBrand: false, qty: "", unit: m.unit ?? "" }]);
  };
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = async () => {
    await enqueue({
      id: crypto.randomUUID(), type: "mr.create", at: new Date().toISOString(),
      payload: {
        projectId: pid, neededBy: neededBy || undefined, note: note.trim() || undefined,
        lines: lines.map((l) => ({ materialId: l.materialId, brand: l.brand.trim() || undefined, qty: Number(l.qty), unit: l.unit })),
      },
    });
    setLines([]); setNote(""); setNeededBy(""); setSent(true);
  };

  return (
    <div className="att">
      <SyncStatus />
      {sent && <p className="notice notice-ok" role="status">✓ {t("sent")}</p>}
      {queued > 0 && <p className="status status-amber">● {t("onPhone", { count: queued })}</p>}
      <div className="field">
        <label htmlFor="mr-proj">{t("project")}</label>
        <select id="mr-proj" value={pid} onChange={(e) => (setProjectId(e.target.value), setLines([]))}>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.mine ? "★ " : ""}{p.code} – {p.name}</option>)}
        </select>
      </div>

      <fieldset className="chips-row">
        <legend className="label">1. {t("pick")}</legend>
        <button type="button" className="chip" aria-pressed={disc === ""} onClick={() => setDisc("")}>{t("all")}</button>
        {DISCIPLINES.map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={disc === d} onClick={() => setDisc(d)}>{d}</button>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="mr-search">{t("search")}</label>
        <input id="mr-search" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <ul className="mat-pick">
        {mats.slice(0, 40).map((m) => (
          <li key={m.id}>
            <button type="button" className="btn mat-btn" onClick={() => add(m)} disabled={lines.some((l) => l.materialId === m.id)}>
              <span>
                <b>{m.name}</b>
                <span className="caption">
                  {" "}{m.discipline} · {m.approved.length ? `${t("approvedMs")}: ${m.approved.map((a) => a.brand).join(", ")}` : `⚠ ${t("noApprovedMs")}`}
                </span>
              </span>
              <span aria-hidden="true">+</span>
            </button>
          </li>
        ))}
      </ul>

      {lines.length > 0 && <h2>2. {t("qty")}</h2>}
      <ul className="att-list">
        {lines.map((l, i) => {
          const m = byId.get(l.materialId)!;
          const ms = m.approved.find((a) => a.brand === l.brand);
          return (
            <li key={l.materialId} className="att-row" data-testid="mr-line">
              <b>{m.name}</b>
              {m.approved.length > 0 && (
                <fieldset className="chips-row">
                  <legend className="label">{t("brand")}</legend>
                  {m.approved.map((a) => (
                    <button key={a.brand} type="button" className="chip" aria-pressed={!l.otherBrand && l.brand === a.brand} onClick={() => set(i, { brand: a.brand, otherBrand: false })}>
                      {a.brand}
                    </button>
                  ))}
                  <button type="button" className="chip" aria-pressed={l.otherBrand} onClick={() => set(i, { otherBrand: true, brand: "" })}>{t("otherBrand")}</button>
                </fieldset>
              )}
              {(l.otherBrand || m.approved.length === 0) && (
                <div className="field">
                  <label htmlFor={`b-${i}`}>{t("brandName")}</label>
                  <input id={`b-${i}`} value={l.brand} onChange={(e) => set(i, { brand: e.target.value, otherBrand: true })} />
                </div>
              )}
              {ms && <span className="caption">{t("spec")}: {ms.spec ?? m.keySpec ?? "–"}{ms.msNo && ` · ${ms.msNo}`}</span>}
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor={`q-${i}`}>{t("quantity")} *</label>
                  <input id={`q-${i}`} type="number" inputMode="decimal" min="0" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
                </div>
              </div>
              <fieldset className="chips-row">
                <legend className="label">{t("unit")} *</legend>
                {UNITS.map((u) => (
                  <button key={u} type="button" className="chip" aria-pressed={l.unit === u} onClick={() => set(i, { unit: u })}>{u}</button>
                ))}
              </fieldset>
              <button type="button" className="btn-link" onClick={() => setLines(lines.filter((_, j) => j !== i))}>{t("remove")}</button>
            </li>
          );
        })}
      </ul>

      {lines.length > 0 && (
        <>
          <div className="field">
            <label htmlFor="mr-need">{t("neededBy")}</label>
            <input id="mr-need" type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mr-note">{t("note")}</label>
            <input id="mr-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button type="button" className="btn btn-primary btn-big" disabled={!ready} onClick={() => void submit()}>
            ✓ {t("send", { count: lines.length })}
          </button>
        </>
      )}
    </div>
  );
}
