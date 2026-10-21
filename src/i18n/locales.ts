export const LOCALES = ["en", "ml", "hi"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_SHORT: Record<Locale, string> = { en: "EN", ml: "മ", hi: "हि" };
export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
