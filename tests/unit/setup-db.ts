import { execSync } from "child_process";
import { rmSync } from "fs";

// Unit tests that touch the DB use their own throwaway SQLite file.
export default function setup() {
  rmSync("data/test-unit.db", { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:../data/test-unit.db" },
    stdio: "ignore",
  });
}
