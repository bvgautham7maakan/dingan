import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { fmtDateTime } from "@/lib/time";

export default async function AuditPage() {
  await requireRole(["ADMIN"]);
  const t = await getTranslations("admin");
  const logs = await db.auditLog.findMany({ include: { actor: true }, orderBy: { at: "desc" }, take: 300 });
  return (
    <>
      <h1>{t("auditTitle")}</h1>
      <p className="caption">Latest 300 entries.</p>
      <div className="table-wrap" tabIndex={0}>
        <table className="kem">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Item</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{fmtDateTime(l.at)}</td>
                <td>{l.actor?.displayName ?? "system"}</td>
                <td>{l.action}</td>
                <td>
                  {l.entityType}
                  {l.entityId && <div className="caption">{l.entityId}</div>}
                </td>
                <td>
                  {(l.before != null || l.after != null) && (
                    <details>
                      <summary>Show</summary>
                      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxWidth: 480 }}>
                        {l.before != null && `Before: ${JSON.stringify(l.before, null, 1)}\n`}
                        {l.after != null && `After: ${JSON.stringify(l.after, null, 1)}`}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
