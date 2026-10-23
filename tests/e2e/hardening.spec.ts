import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { loginOk } from "./helpers";

test("acceptance 11: installable PWA (Chrome installability check, service worker active)", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-1440", "Chromium CDP check");
  await page.goto("/login");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect(manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512")).toBe(true);
});

test("security headers and health check", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-frame-options"]).toBe("SAMEORIGIN");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ ok: true });
});

test("login is rate-limited after repeated failures", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await page.goto("/login");
    await page.getByLabel("Username").fill("nosuchuser");
    await page.getByLabel("Password", { exact: true }).fill(`wrong-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator(".notice-error")).toBeVisible();
  }
  await page.getByLabel("Username").fill("nosuchuser");
  await page.getByLabel("Password", { exact: true }).fill("wrong-x");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".notice-error")).toContainText("Too many failed attempts");
});

// WCAG A/AA checks (axe) on the main screens of each kind.
const PAGES: [string, string][] = [
  ["sanu", "/"], ["sanu", "/m/attendance"], ["sanu", "/m/moves"], ["sanu", "/m/daily-report"], ["sanu", "/m/material-requests"],
  ["ali", "/"], ["ali", "/m/bills"], ["dinga", "/"], ["dinga", "/m/timesheet"], ["dinga", "/m/drawings"], ["dinga", "/admin/users"],
];
for (const [user, path] of PAGES) {
  test(`accessibility: ${path} as ${user}`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop-1440" && user === "dinga");
    await loginOk(page, user);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

test("keyboard: sign in and reach the menu without a mouse", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await page.goto("/login");
  await page.keyboard.press("Tab"); // language buttons come first
  await page.getByLabel("Username").focus();
  await page.keyboard.type("dinga");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Test1234");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Timesheet" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/m\/timesheet/);
});
