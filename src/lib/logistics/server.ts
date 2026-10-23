import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { fileByClientId } from "../files";
import { flowView, registerFlow, startFlow } from "../approvals";
import { hasAnyRole, type Role } from "../roles";
import { dubaiHHMM, todayDubai } from "../time";
import { MutationError } from "../attendance/server";
import { findClashes, type TripSlot } from "./clash";
import type { CurrentUser } from "../auth/current";
import type { MutationOf } from "../sync/schema";

export const TRIP_EDIT_ROLES: readonly Role[] = ["SUP", "HVAC_SUP", "HEAD_SUP", "SE", "PE", "ADMIN"];
export const TRIP_VIEW_ROLES: readonly Role[] = [...TRIP_EDIT_ROLES, "PM", "OPS", "BUL", "COORD", "DRIVER"];
export const PLAN_APPROVER: Role = "HEAD_SUP";
export const BILL_ROLES: readonly Role[] = ["DRIVER", "SUP", "HVAC_SUP", "HEAD_SUP"];
export const BILL_OFFICE_ROLES: readonly Role[] = ["ADMIN", "PE", "OPS", "BUL", "PM"];

export function mapLink(site: { name: string; mapUrl: string | null; lat: number | null; lng: number | null }) {
  if (site.mapUrl) return site.mapUrl;
  const q = site.lat != null && site.lng != null ? `${site.lat},${site.lng}` : `${site.name}, Abu Dhabi`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

registerFlow("VEHICLE_PLAN", {
  link: (id) => `/m/vehicle-plan?plan=${id}`,
  title: async (id) => {
    const p = await db.vehiclePlan.findUnique({ where: { id } });
    return p ? `Vehicle plan ${p.date.split("-").reverse().join("-")}` : "Vehicle plan";
  },
  onApproved: async (id) => void (await db.vehiclePlan.update({ where: { id }, data: { status: "APPROVED" } })),
  onReturnedToRequester: async (id) => void (await db.vehiclePlan.update({ where: { id }, data: { status: "DRAFT" } })),
});

const tripInclude = {
  vehicle: true,
  driver: { select: { id: true, displayName: true } },
  fromSite: true,
  toSite: true,
  passengers: { include: { worker: { select: { name: true, empCode: true } } } },
} as const;

export async function getVehiclePlan(user: CurrentUser, date: string) {
  const plan = await db.vehiclePlan.findUnique({ where: { date } });
  const trips = await db.trip.findMany({ where: { date, status: { not: "CANCELLED" } }, include: tripInclude, orderBy: { plannedOut: "asc" } });
  const slots: TripSlot[] = trips.map((t) => ({
    id: t.id, vehicleId: t.vehicleId, vehicle: t.vehicle.name, driverId: t.driverId, driver: t.driver?.displayName ?? null,
    from: t.fromSite.name, to: t.toSite.name, out: t.plannedOut, back: t.plannedReturn,
  }));
  return {
    plan,
    trips,
    clashes: findClashes(slots),
    flow: plan ? await flowView(user, "VEHICLE_PLAN", plan.id) : null,
  };
}

/** Any edit by a non-approver after approval sends the plan back to draft. */
export async function touchPlan(user: CurrentUser, date: string) {
  const plan = await db.vehiclePlan.upsert({ where: { date }, update: {}, create: { date } });
  if (plan.status !== "DRAFT" && !hasAnyRole(user.roles, [PLAN_APPROVER])) {
    await db.approvalFlow.deleteMany({ where: { entityType: "VEHICLE_PLAN", entityId: plan.id } });
    await db.vehiclePlan.update({ where: { id: plan.id }, data: { status: "DRAFT" } });
  }
  return plan;
}

export async function submitPlan(user: CurrentUser, date: string) {
  const plan = await touchPlan(user, date);
  if (hasAnyRole(user.roles, [PLAN_APPROVER])) {
    await db.approvalFlow.deleteMany({ where: { entityType: "VEHICLE_PLAN", entityId: plan.id } });
    await db.vehiclePlan.update({ where: { id: plan.id }, data: { status: "APPROVED" } });
    await audit({ actorId: user.id, action: "APPROVE", entityType: "VehiclePlan", entityId: plan.id });
    return;
  }
  await db.approvalFlow.deleteMany({ where: { entityType: "VEHICLE_PLAN", entityId: plan.id } });
  await db.vehiclePlan.update({ where: { id: plan.id }, data: { status: "SUBMITTED" } });
  await startFlow("VEHICLE_PLAN", plan.id, "VEHICLE_PLAN", [{ label: "Head supervisor", role: PLAN_APPROVER }], user);
  await audit({ actorId: user.id, action: "SUBMIT", entityType: "VehiclePlan", entityId: plan.id });
}

export async function recordVehicleCheck(user: CurrentUser, m: MutationOf<"vehicle.check">) {
  if (!hasAnyRole(user.roles, ["DRIVER", "SUP", "HVAC_SUP", "HEAD_SUP", "ADMIN"])) throw new MutationError("forbidden");
  const p = m.payload;
  const photo = await fileByClientId(p.photoClientId, user.id);
  if (!photo) throw new MutationError("photo_missing");
  const row = await db.vehicleCheck.create({
    data: {
      vehicleId: p.vehicleId, driverId: user.id, date: p.date, tyresOk: p.tyresOk, oilOk: p.oilOk, lightsOk: p.lightsOk,
      damageNote: p.damageNote ?? null, photoId: photo.id, clientId: m.id,
    },
  });
  await audit({ actorId: user.id, action: "CREATE", entityType: "VehicleCheck", entityId: row.id, after: p });
}

export async function setTripStatus(user: CurrentUser, m: MutationOf<"trip.status">) {
  const trip = await db.trip.findUnique({ where: { id: m.payload.tripId } });
  if (!trip) throw new MutationError("trip_not_found");
  const isDriver = trip.driverId === user.id;
  if (!isDriver && !hasAnyRole(user.roles, ["HEAD_SUP", "ADMIN"])) throw new MutationError("not_your_trip");
  const now = new Date();
  const { status } = m.payload;
  if (status === "STARTED") {
    const checked = await db.vehicleCheck.findFirst({ where: { vehicleId: trip.vehicleId, date: trip.date } });
    if (!checked) throw new MutationError("vehicle_check_first");
  }
  let deliveryPhotoId = trip.deliveryPhotoId;
  if (status === "DELIVERED") {
    const photo = await fileByClientId(m.payload.photoClientId, user.id);
    if (!photo) throw new MutationError("delivery_photo_required");
    deliveryPhotoId = photo.id;
  }
  const data =
    status === "STARTED"
      ? { status, startedAt: trip.startedAt ?? now }
      : status === "DELIVERED"
        ? { status, deliveredAt: now, deliveryPhotoId, startedAt: trip.startedAt ?? now }
        : { status, returnedAt: now, startedAt: trip.startedAt ?? now };
  await db.trip.update({ where: { id: trip.id }, data });
  await audit({ actorId: user.id, action: "EDIT", entityType: "Trip", entityId: trip.id, before: { status: trip.status }, after: { status } });
}

export async function createBill(user: CurrentUser, m: MutationOf<"bill.create">) {
  if (!hasAnyRole(user.roles, BILL_ROLES)) throw new MutationError("forbidden");
  const p = m.payload;
  // Drivers enter the amount; the supervisor form has no amount field (office fills it in).
  const isDriver = hasAnyRole(user.roles, ["DRIVER"]);
  if (isDriver && p.amount == null) throw new MutationError("amount_required");
  if (!isDriver && p.amount != null) throw new MutationError("amount_not_allowed");
  const photo = await fileByClientId(p.photoClientId, user.id);
  if (!photo) throw new MutationError("photo_required");
  const voice = await fileByClientId(p.voiceClientId, user.id);
  const row = await db.driverBill.create({
    data: {
      type: p.type, vehicleId: p.vehicleId, driverId: user.id, date: p.date,
      amountFils: p.amount != null ? Math.round(p.amount * 100) : null, odometer: p.odometer ?? null,
      photoId: photo.id, voiceFileId: voice?.id ?? null, note: p.note ?? null, clientId: m.id,
    },
  });
  await audit({ actorId: user.id, action: "CREATE", entityType: "DriverBill", entityId: row.id, after: { ...p } });
}

/** Everything the driver/vehicle screens need, cached on the phone for offline use. */
export async function getDriverDay(user: CurrentUser) {
  const today = todayDubai();
  const tomorrow = new Date(Date.parse(today + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  const [vehicles, checks, trips, bills] = await Promise.all([
    db.vehicle.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.vehicleCheck.findMany({ where: { date: today }, select: { vehicleId: true } }),
    db.trip.findMany({
      where: { driverId: user.id, date: { in: [today, tomorrow] }, status: { not: "CANCELLED" } },
      include: tripInclude,
      orderBy: { plannedOut: "asc" },
    }),
    db.driverBill.findMany({ where: { driverId: user.id }, include: { vehicle: true }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const mine = vehicles.find((v) => v.defaultDriverId === user.id) ?? trips[0]?.vehicle ?? null;
  return {
    today,
    tomorrow,
    isDriver: hasAnyRole(user.roles, ["DRIVER"]),
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.name })),
    myVehicleId: mine?.id ?? null,
    checkedVehicleIds: [...new Set(checks.map((c) => c.vehicleId))],
    trips: trips.map((t) => ({
      id: t.id, date: t.date, vehicleId: t.vehicleId, vehicle: t.vehicle.name, out: dubaiHHMM(t.plannedOut), back: dubaiHHMM(t.plannedReturn),
      from: t.fromSite.name, to: t.toSite.name, toMap: mapLink(t.toSite), fromMap: mapLink(t.fromSite),
      purpose: t.purpose, materials: t.materialsText, status: t.status,
      passengers: t.passengers.map((p) => p.worker.name),
    })),
    bills: bills.map((b) => ({ id: b.id, date: b.date, type: b.type, vehicle: b.vehicle.name, odometer: b.odometer, amountFils: b.amountFils, createdAt: b.createdAt })),
  };
}
