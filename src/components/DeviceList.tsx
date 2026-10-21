import { getTranslations } from "next-intl/server";
import { fmtDateTime } from "@/lib/time";

type S = { id: string; deviceLabel: string | null; ip: string | null; createdAt: Date; lastUsedAt: Date };

export default async function DeviceList({
  sessions,
  currentId,
  action,
}: {
  sessions: S[];
  currentId?: string;
  action?: (form: FormData) => Promise<void>;
}) {
  const t = await getTranslations("account");
  const tc = await getTranslations("common");
  if (sessions.length === 0) return <p className="muted">{tc("none")}</p>;
  return (
    <div className="table-wrap">
      <table className="kem">
        <thead>
          <tr>
            <th>Device</th>
            <th>{t("lastUsed")}</th>
            <th>Signed in</th>
            {action && <th>{tc("actions")}</th>}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>
                {s.deviceLabel ?? "Device"}
                {s.id === currentId && <b> ({t("thisDevice")})</b>}
                {s.ip && <div className="caption">{s.ip}</div>}
              </td>
              <td>{fmtDateTime(s.lastUsedAt)}</td>
              <td>{fmtDateTime(s.createdAt)}</td>
              {action && (
                <td>
                  {s.id !== currentId && (
                    <form action={action}>
                      <input type="hidden" name="sessionId" value={s.id} />
                      <button className="btn">{t("signOut")}</button>
                    </form>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
