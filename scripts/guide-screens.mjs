// Captures the screenshots used in docs/guides (run against a server with demo data):
//   BASE=http://localhost:3200 PASSWORD=Test1234 node scripts/guide-screens.mjs
import { chromium } from "@playwright/test";

const base = process.env.BASE ?? "http://localhost:3000";
const pw = process.env.PASSWORD ?? "Test1234";
const out = "docs/guides/img";
const b = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const desk = { viewport: { width: 1440, height: 900 } };

async function as(user, opts) {
  const c = await b.newContext(opts);
  const p = await c.newPage();
  await p.goto(base + "/login");
  await p.getByLabel("Username").fill(user);
  await p.getByLabel("Password", { exact: true }).fill(pw);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(base + "/");
  return { c, p };
}
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });

{ // phone – login
  const c = await b.newContext(phone); const p = await c.newPage();
  await p.goto(base + "/login"); await shot(p, "m-login"); await c.close();
}
{
  const { c, p } = await as("sanu", phone);
  await shot(p, "m-home");
  await p.goto(base + "/m/attendance"); await p.waitForSelector(".att-row"); await shot(p, "m-attendance");
  await p.goto(base + "/m/moves"); await p.waitForSelector("text=Move workers");
  await p.getByRole("button", { name: /Emergency/ }).click(); await shot(p, "m-move");
  await p.goto(base + "/m/material-requests"); await p.waitForSelector("text=Pick materials");
  await p.getByRole("button", { name: "HVAC", exact: true }).click();
  await p.getByRole("button", { name: /DUCT INSULATION/ }).first().click();
  await p.getByTestId("mr-line").scrollIntoViewIfNeeded(); await shot(p, "m-material");
  await p.goto(base + "/m/drawings"); await p.getByRole("link", { name: "NBK-SHD-HVAC-005" }).click();
  await p.waitForSelector("canvas"); await p.waitForTimeout(1200); await shot(p, "m-drawing");
  await p.goto(base + "/m/safety"); await p.waitForSelector("text=Mark all remaining OK"); await shot(p, "m-safety");
  await c.close();
}
{ // a supervisor who has not sent today's report yet
  const { c, p } = await as("vishnu", phone);
  await p.goto(base + "/m/daily-report"); await p.waitForSelector("text=1. Manpower"); await shot(p, "m-report");
  await c.close();
}
{
  const { c, p } = await as("ali", phone);
  await p.waitForTimeout(1200); await shot(p, "m-driver"); await c.close();
}
{
  const { c, p } = await as("dinga", desk);
  await shot(p, "d-dashboard");
  await p.goto(base + "/m/material-requests"); await p.getByRole("table").getByRole("link", { name: "NBK-MR-001" }).click(); await p.waitForTimeout(500); await shot(p, "d-mr");
  await p.goto(base + "/m/timesheet?start=2026-09-26"); await shot(p, "d-timesheet");
  await p.goto(base + "/m/vehicle-plan"); await shot(p, "d-vehicle");
  await p.goto(base + "/m/drawings"); await shot(p, "d-drawings");
  await p.goto(base + "/m/material-master?tab=boq"); await shot(p, "d-boq");
  await p.goto(base + "/admin/users"); await p.getByRole("link", { name: "Sanu", exact: true }).click(); await shot(p, "d-user");
  await c.close();
}
{
  const { c, p } = await as("alwin", desk);
  await p.goto(base + "/m/site-queries"); await p.getByRole("link", { name: /NBK-SQ-001/ }).click(); await shot(p, "d-query"); await c.close();
}
await b.close();
console.log("screenshots written to", out);
