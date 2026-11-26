/**
 * Finds the records that describe one vehicle. A vehicle may be stored under its
 * `lorry-<plate>` ID, its plate, or an older random ID, so all three are checked
 * with targeted reads instead of scanning the collection.
 */
import { db, collection, doc, getDoc, getDocs, query, where, type Ref } from "@/lib/fs-server";

export const plateKey = (v: unknown) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const lorryDocId = (plate: string) => `lorry-${plateKey(plate).toLowerCase()}`;

export interface VehicleDoc {
  ref: Ref;
  id: string;
  data: Record<string, any>;
}

export async function findVehicleDocs(
  collectionName: "lorries" | "lorries_registry" | "lorries_live",
  plate: string
): Promise<VehicleDoc[]> {
  const clean = String(plate || "").trim().toUpperCase();
  const key = plateKey(clean);
  if (!key) return [];
  const ids = Array.from(
    new Set([lorryDocId(clean), clean, key, key.toLowerCase()].filter((id) => id && !id.includes("/")))
  );
  const [direct, queried] = await Promise.all([
    Promise.all(ids.map((id) => getDoc(doc(db, collectionName, id)))),
    getDocs(query(collection(db, collectionName), where("plate", "==", clean))),
  ]);
  const found = new Map<string, VehicleDoc>();
  for (const snap of [...direct, ...queried.docs]) {
    if (snap.exists()) {
      found.set(snap.id, { ref: doc(db, collectionName, snap.id), id: snap.id, data: snap.data() });
    }
  }
  return Array.from(found.values());
}

export const isOutsideRecord = (data: Record<string, any>) =>
  Boolean(data.isOutsideLorry || data.ownershipType === "outside");
