import { expect, test } from "@playwright/test";
import { loginOk } from "./helpers";

test("supervisor and driver API responses carry no AED fields (acceptance 6)", async ({ page, browser }) => {
  for (const u of ["sanu", "ali", "renjith", "jitendar", "alwin"]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginOk(p, u);
    const body = await (await p.request.get("/api/projects?scope=all")).text();
    expect(body, u).not.toMatch(/Fils|"aed/);
    await ctx.close();
  }
  await loginOk(page, "dinga");
  const body = await (await page.request.get("/api/projects?scope=all")).json();
  expect(Object.keys(body.projects[0])).toContain("bulThresholdFils");
});

test("server blocks screens outside a role", async ({ page }) => {
  await loginOk(page, "sanu");
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/denied=1/);
  await expect(page.getByText("You do not have access")).toBeVisible();
  await page.goto("/m/estimation");
  await expect(page).toHaveURL(/denied=1/);
});

test("driver sees logistics only; procurement sees no drawings", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "ali");
  const menu = page.getByRole("navigation", { name: "Main menu" });
  await expect(menu.getByRole("link", { name: "Trips" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Drawings" })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Attendance" })).toHaveCount(0);
  await page.goto("/m/drawings");
  await expect(page).toHaveURL(/denied=1/);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await loginOk(p, "azhar");
  await p.goto("/m/drawings");
  await expect(p).toHaveURL(/denied=1/);
  await p.goto("/m/daily-report");
  await expect(p).toHaveURL(/denied=1/);
  await ctx.close();
});
