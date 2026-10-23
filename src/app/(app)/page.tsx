import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { projectsFor } from "@/lib/projects";
import { pendingItems } from "@/lib/dashboard/pending";
import { sinceLastVisit } from "@/lib/dashboard/summary";
import { fmtDateTime } from "@/lib/time";
import Status from "@/components/Status";
import DriverScreen from "@/components/driver/DriverScreen";
import HighAlertPanel from "@/components/HighAlertPanel";
import PendingPanel from "@/components/dashboard/PendingPanel";
import RoleCards from "@/components/dashboard/RoleCards";

const VISIT_GAP_MS = 30 * 60 * 1000;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ scope?: string; denied?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("dashboard");
  const td = await getTranslations("dash");
  const tc = await getTranslations("common");
  const ts = await getTranslations("status");

  // "since your last visit": a visit is a dashboard view more than 30 minutes after the previous one
  const row = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { lastSeenAt: true, prevSeenAt: true } });
  const now = new Date();
  const newVisit = !row.lastSeenAt || now.getTime() - row.lastSeenAt.getTime() > VISIT_GAP_MS;
  const since = newVisit ? row.lastSeenAt : row.prevSeenAt;
  if (newVisit) await db.user.update({ where: { id: me.id }, data: { prevSeenAt: row.lastSeenAt, lastSeenAt: now } });
  else await db.user.update({ where: { id: me.id }, data: { lastSeenAt: now } });

  if (me.roles.length === 1 && me.roles[0] === "DRIVER")
    return (
      <>
        <h1>{t("hello", { name: me.displayName })}</h1>
        <DriverScreen />
      </>
    );

  const scope = sp.scope === "all" || sp.scope === "mine" ? sp.scope : undefined;
  const { scope: s, projects } = await projectsFor(me, scope);
  const [items, summary] = await Promise.all([pendingItems(me), sinceLastVisit(me, since)]);
  const notes = summary ? Object.values(summary.notes).reduce((a, n) => a + n, 0) : 0;

  return (
    <>
      {sp.denied && <p className="notice notice-error">{tc("denied")}</p>}
      <h1>{t("hello", { name: me.displayName })}</h1>
      {/* pinned at the top for SE and PE only */}
      <HighAlertPanel user={me} />
      <div className="dash">
        <div>
          <PendingPanel items={items} />

          <section aria-labelledby="since-h" data-testid="since">
            <h2 id="since-h">{t("sinceLast")}</h2>
            {!summary ? (
              <p className="muted">{t("firstVisit")}</p>
            ) : (
              <p>
                {(notes || summary.mrs || summary.moves || summary.reports || summary.queries || summary.released) ? (
                  <span className="muted">{fmtDateTime(summary.since)} → </span>
                ) : null}
                {[
                  notes && <Link key="n" href="/notifications">{td("sNotes", { n: notes })}</Link>,
                  summary.mrs > 0 && td("sMrs", { n: summary.mrs }),
                  summary.moves > 0 && td("sMoves", { n: summary.moves }),
                  summary.reports > 0 && td("sReports", { n: summary.reports }),
                  summary.queries > 0 && td("sQueries", { n: summary.queries }),
                  summary.released > 0 && td("sReleased", { n: summary.released }),
                ]
                  .filter(Boolean)
                  .reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, " · ", x] : [x]), [])}
                {!notes && !summary.mrs && !summary.moves && !summary.reports && !summary.queries && !summary.released && t("sinceLastEmpty", { when: fmtDateTime(summary.since) })}
              </p>
            )}
          </section>

          <section aria-labelledby="today-h">
            <h2 id="today-h">{td("today")}</h2>
            <RoleCards user={me} projectIds={s === "mine" ? projects.map((p) => p.id) : undefined} />
          </section>
        </div>

        <aside className="panel" aria-labelledby="proj-h">
          <h2 id="proj-h" style={{ marginTop: 0 }}>{s === "mine" ? t("myProjects") : t("allProjects")}</h2>
          <div className="seg" role="group">
            <Link href="/?scope=mine" aria-current={s === "mine"}>{t("myProjects")}</Link>
            <Link href="/?scope=all" aria-current={s === "all"}>{t("allProjects")}</Link>
          </div>
          {projects.length === 0 ? (
            <p className="muted">{t("noProjects")}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {projects.map((p) => (
                <li key={p.id} style={{ padding: "8px 0", borderTop: "1px solid var(--divider)" }}>
                  <Link href={`/m/projects/${p.id}`}><b>{p.code}</b> – {p.name}</Link>
                  <br />
                  <Status code={p.status} label={ts(p.status)} />
                  {p.pm && <span className="muted"> · PM {p.pm.displayName}</span>}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </>
  );
}
