import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { BOQ_EDIT_ROLES, MASTER_EDIT_ROLES } from "@/lib/materials/server";
import { canSeeMoney, hasAnyRole } from "@/lib/roles";
import Status from "@/components/Status";
import Submit from "@/components/Submit";
import { addSubmittal, saveBoqLine, setMsStatus, uploadBoq } from "./actions";

const MS_STATUS = ["DRAFT", "UNDER_REVIEW", "APPROVED", "APPROVED_WITH_COMMENTS", "REJECTED", "CLOSED"];
const DISC = ["ELE", "PLB", "HVAC", "FLS", "GEN"];

export default async function MaterialMasterPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; tab?: string; disc?: string; saved?: string; imported?: string; added?: string; skipped?: string; error?: string }>;
}) {
  const me = await requireRole(["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "EST", "COORD", "PROC", "DESIGN"]);
  const t = await getTranslations("mm");
  const tmr = await getTranslations("mr");
  const sp = await searchParams;
  const projects = await db.project.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
  const project = projects.find((p) => p.id === sp.project) ?? projects.find((p) => p.code === "NBK") ?? projects[0];
  const tab = sp.tab === "boq" ? "boq" : "ms";
  const disc = DISC.includes(sp.disc ?? "") ? sp.disc : undefined;
  const editMs = hasAnyRole(me.roles, MASTER_EDIT_ROLES);
  const editBoq = hasAnyRole(me.roles, BOQ_EDIT_ROLES);
  const money = canSeeMoney(me.roles);
  const q = (extra: Record<string, string>) => `/m/material-master?${new URLSearchParams({ project: project.id, tab, ...(disc ? { disc } : {}), ...extra })}`;

  return (
    <>
      <h1>{t("title")}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <form className="row">
          <label htmlFor="mm-p" className="label">{t("project")}</label>
          <select id="mm-p" name="project" defaultValue={project.id}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} – {p.name}</option>)}
          </select>
          <input type="hidden" name="tab" value={tab} />
          <button className="btn">{t("show")}</button>
        </form>
      </div>
      <div className="seg" role="group">
        <Link href={q({ tab: "ms" })} aria-current={tab === "ms"}>{t("msTab")}</Link>
        <Link href={q({ tab: "boq" })} aria-current={tab === "boq"}>{t("boqTab")}</Link>
      </div>
      {sp.saved && <p className="notice notice-ok" role="status">✓ {t("saved")}</p>}
      {sp.imported && <p className="notice notice-ok" role="status">✓ {t("imported", { n: sp.imported, added: sp.added ?? 0, skipped: sp.skipped ?? 0 })}</p>}
      {sp.error && <p className="notice notice-error" role="alert">{t(`err_${sp.error}`)}</p>}

      {tab === "ms" ? <MsTab /> : <BoqTab />}
    </>
  );

  async function MsTab() {
    const rows = await db.materialSubmittal.findMany({
      where: { OR: [{ projectId: project.id }, { projectId: null }], ...(disc ? { material: { discipline: disc } } : {}) },
      include: { material: true },
      orderBy: [{ material: { discipline: "asc" } }, { material: { name: "asc" } }],
    });
    return (
      <>
        <p className="row">
          <Link className="chip" href={q({ disc: "" })} aria-pressed={!disc}>{t("all")}</Link>
          {DISC.map((d) => <Link key={d} className="chip" href={q({ disc: d })} aria-pressed={disc === d}>{d}</Link>)}
        </p>
        <p className="caption">{t("msHint", { approved: rows.filter((r) => r.status.startsWith("APPROVED")).length, total: rows.length })}</p>
        <div className="table-wrap">
          <table className="kem">
            <thead><tr><th>{t("material")}</th><th>{t("disc")}</th><th>{t("brand")}</th><th>MS</th><th>Rev</th><th>{t("status")}</th><th>{t("spec")}</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="muted">–</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} id={`ms-${r.id}`}>
                  <td>{r.material.name}{!r.projectId && <div className="caption">{t("general")}</div>}</td>
                  <td>{r.material.discipline}</td>
                  <td>{r.brand}</td>
                  <td>{r.msNo ?? "–"}</td>
                  <td>{r.revision ?? "–"}</td>
                  <td>
                    <Status code={r.status} label={tmr(`ms_${r.status}`)} />
                    {editMs && (
                      <form action={setMsStatus} className="row" style={{ marginTop: 4 }}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="project" value={project.id} />
                        <select name="status" defaultValue={r.status} aria-label={t("status")}>
                          {MS_STATUS.map((s) => <option key={s} value={s}>{tmr(`ms_${s}`)}</option>)}
                        </select>
                        <Submit className="btn">{t("set")}</Submit>
                      </form>
                    )}
                  </td>
                  <td>{r.spec ?? r.material.keySpec ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editMs && (
          <details className="panel" style={{ marginTop: 16 }}>
            <summary><b>+ {t("addMs")}</b></summary>
            <form action={addSubmittal} className="form" style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="as-p">{t("project")}</label>
                <select id="as-p" name="projectId" defaultValue={project.id}>
                  <option value="">{t("general")}</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="as-m">{t("material")} *</label><input id="as-m" name="material" required /></div>
              <div className="field">
                <label htmlFor="as-d">{t("disc")} *</label>
                <select id="as-d" name="discipline">{DISC.map((d) => <option key={d}>{d}</option>)}</select>
              </div>
              <div className="field"><label htmlFor="as-b">{t("brand")} *</label><input id="as-b" name="brand" required /></div>
              <div className="row">
                <div className="field"><label htmlFor="as-n">MS no.</label><input id="as-n" name="msNo" /></div>
                <div className="field"><label htmlFor="as-r">Rev</label><input id="as-r" name="revision" /></div>
              </div>
              <div className="field">
                <label htmlFor="as-s">{t("status")} *</label>
                <select id="as-s" name="status" defaultValue="UNDER_REVIEW">{MS_STATUS.map((s) => <option key={s} value={s}>{tmr(`ms_${s}`)}</option>)}</select>
              </div>
              <div className="field"><label htmlFor="as-spec">{t("spec")}</label><input id="as-spec" name="spec" /></div>
              <Submit>{t("addMs")}</Submit>
            </form>
          </details>
        )}
      </>
    );
  }

  async function BoqTab() {
    const [boq, materials, requested] = await Promise.all([
      db.boqLine.findMany({ where: { projectId: project.id }, include: { material: true }, orderBy: [{ material: { discipline: "asc" } }, { material: { name: "asc" } }] }),
      db.material.findMany({ orderBy: [{ discipline: "asc" }, { name: "asc" }] }),
      db.materialRequestLine.groupBy({ by: ["materialId"], where: { request: { projectId: project.id, status: { in: ["UNDER_REVIEW", "ORDERED"] } } }, _sum: { qty: true } }),
    ]);
    const req = new Map(requested.map((r) => [r.materialId, r._sum.qty ?? 0]));
    return (
      <>
        <div className="table-wrap">
          <table className="kem">
            <thead>
              <tr>
                <th>{t("material")}</th><th>{t("disc")}</th><th>{t("boqQty")}</th><th>{t("requested")}</th><th>{t("remaining")}</th>
                {money && <th>{t("rate")}</th>}{editBoq && <th>{t("edit")}</th>}
              </tr>
            </thead>
            <tbody>
              {boq.length === 0 && <tr><td colSpan={7} className="muted">{t("noBoq")}</td></tr>}
              {boq.map((b) => {
                const used = req.get(b.materialId) ?? 0;
                const left = b.qty - used;
                return (
                  <tr key={b.id}>
                    <td>{b.material.name}</td>
                    <td>{b.material.discipline}</td>
                    <td>{b.qty} {b.unit}</td>
                    <td>{used}</td>
                    <td><span className={`status ${left < 0 ? "status-red" : "status-green"}`}>{left < 0 ? "⚠ " : ""}{left}</span></td>
                    {money && <td>{b.rateFils != null ? (b.rateFils / 100).toFixed(2) : "–"}</td>}
                    {editBoq && (
                      <td>
                        <form action={saveBoqLine} className="row">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="materialId" value={b.materialId} />
                          <input name="qty" type="number" step="any" min="0" defaultValue={b.qty} aria-label={t("boqQty")} style={{ width: 90 }} />
                          <input name="unit" defaultValue={b.unit ?? ""} aria-label={t("unit")} style={{ width: 70 }} />
                          {money && <input name="rate" type="number" step="0.01" min="0" defaultValue={b.rateFils != null ? b.rateFils / 100 : ""} aria-label={t("rate")} style={{ width: 90 }} />}
                          <Submit className="btn">{t("set")}</Submit>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editBoq && (
          <div className="grid-cards" style={{ marginTop: 16 }}>
            <form action={saveBoqLine} className="panel form">
              <b>+ {t("addBoq")}</b>
              <input type="hidden" name="projectId" value={project.id} />
              <div className="field">
                <label htmlFor="bq-m">{t("material")}</label>
                <select id="bq-m" name="materialId">{materials.map((m) => <option key={m.id} value={m.id}>{m.discipline} · {m.name}</option>)}</select>
              </div>
              <div className="row">
                <div className="field"><label htmlFor="bq-q">{t("boqQty")} *</label><input id="bq-q" name="qty" type="number" step="any" min="0" required /></div>
                <div className="field"><label htmlFor="bq-u">{t("unit")}</label><input id="bq-u" name="unit" /></div>
              </div>
              {money && <div className="field"><label htmlFor="bq-r">{t("rate")}</label><input id="bq-r" name="rate" type="number" step="0.01" min="0" /></div>}
              <Submit>{t("addBoq")}</Submit>
            </form>
            <form action={uploadBoq} className="panel form">
              <b>⭱ {t("importBoq")}</b>
              <input type="hidden" name="projectId" value={project.id} />
              <p className="caption">{t("importHint")}</p>
              <div className="field">
                <label htmlFor="bq-f">{t("file")}</label>
                <input id="bq-f" name="file" type="file" accept=".xlsx" required />
              </div>
              <Submit>{t("import")}</Submit>
            </form>
          </div>
        )}
      </>
    );
  }
}
