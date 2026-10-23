import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { db } from "@/lib/db";
import { applyMutation, MutationError } from "@/lib/sync/apply";
import { buildTimesheet } from "@/lib/timesheet/build";
import { saveUpload, sniff, UploadError } from "@/lib/files";
import { getVehiclePlan, getDriverDay } from "@/lib/logistics/server";
import { flowView } from "@/lib/approvals";
import type { CurrentUser } from "@/lib/auth/current";
import type { Mutation } from "@/lib/sync/schema";
import { resetDb } from "./reset";

process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), "kem-up-"));

const DATE = "2026-10-21"; // Wednesday
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);
const ids: Record<string, string> = {};
const u: Record<string, CurrentUser> = {};
const mk = (id: string, roles: string[]): CurrentUser => ({ id, sessionId: "s", username: id, displayName: id, locale: "en", roles, mustChangePassword: false, prevSeenAt: null });
const mut = <T extends Mutation["type"]>(type: T, payload: Extract<Mutation, { type: T }>["payload"]) =>
  ({ id: randomUUID(), type, at: new Date().toISOString(), payload }) as Extract<Mutation, { type: T }>;
const photo = async (user: CurrentUser) => {
  const clientId = randomUUID();
  await saveUpload({ buf: JPEG, module: "logistics", userId: user.id, clientId });
  return clientId;
};

beforeAll(async () => {
  await resetDb();
  for (const [name, roles] of [["sanu", ["SUP"]], ["renjith", ["HEAD_SUP"]], ["ali", ["DRIVER"]], ["vishnu", ["SUP"]]] as const) {
    const row = await db.user.create({ data: { username: name, displayName: name, passwordHash: "x", roles: { create: roles.map((role) => ({ role })) } } });
    u[name] = mk(row.id, [...roles]);
  }
  ids.NBK = (await db.site.create({ data: { code: "NBK", name: "NBK" } })).id;
  ids.SAFE = (await db.site.create({ data: { code: "SAFE", name: "Safe Tower" } })).id;
  ids.V1 = (await db.vehicle.create({ data: { name: "Vehicle 1", defaultDriverId: u.ali.id } })).id;
  ids.V3 = (await db.vehicle.create({ data: { name: "Vehicle 3" } })).id;
  for (const code of ["E01", "E02", "E03", "E04", "E05"]) ids[code] = (await db.worker.create({ data: { empCode: code, name: code } })).id;
  // E01–E05 IN at NBK 08:00–17:00
  for (const code of ["E01", "E02", "E03", "E04", "E05"]) {
    await applyMutation(u.sanu, mut("attendance.mark", { date: DATE, siteId: ids.NBK, workerId: ids[code], status: "IN", shift: "DAY", shiftStart: "08:00" }));
    await applyMutation(u.sanu, mut("attendance.finish", { date: DATE, workerId: ids[code], outTime: "17:00" }));
  }
});

const dayOf = async (code: string) => {
  const ts = await buildTimesheet("2026-09-26", "2026-10-25");
  return ts.workers.find((w) => w.empCode === code)!.days.find((d) => d.date === DATE)!;
};

