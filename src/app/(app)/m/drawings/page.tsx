import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { DRAWING_RELEASE_ROLES, DRAWING_UPLOAD_ROLES, DRAWING_VIEW_ROLES, fcOnly, listDrawings } from "@/lib/drawings/server";
import { hasAnyRole } from "@/lib/roles";
import Status from "@/components/Status";
import Submit from "@/components/Submit";
import OfflineButton from "@/components/drawings/OfflineButton";
import UploadForm from "@/components/drawings/UploadForm";
import { release } from "./actions";

export default async function DrawingsPage({ searchParams }: { searchParams: Promise<{ project?: string; released?: string }> }) {
  const me = await requireRole(DRAWING_VIEW_ROLES);
  const t = await getTranslations("dwg");
  const tn = await getTranslations("nav");
  const sp = await searchParams;
  const projects = await db.project.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
  const projectId = projects.find((p) => p.id === sp.project)?.id;
  const drawings = await listDrawings(me, projectId);
  const site = fcOnly(me);
  const canUpload = hasAnyRole(me.roles, DRAWING_UPLOAD_ROLES);
  const canRelease = hasAnyRole(me.roles, DRAWING_RELEASE_ROLES);
  return (
    <>
      <h1>{tn("drawings")}</h1>
      {site && <p className="caption">{t("fcOnlyHint")}</p>}
      {sp.released && <p className="notice notice-ok" role="status">✓ {t("released")}</p>}
      <p className="row">
        <Link className="chip" href="/m/drawings" aria-pressed={!projectId}>{t("all")}</Link>
        {projects.map((p) => <Link key={p.id} className="chip" href={`/m/drawings?project=${p.id}`} aria-pressed={projectId === p.id}>{p.code}</Link>)}
      </p>
      <div className="table-wrap">
        <table className="kem">
          <thead>
            <tr><th>{t("ref")}</th><th>{t("titleField")}</th><th>{t("discipline")}</th><th>{t("revisions")}</th><th>{t("actions")}</th></tr>
          </thead>
          <tbody>
            {drawings.length === 0 && <tr><td colSpan={5} className="muted">{t("none")}</td></tr>}
            {drawings.map((d) => {
              const open = d.fcRevisionId ?? d.revisions[0]?.id;
              const fc = d.revisions.find((r) => r.forConstruction);
              return (
                <tr key={d.id} data-testid={`dwg-${d.ref}`}>
                  <td>{open ? <Link href={`/m/drawings/${open}`}><b>{d.ref}</b></Link> : <b>{d.ref}</b>}</td>
                  <td>{d.title}</td>
                  <td>{d.discipline}</td>
                  <td>
                    {d.revisions.map((r) => (
                      <div key={r.id} className="row" style={{ gap: 6 }}>
                        <Link href={`/m/drawings/${r.id}`}>Rev {r.rev}</Link>
                        {r.forConstruction ? <span className="status status-green">✓ {t("fc")}</span> : <Status code={r.status} label={t(`st_${r.status}`)} />}
                        {canRelease && !r.forConstruction && r.status !== "CLOSED" && (
                          <form action={release}>
                            <input type="hidden" name="revisionId" value={r.id} />
                            <input type="hidden" name="project" value={projectId ?? ""} />
                            <Submit className="btn" confirm={t("releaseConfirm", { ref: d.ref, rev: r.rev })}>{t("release")}</Submit>
                          </form>
                        )}
                      </div>
                    ))}
                  </td>
                  <td>{fc && <OfflineButton revisionId={fc.id} fileId={fc.fileId} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canUpload && (
        <details className="panel" style={{ marginTop: 16 }}>
          <summary><b>⭱ {t("uploadTitle")}</b></summary>
          <div style={{ marginTop: 12 }}>
            <UploadForm projects={projects.map((p) => ({ id: p.id, code: p.code }))} drawings={drawings.map((d) => ({ id: d.id, ref: d.ref, title: d.title }))} defaultProject={projectId} />
          </div>
        </details>
      )}
    </>
  );
}
