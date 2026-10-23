import { db } from "../db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAIL_PER_USER = 5;
const MAX_FAIL_PER_IP = 20;

export async function isLoginBlocked(username: string, ip: string, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_MS);
  // Behind a proxy without X-Forwarded-For every request looks "local"; limiting that address
  // would let one person lock everybody out, so only the per-username limit applies then.
  const ipKnown = ip !== "local" && ip !== "127.0.0.1" && ip !== "::1";
  const [byUser, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { username, success: false, at: { gte: since } } }),
    ipKnown ? db.loginAttempt.count({ where: { ip, success: false, at: { gte: since } } }) : Promise.resolve(0),
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
