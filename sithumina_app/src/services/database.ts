import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "../config/api";
import { db } from "../config/firebase";
import { SRI_LANKA_CITIES } from "../data/sri-lanka-cities";
import { doc, setDoc, deleteDoc, runTransaction, getDoc, getDocs, collection, query, where, onSnapshot, updateDoc, orderBy, limit } from "firebase/firestore";

/**
 * Recursively strips undefined keys so Firestore setDoc / updateDoc never fails with
 * "Unsupported field value: undefined"
 */
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
        clean[key] = sanitizeForFirestore(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

const CITIES_COORDS: Record<string, [number, number]> = {
  colombo: [6.9271, 79.8612],
  gampaha: [7.0917, 79.9998],
  kalutara: [6.5854, 79.9607],
  kaluthara: [6.5854, 79.9607],
  kalugalahena: [6.341, 80.5695],
  kalugala: [6.341, 80.5695],
  morawaka: [6.2625, 80.4903],
  deniyaya: [6.3439, 80.5606],
  matara: [5.9549, 80.555],
  mathara: [5.9549, 80.555],
  galle: [6.0535, 80.221],
  kandy: [7.2906, 80.6337],
  kurunegala: [7.4863, 80.3623],
  negombo: [7.2008, 79.8736],
  ratnapura: [6.6828, 80.4034],
  rathnapura: [6.6828, 80.4034],
  kegalle: [7.2513, 80.3464],
  anuradhapura: [8.3114, 80.4037],
  polonnaruwa: [7.9403, 81.0188],
  badulla: [6.9934, 81.055],
  bandarawela: [6.8258, 80.9982],
  nuwaraeliya: [6.9497, 80.7891],
  hambantota: [6.1429, 81.1212],
  tangalle: [6.0243, 80.7941],
  trincomalee: [8.5874, 81.2152],
  batticaloa: [7.731, 81.6747],
  jaffna: [9.6615, 80.0255],
  vavuniya: [8.7514, 80.4971],
  dambulla: [7.8742, 80.6511],
  avissawella: [6.9538, 80.2078],
  chilaw: [7.5758, 79.7952],
  puttalam: [8.0362, 79.8283],
  monaragala: [6.8728, 81.3507],
  ampara: [7.2912, 81.6724],
  panadura: [6.7132, 79.9074],
  wadduwa: [6.6667, 79.9333],
  bandaragama: [6.7140, 79.9890],
  gelanigama: [6.6850, 80.0200],
  dodangoda: [6.5667, 80.0833],
  horana: [6.7153, 80.063],
  maharagama: [6.848, 79.9265],
  kottawa: [6.8413, 79.9654],
  nugegoda: [6.8649, 79.8997],
  kelaniya: [6.9553, 79.9224],
  wattala: [6.9895, 79.8917],
  jaela: [7.0762, 79.8911],
  katunayake: [7.1699, 79.8886],
  kadawatha: [7.0016, 79.954],
  kiribathgoda: [6.9806, 79.9304],
  malabe: [6.904, 79.9548],
  kaduwela: [6.9344, 79.9839],
  homagama: [6.8436, 80.0032],
  padukka: [6.8524, 80.0991],
  hanwella: [6.9067, 80.0827],
  piliyandala: [6.8018, 79.9227],
  kesbewa: [6.7909, 79.9482],
  moratuwa: [6.773, 79.8816],
  dehiwala: [6.8511, 79.8659],
  mountlavinia: [6.837, 79.865],
  beruwala: [6.4788, 79.9828],
  aluthgama: [6.4344, 80.0003],
  bentota: [6.4259, 80.003],
  ambalangoda: [6.2359, 80.0541],
  hikkaduwa: [6.1406, 80.1002],
  elapitiya: [6.2575, 80.1472],
  baddegama: [6.1878, 80.1837],
  akuressa: [6.0984, 80.4746],
  kamburupitiya: [6.0867, 80.5647],
  weligama: [5.9736, 80.4289],
  dikwella: [5.9667, 80.6975],
  beliatta: [6.0463, 80.7381],
  embilipitiya: [6.3377, 80.8504],
  pelmadulla: [6.6214, 80.5511],
  balangoda: [6.65, 80.7022],
  ehiliyagoda: [6.8539, 80.2603],
  kuruwita: [6.7733, 80.3697],
  deraniyagala: [6.9242, 80.3364],
  yatiyantota: [7.0347, 80.2975],
  ruwanwella: [7.0456, 80.2544],
  mawanella: [7.2525, 80.4467],
  peradeniya: [7.2606, 80.5969],
  katugastota: [7.3242, 80.6214],
  katugasthota: [7.3242, 80.6214],
  gampola: [7.1642, 80.5678],
  nawalapitiya: [7.0506, 80.5342],
  hatton: [6.8917, 80.5956],
  wattegama: [7.3503, 80.6833],
  matale: [7.4675, 80.6234],
  mathale: [7.4675, 80.6234],
};

const SINHALA_CITIES_COORDS: Record<string, [number, number]> = {
  "කොළඹ": [6.9271, 79.8612],
  "ගම්පහ": [7.0917, 79.9998],
  "කළුතර": [6.5854, 79.9607],
  "කළුගලහේන": [6.341, 80.5695],
  "කළුගල": [6.341, 80.5695],
  "මොරවක": [6.2625, 80.4903],
  "දෙනියාය": [6.3439, 80.5606],
  "මහනුවර": [7.2906, 80.6337],
  "ගාල්ල": [6.0535, 80.221],
  "මාතර": [5.9549, 80.555],
  "කුරුණෑගල": [7.4863, 80.3623],
  "රත්නපුර": [6.6828, 80.4034],
  "අනුරාධපුර": [8.3114, 80.4037],
  "පොළොන්නරුව": [7.9403, 81.0188],
  "බදුල්ල": [6.9934, 81.055],
  "මීගමුව": [7.2008, 79.8736],
  "කෑගල්ල": [7.2513, 80.3464],
  "හම්බන්තොට": [6.1429, 81.1212],
  "නුවරඑළිය": [6.9497, 80.7891],
  "ත්‍රිකුණාමලය": [8.5874, 81.2152],
  "මඩකලපුව": [7.731, 81.6747],
  "යාපනය": [9.6615, 80.0255],
  "දඹුල්ල": [7.8742, 80.6511],
  "අවිස්සාවේල්ල": [6.9538, 80.2078],
  "පානදුර": [6.7132, 79.9074],
  "වාද්දුව": [6.6667, 79.9333],
  "බණ්ඩාරගම": [6.7140, 79.9890],
  "ගෙලනිගම": [6.6850, 80.0200],
  "දොඩංගොඩ": [6.5667, 80.0833],
  "හොරණ": [6.7153, 80.063],
  "මහරගම": [6.848, 79.9265],
  "කොට්ටාව": [6.8413, 79.9654],
  "හෝමාගම": [6.8436, 80.0032],
  "බණ්ඩාරවෙල": [6.8258, 80.9982],
  "ඇඹිලිපිටිය": [6.3377, 80.8504],
  "මොරටුව": [6.773, 79.8816],
  "දෙහිවල": [6.8511, 79.8659],
  "කඩවත": [7.0016, 79.954],
  "කිරිබත්ගොඩ": [6.9806, 79.9304],
};

export function resolveCityCoordinates(txt: string): [number, number] | null {
  if (!txt || typeof txt !== "string") return null;
  const s = txt.trim();
  if (s.length === 0) return null;

  // 1. Direct Sinhala match from complete 206-city database
  for (const city of SRI_LANKA_CITIES) {
    if (city.sinhala && (s === city.sinhala || s.includes(city.sinhala) || city.sinhala.includes(s))) {
      return [city.lat, city.lng];
    }
  }

  // 2. Normalized Sinhala match (ළ/ල, ණ/න, ශ/ෂ/ස)
  const sinNorm = s.replace(/ළ/g, "ල").replace(/ණ/g, "න").replace(/[ශෂ]/g, "ස");
  for (const city of SRI_LANKA_CITIES) {
    if (city.sinhala) {
      const cNorm = city.sinhala.replace(/ළ/g, "ල").replace(/ණ/g, "න").replace(/[ශෂ]/g, "ස");
      if (sinNorm === cNorm || sinNorm.includes(cNorm) || cNorm.includes(sinNorm)) {
        return [city.lat, city.lng];
      }
    }
  }

  // 3. Exact English name match
  const lowerQ = s.toLowerCase();
  for (const city of SRI_LANKA_CITIES) {
    if (city.name.toLowerCase() === lowerQ) {
      return [city.lat, city.lng];
    }
  }

  // 4. Exact Alias match
  for (const city of SRI_LANKA_CITIES) {
    for (const alias of city.aliases) {
      if (alias.toLowerCase() === lowerQ) {
        return [city.lat, city.lng];
      }
    }
  }

  // 5. Cleaned match (without "road", "street", "town", "station", etc.)
  const clean = lowerQ
    .replace(/\b(road|rd|highway|expressway|street|st|lane|junction|junc|jn|town|city|hub|port|harbor|harbour|fort|park|station|village|estate)\b/gi, "")
    .replace(/[^a-z0-9]/g, "");

  if (clean.length >= 3) {
    for (const city of SRI_LANKA_CITIES) {
      const cClean = city.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cClean === clean) return [city.lat, city.lng];
      for (const alias of city.aliases) {
        if (alias.toLowerCase().replace(/[^a-z0-9]/g, "") === clean) {
          return [city.lat, city.lng];
        }
      }
    }
  }

  // 6. Secondary fallback to legacy tables
  if (CITIES_COORDS[clean]) return CITIES_COORDS[clean];

  for (const c in CITIES_COORDS) {
    if (clean === c || clean.startsWith(c)) {
      return CITIES_COORDS[c];
    }
  }
  return null;
}

