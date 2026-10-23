import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/current";
import { ROLES, ROLE_LABEL } from "@/lib/roles";
import DeviceList from "@/components/DeviceList";
import Status from "@/components/Status";
import Submit from "@/components/Submit";
import { resetPassword, setActive, signOutAllDevices, updateRoles } from "../actions";

export default async function UserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revoked?: string; deactivated?: string }>;
}) {
  const me = await requireRole(["ADMIN", "PM"]);
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations("admin");
  const tc = await getTranslations("common");
  const user = await db.user.findUnique({
    where: { id },
    include: {
      roles: true,
      sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" } },
    },
  });
  if (!user) notFound();
  const isAdmin = me.roles.includes("ADMIN");
  let flashPw: string | null = null;
  try {
    const f = JSON.parse((await cookies()).get("kem_flash_pw")?.value ?? "null");
    if (isAdmin && f?.userId === user.id) flashPw = String(f.pw);
  } catch {}
  const has = new Set(user.roles.map((r) => r.role));

  return (
    <>
      <h1>
        {user.displayName} <span className="muted">({user.username})</span>
      </h1>
      <p>
        <Status code={user.active ? "ACTIVE" : "INACTIVE"} label={user.active ? tc("active") : tc("inactive")} />
        {user.fullName && <span className="muted"> · {user.fullName}</span>}
      </p>

      {flashPw && (
        <p className="notice notice-warn" role="status">
          {t("tempPasswordShown", { name: user.displayName, pw: "" })}
          <code style={{ fontSize: 20, fontWeight: "bold", display: "block", marginTop: 6 }}>{flashPw}</code>
        </p>
      )}
      {sp.revoked && <p className="notice notice-ok" role="status">{t("signedOutAll", { count: Number(sp.revoked) })}</p>}
      {sp.deactivated && <p className="notice notice-ok" role="status">{t("deactivated")}</p>}

      <h2>{t("devices")}</h2>
      <DeviceList sessions={user.sessions} />
      <div className="row" style={{ marginTop: 12 }}>
        <form action={signOutAllDevices}>
          <input type="hidden" name="id" value={user.id} />
          <Submit className="btn btn-danger" confirm={`${t("signOutAll")}: ${user.displayName}?`}>
            {t("signOutAll")}
          </Submit>
        </form>
      </div>

      {isAdmin && (
        <>
          <h2>{t("roles")}</h2>
          <form action={updateRoles} className="form">
            <input type="hidden" name="id" value={user.id} />
            <div className="checks">
              {ROLES.map((r) => (
                <label key={r} className="check-chip">
                  <input type="checkbox" name="roles" value={r} defaultChecked={has.has(r)} /> {ROLE_LABEL[r]}
                </label>
              ))}
            </div>
            <Submit>{t("saveRoles")}</Submit>
          </form>

          <h2>{tc("actions")}</h2>
          <div className="row">
            <form action={resetPassword}>
              <input type="hidden" name="id" value={user.id} />
              <Submit className="btn" confirm={`${t("resetPassword")}?`}>
                {t("resetPassword")}
              </Submit>
            </form>
            {user.id !== me.id && (
              <form action={setActive}>
                <input type="hidden" name="id" value={user.id} />
                <input type="hidden" name="active" value={user.active ? "false" : "true"} />
                <Submit
                  className={user.active ? "btn btn-danger" : "btn"}
                  confirm={user.active ? `${t("deactivate")} ${user.displayName}?` : undefined}
                >
                  {user.active ? t("deactivate") : t("activate")}
                </Submit>
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}
