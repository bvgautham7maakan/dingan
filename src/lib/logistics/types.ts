// Client-side shapes returned by /api/driver (money is stripped for no-AED roles).
export type DriverTrip = {
  id: string; date: string; vehicleId: string; vehicle: string; out: string; back: string; from: string; to: string;
  toMap: string; fromMap: string; purpose: string | null; materials: string | null; status: string; passengers: string[];
};
export type DriverDay = {
  today: string;
  tomorrow: string;
  isDriver: boolean;
  vehicles: { id: string; name: string }[];
  myVehicleId: string | null;
  checkedVehicleIds: string[];
  trips: DriverTrip[];
  bills: { id: string; date: string; type: string; vehicle: string; odometer: number | null; amountFils?: number | null; createdAt: string }[];
};
