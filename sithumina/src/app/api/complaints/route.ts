import { NextResponse } from "next/server";
import { getAllStoredComplaints, deleteStoredComplaint } from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore";

export async function GET() {
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
    const local = getAllStoredComplaints();
    return NextResponse.json({ success: true, complaints: local });
  } catch {
    const local = getAllStoredComplaints();
    return NextResponse.json({ success: true, complaints: local });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");

    if (!id) {
      try {
        const body = await request.json();
        id = body?.id;
      } catch {}
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Complaint ID is required." },
        { status: 400 }
      );
    }

    deleteStoredComplaint(id);

    try {
      await deleteDoc(doc(db, "complaints", id));
    } catch (e) {
      console.warn("Firestore delete complaint notice:", e);
    }

    return NextResponse.json({ success: true, message: "Complaint record deleted successfully." });
  } catch (error: unknown) {
    const errMessage =
      error instanceof Error ? error.message : "Failed to delete complaint record";
    return NextResponse.json({ success: false, error: errMessage }, { status: 500 });
  }
}
