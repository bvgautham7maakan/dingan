import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Windows PowerShell 5.1 reads a .ps1 without BOM as ANSI: a UTF-8 "–" turns into a curly quote and breaks parsing
describe("Windows scripts", () => {
  const dir = join(__dirname, "../../scripts/windows");
  for (const f of readdirSync(dir)) {
    it(`${f} is plain ASCII`, () => {
      const bad = [...readFileSync(join(dir, f), "utf8")].filter((c) => c.charCodeAt(0) > 127);
      expect(bad).toEqual([]);
    });
  }
});
