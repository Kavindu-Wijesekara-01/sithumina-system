/**
 * Why the office cancelled or deleted a booking.
 *
 *  - complaints/{auto}          permanent audit record, shown to the Admin
 *  - booking_notices/{booking}  what the customer is told, kept even after the
 *                               booking itself has been deleted
 *
 * Not a "use server" module: callers apply their own role checks.
 */
import { db, collection, deleteDoc, doc, getDocs, query, setDoc, where } from "@/lib/fs-server";
import { normalizePhoneNumber } from "@/lib/phone-utils";
import type { StoredBooking, StoredComplaint } from "@/lib/server-store";

const NOTICES = "booking_notices";

export type CancellationType = "cancelled" | "deleted";

export interface BookingNotice {
  bookingId: string;
  type: CancellationType;
  reason: string;
  customerPhone: string;
  pickupCity: string;
  deliveryCity: string;
  date: string;
  vehicleType: string;
  at: number;
}

export async function recordCancellation(
  type: CancellationType,
  bookingId: string,
  booking: Partial<StoredBooking> | undefined,
  reason: string,
  by = "Admin"
): Promise<string> {
  const at = Date.now();
  const id = `complaint-${at}-${Math.floor(100 + Math.random() * 900)}`;
  const customerPhone = normalizePhoneNumber(booking?.customerPhone || "");
  const trip = {
    pickupCity: booking?.pickupCity || "",
    deliveryCity: booking?.deliveryCity || "",
    date: booking?.date || "",
    vehicleType: booking?.vehicleType || "",
  };
  const complaint: StoredComplaint = {
    id,
    bookingId,
    type,
    customerName: booking?.customerName || "Customer",
    customerPhone: booking?.customerPhone || "",
    customerIdNumber: booking?.customerIdNumber || "",
    ...trip,
    assignedDriverName: booking?.assignedDriverName || "",
    assignedPlate: booking?.assignedPlate || "",
    quotedAmount: booking?.quotedAmount ?? 0,
    distanceKm: booking?.distanceKm ?? 0,
    reason,
    deletedAt: at,
    deletedBy: by,
  };
  await Promise.all([
    setDoc(doc(db, "complaints", id), JSON.parse(JSON.stringify(complaint))),
    customerPhone
      ? setDoc(doc(db, NOTICES, bookingId), { bookingId, type, reason, customerPhone, ...trip, at })
      : null,
  ]);
  return id;
}

/** A restored booking no longer carries its cancellation. */
export async function clearCancellation(bookingId: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, NOTICES, bookingId)),
    setDoc(doc(db, "bookings", bookingId), { cancelReason: "", cancelledAt: 0 }, { merge: true }),
  ]);
}

export async function listCustomerNotices(phone: string): Promise<BookingNotice[]> {
  const key = normalizePhoneNumber(phone);
  if (!key) return [];
  const snap = await getDocs(query(collection(db, NOTICES), where("customerPhone", "==", key)));
  return snap.docs.map((d) => d.data() as BookingNotice).sort((a, b) => b.at - a.at);
}
