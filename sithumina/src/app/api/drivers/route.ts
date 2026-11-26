import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { getAllStoredDrivers } from "@/lib/server-store";
import { RiderError, removeRider, saveRider } from "@/lib/riders";
import { db } from "@/lib/fs-server";
import { collection, getDocs } from "@/lib/fs-server";

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

export async function GET() {
  const auth = await authorize("admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  try {
    const snap = await getDocs(collection(db, "drivers"));
    const drivers = snap.docs.map((d) => {
      const data = d.data();
      const driverId = (data.driverId || d.id).toString();
      const plate = data.plate || "";
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
    drivers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return NextResponse.json({ success: true, drivers });
  } catch (err) {
    console.warn("Firestore drivers GET fallback to local store:", err);
    const drivers = await getAllStoredDrivers();
    return NextResponse.json({ success: true, drivers });
  }
}

function failure(error: unknown, fallback: string) {
  const known = error instanceof RiderError;
  if (!known) console.error(fallback, error);
  return NextResponse.json(
    { success: false, error: known ? error.message : fallback },
    { status: known ? 409 : 500 }
  );
}

export async function POST(request: Request) {
  const auth = await authorize("admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  try {
    const body = await request.json();
    const saved = await saveRider({
      driverId: body.driverId,
      name: body.name,
      phone: body.phone,
      nic: body.nic,
      plate: body.plate || body.vehicleNumber,
      vehicleType: body.vehicleType,
      route: body.route,
      active: body.active,
    });
    return NextResponse.json({ success: true, driver: { driverId: saved.driverId } });
  } catch (error) {
    return failure(error, "Failed to register driver.");
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize("admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");
    if (!id) {
      try {
        id = (await request.json())?.id;
      } catch {}
    }
    await removeRider(id || "");
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(error, "Failed to delete driver.");
  }
}
