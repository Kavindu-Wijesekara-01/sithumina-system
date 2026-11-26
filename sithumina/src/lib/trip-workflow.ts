/**
 * Server-side trip workflow: accept / decline / loaded / complete.
 *
 * Rule: a driver and vehicle hold ONE primary trip. While it runs, only
 * attached return (live map) bookings can be added. A second primary is refused.
 * Lock documents are read and written inside a transaction so two simultaneous
 * accepts cannot both become primary.
 */
import { db } from "@/lib/fs-server";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
} from "@/lib/fs-server";
import { isActiveTrip, normalizeVehicleKey, type TripRole } from "@/lib/trip-state";
import { findOutsideOwnerByPlate, syncHireCommission } from "@/lib/outside-owners";
import { outstandingAmount } from "@/lib/ledger";
import { closeDispatchesForBooking } from "@/lib/dispatch-sync";

export class TripError extends Error {}

const LOCKS = "driver_trip_locks";
const ACTIVE_TRIPS = "active_trips";

type Doc = Record<string, any> & { id: string };

const lockKeys = (driverId?: string, plate?: string): string[] => {
  const keys: string[] = [];
  if (driverId) keys.push(`driver_${String(driverId).trim().toUpperCase()}`);
  if (normalizeVehicleKey(plate)) keys.push(`plate_${normalizeVehicleKey(plate)}`);
  return keys;
};

const sameDriverOrVehicle = (b: Record<string, any>, driverId?: string, plate?: string) =>
  Boolean(
    (driverId && String(b.assignedDriverId || "").toUpperCase() === driverId.toUpperCase()) ||
      (normalizeVehicleKey(plate) &&
        normalizeVehicleKey(b.assignedPlate || b.selectedVehiclePlate) === normalizeVehicleKey(plate))
  );

async function listActiveBookings(): Promise<Doc[]> {
  const snaps = await Promise.all(
    ["in_transit", "goods_collected"].map((status) =>
      getDocs(query(collection(db, "bookings"), where("status", "==", status)))
    )
  );
  return snaps.flatMap((s) => s.docs.map((d) => ({ ...d.data(), id: d.id }) as Doc));
}

/** Decide the role of a new job given the trips already running. */
function decideRole(
  incoming: Record<string, any>,
  active: Doc[]
): { role: TripRole; parentBookingId: string } {
  if (active.length === 0) return { role: "primary", parentBookingId: "" };
  const primary = active.find((b) => b.tripRole !== "return");
  const parentBookingId = primary?.id || String(active[0].parentBookingId || active[0].id);
  if (incoming.bookingType !== "live_lorry") {
    throw new TripError(
      `This driver or vehicle is still on trip ${parentBookingId}. Finish that drop-off before starting another booking.`
    );
  }
  return { role: "return", parentBookingId };
}

/** Role a booking would take if dispatched/started now. Throws if it conflicts. */
export async function planTrip(
  booking: Record<string, any> & { id: string }
): Promise<{ role: TripRole; parentBookingId: string }> {
  const driverId = String(booking.assignedDriverId || "");
  const plate = String(booking.assignedPlate || "");
  const active = (await listActiveBookings()).filter(
    (b) => b.id !== booking.id && sameDriverOrVehicle(b, driverId, plate)
  );
  return decideRole(booking, active);
}

/** Keep the public "vehicle is on a trip" marker used by the customer live map. */
export async function refreshVehicleTripState(plate?: string): Promise<void> {
  const key = normalizeVehicleKey(plate);
  if (!key) return;
  const active = (await listActiveBookings()).filter(
    (b) => normalizeVehicleKey(b.assignedPlate || b.selectedVehiclePlate) === key
  );
  const ref = doc(db, ACTIVE_TRIPS, key);
  if (active.length === 0) {
    await deleteDoc(ref);
    return;
  }
  const primary = active.find((b) => b.tripRole !== "return") || active[0];
  // No customer details: this document is readable by the public map
  await setDoc(ref, {
    plate: String(primary.assignedPlate || plate || "").toUpperCase(),
    primaryBookingId: primary.tripRole === "return" ? primary.parentBookingId || primary.id : primary.id,
    destination: String(primary.deliveryCity || ""),
    legCount: active.length,
    updatedAt: Date.now(),
  });
}

export type TripAction = "accept" | "decline" | "loaded" | "collect_cash" | "complete";

export interface TripActor {
  driverId: string;
  /** Vehicle the driver says they are using, if the job has none. */
  plate?: string;
}

export interface TripResult {
  bookingId: string;
  tripRole: TripRole;
  parentBookingId: string;
  bookingStatus: string;
  bookingPatch: Record<string, any>;
}

