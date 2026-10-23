import { expect, test, type Page } from "@playwright/test";
import { loginOk } from "./helpers";

// Chrome only fires beforeinstallprompt when its own heuristics allow it, so fire a stand-in
async function fakeInstallPrompt(page: Page) {
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => {
      (window as unknown as { __prompted: boolean }).__prompted = true;
    };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(e);
  });
}

test("login: Install app button shows when Chrome offers install and opens the prompt", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("install-app")).toHaveCount(0);
  await fakeInstallPrompt(page);
  const btn = page.getByRole("button", { name: "⬇ Install app" });
  await expect(btn).toBeVisible();
  expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await btn.click();
  await expect(page.getByTestId("install-app")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
});

test("dashboard: Not now hides the install card on this device", async ({ page }) => {
  await loginOk(page, "vishnu");
  await fakeInstallPrompt(page);
  await expect(page.getByTestId("install-app")).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByTestId("install-app")).toHaveCount(0);
  await page.reload();
  await fakeInstallPrompt(page);
  await expect(page.getByTestId("install-app")).toHaveCount(0);
});

test.describe("iPhone", () => {
  test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1" });
  test("login shows Add to Home Screen steps", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("install-app")).toContainText("Add to Home Screen");
  });
});
