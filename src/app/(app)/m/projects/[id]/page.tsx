import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { manDays, todaySummary } from "@/lib/dashboard/summary";
import { canSeeMoney } from "@/lib/roles";
import { formatAed } from "@/lib/money";
import { dubaiHHMM, fmtIsoDay } from "@/lib/time";
import Status from "@/components/Status";

// Project dashboard (MOCKUP p27): man-days used vs budget, today, moves, reports, requests, drawings.
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole(["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "EST", "COORD", "DESIGN", "HEAD_SUP", "SUP", "HVAC_SUP"]);
  const t = await getTranslations("proj");
  const ts = await getTranslations("status");
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id }, include: { site: true, pm: { select: { displayName: true } } } });
  if (!p) notFound();
  const [md, today, moves, reports, mrs, fc] = await Promise.all([
    manDays(p.id),
    todaySummary([p.id]),
    db.manpowerMove.findMany({ where: { OR: [{ fromSiteId: p.siteId }, { toSiteId: p.siteId }] }, include: { fromSite: true, toSite: true, _count: { select: { workers: true } } }, orderBy: { moveAt: "desc" }, take: 8 }),
    db.dailyReport.findMany({ where: { projectId: p.id }, include: { author: { select: { displayName: true } } }, orderBy: { date: "desc" }, take: 8 }),
    db.materialRequest.findMany({ where: { projectId: p.id, status: { in: ["UNDER_REVIEW", "ORDERED"] } }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.drawingRevision.count({ where: { forConstruction: true, drawing: { projectId: p.id } } }),
  ]);
  const pct = md.budget ? Math.min(100, Math.round((md.used / md.budget) * 100)) : null;
  const site = today.sites[0];
  return (
    <>
      <h1>{p.code} – {p.name}</h1>
      <p><Status code={p.status} label={ts(p.status)} /> · {p.site.name}{p.pm && ` · PM ${p.pm.displayName}`}{p.client && ` · ${p.client}`}</p>
      <div className="grid-cards">
        <div className="card" data-testid="card-mandays">
          <h3>{t("manDays")}</h3>
          <span className="big">{md.used}</span>
          <div>{md.budget ? t("ofBudget", { budget: md.budget, left: Math.round((md.budget - md.used) * 10) / 10 }) : t("noBudget")}</div>
          {pct != null && (
            <div className="bar" role="img" aria-label={`${pct}%`}>
              <span style={{ width: `${pct}%` }} className={pct >= 90 ? "bar-red" : ""} />
            </div>
          )}
        </div>
        <div className="card">
          <h3>{t("today")}</h3>
          <span className="big">{site?.present ?? 0}/{site?.planned ?? 0}</span>
          <div>{t("presentPlanned")}</div>
          <div>{site?.safety ? "✓" : "–"} {t("safety")} · {site?.report ? "✓" : "–"} {t("report")}</div>
        </div>
        <Link className="card" href={`/m/drawings?project=${p.id}`}><h3>{t("drawings")}</h3><span className="big">{fc}</span><div>{t("fc")}</div></Link>
        <Link className="card" href="/m/timesheet"><h3>{t("timesheet")}</h3><div>{t("timesheetLine")}</div></Link>
      </div>

      <h2>{t("moves")}</h2>
      <ul className="plain-list">
        {moves.length === 0 && <li className="muted">–</li>}
        {moves.map((m) => (
          <li key={m.id}>{fmtIsoDay(m.date)} {dubaiHHMM(m.moveAt)} · {m.fromSite.name} → {m.toSite.name} · {m._count.workers} · {m.reason}</li>
        ))}
      </ul>
      <h2>{t("reports")}</h2>
      <ul className="plain-list">
        {reports.length === 0 && <li className="muted">–</li>}
        {reports.map((r) => (
          <li key={r.id}><Link href={`/m/daily-report/${r.id}`}>{fmtIsoDay(r.date)} · {r.author.displayName}</Link> · {r.status}</li>
        ))}
      </ul>
      <h2>{t("mrs")}</h2>
      <ul className="plain-list">
        {mrs.length === 0 && <li className="muted">–</li>}
        {mrs.map((r) => (
          <li key={r.id}><Link href={`/m/material-requests/${r.id}`}>{r.ref}</Link> · {r.status}{canSeeMoney(me.roles) && r.totalFils != null && ` · ${formatAed(r.totalFils)}`}</li>
        ))}
      </ul>
    </>
  );
}
