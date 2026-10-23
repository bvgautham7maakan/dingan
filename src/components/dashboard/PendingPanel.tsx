import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { groupPending, type Bucket, type PendingItem } from "@/lib/dashboard/pending";
import { fmtDateTime } from "@/lib/time";

const STYLE: Record<Bucket, [string, string]> = { overdue: ["status-red", "⚠"], today: ["status-blue", "●"], week: ["status-grey", "○"], later: ["status-grey", "○"] };

/** Waiting for you – overdue → today → this week. */
export default async function PendingPanel({ items }: { items: PendingItem[] }) {
  const t = await getTranslations("dashboard");
  const g = groupPending(items);
  return (
    <section className="panel" aria-labelledby="pending-h" data-testid="pending">
      <h2 id="pending-h" style={{ marginTop: 0 }}>
        {t("pending")} {items.length > 0 && <span className="badge">{items.length}</span>}
      </h2>
      {items.length === 0 && <p className="muted">{t("noPending")}</p>}
      {(["overdue", "today", "week", "later"] as Bucket[]).map((b) =>
        g[b].length === 0 ? null : (
          <div key={b}>
            <h3 className={`status ${STYLE[b][0]}`}>{STYLE[b][1]} {t(b === "week" ? "thisWeek" : b)} ({g[b].length})</h3>
            <ul className="pending-list">
              {g[b].map((i) => (
                <li key={i.key}>
                  <Link href={i.link}>{i.title}</Link>
                  <span className="caption">
                    {i.detail && `${i.detail} · `}
                    {t("due")} {fmtDateTime(i.due)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
