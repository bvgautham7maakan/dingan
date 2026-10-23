import { expect, test, type Browser } from "@playwright/test";
import { loginOk } from "./helpers";

async function sanuOnPhone(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await ctx.newPage();
  await loginOk(p, "sanu");
  expect((await p.request.get("/api/me")).status()).toBe(200);
  return { ctx, p };
}

async function openUser(page: import("@playwright/test").Page, name: string) {
  await page.goto("/admin/users");
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
}

test("admin signs out all of Sanu's devices; phone is logged out on next request (acceptance 9)", async ({ page, browser }) => {
  const { ctx, p } = await sanuOnPhone(browser);
  await loginOk(page, "dinga");
  await openUser(page, "Sanu");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Sign out all devices" }).click();
  await expect(page.getByRole("status").filter({ hasText: "device(s) signed out" })).toBeVisible();

  expect((await p.request.get("/api/me")).status()).toBe(401);
  await p.reload();
  await expect(p).toHaveURL(/\/login$/);
  await ctx.close();
});

test("PM can sign out a user's devices but cannot edit roles", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  const { ctx, p } = await sanuOnPhone(browser);
  await loginOk(page, "yadhu.s");
  await openUser(page, "Sanu");
  await expect(page.getByRole("button", { name: "Save roles" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Sign out all devices" }).click();
  // wait for the server to confirm before checking the phone (avoids a race with the action)
  await expect(page.getByRole("status").filter({ hasText: "device(s) signed out" })).toBeVisible();
  expect((await p.request.get("/api/me")).status()).toBe(401);
  await ctx.close();
});

test("admin creates a user, gets a one-time password, deactivates the user", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "dinga");
  await page.goto("/admin/users");
  await page.getByLabel("Username").fill("akshay");
  await page.getByLabel("Name", { exact: true }).fill("Akshay");
  await page.getByLabel("Site Engineer").check();
  await page.getByRole("button", { name: "Add" }).click();
  const code = page.locator("code");
  await expect(code).toHaveText(/^Kem-\d{4}-[a-z]+$/);
  const pw = (await code.textContent())!;
  expect(page.url()).not.toContain(pw);

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByLabel("Username").fill("akshay");
  await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p).toHaveURL(/change-password/);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("User deactivated")).toBeVisible();
  expect((await p.request.get("/api/me")).status()).toBe(401);
  await ctx.close();
});

test("master data: add a site and see it in the audit log", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "dinga");
  await page.goto("/admin/sites");
  await page.getByLabel("Code *").fill("TEST1");
  await page.getByLabel("Name *").fill("Test Site One");
  await page.getByLabel("Type *").selectOption("PROJECT");
  await page.getByLabel("Default start time *").fill("07:30");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("✓ Saved")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Test Site One" })).toBeVisible();
  await page.goto("/admin/audit");
  await expect(page.getByRole("cell", { name: "sites" }).first()).toBeVisible();
});
