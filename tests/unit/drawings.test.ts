import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { db } from "@/lib/db";
import { applyMutation } from "@/lib/sync/apply";
import { fmtMm, lengthMm, polylineLength, scaleLabel } from "@/lib/drawings/measure";
import { listDrawings, nextDrawingRef, releaseForConstruction, revisionView, uploadRevision } from "@/lib/drawings/server";
import { drawingPdf, PT_PER_MM } from "../../prisma/demo-pdf";
import type { CurrentUser } from "@/lib/auth/current";
import type { Mutation } from "@/lib/sync/schema";
import { resetDb } from "./reset";

process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "kem-up-"));
const u: Record<string, CurrentUser> = {};
let NBK = "";
const mk = (id: string, roles: string[]): CurrentUser => ({ id, sessionId: "s", username: id, displayName: id, locale: "en", roles, mustChangePassword: false, prevSeenAt: null });
const mut = <T extends Mutation["type"]>(type: T, payload: Extract<Mutation, { type: T }>["payload"]) =>
  ({ id: randomUUID(), type, at: new Date().toISOString(), payload }) as Extract<Mutation, { type: T }>;

describe("measuring maths", () => {
  const cal = { pxLength: 56.693, realMm: 1000 }; // 20 mm on paper at 1:50
  it("point-to-point and chain", () => {
    expect(polylineLength([[0, 0], [3, 4]])).toBe(5);
    expect(polylineLength([[0, 0], [3, 4], [3, 10]])).toBe(11);
  });
  it("converts with the calibration", () => {
    expect(lengthMm([[0, 0], [56.693 * 6, 0]], cal)).toBe(6000);
    expect(scaleLabel(cal)).toBe("≈ 1:50");
    expect(fmtMm(6000)).toBe("6,000 mm (6.00 m)");
  });
  it("is zoom independent: same points, same answer", () => {
    const pts: [number, number][] = [[10, 10], [10, 10 + 56.693 * 4.5]];
    expect(lengthMm(pts, cal)).toBe(4500);
  });
  it("rejects a broken calibration", () => {
    expect(() => lengthMm([[0, 0], [1, 1]], { pxLength: 0, realMm: 1000 })).toThrow();
  });
});

describe("drawing register", () => {
  let fc = "";
  let draft = "";
  beforeAll(async () => {
    await resetDb();
    for (const [name, roles] of [["alwin", ["DESIGN"]], ["sanu", ["SUP"]], ["sachin", ["SE"]], ["azhar", ["PROC"]]] as const) {
      const row = await db.user.create({ data: { username: name, displayName: name, passwordHash: "x", roles: { create: roles.map((role) => ({ role })) } } });
      u[name] = mk(row.id, [...roles]);
    }
    const site = await db.site.create({ data: { code: "NBK", name: "NBK" } });
    NBK = (await db.project.create({ data: { code: "NBK", name: "NBK", siteId: site.id } })).id;
  });

  it("auto ref NBK-SHD-HVAC-001, then -002; PDF only", async () => {
    const pdf = await drawingPdf({ ref: "x", title: "x", rev: "R0", project: "NBK", scale: 50, dims: [{ x: 50, y: 80, mm: 1000 }] });
    const a = await uploadRevision(u.alwin, { projectId: NBK, docType: "SHD", discipline: "HVAC", title: "L2 ducting", rev: "R0", status: "UNDER_REVIEW", buf: pdf });
    expect(a.drawing.ref).toBe("NBK-SHD-HVAC-001");
    expect((await nextDrawingRef(NBK, "SHD", "HVAC")).ref).toBe("NBK-SHD-HVAC-002");
    const b = await uploadRevision(u.alwin, { drawingId: a.drawing.id, rev: "R1", status: "APPROVED", buf: pdf });
    fc = b.rev.id;
    draft = a.rev.id;
    await expect(uploadRevision(u.alwin, { drawingId: a.drawing.id, rev: "R2", status: "APPROVED", buf: Buffer.from("not a pdf") })).rejects.toThrow("bad_type");
    await expect(uploadRevision(u.sanu, { drawingId: a.drawing.id, rev: "R2", status: "APPROVED", buf: pdf })).rejects.toThrow("forbidden");
  });

  it("site roles see only revisions released for construction", async () => {
    expect(await listDrawings(u.sanu)).toEqual([]);
    await expect(releaseForConstruction(u.sachin, fc)).rejects.toThrow("forbidden");
    await releaseForConstruction(u.alwin, fc);
    const list = await listDrawings(u.sanu);
    expect(list[0].revisions.map((r) => r.rev)).toEqual(["R1"]);
    expect(await revisionView(u.sanu, draft)).toBe("forbidden");
    expect((await listDrawings(u.sachin))[0].revisions).toHaveLength(2);
  });

  it("calibrate 1000 mm, measure 6000 mm on a 1:50 sheet (acceptance 10 maths)", async () => {
    const unit = (mm: number) => (mm / 50) * PT_PER_MM;
    await expect(applyMutation(u.sanu, mut("drawing.measure", { revisionId: fc, page: 1, points: [[0, 0], [10, 0]] }))).rejects.toThrow("calibrate_first");
    await applyMutation(u.sanu, mut("drawing.calibrate", { revisionId: fc, page: 1, points: [[100, 200], [100 + unit(1000), 200]], realMm: 1000 }));
    await applyMutation(u.sanu, mut("drawing.measure", { revisionId: fc, page: 1, points: [[100, 250], [100 + unit(6000), 250]], label: "Duct run A" }));
    const v = await revisionView(u.sachin, fc);
    expect(v && v !== "forbidden" && v.measurements[0]).toMatchObject({ lengthMm: 6000, label: "Duct run A" });
    await expect(applyMutation(u.sanu, mut("drawing.calibrate", { revisionId: draft, page: 1, points: [[0, 0], [50, 0]], realMm: 1000 }))).rejects.toThrow("forbidden");
  });
});
