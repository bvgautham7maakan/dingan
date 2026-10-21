// Rebuilds the demo database from scratch: deletes the SQLite file, applies migrations, seeds.
// Use only on the pilot/demo database. Asks for confirmation unless --yes is passed.
import { execSync } from "child_process";
import { existsSync, rmSync } from "fs";
import path from "path";
import readline from "readline/promises";
import "dotenv/config";

const url = process.env.DATABASE_URL ?? "file:../data/kem.db";
if (!url.startsWith("file:")) {
  console.error("reset-demo only works on a SQLite file database.");
  process.exit(1);
}
const file = path.resolve("prisma", url.slice("file:".length));

if (!process.argv.includes("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = await rl.question(`This deletes ALL data in ${file}. Type RESET to continue: `);
  rl.close();
  if (a.trim() !== "RESET") process.exit(0);
}
for (const f of [file, `${file}-journal`]) if (existsSync(f)) rmSync(f);
execSync("npx prisma migrate deploy", { stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