describe("manpower moves (acceptance 2)", () => {
  let moveId: string;
  it("emergency move of 3 workers NBK → Safe Tower at 10:15 applies at once", async () => {
    const m = mut("move.create", { date: DATE, fromSiteId: ids.NBK, toSiteId: ids.SAFE, workerIds: [ids.E01, ids.E02, ids.E03], moveTime: "10:15", reason: "EMERGENCY" });
    await applyMutation(u.sanu, m);
    const move = await db.manpowerMove.findUniqueOrThrow({ where: { clientId: m.id } });
    moveId = move.id;
    expect(move.status).toBe("APPLIED");
    const d = await dayOf("E01");
    expect(d.bySite.get("NBK")!.normal).toBe(2);
    expect(d.bySite.get("Safe Tower")!.normal).toBe(6);
    expect(d.hours.normal).toBe(8);
  });

  it("Renjith sees it to approve; Sanu does not", async () => {
    expect((await flowView(u.renjith, "MANPOWER_MOVE", moveId))!.canAct).toBe(true);
    expect((await flowView(u.sanu, "MANPOWER_MOVE", moveId))!.canAct).toBe(false);
    expect(await db.notification.count({ where: { userId: u.renjith.id, entityId: moveId } })).toBe(1);
    const flow = await flowView(u.sanu, "MANPOWER_MOVE", moveId);
    await expect(applyMutation(u.sanu, mut("approval.act", { flowId: flow!.id, action: "APPROVE" }))).rejects.toBeInstanceOf(MutationError);
  });

  it("approval keeps the split", async () => {
    const flow = await flowView(u.renjith, "MANPOWER_MOVE", moveId);
    await applyMutation(u.renjith, mut("approval.act", { flowId: flow!.id, action: "APPROVE" }));
    expect((await db.manpowerMove.findUniqueOrThrow({ where: { id: moveId } })).status).toBe("APPROVED");
    expect((await dayOf("E02")).bySite.get("Safe Tower")!.normal).toBe(6);
  });

  it("a returned emergency move is undone", async () => {
    const m = mut("move.create", { date: DATE, fromSiteId: ids.NBK, toSiteId: ids.SAFE, workerIds: [ids.E04], moveTime: "13:00", reason: "EMERGENCY" });
    await applyMutation(u.sanu, m);
    expect((await dayOf("E04")).bySite.size).toBe(2);
    const move = await db.manpowerMove.findUniqueOrThrow({ where: { clientId: m.id } });
    const flow = await flowView(u.renjith, "MANPOWER_MOVE", move.id);
    await expect(applyMutation(u.renjith, mut("approval.act", { flowId: flow!.id, action: "RETURN" }))).rejects.toThrow("comment_required");
    await applyMutation(u.renjith, mut("approval.act", { flowId: flow!.id, action: "RETURN", comment: "Not needed" }));
    expect((await db.manpowerMove.findUniqueOrThrow({ where: { id: move.id } })).status).toBe("RETURNED");
    const d = await dayOf("E04");
    expect([...d.bySite.keys()]).toEqual(["NBK"]);
    expect(d.bySite.get("NBK")!.normal).toBe(8);
  });

  it("a normal move waits for approval before hours move", async () => {
    const m = mut("move.create", { date: DATE, fromSiteId: ids.NBK, toSiteId: ids.SAFE, workerIds: [ids.E05], moveTime: "12:00", reason: "EXTRA", vehicleId: ids.V1 });
    await applyMutation(u.sanu, m);
    expect((await dayOf("E05")).bySite.size).toBe(1);
    const move = await db.manpowerMove.findUniqueOrThrow({ where: { clientId: m.id }, include: { trip: { include: { passengers: true } } } });
    expect(move.trip?.passengers).toHaveLength(1); // vehicle booked with the move
    const flow = await flowView(u.renjith, "MANPOWER_MOVE", move.id);
    await applyMutation(u.renjith, mut("approval.act", { flowId: flow!.id, action: "APPROVE" }));
    // 08:00–12:00 NBK (240 min), 12:00–17:00 Safe Tower (300 min): 8 h split 3.56 / 4.44
    const d = await dayOf("E05");
    expect(d.bySite.get("Safe Tower")!.normal).toBe(4.44);
    expect(d.bySite.get("NBK")!.normal).toBe(3.56);
  });

  it("rejects workers who are not on the from-site", async () => {
    await expect(
      applyMutation(u.sanu, mut("move.create", { date: DATE, fromSiteId: ids.NBK, toSiteId: ids.SAFE, workerIds: [ids.E01], moveTime: "15:00", reason: "OTHER" })),
    ).rejects.toThrow("worker_not_on_site");
  });
});

