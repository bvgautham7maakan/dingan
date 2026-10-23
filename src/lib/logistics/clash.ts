/** Vehicle / driver double-booking detection (pure, unit-tested). */
export type TripSlot = {
  id: string;
  vehicleId: string;
  vehicle: string;
  driverId: string | null;
  driver: string | null;
  from: string;
  to: string;
  out: Date;
  back: Date;
};

export type Clash = { kind: "vehicle" | "driver"; who: string; a: TripSlot; b: TripSlot };

const overlap = (a: TripSlot, b: TripSlot) => a.out < b.back && b.out < a.back;

export function findClashes(trips: TripSlot[]): Clash[] {
  const out: Clash[] = [];
  const sorted = [...trips].sort((a, b) => a.out.getTime() - b.out.getTime());
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!overlap(a, b)) continue;
      if (a.vehicleId === b.vehicleId) out.push({ kind: "vehicle", who: a.vehicle, a, b });
      if (a.driverId && a.driverId === b.driverId) out.push({ kind: "driver", who: a.driver ?? "driver", a, b });
    }
  return out;
}

export function clashedTripIds(clashes: Clash[]): Set<string> {
  return new Set(clashes.flatMap((c) => [c.a.id, c.b.id]));
}
