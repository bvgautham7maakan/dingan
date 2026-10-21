"use client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { changePassword, type PwState } from "./actions";
import Submit from "@/components/Submit";

export default function PwForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState<PwState, FormData>(changePassword, {});
  return (
    <form action={action} className="form">
      {state.error && (
        <p className="notice notice-error" role="alert">
          {t(state.error)}
        </p>
      )}
      <div className="field">
        <label htmlFor="current">{t("current")}</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor="new">{t("new")}</label>
        <input id="new" name="new" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div className="field">
        <label htmlFor="confirm">{t("confirm")}</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <Submit className="btn btn-primary btn-big">{t("change")}</Submit>
    </form>
  );
}
