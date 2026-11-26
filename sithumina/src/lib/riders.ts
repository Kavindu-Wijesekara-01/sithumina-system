/**
 * Company riders. Not a "use server" module: callers apply their own role checks.
 *
 *  - Rider IDs (R-n) come from counters/rider_ids and are never issued twice.
 *  - Phone, NIC and vehicle are unique across riders and outside owners.
 *  - The assigned vehicle is linked in lorries_registry and lorries.
 *  - Removing a rider also removes their sign-in.
 */
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from "@/lib/fs-server";
import { deleteAccount, revokeSessions } from "@/lib/auth/accounts";
import { findOutsideOwnerByPlate } from "@/lib/outside-owners";
import { findVehicleDocs, isOutsideRecord, lorryDocId, plateKey } from "@/lib/vehicle-docs";

export class RiderError extends Error {}

const FIRST_RIDER_NUMBER = 10;
const KEYS = "rider_keys";
const COUNTER = ["counters", "rider_ids"] as const;

export interface RiderInput {
  /** Only used by clients that choose their own ID; the web leaves it empty. */
  driverId?: string;
  name: string;
  phone: string;
  nic?: string;
  plate?: string;
  vehicleType?: string;
  route?: string;
  active?: boolean;
}

const phoneKey = (v: unknown) => String(v || "").replace(/\D/g, "").slice(-9);
const nicKey = (v: unknown) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const riderNumber = (id: string) => Number(id.match(/^R-(\d+)$/i)?.[1] || 0);
export const cleanDriverId = (v: unknown) => String(v || "").trim().toUpperCase();
const isValidId = (id: string) => /^[A-Z0-9-]{2,40}$/.test(id);

const lockIds = (phone: string, nic: string, plate: string) =>
  [
    phoneKey(phone) && { id: `phone_${phoneKey(phone)}`, label: "Phone number" },
    nicKey(nic) && { id: `nic_${nicKey(nic)}`, label: "NIC" },
    plateKey(plate) && { id: `plate_${plateKey(plate)}`, label: "Vehicle" },
  ].filter(Boolean) as Array<{ id: string; label: string }>;

const unlinked = () => ({ rider: "Unassigned", driverName: "", driverId: "", driverPhone: "", updatedAt: Date.now() });

/**
 * Create a rider, or update one when `input.driverId` names an existing rider
 * with the same phone number. Returns the saved Driver ID.
 */
