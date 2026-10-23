import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "crypto";
import { loginOk } from "./helpers";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const CREW = ["E10", "E11", "E12"];

/** Marks the crew IN at NBK 08:00–17:00 through the sync API (as Sanu). */
async function crewIn(p: Page) {
  await p.goto("/m/attendance");
  const siteId = await p.locator("#att-site").inputValue();
  const day = await (await p.request.get(`/api/attendance?site=${siteId}&date=${today()}`)).json();
  const all = [...day.rows, ...day.others] as { workerId: string; empCode: string }[];
  const ids = CREW.map((c) => all.find((w) => w.empCode === c)!.workerId);
  const mutations = ids.flatMap((workerId) => [
    { id: randomUUID(), type: "attendance.mark", at: new Date().toISOString(), payload: { date: today(), siteId, workerId, status: "IN", shift: "DAY", shiftStart: "08:00" } },
    { id: randomUUID(), type: "attendance.finish", at: new Date().toISOString(), payload: { date: today(), workerId, outTime: "17:00" } },
  ]);
  const res = await p.request.post("/api/sync", { data: { mutations } });
  expect((await res.json()).results.every((r: { result: string }) => r.result === "applied")).toBe(true);
}

test("acceptance 2: emergency move of 3 workers NBK → Safe Tower at 10:15; Renjith approves; hours split", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "phone-390", "phone flow");
  await loginOk(page, "sanu");
  await crewIn(page);

  await page.goto("/m/moves");
  for (const c of CREW) await page.getByRole("button", { name: new RegExp(c) }).click();
  await page.getByRole("button", { name: "Safe Tower", exact: true }).click();
  await page.getByRole("button", { name: /Emergency/ }).click();
  await expect(page.getByText("the move applies now")).toBeVisible();
  await page.getByLabel(/Move time/).fill("10:15");
  await page.getByRole("button", { name: "Move 3 worker(s) to Safe Tower" }).click();
  await expect(page.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });
  const card = page.getByTestId("move-card").filter({ hasText: "10:15 · NBK → Safe Tower" }).filter({ hasText: "Kamran" });
  await expect(card).toContainText("Applied – waiting for head supervisor");

  // the move applied immediately: Safe Tower's attendance shows them as moved in
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const r = await ctx.newPage();
  await loginOk(r, "renjith");
  await r.goto("/m/moves");
  const rcard = r.getByTestId("move-card").filter({ hasText: "10:15 · NBK → Safe Tower" }).filter({ hasText: "Kamran" });
  await expect(rcard.getByRole("button", { name: /Approve/ })).toBeVisible();
  await rcard.getByRole("button", { name: /Approve/ }).click();
  await expect(r.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });
  await expect(rcard).toContainText("✓ Approved");
  await ctx.close();

  // Sanu does not get an Approve button
  await page.reload();
  await expect(card.getByRole("button", { name: /Approve/ })).toHaveCount(0);

  // hours split 2 h NBK / 6 h Safe Tower in the timesheet
  const office = await browser.newContext();
  const d = await office.newPage();
  await loginOk(d, "dinga");
  const ts = await (await d.request.get(`/api/timesheet?start=${today()}&emp=E10`)).json();
  const day = ts.workers[0].days.find((x: { date: string }) => x.date === today());
  expect(day.bySite.NBK.normal).toBe(2);
  expect(day.bySite["Safe Tower"].normal).toBe(6);
  await office.close();
});
