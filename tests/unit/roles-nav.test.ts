import { describe, expect, it } from "vitest";
import { canRevokeOthers, canSeeMoney, defaultProjectScope, isSiteUser } from "@/lib/roles";
import { navFor, tabsFor } from "@/lib/nav";

const hrefs = (roles: string[]) => navFor(roles).flatMap((g) => g.items.map((i) => i.href));

describe("roles", () => {
  it("project scope default", () => {
    for (const r of ["PM", "PE", "SE", "SUP"]) expect(defaultProjectScope([r])).toBe("mine");
    for (const r of ["BUL", "OPS", "EST", "HEAD_SUP", "COORD"]) expect(defaultProjectScope([r])).toBe("all");
  });
  it("multi-role user sees money if any role may", () => {
    expect(canSeeMoney(["ADMIN", "PE"])).toBe(true);
    expect(canSeeMoney(["SUP"])).toBe(false);
  });
  it("only ADMIN and PM revoke other users", () => {
    expect(canRevokeOthers(["ADMIN"])).toBe(true);
    expect(canRevokeOthers(["PM"])).toBe(true);
    expect(canRevokeOthers(["SE"])).toBe(false);
  });
  it("site users", () => {
    expect(isSiteUser(["SUP"])).toBe(true);
    expect(isSiteUser(["ADMIN", "PE"])).toBe(false);
  });
});

describe("navigation", () => {
  it("desktop menu has at most 7 groups for every role", () => {
    for (const r of ["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "EST", "DESIGN", "COORD", "PROC", "HEAD_SUP", "SUP", "HVAC_SUP", "DRIVER"])
      expect(navFor([r]).length).toBeLessThanOrEqual(7);
  });
  it("driver sees logistics screens only", () => {
    const groups = navFor(["DRIVER"]).map((g) => g.key);
    expect(groups).toEqual(["home", "logistics"]);
  });
  it("procurement sees no drawings or site reports", () => {
    const h = hrefs(["PROC"]);
    expect(h).not.toContain("/m/drawings");
    expect(h).not.toContain("/m/daily-report");
    expect(h).toContain("/m/material-requests");
  });
  it("supervisors have no admin or commercial", () => {
    const g = navFor(["SUP"]).map((x) => x.key);
    expect(g).not.toContain("admin");
    expect(g).not.toContain("commercial");
  });
  it("mobile tab bar is at most 5 tabs", () => {
    for (const r of [["SUP"], ["DRIVER"], ["PROC"], ["DESIGN"], ["ADMIN", "PE"]]) expect(tabsFor(r).length).toBeLessThanOrEqual(5);
  });
});