export async function saveRider(
  input: RiderInput,
  options: { requireFleetVehicle?: boolean } = {}
): Promise<{ driverId: string; created: boolean }> {
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  const nic = String(input.nic || "").trim().toUpperCase();
  const plate = String(input.plate || "").trim().toUpperCase();
  const requested = cleanDriverId(input.driverId);

  if (name.length < 2) throw new RiderError("Enter the rider's full name.");
  if (phone.replace(/\D/g, "").length < 9) throw new RiderError("Enter a valid mobile number.");
  if (nic && !/^(\d{9}[VX]|\d{12})$/.test(nicKey(nic))) {
    throw new RiderError("Enter a valid NIC (9 digits with V or X, or 12 digits).");
  }
  if (requested && !isValidId(requested)) throw new RiderError("The Rider ID may use letters, numbers and dashes.");

  const [drivers, owners] = await Promise.all([
    getDocs(collection(db, "drivers")),
    getDocs(collection(db, "outside_employees")),
  ]);

  const existing = requested ? drivers.docs.find((d) => d.id.toUpperCase() === requested) : undefined;
  if (existing && phoneKey(existing.data().phone) !== phoneKey(phone)) {
    throw new RiderError(`Rider ID ${requested} is already in use.`);
  }
  if (requested && owners.docs.some((d) => d.id.toUpperCase() === requested)) {
    throw new RiderError(`ID ${requested} belongs to an outside owner.`);
  }

  const others = [
    ...drivers.docs.map((d) => ({ id: d.id, data: d.data(), nic: d.data().nic, plate: d.data().plate })),
    ...owners.docs.map((d) => ({ id: d.id, data: d.data(), nic: d.data().idNumber, plate: d.data().plateNumber })),
  ].filter((o) => o.id.toUpperCase() !== requested);
  for (const other of others) {
    const who = `${other.id}${other.data.name ? ` - ${other.data.name}` : ""}`;
    if (phoneKey(other.data.phone) === phoneKey(phone)) {
      throw new RiderError(`Phone number already registered to ${who}.`);
    }
    if (nic && nicKey(other.nic) === nicKey(nic)) throw new RiderError(`NIC already registered to ${who}.`);
    if (plate && plateKey(other.plate) === plateKey(plate)) {
      throw new RiderError(`Vehicle ${plate} is already assigned to ${who}.`);
    }
  }

  const [registry, mirrors, owner] = await Promise.all([
    plate ? findVehicleDocs("lorries_registry", plate) : Promise.resolve([]),
    plate ? findVehicleDocs("lorries", plate) : Promise.resolve([]),
    plate ? findOutsideOwnerByPlate(plate) : Promise.resolve(null),
  ]);
  if (owner || registry.some((v) => isOutsideRecord(v.data))) {
    throw new RiderError(`Vehicle ${plate} belongs to an outside owner.`);
  }
  if (plate && registry.length === 0 && options.requireFleetVehicle) {
    throw new RiderError(`Vehicle ${plate} is not in Fleet Lorries. Add it there first.`);
  }

  const highest = drivers.docs.reduce((max, d) => Math.max(max, riderNumber(d.id)), FIRST_RIDER_NUMBER - 1);
  const locks = lockIds(phone, nic, plate);

  const saved = await runTransaction(db, async (tx) => {
    const counterRef = doc(db, ...COUNTER);
    const [counter, ...held] = await Promise.all([
      tx.get(counterRef),
      ...locks.map((l) => tx.get(doc(db, KEYS, l.id))),
    ]);

    let last = Math.max(Number(counter.data()?.last) || 0, highest);
    let id = requested;
    if (!id) {
      do {
        last += 1;
      } while ((await tx.get(doc(db, "drivers", `R-${last}`))).exists());
      id = `R-${last}`;
    }

    // A lock only counts while its holder still exists (two saves at once)
    for (let i = 0; i < locks.length; i++) {
      const holder = String(held[i].data()?.driverId || "");
      if (holder && holder !== id && (await tx.get(doc(db, "drivers", holder))).exists()) {
        throw new RiderError(`${locks[i].label} already registered to ${holder}.`);
      }
    }
    const current = await tx.get(doc(db, "drivers", id));
    if (current.exists() && !requested) throw new RiderError("Please try again.");

    const now = Date.now();
    const lorryId = registry.find((v) => v.id.startsWith("lorry-"))?.id || (plate ? lorryDocId(plate) : lorryDocId(id));

    tx.set(counterRef, { last: Math.max(last, riderNumber(id)), updatedAt: now }, { merge: true });
    tx.set(
      doc(db, "drivers", id),
      {
        driverId: id,
        name,
        phone,
        nic,
        plate,
        vehicleType: String(input.vehicleType || "").trim() || "Lorry Fleet",
        route: String(input.route || "").trim() || "Island-wide Fleet",
        lorryId,
        active: input.active !== false,
        ...(current.exists() ? {} : { createdAt: now }),
        updatedAt: now,
      },
      { merge: true }
    );
    for (const l of locks) tx.set(doc(db, KEYS, l.id), { driverId: id, createdAt: now });

    const link = { rider: name, driverName: name, driverId: id, driverPhone: phone, updatedAt: now };
    for (const v of registry) tx.set(v.ref, link, { merge: true });
    if (registry.length > 0) {
      if (mirrors.length === 0) {
        tx.set(doc(db, "lorries", lorryId), { id: lorryId, plate, status: "empty", ...link }, { merge: true });
      }
      for (const v of mirrors) tx.set(v.ref, link, { merge: true });
    }
    return { driverId: id, created: !current.exists() };
  });

  // An account left over from an earlier holder of this ID must never work again
  if (saved.created) await deleteAccount(saved.driverId);
  await unlinkVehicles(saved.driverId, plate);
  return saved;
}

