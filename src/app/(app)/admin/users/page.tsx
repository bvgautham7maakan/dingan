import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { ROLES, ROLE_LABEL, isRole } from "@/lib/roles";
import { fmtDateTime } from "@/lib/time";
import Status from "@/components/Status";
import Submit from "@/components/Submit";
import { createUser } from "./actions";

export default async function Users() {
  const me = await requireRole(["ADMIN", "PM"]);
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const now = new Date();
  const users = await db.user.findMany({
    include: {
      roles: true,
      _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } } } } },
    },
    orderBy: { displayName: "asc" },
  });
  const isAdmin = me.roles.includes("ADMIN");
  return (
    <>
      <h1>{t("usersTitle")}</h1>
      <div className="table-wrap" tabIndex={0}>
        <table className="kem">
          <thead>
            <tr>
              <th>{t("displayName")}</th>
              <th>Username</th>
              <th>{t("roles")}</th>
              <th>{t("status")}</th>
              <th>{t("devices")}</th>
              <th>{t("lastSeen")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/users/${u.id}`}>{u.displayName}</Link>
                  {u.fullName && <div className="caption">{u.fullName}</div>}
                </td>
                <td>{u.username}</td>
                <td>{u.roles.map((r) => (isRole(r.role) ? ROLE_LABEL[r.role] : r.role)).join(", ")}</td>
                <td>
                  <Status code={u.active ? "ACTIVE" : "INACTIVE"} label={u.active ? tc("active") : tc("inactive")} />
                  {u.mustChangePassword && <div className="caption">{t("tempPassword")}</div>}
                </td>
                <td>{u._count.sessions}</td>
                <td>{fmtDateTime(u.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isAdmin && (
        <section>
          <h2>{t("newUser")}</h2>
          <form action={createUser} className="form">
            <div className="field">
              <label htmlFor="username">Username</label>
              <input id="username" name="username" pattern="[a-z0-9._\-]{3,32}" required />
            </div>
            <div className="field">
              <label htmlFor="displayName">{t("displayName")}</label>
              <input id="displayName" name="displayName" required />
            </div>
            <div className="field">
              <label htmlFor="fullName">{t("fullName")}</label>
              <input id="fullName" name="fullName" />
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0 }}>
              <legend className="label">{t("roles")}</legend>
              <div className="checks">
                {ROLES.map((r) => (
                  <label key={r} className="check-chip">
                    <input type="checkbox" name="roles" value={r} /> {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Submit>{tc("add")}</Submit>
          </form>
        </section>
      )}
    </>
  );
}
