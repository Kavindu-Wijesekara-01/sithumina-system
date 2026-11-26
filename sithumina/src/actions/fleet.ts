"use server";

import { authorize, driverOwnsVehicle, FORBIDDEN } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import {
  getAllStoredLorries,
  updateLorryStatusInStore,
  updateLorryGpsInStore,
  registerDriverInStore,
  deleteLorryFromStore,
  StoredLorry,
  StoredDriver,
} from "@/lib/server-store";
import { ActionResult, DriverRegistrationInput } from "./types";
import { db } from "@/lib/fs-server";
import { allocateDriverId } from "@/lib/driver-ids";
import { collection, doc, getDocs, setDoc, deleteDoc } from "@/lib/fs-server";

/**
 * Server Action to fetch all actively LIVE lorries directly from Firestore.
 */
export async function getLorriesAction(): Promise<ActionResult<StoredLorry[]>> {
  try {
    try {
      const now = Date.now();
      const HEARTBEAT_STALE_MS = 180_000;
      const [liveSnap, lorriesSnap] = await Promise.all([
        getDocs(collection(db, "lorries_live")),
        getDocs(collection(db, "lorries")),
      ]);
      const merged = new Map<string, StoredLorry>();

      const pushIfLive = (d: any) => {
        const data = d.data();
        if (!data || data.isLive !== true || data.status === "offline") return;
        let updatedMs = Date.now();
        if (typeof data.updatedAt === "number") updatedMs = data.updatedAt;
        else if (typeof data.updatedAt?.toMillis === "function") updatedMs = data.updatedAt.toMillis();
        else if (typeof data.updatedAt?.seconds === "number") updatedMs = data.updatedAt.seconds * 1000;
        if (updatedMs > 0 && now - updatedMs > HEARTBEAT_STALE_MS) return;

        const cleanPlate = String(data.plate || d.id).trim().toUpperCase();
        if (merged.has(cleanPlate)) return;
        merged.set(cleanPlate, {
          id: d.id,
          plate: cleanPlate,
          route: data.route || "",
          driverName: data.riderName || data.driverName || "",
          driverPhone: data.riderPhone || data.driverPhone || "",
          driverId: data.riderUid || data.driverId || d.id,
          vehicleType: data.vehicleType || "Lorry Fleet",
          capacity: data.capacity || data.availableCapacityKg || "",
          maxWeight: data.maxWeight || "",
          lat: Number.isFinite(Number(data.lat)) ? Number(data.lat) : 6.9271,
          lng: Number.isFinite(Number(data.lng)) ? Number(data.lng) : 79.8612,
          heading: Number(data.heading) || 0,
          speedKmH: Number(data.speedKmH) || 0,
          status: data.status === "on_trip" ? "on_trip" : "empty",
          lastUpdated: data.lastUpdated || "Just now",
          updatedAt: updatedMs,
          isOnline: true,
          isLive: true,
        });
      };

      liveSnap.forEach(pushIfLive);
      lorriesSnap.forEach(pushIfLive);

      return { success: true, data: Array.from(merged.values()) };
    } catch {
      const lorries = await getAllStoredLorries();
      return { success: true, data: lorries };
    }
  } catch (err: unknown) {
    console.error("getLorriesAction error:", err);
    return {
      success: false,
      error: "Failed to retrieve lorries.",
    };
  }
}

/**
 * Server Action to toggle or update lorry operational status (empty / on_trip).
 */
