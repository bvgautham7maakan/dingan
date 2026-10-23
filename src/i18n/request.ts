import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/auth/constants";
import { isLocale } from "./locales";

export default getRequestConfig(async () => {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(c) ? c : "en";
  const en = (await import("../../messages/en.json")).default;
  const own = locale === "en" ? en : (await import(`../../messages/${locale}.json`)).default;
  // fall back to English for any key not yet translated
  return { locale, messages: deepMerge(en, own), timeZone: "Asia/Dubai" };
});

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object"
        ? deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}
