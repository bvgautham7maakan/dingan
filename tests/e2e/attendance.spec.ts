import { expect, test, type Page } from "@playwright/test";
import { loginOk } from "./helpers";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const CREW = ["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E08", "E09"];

async function planCrewToNbk(page: Page) {
  await loginOk(page, "renjith");
  await page.goto(`/m/plan?date=${today()}`);
  for (const code of CREW) {
    const row = page.locator(".plan-row", { hasText: code });
    await row.getByLabel("Site").selectOption({ label: "NBK" });
    await row.getByLabel("Vehicle").selectOption({ label: "Vehicle 1" });
  }
  // the demo seed plans E01–E12 at NBK; keep exactly the 9-man crew there
  for (const code of ["E10", "E11", "E12"])
    await page.locator(".plan-row", { hasText: code }).getByLabel("Site").selectOption({ label: "– not planned" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Plan saved")).toBeVisible();
}

test("acceptance 1: Sanu marks 9 workers offline (1 late 08:20, 1 SL); it syncs when back online", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "phone-390", "phone flow");
  await planCrewToNbk(page);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await loginOk(p, "sanu");
  // let the service worker take control so the screen also reopens offline
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.goto("/m/attendance");
  await expect(p.getByText("0 of 9 marked")).toBeVisible();
  await expect(p.getByText("9 not marked")).toBeVisible();

  await ctx.setOffline(true);
  const row = (code: string) => p.getByTestId(`row-${code}`);

  await row("E02").getByRole("button", { name: "LATE" }).click();
  await row("E02").getByLabel("Custom time").fill("08:20");
  await row("E02").getByRole("button", { name: "Set" }).click();
  await row("E03").getByRole("button", { name: "OUT" }).click();
  await row("E03").getByRole("button", { name: /SL/ }).click();
  await p.getByRole("button", { name: /Mark all remaining IN at 08:00/ }).click();

  await expect(p.getByText("9 of 9 marked")).toBeVisible();
  await expect(p.getByTestId("sync-status")).toContainText("Saved on phone · 9 waiting");
  await expect(row("E02")).toContainText("LATE 08:20");
  await expect(row("E03")).toContainText("OUT · SL");

  // the phone keeps the marks across a reload with no signal
  await p.reload();
  await expect(p.getByText("9 of 9 marked")).toBeVisible();
  await expect(p.getByTestId("sync-status")).toContainText("9 waiting");

  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(p.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });

  // the server now holds them
  const site = await p.locator("#att-site").inputValue();
  const day = await (await p.request.get(`/api/attendance?site=${site}&date=${today()}`)).json();
  const rec = Object.fromEntries(day.rows.map((r: { empCode: string; record: unknown }) => [r.empCode, r.record]));
  expect(Object.values(rec).filter(Boolean)).toHaveLength(9);
  expect(rec.E02).toMatchObject({ status: "LATE", inTime: "08:20" });
  expect(rec.E03).toMatchObject({ status: "OUT", leaveCode: "SL" });
  expect(rec.E01).toMatchObject({ status: "IN", inTime: "08:00" });
  await ctx.close();
});

test("timesheet screen and Excel download for office roles", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "dinga");
  await page.goto("/m/timesheet?start=2026-09-26");
  await expect(page.getByText("26-09-2026 – 25-10-2026")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download Excel/ }).click()]);
  expect(download.suggestedFilename()).toBe("KEM Timesheet 26-Sep to 25-Oct 2026.xlsx");
});

test("supervisors cannot open the timesheet or plan; driver cannot open attendance", async ({ page, browser }) => {
  await loginOk(page, "sanu");
  await page.goto("/m/timesheet");
  await expect(page).toHaveURL(/denied=1/);
  await page.goto("/m/plan");
  await expect(page).toHaveURL(/denied=1/);
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await loginOk(p, "ali");
  expect((await p.request.get("/api/attendance?site=x&date=2026-10-01")).status()).toBe(403);
  await ctx.close();
});