const LOCAL_DRIVERS_KEY = "@sithumina_local_drivers_cache";

async function getCachedDrivers(): Promise<DriverRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_DRIVERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveCachedDriver(driver: DriverRecord): Promise<void> {
  try {
    const drivers = await getCachedDrivers();
    const filtered = drivers.filter((d) => d.driverId !== driver.driverId && d.plate !== driver.plate);
    filtered.unshift(driver);
    await AsyncStorage.setItem(LOCAL_DRIVERS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn("Could not cache driver locally:", err);
  }
}

/**
 * Guarantee a valid single-segment Firestore document ID for "lorries" collection.
 * Never returns "" or a path containing "/", preventing FirebaseError odd-segment crashes.
 */
export function resolveSafeLorryDocId(
  lorryId?: string,
  plate?: string,
  driverId?: string
): string {
  const cleanLorry = String(lorryId || "")
    .trim()
    .toLowerCase()
    .replace(/\//g, "-");
  if (cleanLorry && cleanLorry !== "lorry-" && !cleanLorry.includes("/")) {
    return cleanLorry;
  }

  const plateSlug = String(plate || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (plateSlug) return `lorry-${plateSlug}`;

  const driverSlug = String(driverId || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (driverSlug) return `lorry-${driverSlug}`;

  return "";
}

/**
 * Guarantee a valid single-segment Firestore document ID for "lorries_live" collection.
 */
export function resolveSafeLiveKey(
  lorryId?: string,
  plate?: string,
  driverId?: string
): string {
  const plateSlug = String(plate || "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (plateSlug) return plateSlug;

  const docId = resolveSafeLorryDocId(lorryId, plate, driverId);
  if (!docId) return "";
  return docId.replace(/^lorry-/i, "") || docId;
}

export interface DriverRecord {
  id?: string;
  driverId: string; // Unique Driver ID, e.g. ST-DRV-8204
  name: string;
  phone: string;
  plate: string;
  vehicleType: string;
  route: string;
  lorryId: string;
  active: boolean;
  createdAt: number;
}

export interface RegisterDriverInput {
  name: string;
  phone: string;
  plate: string;
  vehicleType: string;
  route: string;
}

/**
 * Generate a unique, professional Driver ID
 * Format: ST-DRV-XXXX (e.g. ST-DRV-4921)
 */
/**
 * Register a company rider through the web server, which issues the next Rider
 * ID and refuses a phone number or NIC that is already registered.
 */
export async function registerRider(input: {
  name: string;
  phone: string;
  nic?: string;
}): Promise<{ driverId?: string; error?: string }> {
  const res = await apiFetch<{ driver: { driverId: string } }>("/api/drivers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const driverId = res.data?.driver?.driverId;
  return driverId ? { driverId } : { error: res.error || "Could not register the rider." };
}

/**
 * Update an existing driver's details in local cache, Firestore, and central API
 */
export async function updateDriverInDb(
  driverId: string,
  updates: {
    name?: string;
    phone?: string;
    plate?: string;
    vehicleType?: string;
    route?: string;
    lorryId?: string;
    active?: boolean;
  }
): Promise<boolean> {
  const cleanId = driverId.trim().toUpperCase();

  // 1. Update in local storage cache
  try {
    const drivers = await getCachedDrivers();
    const idx = drivers.findIndex((d) => d.driverId.toUpperCase() === cleanId);
    if (idx >= 0) {
      drivers[idx] = {
        ...drivers[idx],
        ...updates,
      };
      await AsyncStorage.setItem(LOCAL_DRIVERS_KEY, JSON.stringify(drivers));
    }
  } catch (err) {
    console.warn("Could not update local driver cache:", err);
  }

  // 2. Update in Firestore
  try {
    const driverRef = doc(db, "drivers", cleanId);
    await setDoc(driverRef, updates, { merge: true });
  } catch (err) {
    console.warn("Could not update Firestore driver:", err);
  }

  // 3. Update via Central API if running
  try {
    await apiFetch(`/api/drivers/${encodeURIComponent(cleanId)}`, {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  } catch {}

  return true;
}

/**
 * Remove a rider. The server also deletes their sign-in and frees their lorry.
 */
export async function deleteDriverFromDb(driverId: string): Promise<{ success: boolean; error?: string }> {
  const cleanId = driverId.trim().toUpperCase();
  const res = await apiFetch(`/api/drivers?id=${encodeURIComponent(cleanId)}`, { method: "DELETE" });
  if (!res.success) return { success: false, error: res.error };
  try {
    const drivers = await getCachedDrivers();
    await AsyncStorage.setItem(
      LOCAL_DRIVERS_KEY,
      JSON.stringify(drivers.filter((d) => d.driverId.toUpperCase() !== cleanId))
    );
  } catch (err) {
    console.warn("Could not remove driver from local cache:", err);
  }
  return { success: true };
}


/**
 * Fetch all registered drivers for Admin dashboard
 * Authoritative Firestore -> API -> offline-only cache fallback.
 */
export async function getAllDrivers(): Promise<DriverRecord[]> {
  try {
    const snap = await getDocs(collection(db, "drivers"));
    const list: DriverRecord[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        driverId: String(data.driverId || d.id),
        name: String(data.name || ""),
        phone: String(data.phone || ""),
        plate: String(data.plate || ""),
        vehicleType: String(data.vehicleType || ""),
        route: String(data.route || ""),
        lorryId: resolveSafeLorryDocId(
          data.lorryId,
          data.plate,
          String(data.driverId || d.id)
        ),
        active: data.active !== false,
        createdAt: Number(data.createdAt) || 0,
      });
    });
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    await AsyncStorage.setItem(LOCAL_DRIVERS_KEY, JSON.stringify(list));
    return list;
  } catch {
    // Fall through to central API
  }

  try {
    const apiRes = await apiFetch<{ drivers: DriverRecord[] }>("/api/drivers");
    if (apiRes.success && Array.isArray(apiRes.data?.drivers)) {
      const list = apiRes.data.drivers.map((d) => ({
        ...d,
        lorryId: resolveSafeLorryDocId(d.lorryId, d.plate, d.driverId || d.id),
      }));
      await AsyncStorage.setItem(LOCAL_DRIVERS_KEY, JSON.stringify(list));
      return list;
    }
  } catch (e) {
    console.warn("API getAllDrivers notice:", e);
  }

  // Offline-only fallback
  return getCachedDrivers();
}

/**
 * Update real-time GPS coordinates of the driver's vehicle
 */
export interface LorryGpsMetadata {
  plate?: string;
  driverName?: string;
  driverId?: string;
  driverPhone?: string;
  route?: string;
  status?: "empty" | "on_trip";
  vehicleType?: string;
  capacity?: string;
  startLocation?: string;
  endLocation?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  travelRoute?: string;
  viaWaypoints?: Array<{ name: string; lat: number; lng: number }>;
  emptyTime?: string;
  returnRoute?: string;
  finalDestination?: string;
  availableSpace?: string;
  availableCapacityKg?: string;
  hasFreezer?: boolean;
  hasHelper?: boolean;
}

/**
 * Continuous GPS Coordinate update for fleet vehicle
 * Broadcasts to central Web Server and Firestore without blocking the UI.
 */
export async function updateLorryGpsLocation(
  lorryId: string,
  lat: number,
  lng: number,
  heading: number = 0,
  speedKmH: number = 0,
  meta?: LorryGpsMetadata
): Promise<void> {
  const cleanId = resolveSafeLorryDocId(lorryId, meta?.plate, meta?.driverId);
  if (!cleanId) return;
  const safeLiveId = resolveSafeLiveKey(cleanId, meta?.plate, meta?.driverId) || cleanId;

  // 1. Broadcast to Central Web Platform API (/api/lorries/[id]/location)
  apiFetch(`/api/lorries/${encodeURIComponent(cleanId)}/location`, {
    method: "POST",
    body: JSON.stringify({
      id: cleanId,
      lorryId: cleanId,
      lat,
      lng,
      heading,
      speedKmH,
      isLive: true,
      isOnline: true,
      ...(meta || {}),
    }),
  }).catch((e) => console.warn("API GPS sync notice:", e));

  // 2. Sync to Firestore with explicit active live markers
  try {
    const payload: Record<string, any> = {
      id: cleanId,
      lorryId: cleanId,
      lat,
      lng,
      heading: Math.round(heading) || 0,
      speedKmH: Math.round(speedKmH) || 0,
      isLive: true,
      isOnline: true,
      lastUpdated: "Just now",
      updatedAt: Date.now(),
    };
    if (meta?.plate) payload.plate = meta.plate;
    if (meta?.driverName) payload.driverName = meta.driverName;
    if (meta?.driverId) payload.driverId = meta.driverId;
    if (meta?.driverPhone) payload.driverPhone = meta.driverPhone;
    if (meta?.route) payload.route = meta.route;
    if (meta?.status) payload.status = meta.status;
    if (meta?.vehicleType) payload.vehicleType = meta.vehicleType;
    if (meta?.capacity) payload.capacity = meta.capacity;
    if (meta?.startLocation) payload.startLocation = meta.startLocation;
    if (meta?.endLocation) payload.endLocation = meta.endLocation;
    if (meta?.startLat !== undefined) payload.startLat = meta.startLat;
    if (meta?.startLng !== undefined) payload.startLng = meta.startLng;
    if (meta?.endLat !== undefined) payload.endLat = meta.endLat;
    if (meta?.endLng !== undefined) payload.endLng = meta.endLng;
    if (meta?.travelRoute) payload.travelRoute = meta.travelRoute;
    if (meta?.viaWaypoints && Array.isArray(meta.viaWaypoints)) payload.viaWaypoints = meta.viaWaypoints;
    if (meta?.emptyTime) payload.emptyTime = meta.emptyTime;
    if (meta?.returnRoute) payload.returnRoute = meta.returnRoute;
    if (meta?.finalDestination) payload.finalDestination = meta.finalDestination;
    if (meta?.availableSpace) payload.availableSpace = meta.availableSpace;
    if (meta?.availableCapacityKg) payload.availableCapacityKg = meta.availableCapacityKg;
    if (meta?.hasFreezer !== undefined) payload.hasFreezer = meta.hasFreezer;
    if (meta?.hasHelper !== undefined) payload.hasHelper = meta.hasHelper;

    const writes: Promise<void>[] = [
      setDoc(doc(db, "lorries", cleanId), payload, { merge: true }),
    ];
    if (safeLiveId && !safeLiveId.includes("/")) {
      writes.push(setDoc(doc(db, "lorries_live", safeLiveId), payload, { merge: true }));
    }
    if (safeLiveId !== cleanId) {
      writes.push(setDoc(doc(db, "lorries_live", cleanId), payload, { merge: true }));
    }
    await Promise.allSettled(writes);
  } catch (err) {
    console.warn("Firestore GPS update notice:", err);
  }
}

/**
 * Update lorry trip status: 'empty' vs 'on_trip'
 */
export async function updateLorryTripStatus(
  lorryId: string,
  status: "empty" | "on_trip"
): Promise<void> {
  const cleanId = resolveSafeLorryDocId(lorryId);
  if (!cleanId) return;

  apiFetch(`/api/lorries/${encodeURIComponent(cleanId)}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  }).catch(() => {});

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 2500)
    );
    const firestorePromise = Promise.allSettled([
      setDoc(
        doc(db, "lorries", cleanId),
        { status, isLive: true, isOnline: true, lastUpdated: "Just now", updatedAt: Date.now() },
        { merge: true }
      ),
      setDoc(
        doc(db, "lorries_live", cleanId),
        { status, isLive: true, isOnline: true, lastUpdated: "Just now", updatedAt: Date.now() },
        { merge: true }
      ),
    ]);
    await Promise.race([firestorePromise, timeoutPromise]);
  } catch {}
}

/**
 * Stop live broadcasting and immediately remove vehicle from real-time live map & fleet
 */
export async function stopLorryLiveBroadcasting(
  lorryId: string,
  plate?: string,
  driverId?: string
): Promise<void> {
  const cleanId = resolveSafeLorryDocId(lorryId, plate, driverId);
  const cleanPlate = (plate || "").trim().toUpperCase();
  const plateSlug = cleanPlate.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const cleanPlateId = plateSlug ? `lorry-${plateSlug}` : "";
  const driverSlug = (driverId || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const cleanDriverId = driverSlug ? `lorry-${driverSlug}` : "";

  const uniqueIds = Array.from(
    new Set([cleanId, plateSlug, cleanPlate, cleanPlateId, cleanDriverId].filter((v) => Boolean(v && !v.includes("/"))))
  );
  if (uniqueIds.length === 0) return;

  // Only take the vehicle off the live map. Fleet records must never be deleted here.
  // updateDoc fails harmlessly for IDs that have no document.
  const offline = { isLive: false, isOnline: false, speedKmH: 0, status: "empty", updatedAt: Date.now() };
  const writes = Promise.allSettled([
    ...uniqueIds.map((id) => updateDoc(doc(db, "lorries", id), offline)),
    ...uniqueIds.map((id) => deleteDoc(doc(db, "lorries_live", id))),
  ]);
  await Promise.race([writes, new Promise((resolve) => setTimeout(resolve, 4000))]);
}

export interface LiveTripDetails {
  lorryId: string;
  driverId: string;
  driverName: string;
  driverPhone?: string;
  vehicleType?: string;
  plate: string;
  status: "empty" | "on_trip";
  startLocation: string;
  endLocation: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  travelRoute?: string;
  viaWaypoints?: Array<{ name: string; lat: number; lng: number }>;
  // If loaded
  emptyTime?: string;
  returnRoute?: string;
  finalDestination?: string;
  // If empty
  availableSpace?: string;
  availableCapacityKg?: string;
  hasFreezer?: boolean;
  hasHelper?: boolean;
  // GPS
  lat?: number;
  lng?: number;
  speedKmH?: number;
  heading?: number;
  isLive: boolean;
  isOnline?: boolean;
  updatedAt: number;
}

/**
 * Broadcast full Live Trip and Lorry availability specifications
 * Updates both the central server and Firestore real-time map.
 */
export async function updateLorryLiveTripDetails(
  trip: LiveTripDetails
): Promise<void> {
  const cleanId = resolveSafeLorryDocId(trip.lorryId, trip.plate, trip.driverId);
  if (!cleanId) return;
  const safeLiveId = resolveSafeLiveKey(cleanId, trip.plate, trip.driverId) || cleanId;

  const summaryRoute =
    trip.startLocation && trip.endLocation
      ? `${trip.startLocation} → ${trip.endLocation}`
      : trip.travelRoute || "Island-wide Fleet";

  const payload = {
    ...trip,
    id: cleanId,
    lorryId: cleanId,
    isLive: true,
    isOnline: true,
    route: summaryRoute,
    status: trip.status,
    lastUpdated: "Just now",
    updatedAt: Date.now(),
  };

  // 1. Sync to central API
  apiFetch(`/api/lorries/${encodeURIComponent(cleanId)}/trip`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch(() => {});

  // 2. Sync to Firestore (both lorries and lorries_live)
  try {
    const cleanPayload = sanitizeForFirestore(payload);
    const writes: Promise<void>[] = [
      setDoc(doc(db, "lorries", cleanId), cleanPayload, { merge: true }),
    ];
    if (safeLiveId && !safeLiveId.includes("/")) {
      writes.push(setDoc(doc(db, "lorries_live", safeLiveId), cleanPayload, { merge: true }));
    }
    if (safeLiveId !== cleanId) {
      writes.push(setDoc(doc(db, "lorries_live", cleanId), cleanPayload, { merge: true }));
    }
    await Promise.allSettled(writes);
  } catch (err) {
    console.warn("Firestore trip sync notice:", err);
  }
}

/* ============================================================
 * ENTERPRISE ADMIN METHODS (Fleet, Bookings, Customers, etc.)
 * ============================================================ */

export interface LorryRecord {
  id: string;
  plate: string;
  route: string;
  driverName: string;
  driverPhone?: string;
  driverId: string;
  vehicleType: string;
  lat: number;
  lng: number;
  heading: number;
  speedKmH: number;
  status: "empty" | "on_trip";
  lastUpdated: string;
  updatedAt: number;
  startLocation?: string;
  endLocation?: string;
  travelRoute?: string;
  emptyTime?: string;
  returnRoute?: string;
  finalDestination?: string;
  availableSpace?: string;
  availableCapacityKg?: string;
  hasFreezer?: boolean;
  hasHelper?: boolean;
  isOnline?: boolean;
  isLive?: boolean;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  createdAt: number;
  lastLoginAt: number;
}

export interface BookingRecord {
  id: string;
  customerName: string;
  customerPhone: string;
  pickupCity: string;
  deliveryCity: string;
  date: string;
  vehicleType: string;
  packageDetails?: string;
  customerIdNumber?: string;
  distanceKm?: number;
  status: "pending" | "assigned" | "goods_collected" | "in_transit" | "delivered" | "cancelled";
  assignedLorryId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedPlate?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RegistrationRecord {
  id: string;
  ownerName: string;
  phone: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity: string;
  province: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export interface InquiryRecord {
  id: string;
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
  status: "unread" | "resolved";
  createdAt: number;
}

export interface ReviewRecord {
  id: string;
  name: string;
  rating: number;
  comment: string;
  service: string;
  date?: string;
  createdAt: number;
}

export async function getAllLorries(): Promise<LorryRecord[]> {
  try {
    const res = await apiFetch<{ lorries: LorryRecord[] }>("/api/lorries");
    if (res.success && Array.isArray(res.data?.lorries)) {
      return res.data.lorries;
    }
  } catch {}
  return [];
}

/**
 * Subscribe to all live lorries in real time via Firestore onSnapshot
 * Streams live GPS broadcasts from drivers directly to the Admin Dashboard.
 */
export function subscribeAdminLorries(
  callback: (lorries: LorryRecord[]) => void
): () => void {
  let isMounted = true;
  let liveReady = false;
  let lorriesReady = false;
  const liveMap = new Map<string, LorryRecord>();
  const fallbackMap = new Map<string, LorryRecord>();

  const emitMerged = () => {
    if (!isMounted || !liveReady || !lorriesReady) return;
    const now = Date.now();
    const STALE_THRESHOLD_MS = 180_000;
    const merged = new Map<string, LorryRecord>();

    liveMap.forEach((lorry, key) => {
      const updateMs = Number(lorry.updatedAt) || 0;
      if (updateMs === 0 || (now - updateMs) <= STALE_THRESHOLD_MS) {
        merged.set(key, lorry);
      }
    });

    fallbackMap.forEach((lorry, key) => {
      const updateMs = Number(lorry.updatedAt) || 0;
      if (!merged.has(key) && lorry.isLive && (updateMs === 0 || (now - updateMs) <= STALE_THRESHOLD_MS)) {
        merged.set(key, lorry);
      }
    });

    callback(Array.from(merged.values()));
  };

  const parseDoc = (d: any): LorryRecord | null => {
    const data = d.data();
    if (!data) return null;
    if (data.isLive !== true || data.status === "offline") return null;

    let parsedUpdatedMs = Date.now();
    if (data.updatedAt) {
      if (typeof data.updatedAt === "number") {
        parsedUpdatedMs = data.updatedAt;
      } else if (typeof data.updatedAt?.toMillis === "function") {
        parsedUpdatedMs = data.updatedAt.toMillis();
      } else if (typeof data.updatedAt?.seconds === "number") {
        parsedUpdatedMs = data.updatedAt.seconds * 1000;
      } else if (typeof data.updatedAt === "string") {
        const parsed = Date.parse(data.updatedAt);
        if (!isNaN(parsed)) parsedUpdatedMs = parsed;
      }
    }

    return {
      id: d.id,
      plate: data.plate || (d.id || "").toUpperCase(),
      route: data.route || "Island-wide",
      driverName: (data.riderName && data.riderName !== "Driver" ? data.riderName : "") || (data.driverName && data.driverName !== "Driver" ? data.driverName : ""),
      driverPhone: data.riderPhone || data.driverPhone || data.phone || "",
      driverId: data.riderUid || data.driverId || "",
      vehicleType: data.vehicleType || "Lorry",
      lat: Number.isFinite(Number(data.lat)) ? Number(data.lat) : 6.9271,
      lng: Number.isFinite(Number(data.lng)) ? Number(data.lng) : 79.8612,
      heading: Number(data.heading) || 0,
      speedKmH: Number(data.speedKmH) || 0,
      status: (data.status as "empty" | "on_trip") || "empty",
      lastUpdated: data.lastUpdated || "Just now",
      updatedAt: parsedUpdatedMs,
      isOnline: true,
      isLive: true,
      startLocation: data.startLocation || "",
      endLocation: data.endLocation || "",
      travelRoute: data.travelRoute || "",
      emptyTime: data.emptyTime || "",
      returnRoute: data.returnRoute || "",
      finalDestination: data.destination || data.finalDestination || "",
      availableSpace: data.availableSpace || "",
      availableCapacityKg: data.availableWeight || data.availableCapacityKg || "",
      hasFreezer: !!(data.freezer ?? data.hasFreezer),
      hasHelper: !!(data.helper ?? data.hasHelper),
    };
  };

  let unsubLive = () => {};
  let unsubLorries = () => {};

  try {
    unsubLive = onSnapshot(
      query(collection(db, "lorries_live"), where("isLive", "==", true)),
      (snapshot) => {
        liveMap.clear();
        snapshot.forEach((d) => {
          const item = parseDoc(d);
          if (item) {
            const key = (item.plate || item.id).toUpperCase();
            liveMap.set(key, item);
          }
        });
        liveReady = true;
        emitMerged();
      },
      (err) => {
        console.warn("Admin Firestore lorries_live notice:", err);
        liveReady = true;
        emitMerged();
      }
    );
  } catch {
    liveReady = true;
  }

  try {
    unsubLorries = onSnapshot(
      query(collection(db, "lorries"), where("isLive", "==", true)),
      (snapshot) => {
        fallbackMap.clear();
        snapshot.forEach((d) => {
          const item = parseDoc(d);
          if (item) {
            const key = (item.plate || item.id).toUpperCase();
            fallbackMap.set(key, item);
          }
        });
        lorriesReady = true;
        emitMerged();
      },
      (err) => {
        console.warn("Admin Firestore lorries notice:", err);
        lorriesReady = true;
        emitMerged();
      }
    );
  } catch {
    lorriesReady = true;
    emitMerged();
  }

  const timer = setInterval(() => {
    emitMerged();
  }, 4000);

  return () => {
    isMounted = false;
    clearInterval(timer);
    unsubLive();
    unsubLorries();
  };
}

export async function addNewLorryToFleet(input: {
  plate: string;
  route?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleType?: string;
  capacity?: string;
  maxWeight?: string;
  imageUrl?: string;
  images?: string[];
  description?: string;
}): Promise<boolean> {
  const cleanPlate = input.plate.trim().toUpperCase();
  const lorryId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase() || Date.now()}`;
  const images = Array.isArray(input.images) && input.images.length > 0
    ? input.images
    : (input.imageUrl ? [input.imageUrl] : []);

  const payload = {
    ...input,
    id: lorryId,
    plate: cleanPlate,
    vehicleType: input.vehicleType || "14ft Lorry",
    capacity: input.capacity || "14ft × 6.5ft × 7ft Cargo Space",
    maxWeight: input.maxWeight || "3.5 Tons (3,500 kg)",
    imageUrl: images[0] || "",
    images,
    description: input.description || "Dedicated individual lorry available for custom cargo bookings.",
    status: "empty",
    lat: 6.9271,
    lng: 79.8612,
    updatedAt: Date.now(),
  };

  // Sync with Firestore (Both lorries and lorries_registry)
  try {
    await setDoc(doc(db, "lorries", lorryId), sanitizeForFirestore(payload), { merge: true });
    await setDoc(doc(db, "lorries_registry", lorryId), sanitizeForFirestore(payload), { merge: true });
  } catch (err) {
    console.warn("Firestore sync warning for lorry:", err);
  }

  // Sync with Central API
  try {
    const res = await apiFetch("/api/lorries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return res.success;
  } catch {
    return true;
  }
}

export async function deleteLorryFromFleet(id: string): Promise<boolean> {
  const cleanId = resolveSafeLorryDocId(id);
  if (!cleanId) return false;

  let fsSuccess = false;
  try {
    await deleteDoc(doc(db, "lorries", cleanId));
    await deleteDoc(doc(db, "lorries_registry", cleanId));
    const liveKey = resolveSafeLiveKey(cleanId);
    if (liveKey && !liveKey.includes("/")) {
      await deleteDoc(doc(db, "lorries_live", liveKey));
    }
    fsSuccess = true;
  } catch (err) {
    console.warn("Failed to delete lorry from Firestore:", err);
  }

  try {
    const res = await apiFetch(`/api/lorries?id=${encodeURIComponent(cleanId)}`, {
      method: "DELETE",
    });
    return res.success || fsSuccess;
  } catch {
    return fsSuccess;
  }
}

export async function getAllCustomers(): Promise<CustomerRecord[]> {
  try {
    const res = await apiFetch<{ customers: CustomerRecord[] }>("/api/customers");
    if (res.success && Array.isArray(res.data?.customers)) {
      return res.data.customers;
    }
  } catch {}
  return [];
}

export async function getAllBookings(): Promise<BookingRecord[]> {
  try {
    const res = await apiFetch<{ bookings: BookingRecord[] }>("/api/bookings");
    if (res.success && Array.isArray(res.data?.bookings)) {
      return res.data.bookings;
    }
  } catch {}
  return [];
}

/**
 * Real-time subscription to Customer Bookings from Firestore
 * Ensures customer bookings created on the Web Portal appear instantly in Admin Dashboard.
 */
export function subscribeAdminBookings(
  callback: (bookings: BookingRecord[]) => void
): () => void {
  let isMounted = true;

  let unsubscribeFs = () => {};
  try {
    const colRef = query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(200));
    unsubscribeFs = onSnapshot(
      colRef,
      (snapshot) => {
        if (!isMounted) return;
        const list: BookingRecord[] = [];
        const seenIds = new Set<string>();
        snapshot.forEach((d) => {
          const data = d.data();
          const resolvedId = String(data.id || data.trackingId || d.id);
          if (seenIds.has(resolvedId)) return;
          seenIds.add(resolvedId);

          const resolvedDate =
            data.date ||
            (Array.isArray(data.dates) && data.dates[0]) ||
            "";
          list.push({
            id: resolvedId,
            customerName: data.customerName || data.name || "Customer",
            customerPhone: data.customerPhone || data.phone || "",
            pickupCity: data.pickupCity || data.pickup || "",
            deliveryCity: data.deliveryCity || data.destination || "",
            date: resolvedDate,
            vehicleType: data.vehicleType || "14ft Lorry",
            packageDetails: data.packageDetails || data.notes || "",
            customerIdNumber: data.customerIdNumber || data.idNumber || "",
            distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : (Number(data.distanceKm) || undefined),
            status: data.status || "pending",
            assignedLorryId: data.assignedLorryId,
            assignedDriverName: data.assignedDriverName,
            assignedDriverPhone: data.assignedDriverPhone,
            assignedPlate: data.assignedPlate || data.selectedVehiclePlate || data.assignedLorryPlate,
            createdAt: Number(data.createdAt) || 0,
            updatedAt: Number(data.updatedAt) || Number(data.createdAt) || 0,
          });
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      },
      (err) => {
        console.warn("Bookings Firestore subscription warning:", err);
        getAllBookings().then((fallbackList) => {
          if (isMounted) callback(fallbackList);
        });
      }
    );
  } catch {
    getAllBookings().then((fallbackList) => {
      if (isMounted) callback(fallbackList);
    });
  }

  return () => {
    isMounted = false;
    unsubscribeFs();
  };
}

export async function updateBookingDispatch(input: {
  id: string;
  status: "pending" | "assigned" | "goods_collected" | "in_transit" | "delivered" | "completed" | "cancelled";
  driverTripStatus?: "pending_acceptance" | "accepted" | "declined" | "in_transit" | "completed" | "empty_return";
  rideStartedAt?: number;
  rideEndedAt?: number;
  assignedLorryId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedPlate?: string;
  waypoints?: Array<{ name: string; lat?: number; lng?: number }>;
  travelRoute?: string;
}): Promise<boolean> {
  // 1. Direct Firestore update
  try {
    const docRef = doc(db, "bookings", input.id);
    await setDoc(
      docRef,
      sanitizeForFirestore({
        ...input,
        assignedLorryPlate: input.assignedPlate,
        updatedAt: Date.now(),
      }),
      { merge: true }
    );
  } catch (e) {
    console.warn("Firestore booking dispatch update notice:", e);
  }

  // 2. Notify API
  const res = await apiFetch("/api/bookings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.success;
}

/**
 * Real-time subscription to Vehicle Registrations from Firestore
 * Listens to "vehicle_registrations" collection so registrations submitted on the
 * Web Portal (/register-vehicle) appear instantly in the Admin Dashboard under Vehicle Requests.
 */
export function subscribeAdminRegistrations(
  callback: (registrations: RegistrationRecord[]) => void
): () => void {
  let isMounted = true;

  let unsubscribeFs = () => {};
  try {
    const colRef = query(collection(db, "vehicle_registrations"), orderBy("createdAt", "desc"), limit(200));
    unsubscribeFs = onSnapshot(
      query(colRef),
      (snapshot) => {
        if (!isMounted) return;
        const list: RegistrationRecord[] = [];
        if (!snapshot.empty) {
          snapshot.forEach((d) => {
            const data = d.data();
            list.push({
              id: d.id,
              ownerName: data.ownerName || data.name || "Vehicle Owner",
              phone: data.phone || "",
              vehicleNumber: data.vehicleNumber || data.plateNumber || data.plate || "",
              vehicleType: data.vehicleType || "14ft Lorry",
              capacity: data.capacity || "Standard Load",
              province: data.baseCity || data.province || "Sri Lanka",
              status: data.status || "pending",
              createdAt: data.createdAt || Date.now(),
            });
          });
          list.sort((a, b) => b.createdAt - a.createdAt);
          callback(list);
        } else {
          callback([]);
        }
      },
      (err) => {
        console.warn("Vehicle registrations Firestore subscription warning:", err);
      }
    );
  } catch (err) {
    console.warn("Vehicle registrations Firestore setup notice:", err);
  }

  return () => {
    isMounted = false;
    unsubscribeFs();
  };
}

export async function getAllRegistrations(): Promise<RegistrationRecord[]> {
  try {
    const res = await apiFetch<{ registrations: RegistrationRecord[] }>(
      "/api/registrations"
    );
    if (res.success && Array.isArray(res.data?.registrations)) {
      return res.data.registrations;
    }
  } catch {}
  return [];
}

export async function updateRegistrationStatus(
  id: string,
  status: "pending" | "approved" | "rejected"
): Promise<{ success: boolean; error?: string }> {
  // Approval creates the owner wallet, Driver ID and vehicle records. That all
  // happens in one place, the web API, so it is never half done from the phone.
  if (status === "approved") {
    const res = await apiFetch("/api/registrations", {
      method: "PATCH",
      body: JSON.stringify({ id, status }),
    });
    return { success: res.success, error: res.error };
  }

  try {
    await setDoc(
      doc(db, "vehicle_registrations", id),
      sanitizeForFirestore({ status, updatedAt: Date.now() }),
      { merge: true }
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Could not update the registration." };
  }
}

export async function getAllInquiries(): Promise<InquiryRecord[]> {
  try {
    const res = await apiFetch<{ inquiries: InquiryRecord[] }>("/api/inquiries");
    if (res.success && Array.isArray(res.data?.inquiries)) {
      return res.data.inquiries;
    }
  } catch {}
  return [];
}

export async function updateInquiryStatus(
  id: string,
  status: "unread" | "resolved"
): Promise<boolean> {
  const res = await apiFetch("/api/inquiries", {
    method: "PATCH",
    body: JSON.stringify({ id, status }),
  });
  return res.success;
}

export async function getAllReviews(): Promise<ReviewRecord[]> {
  try {
    const res = await apiFetch<{ reviews: ReviewRecord[] }>("/api/reviews");
    if (res.success && Array.isArray(res.data?.reviews)) {
      return res.data.reviews;
    }
  } catch {}
  return [];
}

/**
 * Real-time subscription to Customer Reviews from Firestore
 * Listens to "reviews" collection so reviews submitted on the Web Portal (/reviews)
 * appear instantly in the Admin Dashboard under Reviews tab.
 */
export function subscribeAdminReviews(
  callback: (reviews: ReviewRecord[]) => void
): () => void {
  let isMounted = true;
  let unsubscribeFs = () => {};

  try {
    const colRef = query(collection(db, "reviews"), orderBy("createdAt", "desc"), limit(100));
    unsubscribeFs = onSnapshot(
      query(colRef),
      (snapshot) => {
        if (!isMounted) return;
        const list: ReviewRecord[] = [];
        if (!snapshot.empty) {
          snapshot.forEach((d) => {
            const data = d.data();
            list.push({
              id: d.id,
              name: data.name || "Customer",
              rating: Number(data.stars || data.rating) || 5,
              comment: data.comment || data.commentEn || data.commentSi || "",
              service: data.route || data.service || "Island-wide Transport",
              date: data.date || "Recently",
              createdAt: data.createdAt || Date.now(),
            });
          });
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          callback(list);
        } else {
          callback([]);
        }
      },
      (err) => {
        console.warn("Reviews Firestore subscription notice:", err);
        if (isMounted) callback([]);
      }
    );
  } catch (err) {
    console.warn("Reviews Firestore setup notice:", err);
    callback([]);
  }

  return () => {
    isMounted = false;
    unsubscribeFs();
  };
}

/**
 * Delete a customer review from Firestore and notify the web API.
 */
export async function deleteAdminReview(id: string): Promise<boolean> {
  if (!id) return false;

  // 1. Direct Firestore deletion
  try {
    const docRef = doc(db, "reviews", id);
    await deleteDoc(docRef);
  } catch (e) {
    console.warn("Firestore delete review notice:", e);
  }

  // 2. Notify API
  try {
    await apiFetch("/api/reviews", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
  } catch {}

  return true;
}

/* ============================================================
 * VEHICLES PERSISTENCE & FIRESTORE SYNC
 * ============================================================ */

export const LOCAL_VEHICLES_KEY = "@sithumina_vehicles_cache";

export interface VehicleItem {
  plate: string;
  type: string;
  capacity: string;
  rider?: string;
  maxWeight?: string;
  description?: string;
  images?: string[];
  status: "On trip" | "Empty";
  createdAt?: number;
}

export async function getCachedVehicles(): Promise<VehicleItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_VEHICLES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function stripSinhalaText(val: any): string {
  if (!val || typeof val !== "string") return "";
  return val.replace(/[\u0D80-\u0DFF]+/g, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
}

export function subscribeAdminVehicles(
  callback: (vehicles: VehicleItem[]) => void
): () => void {
  let isMounted = true;

  // Authoritative Firestore real-time sync on lorries_registry (with offline cache fallback ONLY on error)
  let unsubscribeFs = () => {};
  try {
    const colRef = collection(db, "lorries_registry");
    unsubscribeFs = onSnapshot(
      colRef,
      (snapshot) => {
        if (!isMounted) return;
        const byPlate = new Map<string, VehicleItem>();
        const idSeen = new Map<string, string>();
        snapshot.forEach((d) => {
          const data = d.data();
          const plate = String(data.plate || "").trim();
          if (!plate) return;
          const realImages =
            Array.isArray(data.images) && data.images.length > 0
              ? data.images.filter((img: string) => img && !img.startsWith("/img"))
              : data.imageUrl && !data.imageUrl.startsWith("/img")
              ? [data.imageUrl]
              : [];
          const cap = data.capacity || data.availableCapacityKg || "";
          const item: VehicleItem = {
            plate,
            type: stripSinhalaText(data.vehicleType || "Lorry"),
            capacity: stripSinhalaText(String(cap)),
            maxWeight: stripSinhalaText(String(data.maxWeight || "")),
            description: stripSinhalaText(String(data.description || "")),
            images: realImages,
            rider: String(data.driverName || data.driverId || "Unassigned"),
            status: data.status === "on_trip" ? "On trip" : "Empty",
            createdAt: Number(data.createdAt || data.updatedAt) || 0,
          };
          const key = plate.toUpperCase();
          const prevDocId = idSeen.get(key) || "";
          if (!byPlate.has(key) || (d.id.startsWith("lorry-") && !prevDocId.startsWith("lorry-"))) {
            byPlate.set(key, item);
            idSeen.set(key, d.id);
          }
        });
        const list = Array.from(byPlate.values()).sort(
          (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
        );
        AsyncStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(list)).catch(() => {});
        callback(list);
      },
      (err) => {
        console.warn("Vehicles Firestore subscription notice:", err);
        getCachedVehicles().then((cached) => {
          if (isMounted) callback(cached);
        });
      }
    );
  } catch {
    getCachedVehicles().then((cached) => {
      if (isMounted) callback(cached);
    });
  }

  return () => {
    isMounted = false;
    unsubscribeFs();
  };
}

export async function saveAdminVehicle(veh: VehicleItem): Promise<void> {
  const cleanPlate = veh.plate.trim().toUpperCase();
  const lorryId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;

  // 1. Save to local cache immediately (works offline, zero latency)
  try {
    const current = await getCachedVehicles();
    const filtered = current.filter((v) => v.plate.toUpperCase() !== cleanPlate);
    const updated = [{ ...veh, rider: veh.rider || "Unassigned" }, ...filtered];
    await AsyncStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Vehicle local cache error:", err);
  }

  // 2. Save to Firestore (Both lorries and lorries_registry collections)
  const realImages = Array.isArray(veh.images)
    ? veh.images.filter((img) => img && !img.startsWith("/img"))
    : [];
  const realImageUrl = (realImages.length > 0 && realImages[0]) || "";

  try {
    const payload = sanitizeForFirestore({
      id: lorryId,
      plate: cleanPlate,
      vehicleType: veh.type || "14ft Lorry",
      capacity: veh.capacity || "14ft × 6.5ft × 7ft Cargo Space",
      maxWeight: veh.maxWeight || "3.5 Tons (3,500 kg)",
      description: veh.description || "Dedicated individual lorry available for custom cargo bookings.",
      images: realImages,
      imageUrl: realImageUrl,
      driverName: veh.rider || "Unassigned",
      route: "Island-wide Fleet",
      status: "empty",
      lat: 6.9271,
      lng: 79.8612,
      heading: 0,
      speedKmH: 0,
      isLive: false,
      isOnline: true,
      lastUpdated: "Registered",
      updatedAt: Date.now(),
      createdAt: Date.now(),
    });
    await setDoc(doc(db, "lorries", lorryId), payload, { merge: true });
    await setDoc(doc(db, "lorries_registry", lorryId), payload, { merge: true });
  } catch (err) {
    console.warn("Firestore save vehicle notice:", err);
  }

  // 3. Sync to API if available
  apiFetch("/api/lorries", {
    method: "POST",
    body: JSON.stringify({
      plate: cleanPlate,
      route: "Island-wide Fleet",
      driverName: veh.rider || "Unassigned",
      vehicleType: veh.type || "14ft Lorry",
      capacity: veh.capacity || "14ft × 6.5ft × 7ft Cargo Space",
      maxWeight: veh.maxWeight || "3.5 Tons (3,500 kg)",
      description: veh.description || "Dedicated individual lorry available for custom cargo bookings.",
      images: realImages,
      imageUrl: realImageUrl,
    }),
  }).catch(() => {});
}

export async function deleteAdminVehicle(plate: string): Promise<void> {
  const cleanPlate = plate.trim().toUpperCase();
  const plateSlug = cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase();
  if (!plateSlug) return;
  const lorryId = `lorry-${plateSlug}`;

  try {
    const current = await getCachedVehicles();
    const updated = current.filter((v) => v.plate.toUpperCase() !== cleanPlate);
    await AsyncStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
  } catch {}

  try {
    await deleteDoc(doc(db, "lorries", lorryId));
  } catch {}
  try {
    await deleteDoc(doc(db, "lorries_registry", lorryId));
  } catch {}
  try {
    if (plateSlug && !plateSlug.includes("/")) {
      await deleteDoc(doc(db, "lorries_live", plateSlug));
    }
  } catch {}
}

/* ============================================================
 * RIDERS / DRIVERS PERSISTENCE & FIRESTORE SYNC
 * ============================================================ */

export function subscribeAdminDrivers(
  callback: (drivers: DriverRecord[]) => void
): () => void {
  let isMounted = true;

  // Authoritative Firestore real-time sync (with offline cache fallback ONLY on error)
  let unsubscribeFs = () => {};
  try {
    const colRef = collection(db, "drivers");
    unsubscribeFs = onSnapshot(
      colRef,
      (snapshot) => {
        if (!isMounted) return;
        const list: DriverRecord[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            driverId: String(data.driverId || d.id),
            name: String(data.name || ""),
            phone: String(data.phone || ""),
            plate: String(data.plate || ""),
            vehicleType: String(data.vehicleType || ""),
            route: String(data.route || ""),
            lorryId: resolveSafeLorryDocId(
          data.lorryId,
          data.plate,
          String(data.driverId || d.id)
        ),
            active: data.active !== false,
            createdAt: Number(data.createdAt) || 0,
          });
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        AsyncStorage.setItem(LOCAL_DRIVERS_KEY, JSON.stringify(list)).catch(() => {});
        callback(list);
      },
      (err) => {
        console.warn("Drivers Firestore subscription notice:", err);
        getCachedDrivers().then((cached) => {
          if (isMounted) callback(cached);
        });
      }
    );
  } catch {
    getCachedDrivers().then((cached) => {
      if (isMounted) callback(cached);
    });
  }

  return () => {
    isMounted = false;
    unsubscribeFs();
  };
}

/* ============================================================
 * BANNERS PERSISTENCE & FIRESTORE SYNC
 * ============================================================ */

export const LOCAL_BANNERS_KEY = "@sithumina_app_banners";

export interface BannerItem {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  target: "all" | "riders" | "customers";
  viewMode?: "all" | "mobile" | "desktop";
  desktopImage?: string;
  mobileImage?: string;
  ctaText?: string;
  isActive: boolean;
  createdAt: number;
}

export async function getCachedBanners(): Promise<BannerItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_BANNERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function subscribeAdminBanners(
  callback: (banners: BannerItem[]) => void
): () => void {
  let isMounted = true;

  // Authoritative Firestore real-time sync (with offline cache fallback ONLY on error)
  let unsubscribeFs = () => {};
  try {
    const colRef = collection(db, "banners");
    unsubscribeFs = onSnapshot(
      colRef,
      (snapshot) => {
        if (!isMounted) return;
        const list: BannerItem[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            title: data.title || "",
            subtitle: data.subtitle || "",
            tag: data.tag || "PROMO",
            target: data.target || "all",
            viewMode: data.viewMode || "all",
            desktopImage: data.desktopImage,
            mobileImage: data.mobileImage,
            ctaText: data.ctaText || "Book Now",
            isActive: data.isActive !== false,
            createdAt: Number(data.createdAt) || 0,
          });
        });
        list.sort((a, b) => b.createdAt - a.createdAt);
        AsyncStorage.setItem(LOCAL_BANNERS_KEY, JSON.stringify(list)).catch(() => {});
        callback(list);
      },
      (err) => {
        console.warn("Banners Firestore subscription notice:", err);
        getCachedBanners().then((cached) => {
          if (isMounted) callback(cached);
        });
      }
    );
  } catch {
    getCachedBanners().then((cached) => {
      if (isMounted) callback(cached);
    });
  }

  return () => {
    isMounted = false;
    unsubscribeFs();
  };
}

export async function saveAdminBanner(banner: BannerItem): Promise<void> {
  // 1. Save to local cache immediately
  try {
    const current = await getCachedBanners();
    const filtered = current.filter((b) => b.id !== banner.id);
    const updated = [banner, ...filtered];
    await AsyncStorage.setItem(LOCAL_BANNERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn("Banner local cache error:", err);
  }

  // 2. Save to Firestore
  try {
    const docRef = doc(db, "banners", banner.id);
    await setDoc(docRef, banner, { merge: true });
  } catch (err) {
    console.warn("Firestore save banner notice:", err);
  }
}

export async function deleteAdminBanner(id: string): Promise<void> {
  try {
    const current = await getCachedBanners();
    const updated = current.filter((b) => b.id !== id);
    await AsyncStorage.setItem(LOCAL_BANNERS_KEY, JSON.stringify(updated));
  } catch {}

  try {
    await deleteDoc(doc(db, "banners", id));
  } catch {}
}

export async function toggleAdminBanner(id: string): Promise<void> {
  try {
    const current = await getCachedBanners();
    let nextState = true;
    const updated = current.map((b) => {
      if (b.id === id) {
        nextState = !b.isActive;
        return { ...b, isActive: nextState };
      }
      return b;
    });
    await AsyncStorage.setItem(LOCAL_BANNERS_KEY, JSON.stringify(updated));

    await updateDoc(doc(db, "banners", id), {
      isActive: nextState,
      updatedAt: Date.now(),
    });
  } catch {}
}

/* ============================================================
 * COMPLAINTS & DELETION REASONS FIRESTORE SYNC
 * ============================================================ */

export interface ComplaintRecord {
  id: string;
  bookingId: string;
  type: "cancelled" | "deleted";
  assignedDriverName?: string;
  assignedPlate?: string;
  customerName: string;
  customerPhone: string;
  customerIdNumber?: string;
  pickupCity: string;
  deliveryCity: string;
  date: string;
  vehicleType?: string;
  quotedAmount?: number;
  distanceKm?: number;
  reason: string;
  deletedAt: number;
  deletedBy?: string;
}

export function subscribeAdminComplaints(
  callback: (complaints: ComplaintRecord[]) => void
): () => void {
  let isMounted = true;
  let unsubscribeFs = () => {};

  try {
    const colRef = query(collection(db, "complaints"), orderBy("deletedAt", "desc"), limit(200));
    unsubscribeFs = onSnapshot(
      query(colRef),
      (snapshot) => {
        if (!isMounted) return;
        const list: ComplaintRecord[] = [];
        if (!snapshot.empty) {
          snapshot.forEach((d) => {
            const data = d.data();
            list.push({
              id: String(data.id || d.id),
              bookingId: String(data.bookingId || ""),
              customerName: String(data.customerName || ""),
              customerPhone: String(data.customerPhone || ""),
              customerIdNumber: data.customerIdNumber ? String(data.customerIdNumber) : undefined,
              pickupCity: String(data.pickupCity || ""),
              deliveryCity: String(data.deliveryCity || ""),
              date: String(data.date || data.bookingDate || ""),
              vehicleType: String(data.vehicleType || "Lorry"),
              quotedAmount: typeof data.quotedAmount === "number" ? data.quotedAmount : (Number(data.quotedAmount || data.amount) || undefined),
              distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : (Number(data.distanceKm) || undefined),
              // Older cancellations were stored as "Cancelled: reason" with no type
              type:
                data.type === "cancelled" || data.type === "deleted"
                  ? data.type
                  : String(data.reason || "").startsWith("Cancelled:")
                    ? "cancelled"
                    : "deleted",
              assignedDriverName: data.assignedDriverName ? String(data.assignedDriverName) : undefined,
              assignedPlate: data.assignedPlate ? String(data.assignedPlate) : undefined,
              reason: String(data.reason || "No reason recorded").replace(/^Cancelled:\s*/, ""),
              deletedAt: Number(data.deletedAt) || (data.deletedAt ? new Date(data.deletedAt).getTime() : Date.now()),
              deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
            });
          });
          list.sort((a, b) => (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0));
          callback(list);
        } else {
          callback([]);
        }
      },
      (err) => {
        console.warn("Complaints Firestore subscription notice:", err);
        if (isMounted) callback([]);
      }
    );
  } catch (err) {
    console.warn("Complaints Firestore setup notice:", err);
    callback([]);
  }

  return () => {
    isMounted = false;
    unsubscribeFs();
  };
}

