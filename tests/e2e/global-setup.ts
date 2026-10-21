import { execSync } from "child_process";
import { rmSync } from "fs";

export const TEST_PASSWORD = "Test1234";

// Fresh e2e database: migrate + seed, then give every user (except aneesh) a known,
// already-changed password so tests can sign in. Aneesh keeps the forced-change flag.
export default async function globalSetup() {
  const env = { ...process.env, DATABASE_URL: "file:../data/test-e2e.db", SEED_TEMP_PASSWORD: "Temp9999" };
  rmSync("data/test-e2e.db", { force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "ignore" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "ignore" });
  execSync("npx tsx tests/e2e/prepare-users.ts", { env, stdio: "inherit" });
}
