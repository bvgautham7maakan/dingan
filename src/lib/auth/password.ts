import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "crypto";

// argon2id with OWASP-recommended parameters
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "pw_too_short";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "pw_letters_digits";
  return null;
}

/** Readable temporary password, e.g. "Kem-4821-tank" */
export function tempPassword(): string {
  const words = ["pipe", "duct", "cable", "pump", "valve", "tank", "panel", "fan", "tray", "fuse"];
  return `Kem-${randomInt(1000, 9999)}-${words[randomInt(0, words.length)]}`;
}
