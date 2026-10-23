import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { canSeeMoney, hasAnyRole, type Role } from "@/lib/roles";
import { formatAed } from "@/lib/money";
import { manDays, todaySummary } from "@/lib/dashboard/summary";
import { addDaysIso, fmtIsoDay, todayDubai } from "@/lib/time";

type Card = { key: string; title: string; big?: string | number; lines?: string[]; link?: string; tone?: "alert" | "ok" };
const has = (u: CurrentUser, r: Role[]) => hasAnyRole(u.roles, r);

/** Phase 2/3 modules per role, shown as "Coming in phase …" cards (from MOCKUP V4 captions). */
const LATER: Record<string, [string, 2 | 3][]> = {
  BUL: [["costBudget", 2], ["cashFlow", 3], ["tenders", 2], ["ccr", 2], ["authority", 3], ["weeklyPdf", 2], ["subIssues", 2]],
  OPS: [["costBudget", 2], ["procSavings", 2], ["ccr", 2], ["cashFlow", 3], ["tenders", 2], ["authority", 3]],
  PM: [["schedule", 2], ["ccr", 2], ["subBills", 2], ["ipa", 2]],
  PE: [["takeoff", 2], ["ccr", 2], ["wir", 2], ["subBills", 2], ["progress", 2]],
  SE: [["ccr", 2], ["wir", 2], ["progress", 2]],
  EST: [["tenders", 2], ["takeoff", 2], ["ccr", 2], ["priceList", 2], ["subCompare", 2]],
  DESIGN: [["rfi", 2], ["submittalClient", 2]],
  COORD: [["sabrPack", 2], ["transmittals", 2], ["mom", 2], ["accounts", 3]],
  PROC: [["quotes", 2], ["stock", 2], ["suppliers", 2], ["accounts", 3]],
  HVAC_SUP: [["tc", 2], ["equipment", 2]],
};

