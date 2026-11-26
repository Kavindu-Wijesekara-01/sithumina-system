import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import {
  getAllStoredLorries,
  getAllFleetVehicles,
  deleteLorryFromStore,
  upsertLorryInStore,
} from "@/lib/server-store";
import { db } from "@/lib/fs-server";
import { collection, getDocs, doc, setDoc, deleteDoc } from "@/lib/fs-server";

function mapFirestoreLorryDoc(d: any) {
  const data = d.data();
  const cleanId = (d.id || "").replace(/^lorry-/i, "").toUpperCase();
  const plate = (data.plate || data.vehiclePlate || data.vehicleNumber || cleanId)
    .toString()
    .trim()
    .toUpperCase();

  const realImages = Array.isArray(data.images)
    ? data.images.filter((img: string) => img && typeof img === "string" && !img.startsWith("/img"))
    : [];
  const realImageUrl =
    data.imageUrl && typeof data.imageUrl === "string" && !data.imageUrl.startsWith("/img")
      ? data.imageUrl
      : realImages[0] || "";

  let parsedUpdatedMs = Date.now();
  if (typeof data.updatedAt === "number") {
    parsedUpdatedMs = data.updatedAt;
  } else if (typeof data.updatedAt?.toMillis === "function") {
    parsedUpdatedMs = data.updatedAt.toMillis();
  } else if (typeof data.updatedAt?.seconds === "number") {
    parsedUpdatedMs = data.updatedAt.seconds * 1000;
  }

  const rawDrvName = (data.riderName || data.driverName || data.ownerName || "").toString().trim();
  const cleanDrvName =
    rawDrvName && rawDrvName !== "Driver" && rawDrvName !== "Unassigned" ? rawDrvName : "";

  return {
    id: d.id,
    plate,
    route: data.route || (data.startLocation && data.endLocation ? `${data.startLocation} → ${data.endLocation}` : ""),
    driverName: cleanDrvName,
    driverPhone: (data.riderPhone || data.driverPhone || data.phone || "").toString().trim(),
    driverId: data.riderUid || data.driverId || cleanId,
    vehicleType: data.vehicleType || data.type || "",
    capacity: data.capacity || data.availableCapacityKg || data.availableSpace || "",
    maxWeight: data.maxWeight || "",
    imageUrl: realImageUrl,
    images: realImages.length > 0 ? realImages : realImageUrl ? [realImageUrl] : [],
    description: data.description || "",
    startLocation: data.startLocation || data.baseCity || "",
    endLocation: data.endLocation || "",
    travelRoute: data.travelRoute || "",
    emptyTime: data.emptyTime || "",
    returnRoute: data.returnRoute || "",
    finalDestination: data.destination || data.finalDestination || "",
    availableSpace: data.availableSpace || "",
    availableCapacityKg: data.availableWeight || data.availableCapacityKg || "",
    hasFreezer: !!(data.freezer ?? data.hasFreezer),
    hasHelper: !!(data.helper ?? data.hasHelper),
    lat: Number.isFinite(Number(data.lat)) ? Number(data.lat) : 6.9271,
    lng: Number.isFinite(Number(data.lng)) ? Number(data.lng) : 79.8612,
    heading: Number(data.heading) || 0,
    speedKmH: Number(data.speedKmH) || 0,
    status: data.status || "empty",
    lastUpdated: data.lastUpdated || "Available",
    isOnline: data.isOnline !== false,
    isLive: data.isLive === true,
    updatedAt: parsedUpdatedMs,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (type === "fleet" || type === "all") {
    try {
      const snap = await getDocs(collection(db, "lorries_registry"));
      const byPlate = new Map<string, any>();
      snap.docs.forEach((d) => {
        const mapped = mapFirestoreLorryDoc(d);
        const key = (mapped.plate || mapped.id).toUpperCase();
        if (!byPlate.has(key) || d.id.startsWith("lorry-")) {
          byPlate.set(key, mapped);
        }
      });
      return NextResponse.json({ success: true, lorries: Array.from(byPlate.values()) });
    } catch (err) {
      console.warn("Firestore fleet GET fallback to local store:", err);
      const lorries = await getAllFleetVehicles();
      return NextResponse.json({ success: true, lorries });
    }
  }

  // Live lorries mode (empty/on_trip broadcasts ONLY — never return parked fleet assets here)
  try {
    const now = Date.now();
    const HEARTBEAT_STALE_MS = 180_000;
    const [liveSnap, lorriesSnap] = await Promise.all([
      getDocs(collection(db, "lorries_live")),
      getDocs(collection(db, "lorries")),
    ]);

    const merged = new Map<string, any>();
    const isActivelyLive = (mapped: any) => {
      if (mapped.isLive !== true || mapped.status === "offline") return false;
      const updateMs = Number(mapped.updatedAt) || 0;
      if (updateMs > 0 && now - updateMs > HEARTBEAT_STALE_MS) return false;
      return true;
    };

    liveSnap.docs.forEach((d) => {
      const mapped = mapFirestoreLorryDoc(d);
      if (isActivelyLive(mapped)) {
        merged.set((mapped.plate || mapped.id).toUpperCase(), mapped);
      }
    });

    lorriesSnap.docs.forEach((d) => {
      const mapped = mapFirestoreLorryDoc(d);
      const key = (mapped.plate || mapped.id).toUpperCase();
      if (!merged.has(key) && isActivelyLive(mapped)) {
        merged.set(key, mapped);
      }
    });

    return NextResponse.json({ success: true, lorries: Array.from(merged.values()) });
  } catch (err) {
    console.warn("Firestore live lorries GET fallback to local store:", err);
    const lorries = await getAllStoredLorries();
    return NextResponse.json({ success: true, lorries });
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
        createdAt: Date.now(),
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
        const body = await request.json();
        id = body?.id;
      } catch {}
    }
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Lorry id required" },
        { status: 400 }
      );
    }

    const deleted = await deleteLorryFromStore(id);

    const rawTrim = id.trim();
    const cleanAlnum = rawTrim.replace(/^lorry-/i, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const candidateDocIds = Array.from(
      new Set([
        rawTrim,
        `lorry-${cleanAlnum}`,
        rawTrim.replace(/^lorry-/i, "").toUpperCase(),
        cleanAlnum,
      ].filter(Boolean))
    );

    try {
      for (const candidate of candidateDocIds) {
        await deleteDoc(doc(db, "lorries_registry", candidate)).catch(() => {});
        await deleteDoc(doc(db, "lorries", candidate)).catch(() => {});
        await deleteDoc(doc(db, "lorries_live", candidate)).catch(() => {});
      }
    } catch (e) {
      console.warn("Firestore delete lorry notice:", e);
    }

    return NextResponse.json({ success: true, deleted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete lorry";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
