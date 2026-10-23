import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { loginOk } from "./helpers";

test("acceptance 4: non-MS brand request shows HIGH-ALERT to Sachin and Dinga, not to Sanu", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "phone-390", "phone flow");
  await loginOk(page, "sanu");
  await page.goto("/m/material-requests");
  await page.getByRole("button", { name: "HVAC", exact: true }).click();
  await page.getByLabel("Search material").fill("duct insulation");
  await page.getByRole("button", { name: /DUCT INSULATION \(NBR\)/ }).click();
  const line = page.getByTestId("mr-line");
  await line.getByLabel("Brand name").fill("GENERIC XYZ");
  await line.getByLabel("Quantity *").fill("100");
  await line.getByRole("button", { name: "m²" }).click();
  await page.getByRole("button", { name: "✓ Send request (1 item(s))" }).click();
  await expect(page.getByText("Request saved")).toBeVisible();
  await expect(page.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });

  // Sanu: nothing about HIGH-ALERT anywhere, no AED
  await page.reload();
  await expect(page.getByText("HIGH-ALERT")).toHaveCount(0);
  await page.getByRole("link", { name: /NBK-MR-\d+/ }).first().click();
  await expect(page.getByText("GENERIC XYZ")).toBeVisible();
  await expect(page.getByText("HIGH-ALERT")).toHaveCount(0);
  await expect(page.getByText("AED")).toHaveCount(0);
  const ref = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
  expect(await (await page.request.get("/api/materials")).text()).not.toMatch(/Fils|HIGH/);

  for (const user of ["sachin", "dinga"]) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await loginOk(p, user);
    const panel = p.getByTestId("high-alert");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(ref);
    await expect(panel).toContainText('brand "GENERIC XYZ"');
    await ctx.close();
  }
});

test("acceptance 5: estimator prices SAFE-MR-001, it goes to PM Yadhu S; NBK request shows the PM route", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  await loginOk(page, "deepak");
  await page.goto("/m/material-requests");
  await page.getByRole("link", { name: "SAFE-MR-001" }).click();
  await expect(page.getByText("Your step: Estimator – budget & rates")).toBeVisible();
  await page.getByLabel("Rate (AED) ENERGY VALVE").fill("2900");
  await page.getByLabel(/Rate \(AED\) SPRINKLERS/).fill("32");
  await page.getByRole("button", { name: "✓ Approve" }).click();
  await expect(page.getByText("AED 21,240.00")).toBeVisible();
  await expect(page.getByText("Project Manager – waiting")).toBeVisible();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await loginOk(p, "yadhu.v");
  await p.goto("/m/material-requests");
  await p.getByRole("link", { name: "SAFE-MR-001" }).click();
  await expect(p.getByText("Your step")).toHaveCount(0); // Ops does not act on a PM project
  await ctx.close();

  const pm = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const q = await pm.newPage();
  await loginOk(q, "yadhu.s");
  await q.goto("/m/material-requests");
  await q.getByRole("link", { name: "SAFE-MR-001" }).click();
  await expect(q.getByText("Your step: Project Manager")).toBeVisible();
  await q.getByRole("button", { name: "✓ Approve" }).click();
  // AED 21,240 is under AED 100,000: BUL skipped, procurement next
  await expect(q.getByText("BUL (above threshold) – skipped")).toBeVisible();
  await expect(q.getByText("Procurement – order / LPO – waiting")).toBeVisible();
  await pm.close();

  const buyer = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await buyer.newPage();
  await loginOk(b, "azhar");
  await b.goto("/m/material-requests");
  await b.getByRole("link", { name: "SAFE-MR-001" }).click();
  await b.getByLabel("LPO number *").fill("SABR-LPO-2026-0501");
  await b.getByRole("button", { name: "✓ Mark ordered" }).click();
  await expect(b.getByText("LPO SABR-LPO-2026-0501")).toBeVisible();
  await expect(b.getByText("✓ Ordered").first()).toBeVisible();
  await buyer.close();
});

test("BOQ import from Excel and MS status colours", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  const dir = mkdtempSync(path.join(tmpdir(), "boq-"));
  const file = path.join(dir, "NBK BOQ.xlsx");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BOQ");
  ws.addRow(["NBK – MEP BOQ"]);
  ws.addRow(["Material", "Discipline", "Qty", "Unit", "Rate"]);
  ws.addRow(["DUCT INSULATION (NBR)", "HVAC", 1500, "m²", 55]);
  ws.addRow(["LV CABLES XLPE 4C", "ELE", 2200, "m", 41]);
  await wb.xlsx.writeFile(file);

  await loginOk(page, "dinga");
  await page.goto("/m/material-master?tab=boq");
  await page.getByLabel("Excel file").setInputFiles(file);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("BOQ imported: 2 line(s), 1 new material(s), 0 row(s) skipped.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "LV CABLES XLPE 4C" })).toBeVisible();

  await page.getByRole("link", { name: "MS log" }).click();
  await expect(page.getByText("Under review").first()).toBeVisible();
});
