import { expect, test } from "@playwright/test";
import path from "path";
import { loginOk } from "./helpers";

const PHOTO = path.join(__dirname, "fixtures/photo.jpg");

test("acceptance 7: Vehicle 3 double-booked shows a red clash banner for Renjith", async ({ page }) => {
  await loginOk(page, "renjith");
  await page.goto("/m/vehicle-plan");
  const banner = page.getByTestId("clash-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Vehicle 3 double-booked");
  await expect(banner).toContainText("09:00–11:00 Store → Mangrove");
});

test("PM sees the vehicle plan read-only; Renjith approves it", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "yadhu.s");
  await page.goto("/m/vehicle-plan");
  await expect(page.getByText("View only.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add trip/ })).toHaveCount(0);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const r = await ctx.newPage();
  await loginOk(r, "renjith");
  await r.goto("/m/vehicle-plan");
  await r.getByRole("button", { name: "✓ Approve plan" }).click();
  await expect(r.getByText("✓ Approved")).toBeVisible();
  await ctx.close();
});

test("acceptance 8: Ali does the vehicle check, a trip with delivery photo and a fuel bill", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "phone-390", "phone flow");
  await loginOk(page, "ali");
  // driver home
  await expect(page.getByTestId("check-card")).toContainText("Do the vehicle check first");
  const trip = page.getByTestId("trip").filter({ hasText: "Store → NBK" });
  await expect(trip.getByRole("button", { name: /Do the vehicle check first/ })).toBeDisabled();
  await expect(trip.getByRole("link", { name: /Map to NBK/ })).toHaveAttribute("href", /google\.com\/maps/);

  await page.getByRole("link", { name: "Start vehicle check" }).click();
  for (const part of ["Tyres", "Oil", "Lights"]) await page.getByRole("group", { name: part }).getByRole("button", { name: /OK/ }).click();
  await page.getByLabel("Vehicle photo").setInputFiles(PHOTO);
  await expect(page.getByAltText("Photo preview")).toBeVisible();
  await page.getByRole("button", { name: /Save vehicle check/ }).click();
  await expect(page).toHaveURL(/\/m\/trips/);

  const t2 = page.getByTestId("trip").filter({ hasText: "Store → NBK" });
  await t2.getByRole("button", { name: /Start trip/ }).click();
  await expect(t2).toContainText("Started");
  await t2.getByRole("button", { name: /Delivered/ }).click();
  await t2.getByLabel("Delivery proof photo").setInputFiles(PHOTO);
  await t2.getByRole("button", { name: /Confirm delivered/ }).click();
  await expect(t2).toContainText("Delivered");
  await t2.getByRole("button", { name: /Back at base/ }).click();
  await expect(t2).toContainText("Returned");
  await expect(page.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });

  await page.getByRole("link", { name: /Add fuel/ }).click();
  await page.getByRole("button", { name: "Fuel", exact: true }).click();
  await page.getByLabel("Amount (AED) *").fill("150.50");
  await page.getByLabel("Odometer (km)").fill("48210");
  await page.getByLabel("Bill photo").setInputFiles(PHOTO);
  await page.getByRole("button", { name: /Save bill/ }).click();
  await expect(page.getByText("Bill saved")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });

  // acceptance 6: the driver's own API never returns AED values
  const driverJson = await (await page.request.get("/api/driver")).text();
  expect(driverJson).not.toMatch(/Fils/);
  expect(driverJson).toContain("48210");

  // the office sees the bill with its amount and the photo
  const ctx = await browser.newContext();
  const o = await ctx.newPage();
  await loginOk(o, "dinga");
  await o.goto("/m/bills");
  const row = o.getByRole("row", { name: /Fuel.*Vehicle 1.*Ali/ });
  await expect(row.getByRole("spinbutton")).toHaveValue("150.5");
  const photoUrl = await row.getByRole("link", { name: "View" }).getAttribute("href");
  const img = await o.request.get(photoUrl!);
  expect(img.headers()["content-type"]).toBe("image/jpeg");
  await ctx.close();
});

test("supervisor bill form has no amount field", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-390");
  await loginOk(page, "vishnu");
  await page.goto("/m/bills");
  await expect(page.getByRole("button", { name: "Salik" })).toBeVisible();
  await expect(page.getByLabel(/Amount/)).toHaveCount(0);
});

test("vehicle plan: Vishnu submits, Renjith returns it with a comment", async ({ browser }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  const tomorrow = new Date(Date.now() + 4 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
  const v = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const vp = await v.newPage();
  await loginOk(vp, "vishnu");
  await vp.goto(`/m/vehicle-plan?date=${tomorrow}`);
  await vp.getByLabel("Vehicle *").selectOption({ label: "Vehicle 2" });
  await vp.getByLabel("From *").selectOption({ label: "Office" });
  await vp.getByLabel("To *").selectOption({ label: "Safe Tower" });
  await vp.getByRole("button", { name: "Add trip" }).click();
  await vp.getByRole("button", { name: "Send plan to head supervisor" }).click();
  await expect(vp.getByText("Sent to Renjith for approval.")).toBeVisible();
  await v.close();

  const r = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rp = await r.newPage();
  await loginOk(rp, "renjith");
  await rp.goto(`/m/vehicle-plan?date=${tomorrow}`);
  await rp.getByLabel("Comment (needed to return)").fill("Use Vehicle 1");
  await rp.getByRole("button", { name: "↩ Return" }).click();
  await expect(rp.getByText("Head supervisor – returned")).toBeVisible();
  await expect(rp.getByText("Draft")).toBeVisible();
  await r.close();
});
