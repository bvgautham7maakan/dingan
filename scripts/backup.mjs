// Nightly backup: consistent copy of the SQLite database + new/changed uploads into BACKUP_DIR
// (e.g. a OneDrive folder). Never deletes uploads from the backup. Keeps 14 daily DB copies
// and the first copy of each month for 12 months.
//
//   node scripts/backup.mjs            run a backup
//   node scripts/backup.mjs --verify   also open the copy and count users
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import path from "path";

const started = Date.now();
const backupDir = process.env.BACKUP_DIR;
if (!backupDir) {
  console.error("BACKUP_DIR is not set in .env – nothing done.");
  process.exit(2);
}
const dbUrl = process.env.DATABASE_URL ?? "file:../data/kem.db";
if (!dbUrl.startsWith("file:")) {
  console.error("Backup supports the SQLite pilot database only.");
  process.exit(2);
}
const uploads = path.resolve(process.env.UPLOAD_DIR || "data/uploads");
const dbDir = path.join(backupDir, "db");
const upDir = path.join(backupDir, "uploads");
mkdirSync(dbDir, { recursive: true });
mkdirSync(upDir, { recursive: true });

// Dubai date for the file name
const day = new Date(Date.now() + 4 * 3_600_000).toISOString().slice(0, 10);
const target = path.join(dbDir, `kem-${day}.db`);
if (existsSync(target)) rmSync(target);

// 1. database: VACUUM INTO gives a consistent copy while the app is running
const db = new PrismaClient();
await db.$executeRawUnsafe(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
await db.$disconnect();

// 2. uploads: copy files that are new or changed (by size / time)
let copied = 0;
function mirror(src, dst) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) mirror(s, d);
    else if (e.isFile()) {
      const ss = statSync(s);
      if (!existsSync(d) || statSync(d).size !== ss.size || statSync(d).mtimeMs < ss.mtimeMs) {
        copyFileSync(s, d);
        copied++;
      }
    }
  }
}
mirror(uploads, upDir);

// 3. retention: 14 latest daily copies + first copy of each month (12 months)
const copies = readdirSync(dbDir).filter((f) => /^kem-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse();
const keep = new Set(copies.slice(0, 14));
const months = new Map();
for (const f of [...copies].reverse()) {
  const m = f.slice(4, 11);
  if (!months.has(m)) months.set(m, f);
}
[...months.values()].slice(-12).forEach((f) => keep.add(f));
let removed = 0;
for (const f of copies) {
  if (keep.has(f)) continue;
  rmSync(path.join(dbDir, f));
  removed++;
}

// 4. optional check that the copy opens
let verified = "";
if (process.argv.includes("--verify")) {
  const check = new PrismaClient({ datasources: { db: { url: `file:${target}` } } });
  verified = ` · verify: ${await check.user.count()} users`;
  await check.$disconnect();
}

const line = `${new Date().toISOString()} OK ${path.basename(target)} (${Math.round(statSync(target).size / 1024)} KB) · ${copied} upload(s) copied · ${removed} old copy(ies) removed${verified} · ${Date.now() - started} ms`;
appendFileSync(path.join(backupDir, "backup.log"), line + "\n");
console.log(line);
