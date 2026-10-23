import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createSession, revokeAllSessions, validateSession, deviceLabelFrom } from "@/lib/auth/session";
import { hashPassword, verifyPassword, passwordProblem, tempPassword } from "@/lib/auth/password";
import { isLoginBlocked, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { resetDb } from "./reset";

let userId: string;

beforeAll(async () => {
  await resetDb();
  const u = await db.user.create({
    data: { username: "sanu", displayName: "Sanu", passwordHash: await hashPassword("Secret123"), mustChangePassword: false, roles: { create: [{ role: "SUP" }] } },
  });
  userId = u.id;
});

describe("passwords", () => {
  it("hashes with argon2 and verifies", async () => {
    const h = await hashPassword("Pipe1234");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "Pipe1234")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
  it("rules", () => {
    expect(passwordProblem("short1")).toBe("pw_too_short");
    expect(passwordProblem("onlyletters")).toBe("pw_letters_digits");
    expect(passwordProblem("Duct2026ok")).toBeNull();
    expect(passwordProblem(tempPassword())).toBeNull();
  });
});

describe("sessions", () => {
  it("creates a 90-day session and stores only a hash of the token", async () => {
    const token = await createSession(userId, "Mozilla/5.0 (Linux; Android 14) Chrome/120", "10.0.0.1");
    const s = await validateSession(token);
    expect(s?.user.username).toBe("sanu");
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
    const days = (s!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(s!.deviceLabel).toBe("Chrome on Android");
  });

  it("slides the expiry when used later", async () => {
    const token = await createSession(userId);
    const later = new Date(Date.now() + 30 * 86_400_000);
    const s = await validateSession(token, later);
    const fresh = await db.session.findUniqueOrThrow({ where: { id: s!.id } });
    expect(fresh.expiresAt.getTime()).toBeGreaterThan(later.getTime() + 89 * 86_400_000);
  });

  it("rejects an expired session", async () => {
    const token = await createSession(userId);
    expect(await validateSession(token, new Date(Date.now() + 91 * 86_400_000))).toBeNull();
  });

  it("sign out all devices kills every session on next request (acceptance 9)", async () => {
    const phone = await createSession(userId, "Android");
    const laptop = await createSession(userId, "Windows");
    const count = await revokeAllSessions(userId, null);
    expect(count).toBeGreaterThanOrEqual(2);
    expect(await validateSession(phone)).toBeNull();
    expect(await validateSession(laptop)).toBeNull();
  });

  it("deactivated user is rejected even with a live session", async () => {
    const token = await createSession(userId);
    await db.user.update({ where: { id: userId }, data: { active: false } });
    expect(await validateSession(token)).toBeNull();
    await db.user.update({ where: { id: userId }, data: { active: true } });
  });

  it("device labels", () => {
    expect(deviceLabelFrom("Mozilla/5.0 (Windows NT 10.0) Edg/120")).toBe("Edge on Windows");
    expect(deviceLabelFrom(null)).toBe("Unknown device");
  });
});

describe("login rate limit", () => {
  it("blocks after 5 failures for a username, clears on success", async () => {
    await db.loginAttempt.deleteMany();
    for (let i = 0; i < 5; i++) await recordLoginAttempt("vishnu", "1.1.1.1", false);
    expect(await isLoginBlocked("vishnu", "2.2.2.2")).toBe(true);
    expect(await isLoginBlocked("aneesh", "2.2.2.2")).toBe(false);
    await recordLoginAttempt("vishnu", "1.1.1.1", true);
    expect(await isLoginBlocked("vishnu", "2.2.2.2")).toBe(false);
  });
});

describe("login rate limit behind a proxy", () => {
  it("does not lock everyone out when every request looks local", async () => {
    await db.loginAttempt.deleteMany();
    for (let i = 0; i < 25; i++) await recordLoginAttempt(`attacker${i}`, "local", false);
    expect(await isLoginBlocked("sanu", "local")).toBe(false);
    for (let i = 0; i < 5; i++) await recordLoginAttempt("sanu", "local", false);
    expect(await isLoginBlocked("sanu", "local")).toBe(true);
  });
});
