import { expect, test } from "@playwright/test";
import { loginOk, noHorizontalScroll } from "./helpers";

// One user per role (13 dashboards) and something each must show.
const ROLES: [string, string, RegExp][] = [
  ["dinga", "PE + Admin", /Users & sessions/],
  ["nobin", "BUL", /Critical alerts/],
  ["yadhu.v", "Ops", /Critical alerts/],
  ["yadhu.s", "PM", /Man-days used \/ budget/],
  ["sachin", "SE", /Today's site board/],
  ["deepak", "Estimator", /BOQ lines/],
  ["alwin", "Design", /Site queries waiting/],
  ["aswin", "Coordinator", /MS under review/],
  ["azhar", "Procurement", /Material requests/],
  ["renjith", "Head supervisor", /Supervisor duties/],
  ["sanu", "Supervisor", /Move workers/],
  ["jitendar", "HVAC supervisor", /HVAC T&C checklists/],
  ["ali", "Driver", /Vehicle 1/],
];

for (const [user, role, expected] of ROLES) {
  test(`dashboard: ${role} (${user})`, async ({ page }) => {
    await loginOk(page, user);
    await expect(page.locator("main").getByText(expected).first()).toBeVisible();
    await expect(page.getByText("Application error")).toHaveCount(0);
    await noHorizontalScroll(page);
    if (user !== "ali") await expect(page.getByTestId("pending")).toBeVisible();
  });
}

test("AED never shown on supervisor / design dashboards", async ({ page, browser }) => {
  for (const user of ["sanu", "renjith", "alwin", "jitendar"]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginOk(p, user);
    await expect(p.getByText(/AED/)).toHaveCount(0);
    await ctx.close();
  }
  await loginOk(page, "nobin");
  await expect(page.getByTestId("card-mr")).toContainText("AED");
});

test("supervisor's pending list has today's checklist; HIGH-ALERT only for SE/PE", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-390");
  await loginOk(page, "vishnu");
  await expect(page.getByTestId("pending")).toContainText("daily report");
  await expect(page.getByTestId("high-alert")).toHaveCount(0);
});

test("bell: Renjith opens a notification, it is marked read", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "renjith");
  const bell = page.getByTestId("bell");
  const before = Number((await bell.getAttribute("aria-label"))!.match(/(\d+) new/)![1]);
  expect(before).toBeGreaterThan(0);
  await bell.click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await page.getByTestId("notifications").getByRole("link").first().click();
  await page.goto("/notifications");
  const after = Number((await page.getByTestId("bell").getAttribute("aria-label"))!.match(/(\d+) new/)![1]);
  expect(after).toBe(before - 1);
  if (after > 0) {
    await page.getByRole("button", { name: /Mark all/ }).click();
    await expect(page.getByTestId("bell")).toHaveAttribute("aria-label", "Notifications, 0 new");
  }
});

test("project page: man-days used vs budget", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "yadhu.s");
  await page.getByRole("link", { name: /NBK – NBK/ }).click();
  await expect(page.getByTestId("card-mandays")).toContainText("of 2400 budget");
});

test("since your last visit shows changes", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "sachin");
  await expect(page.getByTestId("since")).toBeVisible();
  // a second session later sees the first visit as "last visit"
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await loginOk(p, "sachin");
  await expect(p.getByTestId("since")).not.toContainText("first visit");
  await ctx.close();
});
