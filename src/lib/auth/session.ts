import { createHash, randomBytes } from "crypto";
import { db } from "../db";
import { SESSION_DAYS, SESSION_TOUCH_MS } from "./constants";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function deviceLabelFrom(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad/i.test(ua)
      ? "iPhone/iPad"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} on ${os}`;
}

function expiry(from = new Date()) {
  return new Date(from.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export async function createSession(userId: string, ua?: string | null, ip?: string | null) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: ua ?? null,
      deviceLabel: deviceLabelFrom(ua),
      ip: ip ?? null,
      expiresAt: expiry(),
    },
  });
  return token;
}

/** Returns the live session + user for a raw token, sliding its expiry. Null if invalid. */
export async function validateSession(token: string | undefined | null, now = new Date()) {
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session) return null;
  if (session.revokedAt || session.expiresAt <= now || !session.user.active) return null;

  if (now.getTime() - session.lastUsedAt.getTime() > SESSION_TOUCH_MS) {
    await db.session.update({
      where: { id: session.id },
      data: { lastUsedAt: now, expiresAt: expiry(now) },
    });
  }
  return session;
}

export async function revokeSession(sessionId: string, byUserId: string | null) {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedById: byUserId },
  });
}

/** Signs out every device of `userId`. Optionally keeps one session (the caller's own). */
export async function revokeAllSessions(
  userId: string,
  byUserId: string | null,
  exceptSessionId?: string,
) {
  const res = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedById: byUserId },
  });
  return res.count;
}