export async function updateLorryStatusAction(
  identifier: string,
  status: "empty" | "on_trip"
): Promise<ActionResult<StoredLorry>> {
  const auth = await authorize("admin", "driver");
  if (!auth.ok) return auth.denied;
  if (auth.session.role === "driver" && !(await driverOwnsVehicle(auth.session, identifier))) return FORBIDDEN;
  try {
    if (!identifier) {
      return { success: false, error: "Vehicle identifier is required." };
    }

    const updatedLocal = await updateLorryStatusInStore(identifier, status);
    let firestoreOk = false;
    try {
      const rawCleanId = (updatedLocal?.id || identifier.trim().toLowerCase()).replace(/\//g, "-");
      const cleanId = rawCleanId && rawCleanId !== "lorry-" ? rawCleanId : "";
      const liveKey = (updatedLocal?.plate || identifier)
        .replace(/^lorry-/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const payload = { status, lastUpdated: "Just now", updatedAt: Date.now() };
      if (cleanId && !cleanId.includes("/")) {
        await setDoc(doc(db, "lorries", cleanId), payload, { merge: true });
        firestoreOk = true;
      }
      if (liveKey && !liveKey.includes("/")) {
        await setDoc(doc(db, "lorries_live", liveKey), payload, { merge: true });
        firestoreOk = true;
      }
    } catch {}

    if (!updatedLocal && !firestoreOk) {
      return { success: false, error: "Lorry not found in fleet." };
    }

    try {
      revalidatePath("/");
      revalidatePath("/find-empty-lorry");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    const fallbackLorry: StoredLorry = updatedLocal || {
      id: identifier.trim().toLowerCase(),
      plate: identifier.trim().toUpperCase(),
      route: "",
      driverName: "",
      driverId: identifier.trim().toUpperCase(),
      vehicleType: "Lorry Fleet",
      lat: 6.9271,
      lng: 79.8612,
      heading: 0,
      speedKmH: 0,
      status,
      lastUpdated: "Just now",
      updatedAt: Date.now(),
    };

    return {
      success: true,
      data: fallbackLorry,
    };
  } catch (err: unknown) {
    console.error("updateLorryStatusAction error:", err);
    return {
      success: false,
      error: "Failed to update lorry status.",
    };
  }
}

/**
 * Server Action to update live GPS telemetry coordinates for a lorry.
 */
export async function updateLorryLocationAction(
  identifier: string,
  lat: number,
  lng: number,
  heading: number = 0,
  speedKmH: number = 0
): Promise<ActionResult<StoredLorry>> {
  const auth = await authorize("admin", "driver");
  if (!auth.ok) return auth.denied;
  if (auth.session.role === "driver" && !(await driverOwnsVehicle(auth.session, identifier))) return FORBIDDEN;
  try {
    if (!identifier) {
      return { success: false, error: "Vehicle identifier is required." };
    }
    const numLat = Number(lat);
    const numLng = Number(lng);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLng)) {
      return { success: false, error: "Valid latitude and longitude numbers are required." };
    }

    const updated = await updateLorryGpsInStore(identifier, numLat, numLng, heading, speedKmH);

    try {
      const liveKey = (updated.plate || identifier)
        .replace(/^lorry-/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const fsPayload = {
        lat: updated.lat,
        lng: updated.lng,
        heading: updated.heading,
        speedKmH: updated.speedKmH,
        isLive: true,
        isOnline: true,
        lastUpdated: "Just now",
        updatedAt: Date.now(),
      };
      if (updated.id && !updated.id.includes("/")) {
        await setDoc(doc(db, "lorries", updated.id), fsPayload, { merge: true });
      }
      if (liveKey && !liveKey.includes("/")) {
        await setDoc(doc(db, "lorries_live", liveKey), fsPayload, { merge: true });
      }
    } catch {}

    return {
      success: true,
      data: updated,
    };
  } catch (err: unknown) {
    console.error("updateLorryLocationAction error:", err);
    return {
      success: false,
      error: "Failed to update lorry GPS location.",
    };
  }
}

/**
 * Server Action to register a driver and attach their lorry to the active fleet.
 */
export async function registerDriverAndLorryAction(
  input: DriverRegistrationInput
): Promise<ActionResult<{ driver: StoredDriver; lorry: StoredLorry }>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    const name = input.name?.trim();
    const phone = input.phone?.trim();
    const plate = input.plate?.trim().toUpperCase();

    if (!name || !phone || !plate) {
      return { success: false, error: "Driver name, phone number, and vehicle plate are required." };
    }

    const result = await registerDriverInStore({
      name,
      phone,
      plate,
      vehicleType: input.vehicleType || "Lorry Fleet",
      route: input.route || "Island-wide Fleet",
      driverId: input.driverId || (await allocateDriverId()),
    });

    try {
      await setDoc(doc(db, "drivers", result.driver.driverId), result.driver, { merge: true });
      await setDoc(doc(db, "lorries", result.lorry.id), result.lorry, { merge: true });
    } catch {}

    try {
      revalidatePath("/");
      revalidatePath("/find-empty-lorry");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: result,
      message: "Driver and vehicle registered into active fleet.",
    };
  } catch (err: unknown) {
    console.error("registerDriverAndLorryAction error:", err);
    return {
      success: false,
      error: "Failed to register driver and lorry.",
    };
  }
}

/**
 * Server Action to delete a lorry from the fleet.
 */
export async function deleteLorryAction(id: string): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    if (!id) {
      return { success: false, error: "Lorry ID is required." };
    }

    const deleted = await deleteLorryFromStore(id);

    const rawTrim = id.trim();
    const cleanAlnum = rawTrim.replace(/^lorry-/i, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const candidates = Array.from(
      new Set([rawTrim, `lorry-${cleanAlnum}`, rawTrim.replace(/^lorry-/i, "").toUpperCase(), cleanAlnum].filter(Boolean))
    );

    try {
      for (const candidate of candidates) {
        await deleteDoc(doc(db, "lorries_registry", candidate)).catch(() => {});
        await deleteDoc(doc(db, "lorries", candidate)).catch(() => {});
        await deleteDoc(doc(db, "lorries_live", candidate)).catch(() => {});
      }
    } catch {}

    try {
      revalidatePath("/");
      revalidatePath("/find-empty-lorry");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: deleted,
    };
  } catch (err: unknown) {
    console.error("deleteLorryAction error:", err);
    return {
      success: false,
      error: "Failed to delete lorry from fleet.",
    };
  }
}
