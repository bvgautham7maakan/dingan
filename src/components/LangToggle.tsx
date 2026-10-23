"use client";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { LOCALES, LOCALE_SHORT } from "@/i18n/locales";

const NAMES = { en: "English", ml: "മലയാളം", hi: "हिन्दी" } as const;

export default function LangToggle() {
  const t = useTranslations("common");
  const current = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="lang" role="group" aria-label={t("language")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={current === l}
          aria-label={NAMES[l]}
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setLocale(l);
              router.refresh();
            })
          }
        >
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
