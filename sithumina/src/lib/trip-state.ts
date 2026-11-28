/**
 * Pure trip rules shared by server and client code (no Firebase imports).
 *
 * A vehicle runs ONE primary trip plus any number of attached return legs.
 */

export type TripRole = "primary" | "return";

export interface TripLike {
  status?: string;
  tripRole?: TripRole;
  parentBookingId?: string;
  driverTripStatus?: string;
  rideStartedAt?: number;
  loadedAt?: number;
  rideEndedAt?: number;
}

/** Statuses of bookings that still need work. "delivered" means payment is due. */
export const OPEN_STATUSES = [
  "pending", "awaiting_payment", "payment_submitted", "accepted", "booked",
  "assigned", "goods_collected", "in_transit", "delivered",
];

const FINISHED = ["delivered", "completed", "cancelled"];
const ON_ROAD = ["in_transit", "goods_collected"];

/** True while a driver has accepted the job and not yet ended it. */
export function isActiveTrip(b: TripLike): boolean {
  return ON_ROAD.includes(String(b.status || "")) && !FINISHED.includes(String(b.status || ""));
}

export function normalizeVehicleKey(plate?: string | null): string {
  return String(plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type TripStage =
  | "scheduled"
  | "awaiting_driver"
  | "declined"
  | "accepted"
  | "loaded"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "not_dispatched";

export function tripStage(b: TripLike): TripStage {
  const status = String(b.status || "");
  if (status === "cancelled") return "cancelled";
  if (status === "delivered" || status === "completed") return "delivered";
  if (isActiveTrip(b)) {
    if (b.loadedAt || b.driverTripStatus === "loaded" || status === "goods_collected") return "loaded";
    if (b.driverTripStatus === "accepted") return "accepted";
    return "in_transit";
  }
  if (b.driverTripStatus === "declined") return "declined";
  if (["accepted", "assigned", "booked"].includes(status)) {
    if (b.driverTripStatus === "pending_acceptance") return "awaiting_driver";
    if (b.driverTripStatus === "scheduled" || status === "assigned") return "scheduled";
  }
  return "not_dispatched";
}

export const TRIP_STAGE_LABEL: Record<TripStage, { en: string; si: string }> = {
  scheduled: { en: "Scheduled – driver not rung yet", si: "වේලාවට සැලසුම් කර ඇත" },
  awaiting_driver: { en: "Ringing – waiting for driver to accept", si: "රියදුරුගේ පිළිගැනීම අපේක්ෂාවෙන්" },
  declined: { en: "Declined by driver", si: "රියදුරු ප්‍රතික්ෂේප කළා" },
  accepted: { en: "Accepted – heading to pickup", si: "පිළිගත්තා – බඩු ගන්නා තැනට යමින්" },
  loaded: { en: "Loaded – goods in transit", si: "බඩු පටවා ඇත – ප්‍රවාහනය වෙමින්" },
  in_transit: { en: "In transit", si: "ගමන් කරමින්" },
  delivered: { en: "Delivered", si: "භාරදී ඇත" },
  cancelled: { en: "Cancelled", si: "අවලංගුයි" },
  not_dispatched: { en: "Not yet dispatched", si: "තවම යවා නැත" },
};

/** Trip fields copied from a raw Firestore booking by every booking mapper. */
export function tripFields(data: Record<string, any>) {
  const num = (v: unknown) => (Number(v) > 0 ? Number(v) : undefined);
  return {
    tripRole: (data.tripRole === "return" || data.tripRole === "primary" ? data.tripRole : undefined) as
      | TripRole
      | undefined,
    parentBookingId: data.parentBookingId ? String(data.parentBookingId) : undefined,
    driverTripStatus: data.driverTripStatus || undefined,
    ringAt: num(data.ringAt),
    declineReason: data.declineReason ? String(data.declineReason) : undefined,
    declinedByName: data.declinedByName ? String(data.declinedByName) : undefined,
    acceptedAt: num(data.acceptedAt),
    rideStartedAt: num(data.rideStartedAt),
    loadedAt: num(data.loadedAt),
    rideEndedAt: num(data.rideEndedAt),
    pickupPinned: data.pickupPinned === true,
    ...(typeof data.externalOwnerId === "string" ? { externalOwnerId: data.externalOwnerId as string } : {}),
    dropoffPinned: data.dropoffPinned === true,
  };
}

export interface TripGroup<T> {
  /** The primary booking, if it is known. */
  primary: T | null;
  /** Return legs attached to the primary. */
  legs: T[];
  key: string;
}

/**
 * Group ongoing bookings so return legs sit under their primary trip.
 * A primary that is already delivered is still shown while a leg is running.
 */
export function groupTrips<T extends TripLike & { id: string }>(ongoing: T[], all: T[]): TripGroup<T>[] {
  const byId = new Map(all.map((b) => [b.id, b]));
  const groups = new Map<string, TripGroup<T>>();
  for (const b of ongoing) {
    const rootId = b.tripRole === "return" && b.parentBookingId ? b.parentBookingId : b.id;
    if (groups.has(rootId)) continue;
    const primary = byId.get(rootId) || null;
    const legs = all
      .filter((x) => x.tripRole === "return" && x.parentBookingId === rootId && x.status !== "cancelled")
      .sort((a, c) => (a.rideStartedAt || 0) - (c.rideStartedAt || 0));
    groups.set(rootId, { key: rootId, primary, legs });
  }
  return Array.from(groups.values());
}
