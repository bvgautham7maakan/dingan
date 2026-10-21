import { db } from "../db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAIL_PER_USER = 5;
const MAX_FAIL_PER_IP = 20;

export async function isLoginBlocked(username: string, ip: string, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_MS);
  const [byUser, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { username, success: false, at: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, success: false, at: { gte: since } } }),
  ]);
  return byUser >= MAX_FAIL_PER_USER || byIp >= MAX_FAIL_PER_IP;
}

export async function recordLoginAttempt(username: string, ip: string, success: boolean) {
  await db.loginAttempt.create({ data: { username, ip, success } });
  if (success) {
    // a good login clears the user's failure streak
    await db.loginAttempt.deleteMany({ where: { username, success: false } });
  }
}
