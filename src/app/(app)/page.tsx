import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/current";
import { navFor } from "@/lib/nav";
import { projectsFor } from "@/lib/projects";
import { fmtDateTime } from "@/lib/time";
import { isSiteUser } from "@/lib/roles";
import Status from "@/components/Status";

// M1 dashboard: common frame for all roles. Role-specific cards arrive in M7.
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; denied?: string }>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const t = await getTranslations("dashboard");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const ts = await getTranslations("status");
  const scope = sp.scope === "all" || sp.scope === "mine" ? sp.scope : undefined;
  const { scope: s, projects } = await projectsFor(me, scope);
  const groups = navFor(me.roles).filter((g) => g.key !== "home");
  const site = isSiteUser(me.roles);

  return (
    <>
      {sp.denied && <p className="notice notice-error">{tc("denied")}</p>}
      <h1>{t("hello", { name: me.displayName })}</h1>
      <div className="dash">
        <div>
          <section className="panel" aria-labelledby="pending-h">
            <h2 id="pending-h" style={{ marginTop: 0 }}>
              {t("pending")}
            </h2>
            <p className="muted">{t("noPending")}</p>
          </section>

          <section aria-labelledby="since-h">
            <h2 id="since-h">{t("sinceLast")}</h2>
            <p className="muted">
              {me.prevSeenAt ? t("sinceLastEmpty", { when: fmtDateTime(me.prevSeenAt) }) : t("firstVisit")}
            </p>
          </section>

          <section aria-labelledby="mod-h">
            <h2 id="mod-h">{t("modules")}</h2>
            <div className="grid-cards">
              {groups.flatMap((g) =>
                g.items.map((i) => (
                  <Link key={i.href} href={i.href} className={`card ${i.stage ? "card-later" : ""}`}>
                    <h3>{tn(i.key)}</h3>
                    <span className="caption">
                      {!i.stage
                        ? tn(g.key)
                        : i.stage.startsWith("P")
                          ? tc("comingPhase", { phase: i.stage[1] })
                          : tc("comingStage", { stage: i.stage })}
                    </span>
                  </Link>
                )),
              )}
            </div>
          </section>
        </div>

        <aside className={`panel ${site ? "" : ""}`} aria-labelledby="proj-h">
          <h2 id="proj-h" style={{ marginTop: 0 }}>
            {s === "mine" ? t("myProjects") : t("allProjects")}
          </h2>
          <div className="seg" role="group">
            <Link href="/?scope=mine" aria-current={s === "mine"}>
              {t("myProjects")}
            </Link>
            <Link href="/?scope=all" aria-current={s === "all"}>
              {t("allProjects")}
            </Link>
          </div>
          {projects.length === 0 ? (
            <p className="muted">{t("noProjects")}</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {projects.map((p) => (
                <li key={p.id} style={{ padding: "8px 0", borderTop: "1px solid var(--divider)" }}>
                  <b>{p.code}</b> – {p.name}
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