const phoneTail = (v: unknown) => String(v || "").replace(/\D/g, "").slice(-9);

export async function performTripAction(
  dispatchId: string,
  action: TripAction,
  actor: TripActor
): Promise<TripResult> {
  const driverId = String(actor.driverId || "").trim().toUpperCase();
  if (!dispatchId || !driverId) throw new TripError("Dispatch and Driver ID are required.");

  const [driverSnap, dispatchSnap] = await Promise.all([
    getDoc(doc(db, "drivers", driverId)),
    getDoc(doc(db, "dispatches", dispatchId)),
  ]);
  if (!driverSnap.exists()) throw new TripError("Driver account not found.");
  if (!dispatchSnap.exists()) throw new TripError("This job is no longer available.");
  const driver = driverSnap.data();
  const initial = dispatchSnap.data();

  const plate = String(initial.assignedPlate || actor.plate || driver.plate || "").toUpperCase();
  const belongs =
    String(initial.driverId || "").toUpperCase() === driverId ||
    (normalizeVehicleKey(initial.assignedPlate) &&
      normalizeVehicleKey(initial.assignedPlate) === normalizeVehicleKey(driver.plate || actor.plate)) ||
    (phoneTail(driver.phone) && phoneTail(driver.phone) === phoneTail(initial.driverPhone)) ||
    (initial.riderId && initial.riderId === driver.lorryId);
  if (!belongs) throw new TripError("This job is assigned to another driver.");

  const bookingId = String(initial.bookingId || dispatchId.replace(/^dispatch-/, ""));
  const bookingRef = doc(db, "bookings", bookingId);
  const dispatchRef = doc(db, "dispatches", dispatchId);

  // Candidates for "what is this driver already doing" (queries are not allowed inside transactions)
  const [allActive, externalOwner] = await Promise.all([listActiveBookings(), findOutsideOwnerByPlate(plate)]);
  const queried = allActive.filter((b) => sameDriverOrVehicle(b, driverId, plate));

  const result = await runTransaction(db, async (tx) => {
    const dispatch = (await tx.get(dispatchRef)).data();
    const bookingSnap = await tx.get(bookingRef);
    if (!dispatch || !bookingSnap.exists()) throw new TripError("This job is no longer available.");
    const booking = bookingSnap.data();
    const bookingStatus = String(booking.status || "");
    if (["cancelled", "delivered", "completed"].includes(bookingStatus)) {
      if (action === "complete" && bookingStatus !== "cancelled") {
        return {
          bookingId,
          tripRole: (booking.tripRole || "primary") as TripRole,
          parentBookingId: String(booking.parentBookingId || ""),
          bookingStatus,
          bookingPatch: {},
        };
      }
      throw new TripError(`Booking ${bookingId} is already ${bookingStatus}.`);
    }

    const keys = lockKeys(driverId, plate);
    const locks = await Promise.all(keys.map((key) => tx.get(doc(db, LOCKS, key))));
    const lockedIds = locks.flatMap((l) => (l.data()?.bookingIds as string[]) || []);

    const candidateIds = new Set([...lockedIds, ...queried.map((b) => b.id)]);
    candidateIds.delete(bookingId);
    const candidates = await Promise.all(
      [...candidateIds].map(async (id) => ({ id, data: (await tx.get(doc(db, "bookings", id))).data() }))
    );
    // A locked booking that has since moved to another driver no longer counts
    const active: Doc[] = candidates
      .filter((c) => c.data && isActiveTrip(c.data) && sameDriverOrVehicle(c.data, driverId, plate))
      .map((c) => ({ ...c.data, id: c.id }) as Doc);

    const now = Date.now();
    let role = (booking.tripRole || "primary") as TripRole;
    let parentBookingId = String(booking.parentBookingId || "");
    let bookingPatch: Record<string, any>;
    let dispatchStatus: string;
    let holdsLock = true;

    if (action === "accept") {
      if (dispatch.status !== "pending_acceptance") {
        if (isActiveTrip(booking)) {
          return { bookingId, tripRole: role, parentBookingId, bookingStatus, bookingPatch: {} };
        }
        throw new TripError("This job is no longer waiting for acceptance.");
      }
      ({ role, parentBookingId } = decideRole(booking, active));
      dispatchStatus = "in_transit";
      bookingPatch = {
        status: "in_transit",
        driverTripStatus: "accepted",
        tripRole: role,
        parentBookingId,
        acceptedAt: now,
        rideStartedAt: now,
        loadedAt: 0,
        rideEndedAt: 0,
        assignedDriverId: driverId,
        assignedDriverName: String(driver.name || booking.assignedDriverName || ""),
        assignedDriverPhone: String(driver.phone || booking.assignedDriverPhone || ""),
        assignedPlate: plate,
      };
    } else if (action === "decline") {
      if (dispatch.status !== "pending_acceptance") throw new TripError("Only a new job can be declined.");
      dispatchStatus = "declined";
      holdsLock = false;
      bookingPatch = { driverTripStatus: "declined" };
    } else if (action === "loaded") {
      if (!isActiveTrip(booking)) throw new TripError("Accept the job before marking it loaded.");
      if (booking.loadedAt) {
        return { bookingId, tripRole: role, parentBookingId, bookingStatus, bookingPatch: {} };
      }
      dispatchStatus = "goods_collected";
      bookingPatch = { status: "in_transit", driverTripStatus: "loaded", loadedAt: now };
    } else if (action === "collect_cash") {
      if (externalOwner) throw new TripError("The vehicle owner collects this fare. Nothing to record.");
      if (!isActiveTrip(booking) || !booking.loadedAt) throw new TripError("Cash is recorded at drop-off, after loading.");
      if (booking.paymentSlipStatus === "pending_review") {
        throw new TripError("A bank slip for this booking is waiting for Admin review.");
      }
      const due = outstandingAmount({ ...booking, id: bookingId, externalOwnerId: "" });
      if (!(Number(booking.quotedAmount) > 0)) throw new TripError("No fare has been quoted for this booking.");
      if (due <= 0) {
        return { bookingId, tripRole: role, parentBookingId, bookingStatus, bookingPatch: {} };
      }
      dispatchStatus = String(dispatch.status);
      const hasAdvance = Number(booking.advanceAmount) > 0;
      bookingPatch = {
        ...(hasAdvance
          ? { finalPaymentMethod: "cash_manual", finalPaymentAt: now }
          : { paymentMethod: "cash_manual", advanceAmount: Number(booking.quotedAmount) }),
        paymentApprovedAt: Number(booking.paymentApprovedAt) || now,
        paymentSlipStatus: "manual_approved",
        pendingAmount: 0,
        cashCollectedAt: now,
        cashCollectedBy: driverId,
        cashCollectedAmount: due,
      };
    } else if (action === "complete") {
      if (!isActiveTrip(booking)) throw new TripError("This trip is not in progress.");
      if (!booking.loadedAt) throw new TripError("Mark the load as Loaded before marking it Dropped.");
      const isPaid =
        Boolean(externalOwner) ||
        (Number(booking.quotedAmount) > 0 &&
          outstandingAmount({ ...booking, id: bookingId, externalOwnerId: "" }) === 0);
      dispatchStatus = "completed";
      holdsLock = false;
      bookingPatch = {
        status: isPaid ? "completed" : "delivered",
        driverTripStatus: "completed",
        rideEndedAt: now,
        externalOwnerId: externalOwner?.id || "",
      };
    } else {
      throw new TripError("Unknown trip action.");
    }

    bookingPatch.updatedAt = now;
    tx.set(bookingRef, bookingPatch, { merge: true });
    tx.set(
      dispatchRef,
      {
        status: dispatchStatus,
        ...(bookingPatch.driverTripStatus ? { driverTripStatus: bookingPatch.driverTripStatus } : {}),
        ...(action === "collect_cash" ? { cashDue: 0 } : {}),
        tripRole: role,
        parentBookingId,
        ...(action === "accept" ? { acceptedAt: now, driverId, assignedPlate: plate } : {}),
        ...(action === "loaded" ? { loadedAt: now } : {}),
        ...(action === "complete" ? { rideEndedAt: now } : {}),
        updatedAt: now,
      },
      { merge: true }
    );
    if (action === "accept" || action === "complete") {
      const ids = active.map((b) => b.id);
      if (holdsLock) ids.push(bookingId);
      for (const key of keys) tx.set(doc(db, LOCKS, key), { bookingIds: ids, updatedAt: now });
    }

    return {
      bookingId,
      tripRole: role,
      parentBookingId,
      bookingStatus: String(bookingPatch.status || bookingStatus),
      bookingPatch,
    };
  });

  // Follow-ups are repairable, so a failure here must not undo the driver's action
  const followUps: Array<Promise<unknown>> = [refreshVehicleTripState(plate)];
  if (action === "complete") {
    followUps.push(closeDispatchesForBooking(bookingId, result.bookingStatus));
    followUps.push(syncHireCommission(bookingId));
  }
  for (const outcome of await Promise.allSettled(followUps)) {
    if (outcome.status === "rejected") console.error("Trip follow-up failed:", outcome.reason);
  }
  return result;
}