describe("logistics (acceptance 7 and 8)", () => {
  it("Vehicle 3 double-booked shows a clash", async () => {
    const plan = await db.vehiclePlan.upsert({ where: { date: DATE }, update: {}, create: { date: DATE } });
    const at = (h: number) => new Date(Date.UTC(2026, 9, 21, h - 4));
    for (const [out, back] of [[9, 11], [10, 12]])
      await db.trip.create({ data: { planId: plan.id, date: DATE, vehicleId: ids.V3, driverId: u.vishnu.id, fromSiteId: ids.NBK, toSiteId: ids.SAFE, plannedOut: at(out), plannedReturn: at(back) } });
    const vp = await getVehiclePlan(u.renjith, DATE);
    expect(vp.clashes.some((c) => c.kind === "vehicle" && c.who === "Vehicle 3")).toBe(true);
  });

  it("Ali: vehicle check before the first trip, delivery photo, fuel bill", async () => {
    const plan = await db.vehiclePlan.findUniqueOrThrow({ where: { date: DATE } });
    const trip = await db.trip.create({
      data: { planId: plan.id, date: DATE, vehicleId: ids.V1, driverId: u.ali.id, fromSiteId: ids.NBK, toSiteId: ids.SAFE, plannedOut: new Date(), plannedReturn: new Date(Date.now() + 3_600_000) },
    });
    await expect(applyMutation(u.ali, mut("trip.status", { tripId: trip.id, status: "STARTED" }))).rejects.toThrow("vehicle_check_first");
    await applyMutation(u.ali, mut("vehicle.check", { date: DATE, vehicleId: ids.V1, tyresOk: true, oilOk: true, lightsOk: true, photoClientId: await photo(u.ali) }));
    await applyMutation(u.ali, mut("trip.status", { tripId: trip.id, status: "STARTED" }));
    await expect(applyMutation(u.ali, mut("trip.status", { tripId: trip.id, status: "DELIVERED" }))).rejects.toThrow("delivery_photo_required");
    await applyMutation(u.ali, mut("trip.status", { tripId: trip.id, status: "DELIVERED", photoClientId: await photo(u.ali) }));
    await applyMutation(u.ali, mut("trip.status", { tripId: trip.id, status: "RETURNED" }));
    const done = await db.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(done).toMatchObject({ status: "RETURNED" });
    expect(done.deliveryPhotoId).toBeTruthy();

    await expect(applyMutation(u.ali, mut("bill.create", { date: DATE, type: "FUEL", vehicleId: ids.V1, photoClientId: await photo(u.ali) }))).rejects.toThrow("amount_required");
    await applyMutation(u.ali, mut("bill.create", { date: DATE, type: "FUEL", vehicleId: ids.V1, amount: 150.5, odometer: 48210, photoClientId: await photo(u.ali) }));
    const bill = await db.driverBill.findFirstOrThrow({ where: { driverId: u.ali.id } });
    expect(bill.amountFils).toBe(15050);
  });

  it("supervisor bill has no amount; a photo is mandatory", async () => {
    await expect(applyMutation(u.vishnu, mut("bill.create", { date: DATE, type: "SALIK", vehicleId: ids.V3, amount: 4, photoClientId: await photo(u.vishnu) }))).rejects.toThrow("amount_not_allowed");
    await expect(applyMutation(u.vishnu, mut("bill.create", { date: DATE, type: "SALIK", vehicleId: ids.V3, photoClientId: randomUUID() }))).rejects.toThrow("photo_required");
    await applyMutation(u.vishnu, mut("bill.create", { date: DATE, type: "SALIK", vehicleId: ids.V3, photoClientId: await photo(u.vishnu) }));
    expect((await db.driverBill.findFirstOrThrow({ where: { driverId: u.vishnu.id } })).amountFils).toBeNull();
  });

  it("driver data lists only Ali's trips with a map link", async () => {
    const d = await getDriverDay(u.ali);
    expect(d.isDriver).toBe(true);
    expect(d.myVehicleId).toBe(ids.V1);
  });
});

describe("uploads", () => {
  it("checks the real file type, not the name", () => {
    expect(sniff(JPEG)?.mime).toBe("image/jpeg");
    expect(sniff(Buffer.from("%PDF-1.7 ..."))?.kind).toBe("PDF");
    expect(sniff(Buffer.from("MZ\x90\x00 not an image"))).toBeNull();
  });
  it("rejects disallowed types and keeps offline retries idempotent", async () => {
    await expect(saveUpload({ buf: Buffer.from("<script>alert(1)</script>"), module: "bills", userId: u.ali.id })).rejects.toBeInstanceOf(UploadError);
    const clientId = randomUUID();
    const a = await saveUpload({ buf: JPEG, module: "bills", userId: u.ali.id, clientId });
    const b = await saveUpload({ buf: JPEG, module: "bills", userId: u.ali.id, clientId });
    expect(b.id).toBe(a.id);
    await expect(saveUpload({ buf: JPEG, module: "bills", userId: u.sanu.id, clientId })).rejects.toThrow("forbidden");
  });
});
