/**
 * The only vehicle data visitors may see. Fields are copied one by one, so owner
 * names, NIC numbers, driver names, driver IDs and phone numbers never leave the
 * server, even if new fields are added to the stored records.
 */
import { db, collection, doc, getDoc, getDocs, query, where } from "@/lib/fs-server";
import { isOutsideRecord, plateKey } from "@/lib/vehicle-docs";

/** A position older than this is no longer shown (allows for weak signal). */
const STALE_AFTER_MS = 15 * 60 * 1000;

type Data = Record<string, any>;

/** Phone numbers and NIC numbers typed into free text are removed too. */
const text = (v: unknown) =>
  String(v ?? "")
    .replace(/(?:\+?94|0)[\s-]?7\d(?:[\s-]?\d){7}/g, "")
    .replace(/\b(?:\d{9}[vVxX]|\d{12})\b/g, "")
    .trim();

const number = (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : undefined);

const millis = (v: any): number =>
  typeof v === "number" ? v : typeof v?.toMillis === "function" ? v.toMillis() : Number(v?.seconds) * 1000 || 0;

const rawPhotos = (data: Data): string[] => {
  const list = Array.isArray(data.images) && data.images.length > 0 ? data.images : [data.imageUrl];
  return list.filter((i: unknown): i is string => typeof i === "string" && Boolean(i) && !i.startsWith("/img"));
};

/** Uploaded photos are linked rather than embedded, keeping the list small. */
const photos = (id: string, data: Data) =>
  rawPhotos(data).map((image, n) =>
    image.startsWith("data:")
      ? `/api/lorries/photo?id=${encodeURIComponent(id)}&n=${n}&v=${image.length}`
      : image
  );

function toPublic(id: string, data: Data) {
  const plate = String(data.plate || data.vehiclePlate || data.vehicleNumber || id.replace(/^lorry-/i, ""))
    .trim()
    .toUpperCase();
  const images = photos(id, data);
  const outside = isOutsideRecord(data);
  return {
    // Some older records are keyed by Driver ID, so the ID is rebuilt from the plate
    id: id.startsWith("lorry-") ? id : `lorry-${plateKey(plate).toLowerCase()}`,
    plate,
    route: text(data.route),
    vehicleType: text(data.vehicleType || data.type),
    capacity: text(data.capacity || data.availableCapacityKg || data.availableSpace),
    maxWeight: text(data.maxWeight),
    imageUrl: images[0] || "",
    images,
    description: text(data.description),
    startLocation: text(data.startLocation || data.baseCity),
    endLocation: text(data.endLocation),
    travelRoute: text(data.travelRoute),
    viaWaypoints: Array.isArray(data.viaWaypoints)
      ? data.viaWaypoints.map((w: Data) => ({ name: text(w?.name), lat: Number(w?.lat), lng: Number(w?.lng) }))
      : [],
    startLat: number(data.startLat),
    startLng: number(data.startLng),
    endLat: number(data.endLat),
    endLng: number(data.endLng),
    emptyTime: text(data.emptyTime),
    returnRoute: text(data.returnRoute),
    finalDestination: text(data.destination || data.finalDestination),
    availableSpace: text(data.availableSpace),
    availableCapacityKg: text(data.availableWeight || data.availableCapacityKg),
    hasFreezer: Boolean(data.freezer ?? data.hasFreezer),
    hasHelper: Boolean(data.helper ?? data.hasHelper),
    lat: number(data.lat) ?? 6.9271,
    lng: number(data.lng) ?? 79.8612,
    heading: Number(data.heading) || 0,
    speedKmH: Number(data.speedKmH) || 0,
    status: data.status === "on_trip" ? "on_trip" : data.status === "offline" ? "offline" : "empty",
    lastUpdated: text(data.lastUpdated) || "Available",
    updatedAt: millis(data.updatedAt) || Date.now(),
    isOnline: data.isOnline !== false,
    isLive: data.isLive === true,
    isAvailable: data.isAvailable !== false,
    isOutsideLorry: outside,
    ownershipType: outside ? "outside" : "company",
  };
}

export type PublicLorry = ReturnType<typeof toPublic>;

/** Every registered vehicle, one per plate. */
export async function publicFleet(): Promise<PublicLorry[]> {
  const snap = await getDocs(collection(db, "lorries_registry"));
  const byPlate = new Map<string, PublicLorry>();
  for (const d of snap.docs) {
    const lorry = toPublic(d.id, d.data());
    const key = plateKey(lorry.plate);
    if (key && (!byPlate.has(key) || d.id.startsWith("lorry-"))) byPlate.set(key, lorry);
  }
  return Array.from(byPlate.values());
}

let liveCache: { at: number; value: Promise<PublicLorry[]> } | null = null;

async function readLive(): Promise<PublicLorry[]> {
  const [live, mirror] = await Promise.all(
    ["lorries_live", "lorries"].map((name) => getDocs(query(collection(db, name), where("isLive", "==", true))))
  );
  const now = Date.now();
  const byPlate = new Map<string, PublicLorry>();
  for (const d of [...live.docs, ...mirror.docs]) {
    const lorry = toPublic(d.id, d.data());
    const key = plateKey(lorry.plate);
    if (!key || byPlate.has(key) || lorry.status === "offline") continue;
    if (now - lorry.updatedAt > STALE_AFTER_MS) continue;
    byPlate.set(key, lorry);
  }
  return Array.from(byPlate.values());
}

/** Vehicles broadcasting now. Shared by requests arriving within a few seconds. */
export function publicLiveLorries(): Promise<PublicLorry[]> {
  if (!liveCache || Date.now() - liveCache.at > 4000) {
    const value = readLive();
    liveCache = { at: Date.now(), value };
    value.catch(() => (liveCache = null));
  }
  return liveCache.value;
}

/** One uploaded vehicle photo, decoded. Only raster images are served. */
export async function publicPhoto(id: string, index: number): Promise<{ type: string; bytes: Buffer } | null> {
  if (!id || id.includes("/") || !Number.isInteger(index) || index < 0 || index > 9) return null;
  const slug = id.replace(/^lorry-/i, "");
  for (const name of ["lorries_registry", "lorries"]) {
    for (const docId of new Set([id, slug.toUpperCase()])) {
      const snap = await getDoc(doc(db, name, docId));
      if (!snap.exists()) continue;
      const match = rawPhotos(snap.data())[index]?.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (match) return { type: match[1], bytes: Buffer.from(match[2], "base64") };
    }
  }
  return null;
}
