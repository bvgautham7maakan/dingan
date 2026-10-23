import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { applyMutation } from "@/lib/sync/apply";
import { act, flowView, pendingFor } from "@/lib/flows";
import { openAlerts, setLpo, setRates } from "@/lib/materials/server";
import { checkLine, needsBul } from "@/lib/materials/rules";
import { moneyFor } from "@/lib/money";
import type { CurrentUser } from "@/lib/auth/current";
import type { Mutation } from "@/lib/sync/schema";
import { resetDb } from "./reset";

const u: Record<string, CurrentUser> = {};
const p: Record<string, string> = {};
const m: Record<string, string> = {};
const mk = (id: string, roles: string[]): CurrentUser => ({ id, sessionId: "s", username: id, displayName: id, locale: "en", roles, mustChangePassword: false, prevSeenAt: null });
const mr = (projectId: string, lines: { materialId: string; brand?: string; qty: number; unit?: string }[]) =>
  ({ id: randomUUID(), type: "mr.create", at: new Date().toISOString(), payload: { projectId, lines } }) as Extract<Mutation, { type: "mr.create" }>;
const create = async (user: CurrentUser, projectId: string, lines: Parameters<typeof mr>[1]) => {
  const mut = mr(projectId, lines);
  await applyMutation(user, mut);
  return db.materialRequest.findUniqueOrThrow({ where: { clientId: mut.id }, include: { lines: { include: { highAlerts: true } } } });
};
const step = async (user: CurrentUser, id: string) => (await flowView(user, "MATERIAL_REQUEST", id))!;

beforeAll(async () => {
  await resetDb();
  const people: [string, string[]][] = [
    ["sanu", ["SUP"]], ["sachin", ["SE"]], ["dinga", ["ADMIN", "PE"]], ["deepak", ["EST"]], ["yadhu.s", ["PM"]], ["yadhu.v", ["OPS"]], ["nobin", ["BUL"]], ["azhar", ["PROC"]],
  ];
  for (const [name, roles] of people) {
    const row = await db.user.create({ data: { username: name, displayName: name, passwordHash: "x", roles: { create: roles.map((role) => ({ role })) } } });
    u[name] = mk(row.id, roles);
  }
  const s1 = await db.site.create({ data: { code: "NBK", name: "NBK" } });
  const s2 = await db.site.create({ data: { code: "MANG", name: "Mangrove" } });
  p.NBK = (await db.project.create({ data: { code: "NBK", name: "NBK", siteId: s1.id, pmUserId: u["yadhu.s"].id } })).id;
  p.MANG = (await db.project.create({ data: { code: "MANG", name: "Mangrove", siteId: s2.id } })).id;
  await db.projectMember.createMany({ data: [{ projectId: p.NBK, userId: u.sachin.id, role: "SE" }, { projectId: p.NBK, userId: u.dinga.id, role: "PE" }] });
  await db.setting.create({ data: { key: "bulThresholdFils", value: 100_000 * 100 } });
  m.INS = (await db.material.create({ data: { name: "CHW PIPE INSULATION (NBR)", discipline: "HVAC", keySpec: "NBR 25 mm" } })).id;
  m.CHL = (await db.material.create({ data: { name: "CHILLER", discipline: "HVAC" } })).id;
  for (const projectId of [p.NBK, p.MANG]) {
    await db.materialSubmittal.create({ data: { materialId: m.INS, projectId, brand: "AEROFOAM (HIRA)", msNo: "MS-HVAC-01", status: "APPROVED", spec: "Aerofoam NBR 25 mm" } });
    await db.materialSubmittal.create({ data: { materialId: m.CHL, projectId, brand: "CARRIER", msNo: "MS-HVAC-09", status: "APPROVED" } });
  }
  await db.materialSubmittal.create({ data: { materialId: m.INS, projectId: p.NBK, brand: "ARMAFLEX", status: "UNDER_REVIEW" } });
  await db.boqLine.create({ data: { projectId: p.NBK, materialId: m.INS, qty: 600, unit: "m", rateFils: 3800 } });
});

describe("HIGH-ALERT rules", () => {
  it("brand outside the approved MS", () => {
    expect(checkLine({ material: "X", brand: "Armaflex", approvedBrands: ["AEROFOAM (HIRA)"], qty: 1, alreadyRequested: 0, boqQty: null })[0].type).toBe("BRAND_NOT_APPROVED");
    expect(checkLine({ material: "X", brand: "aerofoam  (hira)", approvedBrands: ["AEROFOAM (HIRA)"], qty: 1, alreadyRequested: 0, boqQty: null })).toEqual([]);
    expect(checkLine({ material: "X", brand: null, approvedBrands: [], qty: 1, alreadyRequested: 0, boqQty: null })[0].detail).toContain("no approved MS");
  });
  it("requested + already requested over BOQ", () => {
    expect(checkLine({ material: "X", brand: "A", approvedBrands: ["A"], qty: 80, alreadyRequested: 520, boqQty: 600 })).toEqual([]);
    expect(checkLine({ material: "X", brand: "A", approvedBrands: ["A"], qty: 81, alreadyRequested: 520, boqQty: 600 })[0].type).toBe("QTY_OVER_BOQ");
  });
  it("BUL only above the threshold", () => {
    expect(needsBul(10_000_000, 10_000_000)).toBe(false);
    expect(needsBul(10_000_001, 10_000_000)).toBe(true);
  });
});

