import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { fmtDateTime } from "@/lib/time";
import Submit from "@/components/Submit";
import { markAllRead } from "./actions";

const ICON: Record<string, string> = { APPROVAL: "●", APPROVED: "✓", RETURNED: "↩", HIGH_ALERT: "⚠", SAFETY: "⛑", DUTY: "☑", DUTY_DONE: "✓", QUERY: "?", QUERY_ANSWERED: "💬", DRAWING: "▧" };

export default async function NotificationsPage() {
  const me = await requireUser();
  const t = await getTranslations("notes");
  const list = await db.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <>
      <h1>{t("title")}</h1>
      {unread > 0 && (
        <form action={markAllRead} style={{ marginBottom: 12 }}>
          <Submit className="btn">{t("markAll", { n: unread })}</Submit>
        </form>
      )}
      {list.length === 0 && <p className="muted">{t("none")}</p>}
      <ul className="pending-list" data-testid="notifications">
        {list.map((n) => (
          <li key={n.id} className={n.readAt ? "note-read" : "note-unread"}>
            <a href={`/notifications/${n.id}`}>
              <span aria-hidden="true">{ICON[n.type] ?? "•"}</span> {n.title}
            </a>
            <span className="caption">
              {fmtDateTime(n.createdAt)} · {n.readAt ? t("read") : <b>{t("unread")}</b>}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
