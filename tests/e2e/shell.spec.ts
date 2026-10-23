import { expect, test } from "@playwright/test";
import { loginOk, noHorizontalScroll } from "./helpers";

test("app shell: sidebar on desktop, bottom tabs on phone", async ({ page }, info) => {
  await loginOk(page, "dinga");
  const phone = info.project.name === "phone-390";
  await expect(page.getByRole("navigation", { name: "Tabs" })).toBeVisible({ visible: phone });
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible({ visible: !phone });
  if (phone) {
    const tabs = page.getByRole("navigation", { name: "Tabs" }).getByRole("link");
    expect(await tabs.count()).toBeLessThanOrEqual(5);
    const box = await tabs.first().boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(60);
  }
  for (const path of ["/", "/account", "/admin/users", "/admin/projects", "/m/attendance", "/more"]) {
    await page.goto(path);
    await noHorizontalScroll(page);
  }
});

test("supervisor phone tabs and sign-in screen are touch sized", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-390");
  await page.goto("/login");
  const btn = await page.getByRole("button", { name: "Sign in" }).boundingBox();
  expect(btn!.height).toBeGreaterThanOrEqual(64);
  await loginOk(page, "sanu");
  const tabs = page.getByRole("navigation", { name: "Tabs" });
  await expect(tabs.getByRole("link", { name: "Attendance" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Manpower moves" })).toBeVisible();
});

test("language toggle switches to Malayalam and Hindi", async ({ page }) => {
  await loginOk(page, "renjith");
  await page.getByRole("button", { name: "മലയാളം" }).first().click();
  await expect(page.getByRole("heading", { name: "നമസ്കാരം, Renjith" })).toBeVisible();
  await page.getByRole("button", { name: "हिन्दी" }).first().click();
  await expect(page.getByRole("heading", { name: "नमस्ते, Renjith" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).first().click();
  await expect(page.getByRole("heading", { name: "Hello, Renjith" })).toBeVisible();
});

test("project panel: supervisor defaults to My projects, BUL to All", async ({ page, browser }) => {
  await loginOk(page, "sanu");
  await expect(page.getByRole("heading", { name: "My projects", level: 2 })).toBeVisible();
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await loginOk(p2, "nobin");
  await expect(p2.getByRole("heading", { name: "All projects", level: 2 })).toBeVisible();
  await ctx.close();
});