describe("material request (acceptance 4 and 5)", () => {
  it("brand and spec auto-fill from the approved MS; no alert", async () => {
    const r = await create(u.sanu, p.NBK, [{ materialId: m.INS, qty: 50, unit: "m" }]);
    expect(r.lines[0]).toMatchObject({ brand: "AEROFOAM (HIRA)", spec: "Aerofoam NBR 25 mm", rateFils: 3800 });
    expect(r.lines[0].highAlerts).toEqual([]);
    expect(r.ref).toBe("NBK-MR-001");
  });

  it("non-MS brand → HIGH-ALERT for Sachin (SE) and Dinga (PE), not Sanu", async () => {
    const r = await create(u.sanu, p.NBK, [{ materialId: m.INS, brand: "ARMAFLEX", qty: 600, unit: "m" }]);
    expect(r.lines[0].highAlerts.map((a) => a.type).sort()).toEqual(["BRAND_NOT_APPROVED", "QTY_OVER_BOQ"]);
    expect((await openAlerts(u.sachin)).length).toBeGreaterThan(0);
    expect((await openAlerts(u.dinga)).length).toBeGreaterThan(0);
    expect(await openAlerts(u.sanu)).toEqual([]);
    const notes = async (who: string) => db.notification.count({ where: { userId: u[who].id, type: "HIGH_ALERT" } });
    expect(await notes("sachin")).toBe(1);
    expect(await notes("dinga")).toBe(1);
    expect(await notes("sanu")).toBe(0);
  });

  it("NBK (PM Yadhu S) routes to him; nobody else can act on it", async () => {
    const r = await db.materialRequest.findFirstOrThrow({ where: { ref: "NBK-MR-001" } });
    expect((await step(u.sanu, r.id)).canAct).toBe(false); // requester never approves
    let f = await step(u.sachin, r.id);
    expect(f.steps.map((s) => s.label)).toEqual(["SE / PE check", "Estimator – budget & rates", "Project Manager", "BUL (above threshold)", "Procurement – order / LPO"]);
    await act(u.sachin, f.id, "APPROVE");
    f = await step(u.deepak, r.id);
    await act(u.deepak, f.id, "APPROVE"); // rate came from the BOQ
    expect((await step(u["yadhu.s"], r.id)).canAct).toBe(true);
    expect((await step(u["yadhu.v"], r.id)).canAct).toBe(false);
    await act(u["yadhu.s"], f.id, "APPROVE");
    // 50 m × 38 = AED 1,900 → BUL skipped, straight to procurement
    f = await step(u.azhar, r.id);
    expect(f.steps[3].status).toBe("SKIPPED");
    expect(f.canAct).toBe(true);
    await expect(act(u.azhar, f.id, "APPROVE")).rejects.toThrow("lpo_required");
    await setLpo(u.azhar, r.id, "LPO-123");
    await act(u.azhar, f.id, "APPROVE");
    expect(await db.materialRequest.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "ORDERED", lpoNo: "LPO-123" });
  });

  it("Mangrove (no PM) routes to Ops Yadhu V; above AED 100,000 adds Nobin", async () => {
    const r = await create(u.sanu, p.MANG, [{ materialId: m.CHL, qty: 1, unit: "nos" }]);
    let f = await step(u.sachin, r.id);
    expect(f.steps[2].label).toBe("Operations Manager");
    await act(u.sachin, f.id, "APPROVE");
    await expect(act(u.deepak, f.id, "APPROVE")).rejects.toThrow("rates_required");
    await setRates(u.deepak, r.id, { [r.lines[0].id]: 185_000 });
    await act(u.deepak, f.id, "APPROVE");
    expect((await step(u["yadhu.s"], r.id)).canAct).toBe(false);
    expect((await step(u["yadhu.v"], r.id)).canAct).toBe(true);
    await act(u["yadhu.v"], f.id, "APPROVE");
    f = await step(u.nobin, r.id);
    expect(f.currentLabel).toBe("BUL (above threshold)");
    expect(f.canAct).toBe(true);
    expect((await pendingFor(u.nobin)).length).toBe(1);
  });

  it("supervisor responses carry no AED fields", async () => {
    const r = await db.materialRequest.findFirstOrThrow({ include: { lines: true } });
    const out = JSON.stringify(moneyFor(u.sanu.roles, r));
    expect(out).not.toMatch(/Fils/);
    expect(JSON.stringify(moneyFor(u.deepak.roles, r))).toMatch(/rateFils/);
  });
});
