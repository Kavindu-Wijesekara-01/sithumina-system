import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { getAllStoredDrivers } from "@/lib/server-store";
import { db } from "@/lib/fs-server";
import { collection, getDocs, doc, setDoc } from "@/lib/fs-server";

function resolveDriverLorryId(rawLorryId: unknown, plate: unknown, driverId: unknown): string {
  const cleanLorry = String(rawLorryId || "").trim().toLowerCase().replace(/\//g, "-");
  if (cleanLorry && cleanLorry !== "lorry-" && !cleanLorry.includes("/")) {
    return cleanLorry;
  }
  const plateSlug = String(plate || "").trim().replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (plateSlug) return `lorry-${plateSlug}`;
  const idSlug = String(driverId || "").trim().replace(/[^a-z0-9]/gi, "").toLowerCase();
  return idSlug ? `lorry-${idSlug}` : "";
}

function matchDriver(list: any[], cleanId: string) {
  const cleanCompact = cleanId.replace(/\s+/g, "");
  return list.find(
    (d) =>
      String(d.driverId || "").toUpperCase() === cleanId ||
      String(d.plate || "").toUpperCase() === cleanId ||
      (d.phone && String(d.phone).replace(/\s+/g, "").toUpperCase() === cleanCompact)
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize("admin", "driver");
  if (!auth.ok) return deniedResponse(auth.denied);
  if (auth.session.role === "driver" && (await params).id.toUpperCase() !== auth.session.driverId) {
    return deniedResponse(FORBIDDEN);
  }
  const { id } = await params;
  const cleanId = decodeURIComponent(id || "").trim().toUpperCase();
  if (!cleanId) {
    return NextResponse.json(
      { success: false, error: "Driver identifier required" },
      { status: 400 }
    );
  }

  let driver: any = null;
  try {
    const snap = await getDocs(collection(db, "drivers"));
    const fsDrivers = snap.docs.map((d) => {
      const data = d.data();
      const driverId = String(data.driverId || d.id);
      const plate = String(data.plate || "");
      return {
        id: d.id,
        driverId,
        name: data.name || "",
        phone: data.phone || "",
        nic: data.nic || "",
        plate,
        vehicleType: data.vehicleType || "",
        route: data.route || "",
        lorryId: resolveDriverLorryId(data.lorryId, plate, driverId),
        active: data.active !== false,
        createdAt: Number(data.createdAt) || 0,
      };
    });
    driver = matchDriver(fsDrivers, cleanId);
  } catch (err) {
    console.warn("Firestore driver lookup fallback:", err);
    const drivers = await getAllStoredDrivers();
    driver = matchDriver(drivers, cleanId);
  }

  if (!driver) {
    return NextResponse.json(
      { success: false, error: "Driver not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, driver });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize("admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  try {
    const { id } = await params;
    const cleanId = decodeURIComponent(id || "").trim().toUpperCase().replace(/\//g, "-");
    const rawUpdates = await request.json();
    if (!cleanId) {
      return NextResponse.json({ success: false, error: "Driver ID required" }, { status: 400 });
    }
    const updates = { ...rawUpdates };
    const safeLorryId = resolveDriverLorryId(updates.lorryId, updates.plate, cleanId);
    if (updates.lorryId !== undefined && (!updates.lorryId || !String(updates.lorryId).trim())) {
      if (safeLorryId) {
        updates.lorryId = safeLorryId;
      } else {
        delete updates.lorryId;
      }
    } else if (safeLorryId && updates.plate && !updates.lorryId) {
      updates.lorryId = safeLorryId;
    }
    await setDoc(
      doc(db, "drivers", cleanId),
      { ...updates, updatedAt: Date.now() },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update driver.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
