import { expect, test } from "@playwright/test";
import { login, loginOk, noHorizontalScroll } from "./helpers";

test("unauthenticated visitors are sent to login; API returns 401", async ({ page, request }) => {
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login$/);
  await noHorizontalScroll(page);
  const r = await request.get("/api/me");
  expect(r.status()).toBe(401);
});

test("wrong password shows an error", async ({ page }) => {
  await login(page, "sachin", "nope-nope-1");
  await expect(page.locator(".notice-error")).toContainText("Wrong username or password");
});

test("first login forces a password change", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-390", "runs once – it changes the password");
  await login(page, "aneesh", "Temp9999");
  await expect(page).toHaveURL(/\/change-password$/);
  // the rest of the app stays locked until the password is changed
  await page.goto("/");
  await expect(page).toHaveURL(/\/change-password$/);
  expect((await page.request.get("/api/me")).status()).toBe(403);

  await page.getByLabel("Current password").fill("Temp9999");
  await page.getByLabel("New password", { exact: true }).fill("Aneesh2026");
  await page.getByLabel("Repeat new password").fill("Aneesh2026");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Hello, Aneesh" })).toBeVisible();
});

test("session persists across browser restarts (cookie lives 90 days)", async ({ page, context }) => {
  await loginOk(page, "sachin");
  const cookie = (await context.cookies()).find((c) => c.name === "kem_session")!;
  expect(cookie.httpOnly).toBe(true);
  const days = (cookie.expires * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(89);
});

test("log out ends the session", async ({ page }, info) => {
  await loginOk(page, "deepak");
  if (info.project.name === "phone-390") {
    await page.getByRole("link", { name: "More" }).click();
  }
  await page.getByRole("button", { name: "Log out" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/me")).status()).toBe(401);
});
