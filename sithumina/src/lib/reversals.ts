/**
 * Refund records for money received on a booking that is cancelled or deleted.
 */
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { paymentEntries, isExternalBooking, type LedgerBooking } from "@/lib/ledger";
import { findOutsideOwnerByPlate } from "@/lib/outside-owners";

const COL = "payment_reversals";

/** Call with the booking as it was before cancellation. Does nothing if unpaid. */
export async function recordReversal(
  booking: LedgerBooking & { customerName?: string },
  reason: string
): Promise<void> {
  const entries = paymentEntries(booking);
  if (entries.length === 0) return;
  const external =
    isExternalBooking(booking) ||
    Boolean(await findOutsideOwnerByPlate(String(booking.assignedPlate || "")));
  const now = Date.now();
  const id = `rev-${booking.id}-${now}`;
  await setDoc(doc(db, COL, id), {
    id,
    bookingId: booking.id,
    customerName: booking.customerName || "",
    driverId: booking.assignedDriverId || "",
    driverName: booking.assignedDriverName || "",
    plate: booking.assignedPlate || "",
    entries,
    external,
    reason,
    refundedAt: now,
    voided: false,
  });
}

/** A restored booking counts its own payments again, so its refunds are voided. */
export async function voidReversals(bookingId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, COL), where("bookingId", "==", bookingId)));
  await Promise.all(snap.docs.map((d) => updateDoc(doc(db, COL, d.id), { voided: true })));
}
