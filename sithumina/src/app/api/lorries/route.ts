import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { upsertLorryInStore } from "@/lib/server-store";
import { db, doc, setDoc } from "@/lib/fs-server";
import { publicFleet, publicLiveLorries } from "@/lib/public-fleet";
import { FleetError, removeFleetVehicle } from "@/lib/fleet-vehicles";

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type");
  try {
    const lorries = type === "fleet" || type === "all" ? await publicFleet() : await publicLiveLorries();
    // Briefly cached at the edge so many visitors share one database read
    return NextResponse.json(
      { success: true, lorries },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=10" } }
    );
  } catch (err) {
    console.error("Public lorry list failed:", err);
    return NextResponse.json({ success: false, error: "Vehicles could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize("admin", "driver");
  if (!auth.ok) return deniedResponse(auth.denied);
  if (auth.session.role === "driver") {
    const body = await request.clone().json().catch(() => ({}));
    const vehicle = String(body.plate || body.lorryId || body.id || "");
    if (!(await driverOwnsVehicle(auth.session, vehicle))) return deniedResponse(FORBIDDEN);
  }
  try {
    const body = await request.json();
    const {
      plate,
      route,
      driverName,
      driverPhone,
      vehicleType,
      capacity,
      maxWeight,
      baseCity,
      imageUrl,
      images,
      description,
      status,
      driverId,
      rider,
    } = body;

    if (!plate) {
      return NextResponse.json(
        { success: false, error: "Plate number is required" },
        { status: 400 }
      );
    }

    const cleanPlate = plate.toString().trim().toUpperCase();
    const docId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;

    const realImages = Array.isArray(images)
      ? images.filter((img: string) => img && typeof img === "string" && !img.startsWith("/img"))
      : [];
    const realImageUrl =
      imageUrl && typeof imageUrl === "string" && !imageUrl.startsWith("/img")
        ? imageUrl
        : realImages[0] || "";

    const rawResolvedDriver = (driverName || rider || "").toString().trim();
    const resolvedDriverName =
      rawResolvedDriver && rawResolvedDriver !== "Driver" && rawResolvedDriver !== "Unassigned"
        ? rawResolvedDriver
        : "";

    const lorry = await upsertLorryInStore({
      id: docId,
      lorryId: docId,
      plate: cleanPlate,
      route: route || "",
      driverName: resolvedDriverName,
      driverPhone: driverPhone || "",
      vehicleType: vehicleType || "Lorry Fleet",
      capacity: capacity || "",
      maxWeight: maxWeight || "",
      imageUrl: realImageUrl,
      images: realImages.length > 0 ? realImages : undefined,
      description: description || "",
      startLocation: baseCity || "",
      status: status || "empty",
      driverId,
    });

    try {
      const fsPayload = {
        id: docId,
        plate: cleanPlate,
        vehicleType: lorry.vehicleType,
        capacity: lorry.capacity || "",
        maxWeight: lorry.maxWeight || "",
        baseCity: baseCity || lorry.startLocation || "",
        startLocation: baseCity || lorry.startLocation || "",
        description: lorry.description || "",
        images: realImages,
        imageUrl: realImageUrl,
        rider: resolvedDriverName || "Unassigned",
        driverName: resolvedDriverName,
        driverPhone: driverPhone || "",
        route: route || "",
        status: status || "empty",
        updatedAt: Date.now(),
      };
      await setDoc(doc(db, "lorries_registry", docId), fsPayload, { merge: true });
      await setDoc(doc(db, "lorries", docId), fsPayload, { merge: true });
    } catch (e) {
      console.warn("Firestore sync notice for lorry POST:", e);
    }

    return NextResponse.json({ success: true, lorry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add lorry";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
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
    await removeFleetVehicle(id || "");
    return NextResponse.json({ success: true, deleted: true });
  } catch (error: unknown) {
    const known = error instanceof FleetError;
    if (!known) console.error("Lorry delete failed:", error);
    return NextResponse.json(
      { success: false, error: known ? (error as Error).message : "Failed to delete lorry" },
      { status: known ? 409 : 500 }
    );
  }
}
