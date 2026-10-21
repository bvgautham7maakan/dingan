import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/current";
import LangToggle from "@/components/LangToggle";
import PwForm from "./PwForm";

export default async function ChangePasswordPage() {
  const me = await requireUser({ allowPasswordChange: true });
  const t = await getTranslations("auth");
  return (
    <main className="auth-wrap">
      <div className="auth-box">
        <div className="auth-top">
          <LangToggle />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="KEM" className="logo" />
        <h1>{t("changeTitle")}</h1>
        {me.mustChangePassword && <p className="notice notice-warn">{t("changeIntro")}</p>}
        <PwForm />
      </div>
    </main>
  );
}
