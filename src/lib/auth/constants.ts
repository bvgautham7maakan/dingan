export const SESSION_COOKIE = "kem_session";
export const LOCALE_COOKIE = "kem_locale";
export const SESSION_DAYS = 90;
export const SESSION_MAX_AGE_S = SESSION_DAYS * 24 * 60 * 60;
/** Only write lastUsedAt/expiresAt when older than this, to avoid a DB write per request. */
export const SESSION_TOUCH_MS = 15 * 60 * 1000;

export const PUBLIC_PATHS = ["/login", "/offline", "/manifest.webmanifest", "/sw.js"];
