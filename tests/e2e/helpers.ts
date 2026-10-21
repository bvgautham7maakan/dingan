import { expect, type Page } from "@playwright/test";

export async function login(page: Page, username: string, password = "Test1234") {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function loginOk(page: Page, username: string) {
  await login(page, username);
  await expect(page).toHaveURL(/\/$/);
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