export default async function RoleCards({ user, projectIds }: { user: CurrentUser; projectIds?: string[] }) {
  const t = await getTranslations("dash");
  const money = canSeeMoney(user.roles);
  const today = todayDubai();
  const cards: Card[] = [];
  const office = has(user, ["PE", "SE", "PM", "OPS", "BUL", "COORD", "HEAD_SUP", "ADMIN"]);

  // Supervisors: one-tap actions
  if (has(user, ["SUP", "HVAC_SUP"])) {
    const myDuties = await db.duty.count({ where: { assigneeId: user.id, status: "OPEN" } });
    return (
      <>
        <div className="quick-grid">
          {[
            ["attendance", "/m/attendance", "✓"], ["moves", "/m/moves", "⇄"], ["dailyReport", "/m/daily-report", "▤"],
            ["safety", "/m/safety", "⛑"], ["materialRequests", "/m/material-requests", "▦"], ["siteQueries", "/m/site-queries", "?"],
            ["drawings", "/m/drawings", "▧"], ["duties", "/m/duties", "☑"],
          ].map(([k, href, icon]) => (
            <Link key={k} href={href} className="btn btn-big quick">
              <span aria-hidden="true">{icon}</span> {t(`q_${k}`)}
              {k === "duties" && myDuties > 0 && <span className="badge">{myDuties}</span>}
            </Link>
          ))}
        </div>
        <Later user={user} />
      </>
    );
  }

  if (office) {
    const s = await todaySummary(projectIds);
    cards.push({
      key: "board", title: t("siteBoard"), big: `${s.present}/${s.planned}`, link: "/m/attendance",
      lines: [
        t("presentPlanned"),
        ...s.sites.filter((x) => x.planned || x.present).map((x) => `${x.code}: ${x.present}/${x.planned} · ${x.safety ? (x.safetyIssues ? `⚠ ${x.safetyIssues}` : "✓") : "–"} ${t("safetyShort")} · ${x.report ? "✓" : "–"} ${t("reportShort")}`),
        t("movesTrips", { moves: s.moves, trips: s.trips, delivered: s.delivered }),
      ],
      tone: s.clashes ? "alert" : undefined,
    });
    if (s.clashes) cards.push({ key: "clash", title: t("clashes"), big: s.clashes, link: "/m/vehicle-plan", tone: "alert", lines: [t("clashLine")] });
  }

  if (has(user, ["PM", "OPS", "BUL", "PE", "ADMIN"])) {
    const projects = await db.project.findMany({ where: { status: "ACTIVE", ...(projectIds ? { id: { in: projectIds } } : {}), manDayBudget: { not: null } } });
    const md = await Promise.all(projects.map(async (p) => ({ p, ...(await manDays(p.id)) })));
    if (md.length)
      cards.push({ key: "mandays", title: t("manDays"), link: `/m/projects/${md[0].p.id}`, lines: md.map((x) => `${x.p.code}: ${x.used} / ${x.budget} (${Math.round((x.used / (x.budget || 1)) * 100)}%)`) });
  }

  if (has(user, ["PM", "OPS", "HEAD_SUP", "BUL"])) {
    const tomorrow = addDaysIso(today, 1);
    const [plan, trips, vplan] = await Promise.all([
      db.dayPlanLine.groupBy({ by: ["siteId"], where: { plan: { date: tomorrow } }, _count: { _all: true } }),
      db.trip.count({ where: { date: tomorrow, status: { not: "CANCELLED" } } }),
      db.vehiclePlan.findUnique({ where: { date: tomorrow } }),
    ]);
    const sites = await db.site.findMany({ where: { id: { in: plan.map((x) => x.siteId) } } });
    cards.push({
      key: "tomorrow", title: t("tomorrow", { date: fmtIsoDay(tomorrow) }), link: `/m/plan?date=${tomorrow}`,
      lines: [
        ...(plan.length ? plan.map((x) => `${sites.find((s) => s.id === x.siteId)?.name}: ${x._count._all}`) : [t("noPlan")]),
        t("tripsPlan", { n: trips, status: vplan?.status ?? "DRAFT" }),
        t("viewOnly"),
      ],
    });
  }

  if (has(user, ["PE", "SE", "PM", "OPS", "BUL", "EST", "PROC", "ADMIN"])) {
    const open = await db.materialRequest.findMany({ where: { status: "UNDER_REVIEW", ...(projectIds ? { projectId: { in: projectIds } } : {}) }, select: { totalFils: true } });
    const ordered = await db.materialRequest.findMany({ where: { status: "ORDERED", orderedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } }, select: { totalFils: true } });
    const sum = (r: { totalFils: number | null }[]) => r.reduce((a, x) => a + (x.totalFils ?? 0), 0);
    cards.push({
      key: "mr", title: t("mrPipeline"), big: open.length, link: "/m/material-requests",
      lines: [t("mrOpen"), ...(money ? [t("mrValue", { v: formatAed(sum(open)) }), t("mrOrdered", { n: ordered.length, v: formatAed(sum(ordered)) })] : [])],
    });
  }

  if (has(user, ["BUL", "OPS"])) {
    const [alerts, overdueDuties, issues] = await Promise.all([
      db.highAlert.count({ where: { resolvedAt: null } }),
      db.duty.count({ where: { status: "OPEN", deadline: { lt: new Date() } } }),
      db.safetyChecklist.aggregate({ where: { date: today }, _sum: { issues: true } }),
    ]);
    cards.push({
      key: "critical", title: t("critical"), big: alerts + overdueDuties + (issues._sum.issues ?? 0), tone: alerts + overdueDuties ? "alert" : "ok",
      lines: [t("critHigh", { n: alerts }), t("critDuties", { n: overdueDuties }), t("critSafety", { n: issues._sum.issues ?? 0 })],
    });
  }

  if (has(user, ["HEAD_SUP"])) {
    const [open, overdue, done] = await Promise.all([
      db.duty.count({ where: { status: "OPEN" } }),
      db.duty.count({ where: { status: "OPEN", deadline: { lt: new Date() } } }),
      db.duty.count({ where: { status: "DONE", doneAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ]);
    cards.push({ key: "duties", title: t("duties"), big: open, link: "/m/duties", tone: overdue ? "alert" : undefined, lines: [t("dutyLine", { overdue, done })] });
  }

  if (has(user, ["DESIGN"])) {
    const [q, review, fc] = await Promise.all([
      db.siteQuery.count({ where: { status: "OPEN" } }),
      db.drawingRevision.count({ where: { status: "UNDER_REVIEW", forConstruction: false } }),
      db.drawingRevision.count({ where: { releasedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ]);
    cards.push({ key: "queries", title: t("openQueries"), big: q, link: "/m/site-queries", tone: q ? "alert" : "ok" });
    cards.push({ key: "dwg", title: t("drawingQueue"), big: review, link: "/m/drawings", lines: [t("fcWeek", { n: fc })] });
  }

  if (has(user, ["COORD", "PE", "SE", "DESIGN", "PROC"])) {
    const ms = await db.materialSubmittal.groupBy({ by: ["status"], where: projectIds ? { projectId: { in: projectIds } } : {}, _count: { _all: true } });
    const n = (s: string) => ms.find((x) => x.status === s)?._count._all ?? 0;
    cards.push({
      key: "ms", title: t("msLog"), big: n("UNDER_REVIEW"), link: "/m/material-master",
      lines: [t("msLine", { review: n("UNDER_REVIEW"), approved: n("APPROVED") + n("APPROVED_WITH_COMMENTS"), draft: n("DRAFT") })],
    });
  }

  if (has(user, ["EST"])) {
    const boq = await db.boqLine.groupBy({ by: ["projectId"], _count: { _all: true } });
    const ps = await db.project.findMany({ where: { id: { in: boq.map((b) => b.projectId) } } });
    cards.push({ key: "boq", title: t("boq"), link: "/m/material-master?tab=boq", lines: boq.length ? boq.map((b) => `${ps.find((p) => p.id === b.projectId)?.code}: ${b._count._all} ${t("lines")}`) : [t("noBoq")] });
  }

  if (has(user, ["ADMIN"])) {
    const [users, sessions] = await Promise.all([db.user.count({ where: { active: true } }), db.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } })]);
    cards.push({ key: "admin", title: t("admin"), link: "/admin/users", lines: [t("adminLine", { users, sessions })] });
  }

  return (
    <>
      <div className="grid-cards">
        {cards.map((c) => {
          const body = (
            <>
              <h3>{c.title}</h3>
              {c.big !== undefined && <span className="big">{c.big}</span>}
              {c.lines?.map((l, i) => <div key={i} className={i === 0 && c.big !== undefined ? "caption" : undefined}>{l}</div>)}
            </>
          );
          const cls = `card ${c.tone === "alert" ? "card-alert" : ""}`;
          return c.link ? (
            <Link key={c.key} href={c.link} className={cls} data-testid={`card-${c.key}`}>{body}</Link>
          ) : (
            <div key={c.key} className={cls} data-testid={`card-${c.key}`}>{body}</div>
          );
        })}
      </div>
      <Later user={user} />
    </>
  );
}

async function Later({ user }: { user: CurrentUser }) {
  const t = await getTranslations("dash");
  const tc = await getTranslations("common");
  const keys = new Map<string, 2 | 3>();
  for (const r of user.roles) for (const [k, p] of LATER[r] ?? []) keys.set(k, p);
  if (!keys.size) return null;
  return (
    <section aria-labelledby="later-h">
      <h2 id="later-h">{t("later")}</h2>
      <div className="grid-cards">
        {[...keys].map(([k, p]) => (
          <div key={k} className="card card-later">
            <h3>{t(`p_${k}`)}</h3>
            <span className="caption">{tc("comingPhase", { phase: p })}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
