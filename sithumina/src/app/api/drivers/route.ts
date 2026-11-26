import { NextResponse } from "next/server";
import {
  getAllStoredDrivers,
  registerDriverInStore,
  deleteDriverFromStore,
} from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { allocateDriverId } from "@/lib/driver-ids";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, plate, vehicleNumber, vehicleType, route, driverId, nic, active } = body;
    const finalPlate = (plate || vehicleNumber || "").toString().trim().toUpperCase();

    if (!name || !phone || !finalPlate) {
      return NextResponse.json(
        { success: false, error: "Name, phone, and plate are required." },
        { status: 400 }
      );
    }

    const result = await registerDriverInStore({
      name,
      phone,
      plate: finalPlate,
      vehicleType: vehicleType || "Lorry Fleet",
      route: route || "Island-wide Fleet",
      driverId: driverId || (await allocateDriverId()),
    });

    const cleanId = result.driver.driverId.trim().toUpperCase();
    try {
      await setDoc(
        doc(db, "drivers", cleanId),
        {
          driverId: cleanId,
          name: result.driver.name,
          phone: result.driver.phone,
          nic: (nic || "").toString().trim(),
          plate: result.driver.plate,
          vehicleType: result.driver.vehicleType,
          route: result.driver.route,
          lorryId: result.driver.lorryId,
          active: active !== false,
          createdAt: result.driver.createdAt,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("Firestore sync notice for driver POST:", e);
    }

    return NextResponse.json({
      success: true,
      driver: result.driver,
      lorry: result.lorry,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to register driver.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
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
        { success: false, error: "Driver ID is required." },
        { status: 400 }
      );
    }

    const cleanUpper = id.trim().toUpperCase();
    await deleteDriverFromStore(id);

    try {
      await deleteDoc(doc(db, "drivers", cleanUpper));
      if (id.trim() !== cleanUpper) {
        await deleteDoc(doc(db, "drivers", id.trim()));
      }
      const snap = await getDocs(collection(db, "drivers"));
      for (const d of snap.docs) {
        const data = d.data();
        const dId = String(data.driverId || d.id).toUpperCase();
        const dPlate = String(data.plate || "").toUpperCase();
        if (dId === cleanUpper || dPlate === cleanUpper) {
          await deleteDoc(doc(db, "drivers", d.id));
        }
      }
    } catch (e) {
      console.warn("Firestore delete driver notice:", e);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete driver.";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
