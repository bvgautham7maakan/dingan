import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { ROLE_LABEL, isRole } from "@/lib/roles";
import DeviceList from "@/components/DeviceList";
import LangToggle from "@/components/LangToggle";
import Submit from "@/components/Submit";
import { signOutDevice, signOutOtherDevices } from "./actions";

export default async function Account() {
  const me = await requireUser();
  const t = await getTranslations("account");
  const tc = await getTranslations("common");
  const sessions = await db.session.findMany({
    where: { userId: me.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });
  return (
    <>
      <h1>{t("title")}</h1>
      <p>
        <b>{me.displayName}</b> ({me.username}) · {me.roles.filter(isRole).map((r) => ROLE_LABEL[r]).join(", ")}
      </p>
      <h2>{tc("language")}</h2>
      <LangToggle />
      <h2>{t("devices")}</h2>
      <DeviceList sessions={sessions} currentId={me.sessionId} action={signOutDevice} />
      <div className="row" style={{ marginTop: 12 }}>
        {sessions.length > 1 && (
          <form action={signOutOtherDevices}>
            <Submit className="btn">{t("signOutOthers")}</Submit>
          </form>
        )}
        <Link className="btn" href="/change-password">
          {t("changePassword")}
        </Link>
      </div>
    </>
  );
}
