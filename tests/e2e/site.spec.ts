import { expect, test, type Browser } from "@playwright/test";
import path from "path";
import { loginOk } from "./helpers";

const PHOTO = path.join(__dirname, "fixtures/photo.jpg");
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function as(browser: Browser, user: string, opts = {}) {
  const ctx = await browser.newContext(opts);
  const p = await ctx.newPage();
  await loginOk(p, user);
  return { ctx, p };
}

test.describe("M4 site flows", () => {
  test.skip(({ isMobile }) => !isMobile, "runs once, in the phone project");

  test("duty: Renjith assigns with a deadline, Sanu marks it done with a photo", async ({ browser }) => {
    const r = await as(browser, "renjith", phone);
    await r.p.goto("/m/duties");
    await r.p.getByText("+ Assign a duty").click();
    await r.p.getByLabel("What needs doing *").fill("Fix FCU drain level 3");
    await r.p.getByLabel("Project *").selectOption({ label: "NBK – NBK" });
    await r.p.getByLabel("Supervisor *").selectOption({ label: "Sanu" });
    await r.p.getByRole("button", { name: "Assign a duty" }).click();
    await expect(r.p.getByText("Duty assigned")).toBeVisible();
    await r.ctx.close();

    const s = await as(browser, "sanu", phone);
    await s.p.goto("/m/duties");
    const duty = s.p.getByTestId("duty").filter({ hasText: "Fix FCU drain level 3" });
    await expect(duty).toContainText("Deadline");
    await duty.getByRole("button", { name: "✓ Mark done" }).click();
    await duty.getByLabel("Photo").setInputFiles(PHOTO);
    await duty.getByRole("button", { name: /Done – send/ }).click();
    await expect(s.p.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });
    await expect(s.p.getByTestId("duty").filter({ hasText: "Fix FCU drain level 3" })).toContainText("✓ Done");
    await s.ctx.close();
  });

  test("daily report: Sanu's 4 steps → Renjith checks → Sachin checks", async ({ browser }) => {
    const s = await as(browser, "sanu", phone);
    await s.p.goto("/m/daily-report");
    await expect(s.p.getByText("1. Manpower")).toBeVisible();
    await s.p.getByRole("button", { name: "MEPS +" }).click();
    await s.p.getByRole("button", { name: "MEPS +" }).click();
    await s.p.getByRole("button", { name: "Next ›" }).click();
    await s.p.getByLabel("Work done today *").fill("GI ducting level 2 grid C–D, 36 m");
    await s.p.getByLabel("Photos").setInputFiles(PHOTO);
    await expect(s.p.getByText("Photos (1/10)")).toBeVisible();
    await s.p.getByRole("button", { name: "Next ›" }).click();
    await s.p.getByLabel("Materials needed").fill("Duct sealant 10 tubes");
    await s.p.getByRole("button", { name: "Next ›" }).click();
    await s.p.getByLabel("Plan for tomorrow").fill("Ducting grid D–E");
    await expect(s.p.getByText("MEPS 2")).toBeVisible();
    await s.p.getByRole("button", { name: "✓ Send report" }).click();
    await expect(s.p.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });
    await s.p.reload();
    await expect(s.p.getByText("Sent – being checked").first()).toBeVisible();
    await s.ctx.close();

    for (const [user, label] of [["renjith", "Head supervisor check"], ["sachin", "Site engineer check"]] as const) {
      const c = await as(browser, user, { viewport: { width: 1440, height: 900 } });
      await c.p.goto("/m/daily-report");
      await c.p.getByRole("row", { name: /NBK.*Sanu/ }).first().getByRole("link").click(); // newest first
      await expect(c.p.getByText(`${label} – waiting`)).toBeVisible();
      await expect(c.p.getByText("GI ducting level 2 grid C–D, 36 m")).toBeVisible();
      await c.p.getByRole("button", { name: "✓ Checked" }).click();
      await expect(c.p.getByText(`${label} – done`)).toBeVisible();
      await c.ctx.close();
    }
  });

  test("safety checklist: all OK in two taps", async ({ browser }) => {
    const s = await as(browser, "sanu", phone);
    await s.p.goto("/m/safety");
    await s.p.getByRole("button", { name: /Mark all remaining OK/ }).click();
    await s.p.getByRole("button", { name: "✓ Send checklist" }).click();
    await expect(s.p.getByText("Checklist saved")).toBeVisible();
    await expect(s.p.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });
    await s.ctx.close();
  });

  test("site query: Sanu asks design with a photo, Alwin answers, Sanu sees the answer", async ({ browser }) => {
    const s = await as(browser, "sanu", phone);
    await s.p.goto("/m/site-queries");
    await s.p.getByLabel("Subject *").fill("Cable tray clash with chilled water pipe");
    await s.p.getByLabel("Question *").fill("Tray at +3.2 m hits CHW line at grid C4. Raise tray or reroute?");
    await s.p.getByRole("button", { name: "ELE" }).click();
    await s.p.getByLabel("Photos").setInputFiles(PHOTO);
    await s.p.getByRole("button", { name: "✓ Send to design" }).click();
    await expect(s.p.getByTestId("sync-status")).toContainText("All sent", { timeout: 30_000 });
    await expect(s.p.getByTestId("query").filter({ hasText: "Cable tray clash" })).toContainText("Waiting for design");

    const a = await as(browser, "alwin", { viewport: { width: 1440, height: 900 } });
    await a.p.goto("/m/site-queries");
    await a.p.getByRole("link", { name: /Cable tray clash/ }).click();
    await expect(a.p.getByRole("img", { name: "Photos" })).toBeVisible();
    await a.p.getByLabel("Your answer").fill("Raise tray to +3.45 m, see SK-ELE-014");
    await a.p.getByRole("button", { name: "Send answer" }).click();
    await expect(a.p.getByText("Answer sent")).toBeVisible();
    await a.ctx.close();

    await s.p.reload();
    await expect(s.p.getByTestId("query").filter({ hasText: "Cable tray clash" })).toContainText("Raise tray to +3.45 m");
    await s.ctx.close();
  });
});
