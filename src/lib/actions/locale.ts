"use server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/auth/constants";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/locales";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  });
  const u = await getCurrentUser();
  if (u) await db.user.update({ where: { id: u.id }, data: { locale } });
}
