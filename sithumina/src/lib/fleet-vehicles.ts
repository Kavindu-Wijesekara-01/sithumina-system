/**
 * Company fleet vehicles. Not a "use server" module: callers apply their own
 * role checks. Outside vehicles are managed with their owners.
 */
import { db, collection, doc, getDocs, query, where, writeBatch } from "@/lib/fs-server";
import { findOutsideOwnerByPlate } from "@/lib/outside-owners";
import { findVehicleDocs, isOutsideRecord, lorryDocId, plateKey } from "@/lib/vehicle-docs";

export class FleetError extends Error {}

export interface FleetVehicleInput {
  plate: string;
  vehicleType: string;
  capacity?: string;
  maxWeight?: string;
  baseCity?: string;
  description?: string;
  images?: string[];
  /** Rider to put on this vehicle; empty leaves it unassigned. */
  driverId?: string;
}

/** Firestore refuses documents over 1 MiB. */
const MAX_PHOTO_CHARACTERS = 900_000;

export async function saveFleetVehicle(input: FleetVehicleInput, options: { isNew: boolean }): Promise<void> {
  const plate = String(input.plate || "").trim().toUpperCase();
  if (!plateKey(plate) || plate.includes("/")) throw new FleetError("Enter a valid vehicle number.");
  const images = (input.images || []).filter((i) => typeof i === "string" && i && !i.startsWith("/img")).slice(0, 3);
  if (images.join("").length > MAX_PHOTO_CHARACTERS) {
    throw new FleetError("The photos are too large. Use smaller images (about 200 KB each).");
  }

  const driverId = String(input.driverId || "").trim().toUpperCase();
  const [registry, mirrors, owner, drivers] = await Promise.all([
    findVehicleDocs("lorries_registry", plate),
    findVehicleDocs("lorries", plate),
    findOutsideOwnerByPlate(plate),
    getDocs(collection(db, "drivers")),
  ]);
  if (owner || registry.some((v) => isOutsideRecord(v.data))) {
    throw new FleetError(`Vehicle ${plate} belongs to an outside owner. Manage it under Outside Employees.`);
  }
  if (options.isNew && registry.length > 0) throw new FleetError(`Vehicle ${plate} is already in the fleet.`);

  const rider = driverId ? drivers.docs.find((d) => d.id.toUpperCase() === driverId) : undefined;
  if (driverId && !rider) throw new FleetError("The selected rider no longer exists.");
  if (rider?.data().isOutsideDriver) throw new FleetError("An outside owner cannot drive a company vehicle.");

  const id = lorryDocId(plate);
  const now = Date.now();
  const name = rider ? String(rider.data().name || "") : "";
  const details = {
    plate,
    vehicleType: String(input.vehicleType || "").trim() || "Lorry",
    capacity: String(input.capacity || "").trim(),
    maxWeight: String(input.maxWeight || "").trim(),
    baseCity: String(input.baseCity || "").trim(),
    startLocation: String(input.baseCity || "").trim(),
    description: String(input.description || "").trim(),
    images,
    imageUrl: images[0] || "",
    ownershipType: "company",
    rider: name || "Unassigned",
    driverName: name,
    driverId: rider ? rider.id : "",
    driverPhone: rider ? String(rider.data().phone || "") : "",
    updatedAt: now,
  };

  const batch = writeBatch(db);
  const targets = (found: typeof registry, name_: "lorries_registry" | "lorries") =>
    found.length > 0 ? found.map((v) => v.ref) : [doc(db, name_, id)];
  // A new record starts empty; editing never resets the status or creation date
  const created = (found: typeof registry) => (found.length === 0 ? { id, status: "empty", createdAt: now } : {});
  for (const ref of targets(registry, "lorries_registry")) {
    batch.set(ref, { ...details, ...created(registry) }, { merge: true });
  }
  for (const ref of targets(mirrors, "lorries")) {
    batch.set(ref, { ...details, ...created(mirrors) }, { merge: true });
  }

  // One rider per vehicle and one vehicle per rider
  for (const d of drivers.docs) {
    if (rider && d.id === rider.id) {
      batch.set(doc(db, "drivers", d.id), { plate, lorryId: id, vehicleType: details.vehicleType, updatedAt: now }, { merge: true });
    } else if (plateKey(d.data().plate) === plateKey(plate)) {
      batch.set(doc(db, "drivers", d.id), { plate: "", updatedAt: now }, { merge: true });
    }
  }
  if (rider) {
    batch.set(doc(db, "rider_keys", `plate_${plateKey(plate)}`), { driverId: rider.id, createdAt: now });
  } else {
    batch.delete(doc(db, "rider_keys", `plate_${plateKey(plate)}`));
  }
  await batch.commit();

  if (rider) {
    // Take the rider off any vehicle they had before
    const previous = await Promise.all(
      (["lorries_registry", "lorries"] as const).map(async (collectionName) => ({
        collectionName,
        rows: (await getDocs(query(collection(db, collectionName), where("driverId", "==", rider.id)))).docs,
      }))
    );
    const moved = writeBatch(db);
    let count = 0;
    for (const { collectionName, rows } of previous) {
      for (const d of rows) {
        if (plateKey(d.data().plate) === plateKey(plate)) continue;
        moved.set(
          doc(db, collectionName, d.id),
          { rider: "Unassigned", driverName: "", driverId: "", driverPhone: "", updatedAt: now },
          { merge: true }
        );
        count++;
      }
    }
    if (count) await moved.commit();
  }
}

export async function removeFleetVehicle(identifier: string): Promise<void> {
  const raw = String(identifier || "").trim();
  const plate = raw.replace(/^lorry-/i, "").toUpperCase();
  if (!plateKey(plate)) throw new FleetError("Vehicle number is required.");
  const [registry, mirrors, live, owner, drivers] = await Promise.all([
    findVehicleDocs("lorries_registry", plate),
    findVehicleDocs("lorries", plate),
    findVehicleDocs("lorries_live", plate),
    findOutsideOwnerByPlate(plate),
    getDocs(collection(db, "drivers")),
  ]);
  if (owner || registry.some((v) => isOutsideRecord(v.data))) {
    throw new FleetError("Outside vehicles are managed under Outside Employees.");
  }
  const batch = writeBatch(db);
  for (const v of [...registry, ...mirrors, ...live]) batch.delete(v.ref);
  for (const d of drivers.docs) {
    if (plateKey(d.data().plate) === plateKey(plate)) {
      batch.set(doc(db, "drivers", d.id), { plate: "", updatedAt: Date.now() }, { merge: true });
    }
  }
  batch.delete(doc(db, "rider_keys", `plate_${plateKey(plate)}`));
  await batch.commit();
}
