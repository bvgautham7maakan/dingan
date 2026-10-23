"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { login, type LoginState } from "./actions";
import Submit from "@/components/Submit";

export default function LoginForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="form">
      {state.error && (
        <p className="notice notice-error" role="alert">
          {t(state.error)}
        </p>
      )}
      <div className="field">
        <label htmlFor="username">{t("username")}</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
      </div>
      <div className="field">
        <label htmlFor="password">{t("password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Submit className="btn btn-primary btn-big">{t("signIn")}</Submit>
      <p className="caption">{t("stayHint")}</p>
    </form>
  );
}
