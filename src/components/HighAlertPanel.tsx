import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CurrentUser } from "@/lib/auth/current";
import { openAlerts } from "@/lib/materials/server";

/** Pinned HIGH-ALERT list – rendered only for SE and PE (openAlerts returns nothing for others). */
export default async function HighAlertPanel({ user }: { user: CurrentUser }) {
  const alerts = await openAlerts(user);
  if (!alerts.length) return null;
  const t = await getTranslations("mr");
  return (
    <section className="alert-panel" role="alert" data-testid="high-alert">
      <h2>⚠ HIGH-ALERT ({alerts.length})</h2>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {alerts.map((a) => (
          <li key={a.id}>
            <Link href={`/m/material-requests/${a.requestId}`}><b>{a.ref}</b></Link> · {a.project} · {t(`alert_${a.type}`)}: {a.detail}
          </li>
        ))}
      </ul>
    </section>
  );
}
