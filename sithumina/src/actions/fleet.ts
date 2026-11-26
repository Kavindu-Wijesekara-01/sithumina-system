"use server";

import { authorize, driverOwnsVehicle, FORBIDDEN } from "@/lib/auth/server";
import { revalidatePath } from "next/cache";
import {
  updateLorryStatusInStore,
  updateLorryGpsInStore,
  StoredLorry,
} from "@/lib/server-store";
import { ActionResult } from "./types";
import { db } from "@/lib/fs-server";
import { doc, setDoc } from "@/lib/fs-server";

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
