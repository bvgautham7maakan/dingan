import { describe, expect, it } from "vitest";
import { clashedTripIds, findClashes, type TripSlot } from "@/lib/logistics/clash";

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 23, h - 4, m));
const trip = (id: string, vehicle: string, driver: string | null, out: [number, number], back: [number, number]): TripSlot => ({
  id, vehicleId: vehicle, vehicle: `Vehicle ${vehicle}`, driverId: driver, driver, from: "NBK", to: "Safe Tower", out: at(...out), back: at(...back),
});

describe("vehicle / driver clash detection", () => {
  it("flags the same vehicle booked at overlapping times (Vehicle 3 double-booked)", () => {
    const c = findClashes([trip("a", "3", "vishnu", [9, 0], [11, 0]), trip("b", "3", "aneesh", [10, 30], [12, 0])]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "vehicle", who: "Vehicle 3" });
    expect([...clashedTripIds(c)].sort()).toEqual(["a", "b"]);
  });
  it("flags the same driver on two vehicles at once", () => {
    const c = findClashes([trip("a", "1", "ali", [8, 0], [9, 0]), trip("b", "2", "ali", [8, 30], [9, 30])]);
    expect(c).toEqual([expect.objectContaining({ kind: "driver", who: "ali" })]);
  });
  it("back-to-back trips do not clash", () => {
    expect(findClashes([trip("a", "1", "ali", [8, 0], [9, 0]), trip("b", "1", "ali", [9, 0], [10, 0])])).toEqual([]);
  });
  it("no driver set is never a driver clash", () => {
    expect(findClashes([trip("a", "1", null, [8, 0], [9, 0]), trip("b", "2", null, [8, 0], [9, 0])])).toEqual([]);
  });
  it("same vehicle and driver overlapping gives both clash kinds", () => {
    const c = findClashes([trip("a", "1", "ali", [8, 0], [10, 0]), trip("b", "1", "ali", [9, 0], [11, 0])]);
    expect(c.map((x) => x.kind).sort()).toEqual(["driver", "vehicle"]);
  });
});