/** Clear this rider from every vehicle other than `keepPlate`. */
async function unlinkVehicles(driverId: string, keepPlate = ""): Promise<void> {
  const snaps = await Promise.all(
    (["lorries_registry", "lorries"] as const).map(async (name) => ({
      name,
      rows: (await getDocs(query(collection(db, name), where("driverId", "==", driverId)))).docs,
    }))
  );
  const stale = snaps.flatMap(({ name, rows }) =>
    rows
      .filter((d) => !keepPlate || plateKey(d.data().plate) !== plateKey(keepPlate))
      .map((d) => doc(db, name, d.id))
  );
  if (stale.length === 0) return;
  const batch = writeBatch(db);
  for (const ref of stale) batch.set(ref, unlinked(), { merge: true });
  await batch.commit();
}

/**
 * Remove a rider: their sign-in first (so a failure leaves the record visible
 * and the removal can be retried), then the record, locks and vehicle links.
 */
export async function removeRider(rawId: string): Promise<void> {
  const id = cleanDriverId(rawId);
  if (!isValidId(id)) throw new RiderError("Driver ID is required.");
  const owner = await getDoc(doc(db, "outside_employees", id));
  if (owner.exists()) {
    throw new RiderError(`${id} is an outside owner. Manage them under Outside Employees.`);
  }

  await deleteAccount(id);

  const held = await getDocs(query(collection(db, KEYS), where("driverId", "==", id)));
  const batch = writeBatch(db);
  batch.delete(doc(db, "drivers", id));
  for (const lock of held.docs) batch.delete(doc(db, KEYS, lock.id));
  await batch.commit();

  // Remember the highest number ever used, even if it was just removed
  const number = riderNumber(id);
  if (number) {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, ...COUNTER);
      const last = Number((await tx.get(ref)).data()?.last) || 0;
      if (number > last) tx.set(ref, { last: number, updatedAt: Date.now() }, { merge: true });
    });
  }
  await unlinkVehicles(id);
}

export async function setRiderActive(rawId: string, active: boolean): Promise<void> {
  const id = cleanDriverId(rawId);
  const ref = doc(db, "drivers", id);
  if (!isValidId(id) || !(await getDoc(ref)).exists()) throw new RiderError("Rider not found.");
  await setDoc(ref, { active, updatedAt: Date.now() }, { merge: true });
  if (!active) await revokeSessions(id);
}

/**
 * The `drivers/{ID}` record sign-in depends on. Older outside owners (for
 * example ST-OUT-1001) were saved without one, so it is rebuilt from the owner.
 */
export async function ensureDriverRecord(rawId: string): Promise<Record<string, any> | null> {
  const id = cleanDriverId(rawId);
  if (!isValidId(id)) return null;
  const [driver, owner] = await Promise.all([
    getDoc(doc(db, "drivers", id)),
    getDoc(doc(db, "outside_employees", id)),
  ]);
  if (driver.exists()) return driver.data();
  if (!owner.exists()) return null;

  const o = owner.data();
  const plate = String(o.plateNumber || "").trim().toUpperCase();
  const now = Date.now();
  const record = {
    id,
    driverId: id,
    name: String(o.name || id),
    phone: String(o.phone || ""),
    nic: String(o.idNumber || ""),
    plate,
    vehicleType: String(o.vehicleType || "Lorry"),
    route: `${o.baseCity || "Colombo"} – Island-wide`,
    lorryId: lorryDocId(plate || id),
    active: !o.status || o.status === "active",
    isOutsideDriver: true,
    createdAt: Number(o.createdAt) || now,
    updatedAt: now,
  };
  const vehicles = plate
    ? (await Promise.all([findVehicleDocs("lorries_registry", plate), findVehicleDocs("lorries", plate)])).flat()
    : [];
  const batch = writeBatch(db);
  batch.set(doc(db, "drivers", id), record);
  batch.set(doc(db, "outside_employees", id), { driverId: id, updatedAt: now }, { merge: true });
  for (const v of vehicles) {
    batch.set(v.ref, { isOutsideLorry: true, ownershipType: "outside", driverId: id, updatedAt: now }, { merge: true });
  }
  await batch.commit();
  return record;
}
