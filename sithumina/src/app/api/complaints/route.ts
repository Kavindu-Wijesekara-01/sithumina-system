import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { getAllStoredComplaints } from "@/lib/server-store";
import { db } from "@/lib/fs-server";
import { collection, getDocs, doc, deleteDoc } from "@/lib/fs-server";

export async function GET() {
  const auth = await authorize("admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  try {
    const colRef = collection(db, "complaints");
    const snap = await getDocs(colRef);
    if (!snap.empty) {
      const complaints = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          bookingId: String(data.bookingId || ""),
          customerName: String(data.customerName || ""),
          customerPhone: String(data.customerPhone || ""),
          customerIdNumber: data.customerIdNumber ? String(data.customerIdNumber) : undefined,
          pickupCity: String(data.pickupCity || ""),
          deliveryCity: String(data.deliveryCity || ""),
          date: String(data.date || data.bookingDate || ""),
          vehicleType: String(data.vehicleType || "Lorry"),
          quotedAmount: typeof data.quotedAmount === "number" ? data.quotedAmount : (Number(data.quotedAmount || data.amount) || undefined),
          distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : (Number(data.distanceKm) || undefined),
          reason: String(data.reason || "Booking deleted by admin"),
          deletedAt: Number(data.deletedAt) || (data.deletedAt ? new Date(data.deletedAt).getTime() : Date.now()),
          deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
        };
      }).sort((a, b) => (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0));

      return NextResponse.json({ success: true, complaints });
    }
    const local = await getAllStoredComplaints();
    return NextResponse.json({ success: true, complaints: local });
  } catch {
    const local = await getAllStoredComplaints();
    return NextResponse.json({ success: true, complaints: local });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: "Cancellation and deletion records are permanent." },
    { status: 405 }
  );
}
