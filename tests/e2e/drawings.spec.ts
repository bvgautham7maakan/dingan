import { expect, test, type Page } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { drawingPdf, PT_PER_MM } from "../../prisma/demo-pdf";
import { loginOk, noHorizontalScroll } from "./helpers";

const SCALE = 25;
const A3_H = 297 * PT_PER_MM;
// dimension lines in paper mm from the bottom-left corner
const REF_1000 = { x: 20, y: 262, mm: 1000 };
const TARGET = { x: 20, y: 245, mm: 3500 };

/** Clicks a point given in paper mm (bottom-left origin) on the viewer overlay. */
async function clickPaper(page: Page, xMm: number, yMm: number) {
  const svg = page.getByTestId("overlay");
  const box = (await svg.boundingBox())!;
  const w = Number(await svg.getAttribute("data-w"));
  const h = Number(await svg.getAttribute("data-h"));
  const px = xMm * PT_PER_MM;
  const py = A3_H - yMm * PT_PER_MM;
  await page.mouse.click(box.x + (px / w) * box.width, box.y + (py / h) * box.height);
}

test("acceptance 10: calibrate on 1,000 mm, measure another line within ±1%", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440");
  const dir = mkdtempSync(path.join(tmpdir(), "dwg-"));
  const file = path.join(dir, "test-drawing.pdf");
  writeFileSync(file, await drawingPdf({ ref: "TEST", title: "Measure test", rev: "R0", project: "NBK", scale: SCALE, dims: [REF_1000, TARGET] }));

  await loginOk(page, "alwin");
  await page.goto("/m/drawings");
  await page.getByText("⭱ Upload drawing / revision").click();
  await page.getByLabel("Project *").selectOption({ label: "NBK" });
  await page.getByLabel("Discipline *").selectOption("HVAC");
  await page.getByLabel("Title *").fill("Measure test sheet");
  await page.getByLabel("PDF file *").setInputFiles(file);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(/Uploaded NBK-SHD-HVAC-\d+/)).toBeVisible();
  const ref = (await page.getByText(/Uploaded NBK-SHD-HVAC-\d+/).textContent())!.match(/NBK-SHD-HVAC-\d+/)![0];
  const row = page.getByTestId(`dwg-${ref}`);
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Release for construction" }).click();
  await expect(page.getByText("Released for construction")).toBeVisible();
  await page.getByTestId(`dwg-${ref}`).getByRole("link", { name: ref }).click();

  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByTestId("overlay").scrollIntoViewIfNeeded();

  await page.getByRole("button", { name: "📏 Calibrate" }).click();
  await clickPaper(page, REF_1000.x, REF_1000.y);
  await clickPaper(page, REF_1000.x + REF_1000.mm / SCALE, REF_1000.y);
  await page.getByLabel("Known length (mm)").fill("1000");
  await page.getByRole("button", { name: "✓ Save calibration" }).click();
  await expect(page.getByText(/Calibrated: 1000 mm reference · ≈ 1:25/)).toBeVisible();

  await page.getByTestId("overlay").scrollIntoViewIfNeeded();
  await clickPaper(page, TARGET.x, TARGET.y);
  await clickPaper(page, TARGET.x + TARGET.mm / SCALE, TARGET.y);
  const text = (await page.getByTestId("live-length").textContent())!;
  const mm = Number(text.replace(/,/g, "").match(/[\d.]+/)![0]); // "3,500 mm (3.50 m)"
  expect(Math.abs(mm - 3500) / 3500).toBeLessThanOrEqual(0.01);

  await page.getByLabel("Label").fill("Duct run C");
  await page.getByRole("button", { name: "✓ Save" }).click();
  await expect(page.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId("measurements")).toContainText("Duct run C");
});

test("site roles see only drawings released for construction", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-390");
  await loginOk(page, "sanu");
  await page.goto("/m/drawings");
  await expect(page.getByTestId("dwg-NBK-SHD-HVAC-005")).toBeVisible();
  await expect(page.getByTestId("dwg-NBK-SHD-ELE-011")).toHaveCount(0);
  await expect(page.getByText("Only drawings released for construction are shown.")).toBeVisible();
});

test("saved drawing opens with no signal", async ({ browser }, info) => {
  test.skip(info.project.name !== "phone-390");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await loginOk(page, "sanu");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/m/drawings");
  await page.getByTestId("dwg-NBK-SHD-HVAC-005").getByRole("link", { name: "NBK-SHD-HVAC-005" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "⭳ Save offline" }).click();
  await expect(page.getByRole("button", { name: /Saved on phone/ })).toBeVisible();

  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /NBK-SHD-HVAC-005 · Rev R1/ })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("The PDF could not be opened.")).toHaveCount(0);
  const drawn = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0);
  expect(drawn).toBe(true);
  await ctx.close();
});
