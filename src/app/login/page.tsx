import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current";
import LangToggle from "@/components/LangToggle";
import LoginForm from "./LoginForm";
import InstallApp from "@/components/InstallApp";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const t = await getTranslations("auth");
  return (
    <main className="auth-wrap">
      <div className="auth-box">
        <div className="auth-top">
          <LangToggle />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="KEM – Kahraba Electromechanical Services" className="logo" />
        <h1>{t("title")}</h1>
        <LoginForm />
        <InstallApp />
      </div>
    </main>
  );
}
