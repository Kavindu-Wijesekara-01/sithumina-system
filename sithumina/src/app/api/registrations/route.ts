import { NextResponse } from "next/server";
import {
  getAllStoredRegistrations,
  addRegistrationInStore,
  updateRegistrationStatusInStore,
} from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { OwnerError, approveOwnerRegistration } from "@/lib/outside-owners";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";

export async function GET() {
  try {
    const colRef = collection(db, "vehicle_registrations");
    const snap = await getDocs(colRef);
    const registrations = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    return NextResponse.json({ success: true, registrations });
  } catch {
    return NextResponse.json({ success: true, registrations: [] });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ownerName, phone, vehicleNumber, vehicleType, capacity, province } = body;

    if (!ownerName || !phone || !vehicleNumber) {
      return NextResponse.json(
        { success: false, error: "Owner name, phone, and vehicle number are required." },
        { status: 400 }
      );
    }

    const registration = await addRegistrationInStore({
      ownerName,
      phone,
      vehicleNumber,
      vehicleType: vehicleType || "Lorry",
      capacity: capacity || "Standard",
      province: province || "Western Province",
    });

    // Sync to Firestore
    try {
      const docRef = doc(db, "vehicle_registrations", registration.id);
      await setDoc(
        docRef,
        {
          id: registration.id,
          ownerName,
          phone,
          plateNumber: vehicleNumber,
          vehicleNumber,
          vehicleType: vehicleType || "Lorry",
          capacity: capacity || "Standard",
          province: province || "Western Province",
          status: "pending",
          createdAt: registration.createdAt,
          updatedAt: registration.createdAt,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("Firestore sync notice for registration POST:", e);
    }

    return NextResponse.json({ success: true, registration });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to submit vehicle registration";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Registration ID and status are required." },
        { status: 400 }
      );
    }

    if (status === "approved") {
      try {
        const { employee } = await approveOwnerRegistration(id);
        await updateRegistrationStatusInStore(id, status);
        return NextResponse.json({
          success: true,
          registration: { id, status, outsideEmployeeId: employee.id },
        });
      } catch (e) {
        console.error("Registration approval failed:", e);
        return NextResponse.json(
          { success: false, error: e instanceof OwnerError ? e.message : "Failed to approve registration." },
          { status: e instanceof OwnerError ? 409 : 500 }
        );
      }
    }

    const updated = await updateRegistrationStatusInStore(id, status);

    // Sync status to Firestore
    try {
      const docRef = doc(db, "vehicle_registrations", id);
      await setDoc(
        docRef,
        {
          status,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("Firestore sync notice for registration PATCH:", e);
    }

    return NextResponse.json({ success: true, registration: updated || { id, status } });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update registration";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
