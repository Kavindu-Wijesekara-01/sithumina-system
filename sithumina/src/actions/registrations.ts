"use server";

import { revalidatePath } from "next/cache";
import {
  addRegistrationInStore,
  getAllStoredRegistrations,
  updateRegistrationStatusInStore,
  registerDriverInStore,
  StoredRegistration,
} from "@/lib/server-store";
import { ActionResult, VehicleRegistrationActionInput } from "./types";
import { db } from "@/lib/firebase";
import { collection, addDoc, doc, setDoc, updateDoc, getDocs } from "firebase/firestore";

/**
 * Server Action for vehicle owners / fleet partners to register their lorry.
 */
export async function registerVehicleAction(
  input: VehicleRegistrationActionInput
): Promise<ActionResult<{ id: string; registration: StoredRegistration }>> {
  try {
    const ownerName = input.ownerName?.trim();
    const phone = input.phone?.trim();
    const plateNumber = input.plateNumber?.trim().toUpperCase();
    const vehicleType = input.vehicleType?.trim() || "14ft Lorry";
    const baseCity = input.baseCity?.trim() || "Colombo";
    const capacity = input.capacity?.trim() || "Standard Load";
    const province = input.province?.trim() || "Western";

    if (!ownerName) {
      return { success: false, error: "Owner or company name is required." };
    }
    if (!phone || phone.length < 8) {
      return { success: false, error: "A valid phone number is required." };
    }
    if (!plateNumber) {
      return { success: false, error: "Vehicle plate number is required (e.g. WP LK-1234)." };
    }

    const registration = addRegistrationInStore({
      ownerName,
      phone,
      vehicleNumber: plateNumber,
      vehicleType,
      capacity,
      province,
    });

    // Cloud Firestore sync (primary source of truth)
    try {
      const docRef = doc(db, "vehicle_registrations", registration.id);
      await setDoc(
        docRef,
        {
          id: registration.id,
          ownerName,
          phone,
          plateNumber,
          vehicleNumber: plateNumber,
          vehicleType,
          baseCity,
          capacity,
          province,
          status: "pending",
          createdAt: registration.createdAt,
          updatedAt: registration.createdAt,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn("Firestore registration sync notice:", cloudErr);
    }

    try {
      revalidatePath("/register-vehicle");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: {
        id: registration.id,
        registration,
      },
      message: "Vehicle registration submitted successfully.",
    };
  } catch (err: unknown) {
    console.error("registerVehicleAction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to register vehicle.",
    };
  }
}

/**
 * Server Action to get all vehicle registrations directly from Firestore.
 */
export async function getAllRegistrationsAction(): Promise<ActionResult<StoredRegistration[]>> {
  try {
    const colRef = collection(db, "vehicle_registrations");
    const snap = await getDocs(colRef);
    const registrations = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as unknown as StoredRegistration[];

    return {
      success: true,
      data: registrations,
    };
  } catch (err: unknown) {
    console.error("getAllRegistrationsAction error:", err);
    return {
      success: false,
      error: "Failed to retrieve registrations.",
    };
  }
}

/**
 * Server Action to update vehicle registration status.
 */
export async function updateRegistrationStatusAction(
  id: string,
  status: "pending" | "approved" | "rejected"
): Promise<ActionResult<StoredRegistration>> {
  try {
    if (!id) {
      return { success: false, error: "Registration ID is required." };
    }

    const updated = updateRegistrationStatusInStore(id, status);

    try {
      const docRef = doc(db, "vehicle_registrations", id);
      await updateDoc(docRef, { status, updatedAt: Date.now() });
    } catch (e) {
      console.warn("Firestore registration status update notice:", e);
    }

    try {
      revalidatePath("/register-vehicle");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: updated || ({ id, status } as StoredRegistration),
    };
  } catch (err: unknown) {
    console.error("updateRegistrationStatusAction error:", err);
    return {
      success: false,
      error: "Failed to update registration status.",
    };
  }
}

/**
 * Server Action to approve a registration and instantly inject it into the active live fleet.
 */
export async function approveRegistrationAndAddToFleetAction(
  id: string,
  route?: string
): Promise<ActionResult<StoredRegistration>> {
  try {
    const reg = updateRegistrationStatusInStore(id, "approved");

    try {
      const docRef = doc(db, "vehicle_registrations", id);
      await updateDoc(docRef, { status: "approved", updatedAt: Date.now() });
    } catch (e) {
      console.warn("Firestore approve registration notice:", e);
    }

    // Add to active fleet
    if (reg) {
      registerDriverInStore({
        name: reg.ownerName,
        phone: reg.phone,
        plate: reg.vehicleNumber,
        vehicleType: reg.vehicleType,
        route: route || `${reg.province} – Island-wide`,
      });

      const plate = (reg.vehicleNumber || "").toUpperCase().trim();
      if (plate) {
        try {
          await setDoc(
            doc(db, "lorries_registry", plate),
            {
              plateNumber: plate,
              vehicleType: reg.vehicleType || "Lorry",
              ownerName: reg.ownerName,
              phone: reg.phone,
              capacity: reg.capacity || "Standard",
              province: reg.province || "Western",
              route: route || `${reg.province} – Island-wide`,
              status: "available",
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        } catch (e) {
          console.warn("Firestore lorries_registry sync notice:", e);
        }
      }
    }

    try {
      revalidatePath("/");
      revalidatePath("/find-empty-lorry");
      revalidatePath("/register-vehicle");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: reg || ({ id, status: "approved" } as StoredRegistration),
      message: "Registration approved and vehicle added to live map.",
    };
  } catch (err: unknown) {
    console.error("approveRegistrationAndAddToFleetAction error:", err);
    return {
      success: false,
      error: "Failed to approve registration.",
    };
  }
}
