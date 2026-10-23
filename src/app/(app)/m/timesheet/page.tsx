import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/current";
import { buildTimesheet, loadSettings } from "@/lib/timesheet/build";
import { cycleFor } from "@/lib/timesheet/rules";
import { TIMESHEET_ROLES } from "@/lib/timesheet/access";
import { addDaysIso, fmtIsoDay, todayDubai } from "@/lib/time";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const fmtH = (n: number) => (n === 0 ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(1));

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  await requireRole(TIMESHEET_ROLES);
  const t = await getTranslations("ts");
  const sp = await searchParams;
  const settings = await loadSettings();
  const ref = sp.start && /^\d{4}-\d{2}-\d{2}$/.test(sp.start) ? sp.start : todayDubai();
  const cycle = cycleFor(ref, settings);
  const ts = await buildTimesheet(cycle.start, cycle.end);
  const prev = cycleFor(addDaysIso(cycle.start, -1), settings).start;
  const next = addDaysIso(cycle.end, 1);
  const g = ts.grand;

  return (
    <>
      <h1>{t("title")}</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn" href={`/m/timesheet?start=${prev}`} aria-label={t("prev")}>
          ‹
        </Link>
        <b style={{ fontSize: 18 }}>
          {fmtIsoDay(cycle.start)} – {fmtIsoDay(cycle.end)}
        </b>
        <Link className="btn" href={`/m/timesheet?start=${next}`} aria-label={t("next")}>
          ›
        </Link>
        <a className="btn btn-primary" href={`/api/timesheet/export?start=${cycle.start}`} download>
          ⭳ {t("export")}
        </a>
      </div>

      <div className="grid-cards" style={{ marginBottom: 16 }}>
        <div className="card"><h3>{t("daysWorked")}</h3><span className="big">{g.daysWorked}</span></div>
        <div className="card"><h3>{t("normal")}</h3><span className="big">{fmtH(g.normal)}</span></div>
        <div className="card"><h3>{t("ot125")}</h3><span className="big">{fmtH(g.ot125)}</span></div>
        <div className="card"><h3>{t("ot150")}</h3><span className="big">{fmtH(g.ot150)}</span></div>
        <div className="card"><h3>{t("paidLeave")}</h3><span className="big">{g.paidLeaveDays}</span><div className="caption">AL + SL</div></div>
        <div className="card"><h3>{t("unpaid")}</h3><span className="big">{g.otherLeaveDays}</span><div className="caption">CL + LV + A</div></div>
      </div>
      <p className="caption">{t("legend")}</p>

      <div className="table-wrap" tabIndex={0}>
        <table className="kem ts-grid">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t("name")}</th>
              {ts.days.map((d, i) => (
                <th key={d} className={ts.dayTypes[i] !== "Normal" ? "ts-off" : undefined} title={ts.dayTypes[i]}>
                  {WD[new Date(d + "T00:00:00Z").getUTCDay()]}
                  <br />
                  {d.slice(8)}
                </th>
              ))}
              <th>{t("daysWorked")}</th>
              <th>{t("normal")}</th>
              <th>{t("ot125")}</th>
              <th>{t("ot150")}</th>
              <th>AL</th>
              <th>SL</th>
              <th title="CL + LV + A">{t("unpaid")}</th>
            </tr>
          </thead>
          <tbody>
            {ts.workers.map((w) => (
              <tr key={w.workerId}>
                <td>{w.empCode}</td>
                <td style={{ whiteSpace: "nowrap" }}>{w.name}</td>
                {w.cells.map((c, i) => (
                  <td key={i} className={typeof c === "number" && c > 8 ? "ts-ot" : undefined} title={w.days[i].remarks ?? undefined}>
                    {c ?? ""}
                    {w.days[i].remarks?.startsWith("Finish") ? "*" : ""}
                  </td>
                ))}
                <td>{w.totals.daysWorked}</td>
                <td>{fmtH(w.totals.normal)}</td>
                <td>{fmtH(w.totals.ot125)}</td>
                <td>{fmtH(w.totals.ot150)}</td>
                <td>{w.totals.alDays || "–"}</td>
                <td>{w.totals.sickDays || "–"}</td>
                <td>{w.totals.otherLeaveDays || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="caption">{t("star")}</p>
    </>
  );
}
