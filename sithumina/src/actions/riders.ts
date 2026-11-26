"use server";

import { ActionResult } from "./types";
import { authorize } from "@/lib/auth/server";
import { RiderError, removeRider, saveRider, setRiderActive, type RiderInput } from "@/lib/riders";
import { FleetError, removeFleetVehicle, saveFleetVehicle, type FleetVehicleInput } from "@/lib/fleet-vehicles";

function failure(context: string, err: unknown): { success: false; error: string } {
  if (err instanceof RiderError || err instanceof FleetError) return { success: false, error: err.message };
  console.error(`${context} error:`, err);
  return { success: false, error: "Could not save the change. Please try again." };
}

export async function addRiderAction(input: RiderInput): Promise<ActionResult<{ driverId: string }>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    // New riders always receive the next ID from the counter
    const saved = await saveRider({ ...input, driverId: undefined }, { requireFleetVehicle: true });
    return { success: true, data: { driverId: saved.driverId } };
  } catch (err) {
    return failure("addRiderAction", err);
  }
}

export async function deleteRiderAction(driverId: string): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    await removeRider(driverId);
    return { success: true, data: true };
  } catch (err) {
    return failure("deleteRiderAction", err);
  }
}

export async function setRiderActiveAction(driverId: string, active: boolean): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    await setRiderActive(driverId, active);
    return { success: true, data: true };
  } catch (err) {
    return failure("setRiderActiveAction", err);
  }
}

export async function saveFleetVehicleAction(
  input: FleetVehicleInput,
  isNew: boolean
): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    await saveFleetVehicle(input, { isNew });
    return { success: true, data: true };
  } catch (err) {
    return failure("saveFleetVehicleAction", err);
  }
}

export async function deleteFleetVehicleAction(plate: string): Promise<ActionResult<boolean>> {
  const auth = await authorize("admin");
  if (!auth.ok) return auth.denied;
  try {
    await removeFleetVehicle(plate);
    return { success: true, data: true };
  } catch (err) {
    return failure("deleteFleetVehicleAction", err);
  }
}
