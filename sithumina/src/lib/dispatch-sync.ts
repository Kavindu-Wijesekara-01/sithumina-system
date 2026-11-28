/**
 * Keeps Driver App dispatch documents in step with the booking lifecycle.
 */
import { db } from "@/lib/fs-server";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "@/lib/fs-server";

const FINISHED = ["delivered", "completed"];
const NOT_YET_DISPATCHABLE = ["pending", "awaiting_payment", "payment_submitted"];

/**
 * Close (or withdraw) every dispatch belonging to a booking, including the
 * primary `dispatch-{bookingId}` document. No-op for in-progress statuses.
 */
export async function closeDispatchesForBooking(bookingId: string, bookingStatus: string): Promise<void> {
  const isFinished = FINISHED.includes(bookingStatus);
  const isCancelled = bookingStatus === "cancelled";
  const isWithdrawn = NOT_YET_DISPATCHABLE.includes(bookingStatus);
  if (!bookingId || (!isFinished && !isCancelled && !isWithdrawn)) return;

  const targets = new Map<string, string>(); // doc id -> current status
  const primaryId = `dispatch-${bookingId}`;
  const primary = await getDoc(doc(db, "dispatches", primaryId));
  if (primary.exists()) targets.set(primaryId, String(primary.data().status || ""));

  const related = await getDocs(query(collection(db, "dispatches"), where("bookingId", "==", bookingId)));
  related.forEach((d) => targets.set(d.id, String(d.data().status || "")));

  const nextStatus = isFinished ? "completed" : isCancelled ? "cancelled" : "withdrawn";

  for (const [id, current] of targets) {
    if (current === nextStatus) continue;
    // Only pull back a job the driver has not accepted yet; never interrupt a trip in progress
    if (isWithdrawn && !["scheduled", "pending_acceptance", "declined"].includes(current)) continue;
    await updateDoc(doc(db, "dispatches", id), { status: nextStatus, ringActive: false, updatedAt: Date.now() });
  }
}
