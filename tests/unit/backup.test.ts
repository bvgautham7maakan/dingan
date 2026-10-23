import { describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const run = (env: Record<string, string>) =>
  spawnSync("node", ["scripts/backup.mjs", "--verify"], { env: { ...process.env, DATABASE_URL: "file:../data/test-unit.db", ...env }, encoding: "utf8" });

describe("nightly backup", () => {
  it("copies the database and new uploads, and the copy opens", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kem-bk-"));
    const up = path.join(root, "uploads");
    mkdirSync(path.join(up, "NBK", "bills"), { recursive: true });
    writeFileSync(path.join(up, "NBK", "bills", "a.jpg"), "photo");
    const out = path.join(root, "OneDrive", "KEM App Backup");
    const r = run({ BACKUP_DIR: out, UPLOAD_DIR: up });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/OK kem-\d{4}-\d{2}-\d{2}\.db .* 1 upload\(s\) copied .* verify: \d+ users/);
    expect(readdirSync(path.join(out, "db"))).toHaveLength(1);
    expect(readFileSync(path.join(out, "uploads", "NBK", "bills", "a.jpg"), "utf8")).toBe("photo");
    // second run: nothing new to copy
    const r2 = run({ BACKUP_DIR: out, UPLOAD_DIR: up });
    expect(r2.stdout).toContain("0 upload(s) copied");
    expect(existsSync(path.join(out, "backup.log"))).toBe(true);
  });

  it("refuses to run without BACKUP_DIR", () => {
    const r = run({ BACKUP_DIR: "" });
    expect(r.status).toBe(2);
  });

  it("keeps 14 daily copies plus one per month", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kem-bk-"));
    const dbDir = path.join(root, "db");
    mkdirSync(dbDir, { recursive: true });
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 7, 1 + i)).toISOString().slice(0, 10);
      writeFileSync(path.join(dbDir, `kem-${d}.db`), "x");
    }
    const r = run({ BACKUP_DIR: root, UPLOAD_DIR: path.join(root, "none") });
    expect(r.status, r.stderr).toBe(0);
    const left = readdirSync(dbDir).sort();
    expect(left).toContain("kem-2026-08-01.db"); // first of August kept
    expect(left).toContain("kem-2026-09-01.db");
    expect(left.length).toBeLessThanOrEqual(14 + 3);
  });
});
