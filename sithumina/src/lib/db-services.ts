import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  limit,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Lorry, LorryStatus } from "./mock-lorries";
import { StoredBooking } from "./server-store";
import {
  createBookingAction,
  trackBookingAction,
  updateBookingStatusAction,
  updateLorryStatusAction,
  updateLorryLocationAction,
  registerDriverAndLorryAction,
  deleteLorryAction,
  registerVehicleAction,
  updateRegistrationStatusAction,
  submitInquiryAction,
  submitReviewAction,
  deleteReviewAction,
} from "@/actions";

/* ============================================================
 * LORRIES / FLEET SERVICE
 * ============================================================ */

const LORRIES_LIVE_COL = "lorries_live";
const LORRIES_REGISTRY_COL = "lorries_registry";

/**
 * Disabled dummy seeding - only real registered drivers appear
 */
export async function seedInitialLorriesIfEmpty(): Promise<boolean> {
  return false;
}

/**
 * Secondary REST API fetcher for zero-interruption resilience.
 * Seamlessly connects when Firestore security rules or network streams are restricted.
 */
async function fetchLorriesFromApi(type: "live" | "fleet" = "live"): Promise<Lorry[]> {
  try {
    const url = type === "fleet" ? "/api/lorries?type=fleet" : "/api/lorries";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.success || !Array.isArray(json.lorries)) return [];
    const now = Date.now();
    const STALE_HEARTBEAT_MS = 15 * 60 * 1000; // 15 minutes grace window for mountainous / low-signal corridors
    return json.lorries
      .filter((l: any) => {
        if (type === "fleet") return true; // Fleet vehicles are permanent assets
        if (l.isLive === false || l.status === "offline") return false;
        const updateMs = Number(l.updatedAt) || 0;
        if (updateMs > 0 && (now - updateMs) > STALE_HEARTBEAT_MS) {
          return false;
        }
        return true;
      })
      .map((l: any) => ({
      id: l.id || `lorry-${(l.plate || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      plate: (l.plate || l.id || "").toString().trim().toUpperCase(),
      route:
        l.startLocation && l.endLocation
          ? `${l.startLocation} → ${l.endLocation}`
          : l.route || l.travelRoute || "Island-wide Fleet",
      driverName:
        (l.driverName || l.rider || "").toString().trim() !== "Driver" &&
        (l.driverName || l.rider || "").toString().trim() !== "Unassigned"
          ? String(l.driverName || l.rider || "").trim()
          : "",
      driverPhone: l.driverPhone || "",
      driverId: l.driverId || "",
      vehicleType: l.vehicleType || "Lorry Fleet",
      capacity: l.capacity || l.availableCapacityKg || "",
      maxWeight: l.maxWeight || "",
      imageUrl: l.imageUrl || (Array.isArray(l.images) && l.images[0]) || "",
      images: Array.isArray(l.images) && l.images.length > 0 ? l.images : (l.imageUrl ? [l.imageUrl] : []),
      description: l.description || "",
      lat: Number.isFinite(Number(l.lat)) ? Number(l.lat) : 6.9271,
      lng: Number.isFinite(Number(l.lng)) ? Number(l.lng) : 79.8612,
      heading: Number(l.heading) || 0,
      speedKmH: Number(l.speedKmH) || 0,
      status: (l.status as LorryStatus) || "empty",
      lastUpdated: l.lastUpdated || "Available",
      updatedAt: Number(l.updatedAt) || Date.now(),
      isOnline: l.isOnline !== false,
      isLive: l.isLive === true,
      startLocation: l.startLocation || l.baseCity || "Head Office",
      endLocation: l.endLocation || "Island-wide",
      startLat: Number.isFinite(Number(l.startLat)) ? Number(l.startLat) : undefined,
      startLng: Number.isFinite(Number(l.startLng)) ? Number(l.startLng) : undefined,
      endLat: Number.isFinite(Number(l.endLat)) ? Number(l.endLat) : undefined,
      endLng: Number.isFinite(Number(l.endLng)) ? Number(l.endLng) : undefined,
      travelRoute: l.travelRoute || "",
      viaWaypoints: Array.isArray(l.viaWaypoints) ? l.viaWaypoints : [],
      emptyTime: l.emptyTime || "Ready Now",
      returnRoute: l.returnRoute || "",
      finalDestination: l.finalDestination || "",
      availableSpace: l.availableSpace || "Full (100%)",
      availableCapacityKg: l.availableCapacityKg || "",
      hasFreezer: !!l.hasFreezer,
      hasHelper: !!l.hasHelper,
    }));
  } catch {
    return [];
  }
}

/**
 * Subscribe to live lorries in real time.
 * Uses Firebase Firestore onSnapshot on "lorries_live" collection as primary stream,
 * with automatic, seamless fallback to Next.js REST API channel for 100% availability.
 */
export function subscribeLorries(
  callback: (lorries: Lorry[]) => void,
  onError?: (error: Error) => void
): () => void {
  let isMounted = true;
  const liveMap = new Map<string, Lorry>();
  const fallbackMap = new Map<string, Lorry>();
  let liveReady = false;
  let lorriesReady = false;
  let apiPollingTimer: NodeJS.Timeout | null = null;
  let isUsingApiFallback = false;

  const emitMerged = () => {
    if (!isMounted || isUsingApiFallback || !liveReady || !lorriesReady) return;
    const now = Date.now();
    const STALE_THRESHOLD_MS = 900_000; // 15 minutes grace window for mountainous/low-signal corridors
    const merged = new Map<string, Lorry>();

    // 1. Process lorries_live (live collection has primary priority)
    liveMap.forEach((lorry, key) => {
      const updateMs = Number(lorry.updatedAt) || 0;
      if (lorry.isLive && (updateMs === 0 || (now - updateMs) <= STALE_THRESHOLD_MS)) {
        merged.set(key, lorry);
      }
    });

    // 2. Process lorries collection (if not already in merged and actively broadcasting)
    fallbackMap.forEach((lorry, key) => {
      const updateMs = Number(lorry.updatedAt) || 0;
      if (!merged.has(key) && lorry.isLive && (updateMs === 0 || (now - updateMs) <= STALE_THRESHOLD_MS)) {
        merged.set(key, lorry);
      }
    });

    // ALWAYS emit merged array (even if empty) so stopped vehicles disappear immediately
    callback(Array.from(merged.values()));
  };

  const activateApiFallback = () => {
    if (isUsingApiFallback || !isMounted) return;
    isUsingApiFallback = true;
    const poll = async () => {
      if (!isMounted) return;
      const apiLorries = await fetchLorriesFromApi();
      if (isMounted) {
        callback(apiLorries);
      }
    };
    poll();
    apiPollingTimer = setInterval(poll, 3500);
  };

  const parseSnapDoc = (docSnap: any): Lorry | null => {
    const data = docSnap.data();
    if (!data) return null;
    // Strictly filter out any vehicle where broadcasting has stopped or ended
    if (data.isLive !== true || data.status === "offline") {
      return null;
    }

    const cleanId = (docSnap.id || "").toUpperCase();
    const resolvedPlate = (data.plate || cleanId).toString().trim().toUpperCase();

    const routeSummary =
      data.startLocation && data.endLocation
        ? `${data.startLocation} → ${data.endLocation}`
        : data.route && data.route !== "Island-wide Fleet" && data.route !== "Colombo – Island-wide"
        ? data.route
        : data.travelRoute || "Island-wide Fleet";

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

    const rawDrvName = String(data.riderName || data.driverName || "").trim();
    return {
      id: docSnap.id,
      plate: resolvedPlate,
      route: routeSummary,
      driverName: rawDrvName !== "Driver" && rawDrvName !== "Unassigned" ? rawDrvName : "",
      driverPhone: data.riderPhone || data.driverPhone || "",
      driverId: data.riderUid || data.driverId || cleanId,
      vehicleType: data.vehicleType || "Lorry Fleet",
      capacity: data.availableWeight || data.capacity || data.availableCapacityKg || "",
      lat: Number.isFinite(Number(data.lat)) ? Number(data.lat) : 6.9271,
      lng: Number.isFinite(Number(data.lng)) ? Number(data.lng) : 79.8612,
      heading: Number(data.heading) || 0,
      speedKmH: Number(data.speedKmH) || 0,
      status: (data.status as LorryStatus) || "empty",
      lastUpdated: data.lastUpdated || "Just now",
      updatedAt: parsedUpdatedMs,
      isOnline: true,
      isLive: true,
      startLocation: data.startLocation || "",
      endLocation: data.endLocation || "",
      startLat: Number.isFinite(Number(data.startLat)) ? Number(data.startLat) : undefined,
      startLng: Number.isFinite(Number(data.startLng)) ? Number(data.startLng) : undefined,
      endLat: Number.isFinite(Number(data.endLat)) ? Number(data.endLat) : undefined,
      endLng: Number.isFinite(Number(data.endLng)) ? Number(data.endLng) : undefined,
      travelRoute: data.travelRoute || "",
      viaWaypoints: Array.isArray(data.viaWaypoints) ? data.viaWaypoints : [],
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
    const colLive = collection(db, "lorries_live");
    unsubLive = onSnapshot(
      colLive,
      (snapshot) => {
        liveMap.clear();
        snapshot.forEach((d) => {
          const item = parseSnapDoc(d);
          if (item) {
            const key = (item.plate || item.id).toUpperCase();
            liveMap.set(key, item);
          }
        });
        liveReady = true;
        emitMerged();
      },
      (err) => {
        liveReady = true;
        onError?.(err);
        activateApiFallback();
      }
    );
  } catch (err) {
    liveReady = true;
    if (err instanceof Error) onError?.(err);
    activateApiFallback();
  }

  try {
    const colLorries = collection(db, "lorries");
    unsubLorries = onSnapshot(
      colLorries,
      (snapshot) => {
        fallbackMap.clear();
        snapshot.forEach((d) => {
          const item = parseSnapDoc(d);
          if (item) {
            const key = (item.plate || item.id).toUpperCase();
            fallbackMap.set(key, item);
          }
        });
        lorriesReady = true;
        emitMerged();
      },
      (err) => {
        lorriesReady = true;
        onError?.(err);
        activateApiFallback();
      }
    );
  } catch (err) {
    lorriesReady = true;
    if (err instanceof Error) onError?.(err);
    activateApiFallback();
  }

  // Periodic heartbeat timer (every 4 seconds) to auto-remove stale lorries
  const timer = setInterval(() => {
    emitMerged();
  }, 4000);

  return () => {
    isMounted = false;
    clearInterval(timer);
    if (apiPollingTimer) clearInterval(apiPollingTimer);
    unsubLive();
    unsubLorries();
  };
}

/**
 * Subscribe to all fleet vehicles for dedicated individual booking.
 * Returns all registered lorries with image, specifications, and availability.
 * Real-time connection to Firestore with zero dummy data.
 */
export function subscribeFleetVehicles(
  callback: (lorries: Lorry[]) => void,
  onError?: (error: Error) => void
): () => void {
  let isMounted = true;

  let unsubscribeFirestore = () => {};
  try {
    const colRef = collection(db, LORRIES_REGISTRY_COL);
    unsubscribeFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        if (!isMounted) return;
        const byPlate = new Map<string, Lorry>();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const cleanId = (docSnap.id || "").replace(/^lorry-/i, "").toUpperCase();
          const resolvedPlate = (data.plate || data.vehiclePlate || data.vehicleNumber || cleanId)
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

          const rawDriver = (data.driverName || data.name || data.rider || "").toString().trim();
          const driverName = rawDriver === "Unassigned" || rawDriver === "Driver" ? "" : rawDriver;
          const driverPhone = (data.driverPhone || data.phone || "").toString().trim();
          const route = (data.route || "").toString().trim();

          const item: Lorry = {
            id: docSnap.id,
            plate: resolvedPlate,
            route,
            driverName,
            driverPhone,
            driverId: data.driverId || cleanId,
            vehicleType: data.vehicleType || data.type || "Lorry Fleet",
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
            finalDestination: data.finalDestination || "",
            availableSpace: data.availableSpace || "",
            availableCapacityKg: data.availableCapacityKg || "",
            hasFreezer: !!data.hasFreezer,
            hasHelper: !!data.hasHelper,
            lat: Number.isFinite(Number(data.lat)) ? Number(data.lat) : 6.9271,
            lng: Number.isFinite(Number(data.lng)) ? Number(data.lng) : 79.8612,
            status: (data.status as LorryStatus) || "empty",
            lastUpdated: data.lastUpdated || "Available",
          };
          const key = (item.plate || item.id).toUpperCase();
          if (!byPlate.has(key) || docSnap.id.startsWith("lorry-")) {
            byPlate.set(key, item);
          }
        });
        callback(Array.from(byPlate.values()));
      },
      (err) => {
        onError?.(err);
        fetchLorriesFromApi("fleet").then((apiLorries) => {
          if (isMounted) callback(apiLorries);
        });
      }
    );
  } catch (err) {
    if (err instanceof Error) onError?.(err);
    fetchLorriesFromApi("fleet").then((apiLorries) => {
      if (isMounted) callback(apiLorries);
    });
  }

  return () => {
    isMounted = false;
    unsubscribeFirestore();
  };
}

/**
 * Interface for registered drivers in Admin Dashboard
 */
export interface AdminDriverRecord {
  id?: string;
  driverId: string;
  name: string;
  phone: string;
  nic?: string;
  plate: string;
  vehicleType: string;
  route: string;
  lorryId?: string;
  active: boolean;
  createdAt: number;
}

/**
 * Subscribe to drivers collection for Admin Dashboard
 */
export function subscribeAdminDrivers(
  callback: (drivers: AdminDriverRecord[]) => void
): () => void {
  let isMounted = true;

  let unsub = () => {};
  try {
    const colRef = collection(db, "drivers");
    unsub = onSnapshot(
      colRef,
      (snap) => {
        if (!isMounted) return;
        const list: AdminDriverRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const driverIdVal = String(data.driverId || d.id);
          const plateVal = String(data.plate || "");
          const cleanLorry = String(data.lorryId || "").trim().toLowerCase().replace(/\//g, "-");
          const plateSlug = plateVal.replace(/[^a-z0-9]/gi, "").toLowerCase();
          const idSlug = driverIdVal.replace(/[^a-z0-9]/gi, "").toLowerCase();
          const resolvedLorryId =
            cleanLorry && cleanLorry !== "lorry-"
              ? cleanLorry
              : plateSlug
              ? `lorry-${plateSlug}`
              : idSlug
              ? `lorry-${idSlug}`
              : "";
          list.push({
            id: d.id,
            driverId: driverIdVal,
            name: String(data.name || ""),
            phone: String(data.phone || ""),
            nic: String(data.nic || ""),
            plate: plateVal,
            vehicleType: String(data.vehicleType || ""),
            route: String(data.route || ""),
            lorryId: resolvedLorryId,
            active: data.active !== false,
            createdAt: Number(data.createdAt) || 0,
          });
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
      },
      () => {
        fetch("/api/drivers", { cache: "no-store" })
          .then((r) => r.json())
          .then((json) => {
            if (isMounted) {
              callback(json.success && Array.isArray(json.drivers) ? json.drivers : []);
            }
          })
          .catch(() => {
            if (isMounted) callback([]);
          });
      }
    );
  } catch {
    fetch("/api/drivers", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (isMounted) {
          callback(json.success && Array.isArray(json.drivers) ? json.drivers : []);
        }
      })
      .catch(() => {
        if (isMounted) callback([]);
      });
  }

  return () => {
    isMounted = false;
    unsub();
  };
}

/**
 * Save / Register new or edited Driver/Rider
 */
export async function saveAdminRider(input: {
  driverId: string;
  name: string;
  phone: string;
  nic?: string;
  plate?: string;
  vehicleType?: string;
  route?: string;
  lorryId?: string;
  active?: boolean;
}): Promise<boolean> {
  const cleanId = input.driverId.trim().toUpperCase().replace(/\//g, "-");
  if (!cleanId) return false;
  const cleanPlate = (input.plate || "").trim().toUpperCase();
  const explicitLorry = String(input.lorryId || "").trim().toLowerCase().replace(/\//g, "-");
  const plateSlug = cleanPlate.toLowerCase().replace(/[^a-z0-9]/g, "");
  const idSlug = cleanId.toLowerCase().replace(/[^a-z0-9]/g, "");
  const lorryId =
    explicitLorry && explicitLorry !== "lorry-"
      ? explicitLorry
      : `lorry-${plateSlug || idSlug || Date.now()}`;

  const payload: AdminDriverRecord = {
    driverId: cleanId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    nic: (input.nic || "").trim(),
    plate: cleanPlate,
    vehicleType: input.vehicleType?.trim() || "Lorry Fleet",
    route: input.route?.trim() || "Island-wide Fleet",
    lorryId,
    active: input.active !== false,
    createdAt: Date.now(),
  };

  // 1. Sync to local Web Backend API (/api/drivers)
  try {
    await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}

  // 2. Sync to Firestore drivers and lorries
  try {
    await setDoc(doc(db, "drivers", cleanId), payload, { merge: true });
    if (cleanPlate) {
      await setDoc(
        doc(db, "lorries", lorryId),
        {
          id: lorryId,
          plate: cleanPlate,
          route: payload.route,
          driverName: payload.name,
          driverId: cleanId,
          driverPhone: payload.phone,
          vehicleType: payload.vehicleType,
          status: "empty",
          lastUpdated: "Active",
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }
  } catch {}

  return true;
}

/**
 * Delete Rider from Firestore and local API
 */
export async function deleteAdminRider(driverId: string): Promise<boolean> {
  const cleanId = driverId.trim().toUpperCase();
  try {
    await deleteDoc(doc(db, "drivers", cleanId));
  } catch {}
  try {
    await fetch(`/api/drivers?id=${encodeURIComponent(cleanId)}`, { method: "DELETE" });
  } catch {}
  return true;
}

/**
 * Toggle Rider active status
 */
export async function toggleAdminRiderStatus(driverId: string, active: boolean): Promise<boolean> {
  const cleanId = driverId.trim().toUpperCase();
  try {
    await updateDoc(doc(db, "drivers", cleanId), {
      active,
      updatedAt: Date.now(),
    });
  } catch {}
  return true;
}

/**
 * Save fleet vehicle into Firestore lorries_registry and sync with /api/lorries
 */
export async function saveAdminFleetVehicle(input: {
  plate: string;
  vehicleType: string;
  capacity?: string;
  maxWeight?: string;
  baseCity?: string;
  description?: string;
  images?: string[];
  imageUrl?: string;
  rider?: string;
  driverId?: string;
  driverPhone?: string;
}): Promise<boolean> {
  const cleanPlate = input.plate.trim().toUpperCase();
  const docId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;
  const images = Array.isArray(input.images) && input.images.length > 0
    ? input.images
    : (input.imageUrl ? [input.imageUrl] : []);

  const riderName = input.rider?.trim() || "Unassigned";

  const payload: Record<string, any> = {
    id: docId,
    plate: cleanPlate,
    vehicleType: input.vehicleType.trim(),
    capacity: input.capacity?.trim() || "14ft × 6.5ft × 7ft Cargo Space",
    maxWeight: input.maxWeight?.trim() || "3.5 Tons (3,500 kg)",
    baseCity: input.baseCity?.trim() || "",
    startLocation: input.baseCity?.trim() || "",
    description: input.description?.trim() || "Dedicated individual lorry available for custom cargo bookings.",
    images,
    imageUrl: images[0] || "",
    rider: riderName,
    driverName: riderName === "Unassigned" ? "" : riderName,
    driverId: riderName === "Unassigned" ? "" : (input.driverId?.trim() || ""),
    driverPhone: riderName === "Unassigned" ? "" : (input.driverPhone?.trim() || ""),
    status: "empty",
    updatedAt: Date.now(),
    createdAt: Date.now(),
  };

  // 1. Sync to local API (/api/lorries)
  try {
    await fetch("/api/lorries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}

  // 2. Sync to Firestore (Both lorries_registry and lorries)
  try {
    await setDoc(doc(db, "lorries_registry", docId), payload, { merge: true });
    await setDoc(doc(db, "lorries", docId), payload, { merge: true });
  } catch {}

  return true;
}

/**
 * Delete fleet vehicle from Firestore and API
 */
export async function deleteAdminFleetVehicle(plate: string): Promise<boolean> {
  const cleanPlate = plate.trim().toUpperCase();
  const docId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;

  try {
    await fetch(`/api/lorries?id=${encodeURIComponent(docId)}`, { method: "DELETE" });
  } catch {}

  try {
    await deleteDoc(doc(db, "lorries_registry", docId));
    await deleteDoc(doc(db, "lorries", docId));
  } catch {}

  return true;
}

/**
 * Update lorry status ("empty" vs "on_trip") using Server Action
 */
export async function updateLorryStatus(
  lorryId: string,
  status: LorryStatus
): Promise<void> {
  try {
    await updateLorryStatusAction(lorryId, status);
  } catch (e) {
    console.warn("Server action status update notice:", e);
  }
}

/**
 * Update lorry GPS location & heading/speed in real time using Server Action
 */
export async function updateLorryLocation(
  lorryId: string,
  lat: number,
  lng: number,
  heading: number = 0,
  speedKmH: number = 0
): Promise<void> {
  try {
    await updateLorryLocationAction(lorryId, lat, lng, heading, speedKmH);
  } catch (e) {
    console.warn("Server action location update notice:", e);
  }
}

/**
 * Add a new lorry directly to Fleet using Server Action
 */
export async function addNewLorry(lorry: Omit<Lorry, "id">): Promise<string> {
  const defaultId = `lorry-${lorry.plate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;
  try {
    const res = await registerDriverAndLorryAction({
      name: lorry.driverName || "Driver",
      phone: "0771234567",
      plate: lorry.plate,
      vehicleType: lorry.vehicleType,
      route: lorry.route,
    });
    if (res.success && res.data.lorry?.id) {
      return res.data.lorry.id;
    }
  } catch (e) {
    console.warn("Server action add lorry notice:", e);
  }
  return defaultId;
}

/**
 * Delete a lorry from Fleet using Server Action
 */
export async function deleteLorry(lorryId: string): Promise<void> {
  try {
    await deleteLorryAction(lorryId);
  } catch (e) {
    console.warn("Server action delete lorry notice:", e);
  }
}

/* ============================================================
 * BOOKINGS SERVICE
 * ============================================================ */

export type BookingStatus =
  | "pending"
  | "awaiting_payment"
  | "payment_submitted"
  | "accepted"
  | "booked"
  | "confirmed"
  | "assigned"
  | "in_transit"
  | "delivered"
  | "cancelled";

export interface Booking {
  id: string;
  trackingId: string;
  pickup: string;
  destination: string;
  vehicleType: string;
  weight?: string;
  date: string;
  phone: string;
  notes?: string;
  status: BookingStatus;
  assignedLorryPlate?: string;
  createdAt: number;
}

export type BookingInput = Omit<Booking, "id" | "trackingId" | "createdAt" | "status">;

const BOOKINGS_COL = "bookings";

export function generateTrackingId(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ST-2026-${rand}`;
}

/**
 * Create a new freight booking via Server Action
 */
export async function createBooking(
  input: BookingInput
): Promise<{ id: string; trackingId: string }> {
  try {
    const res = await createBookingAction({
      pickup: input.pickup,
      destination: input.destination,
      vehicleType: input.vehicleType,
      weight: input.weight,
      date: input.date,
      phone: input.phone,
      notes: input.notes,
    });
    if (res.success) {
      return { id: res.data.id, trackingId: res.data.trackingId };
    }
  } catch (err) {
    console.warn("Server action create booking notice:", err);
  }

  const trackingId = generateTrackingId();
  return { id: trackingId, trackingId };
}

/**
 * Subscribe to all bookings in real time (for Admin / Dispatch manager)
 * Uses Firestore onSnapshot stream with single fallback fetch (Zero polling loops)
 */
export function subscribeBookings(
  callback: (bookings: Booking[]) => void
): () => void {
  let isMounted = true;

  const fetchBookingsApiFallback = async () => {
    try {
      const res = await fetch("/api/bookings", { cache: "no-store" });
      if (res.ok && isMounted) {
        const data = await res.json();
        const raw = Array.isArray(data.bookings) ? data.bookings : [];
        const mapped: Booking[] = raw.map((b: StoredBooking) => ({
          id: b.id,
          trackingId: b.id,
          pickup: b.pickupCity || "",
          destination: b.deliveryCity || "",
          vehicleType: b.vehicleType || "Lorry",
          date: b.date || "",
          phone: b.customerPhone || "",
          notes: b.packageDetails || "",
          status: (b.status as BookingStatus) || "pending",
          assignedLorryPlate: b.assignedPlate,
          createdAt: Number(b.createdAt) || 0,
        }));
        callback(mapped);
        return;
      }
    } catch {
      // Non-blocking
    }
    if (isMounted) callback([]);
  };

  let unsubFs = () => {};
  try {
    const colRef = collection(db, BOOKINGS_COL);
    unsubFs = onSnapshot(
      colRef,
      (snapshot) => {
        if (!isMounted) return;
        const items: Booking[] = [];
        const seenIds = new Set<string>();
        snapshot.forEach((d) => {
          const data = d.data();
          const resolvedId = String(data.id || data.trackingId || d.id);
          if (seenIds.has(resolvedId)) return;
          seenIds.add(resolvedId);
          items.push({
            id: resolvedId,
            trackingId: String(data.trackingId || resolvedId),
            pickup: data.pickupCity || data.pickup || "",
            destination: data.deliveryCity || data.destination || "",
            vehicleType: data.vehicleType || "Lorry",
            weight: data.cargoWeight || data.weight || "",
            date: data.date || (Array.isArray(data.dates) && data.dates[0]) || "",
            phone: data.customerPhone || data.phone || "",
            notes: data.packageDetails || data.notes || "",
            status: (data.status as BookingStatus) || "pending",
            assignedLorryPlate: data.assignedPlate || data.assignedLorryPlate || "",
            createdAt: Number(data.createdAt) || 0,
          });
        });
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(items);
      },
      () => {
        fetchBookingsApiFallback();
      }
    );
  } catch {
    fetchBookingsApiFallback();
  }

  return () => {
    isMounted = false;
    unsubFs();
  };
}

/**
 * Get booking by Tracking ID (e.g. "ST-2026-4821") or Phone number via Server Action
 */
export async function findBookingByTrackingOrPhone(
  queryStr: string
): Promise<Booking[]> {
  const clean = queryStr.trim();
  try {
    const res = await trackBookingAction(clean);
    if (res.success && res.data.length > 0) {
      return res.data.map((b) => ({
        id: b.id,
        trackingId: b.id,
        pickup: b.pickupCity,
        destination: b.deliveryCity,
        vehicleType: b.vehicleType,
        date: b.date,
        phone: b.customerPhone,
        notes: b.packageDetails,
        status: b.status as BookingStatus,
        assignedLorryPlate: b.assignedPlate,
        createdAt: b.createdAt,
      }));
    }
  } catch (err) {
    console.warn("trackBookingAction notice:", err);
  }
  return [];
}

/**
 * Update booking status or assign lorry via Server Action
 */
export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  assignedLorryPlate?: string
): Promise<void> {
  try {
    const mappedStatus =
      status === "confirmed" ? "pending" : (status as "pending" | "assigned" | "in_transit" | "delivered" | "cancelled");
    await updateBookingStatusAction(
      bookingId,
      mappedStatus,
      assignedLorryPlate ? { assignedPlate: assignedLorryPlate } : undefined
    );
  } catch (e) {
    console.warn("Server action update booking status notice:", e);
  }
}

/* ============================================================
 * VEHICLE REGISTRATION SERVICE (Partner Lorry Owners)
 * ============================================================ */

export interface VehicleRegistration {
  id: string;
  ownerName: string;
  phone: string;
  plateNumber: string;
  vehicleType: string;
  baseCity: string;
  driverCount: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
}

export type VehicleRegistrationInput = Omit<
  VehicleRegistration,
  "id" | "status" | "createdAt"
>;

const REGISTRATIONS_COL = "vehicle_registrations";

export async function createVehicleRegistration(
  input: VehicleRegistrationInput
): Promise<string> {
  try {
    const res = await registerVehicleAction({
      ownerName: input.ownerName,
      phone: input.phone,
      plateNumber: input.plateNumber,
      vehicleType: input.vehicleType,
      baseCity: input.baseCity,
      driverCount: input.driverCount,
    });
    if (res.success) {
      return res.data.id;
    }
  } catch (e) {
    console.warn("Server action vehicle registration notice:", e);
  }
  return `ST-REG-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function subscribeVehicleRegistrations(
  callback: (regs: VehicleRegistration[]) => void
): () => void {
  const colRef = collection(db, REGISTRATIONS_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: VehicleRegistration[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          ownerName: data.ownerName || "",
          phone: data.phone || "",
          plateNumber: data.plateNumber || data.vehicleNumber || "",
          vehicleType: data.vehicleType || "14ft",
          baseCity: data.baseCity || data.province || "",
          driverCount: data.driverCount || "1",
          status: data.status || "pending",
          createdAt: Number(data.createdAt) || 0,
        });
      });
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(items);
    },
    (err) => {
      console.warn("Error subscribing to registrations:", err);
      callback([]);
    }
  );
}

export async function updateRegistrationStatus(
  regId: string,
  status: "pending" | "approved" | "rejected"
): Promise<void> {
  try {
    await updateRegistrationStatusAction(regId, status);
  } catch (e) {
    console.warn("Server action registration status notice:", e);
  }
}

/**
 * Approve registration and immediately add it to the live fleet on the map
 */
export async function approveAndAddToFleet(
  reg: VehicleRegistration,
  lat: number = 6.9271,
  lng: number = 79.8612
): Promise<void> {
  await updateRegistrationStatus(reg.id, "approved");
  await addNewLorry({
    plate: reg.plateNumber,
    route: `${reg.baseCity} – Island-wide`,
    driverName: reg.ownerName,
    vehicleType: reg.vehicleType,
    lat,
    lng,
    heading: 0,
    speedKmH: 0,
    status: "empty",
    lastUpdated: "Just now",
  });
}

/* ============================================================
 * CUSTOMER REVIEWS SERVICE
 * ============================================================ */

export interface Review {
  id: string;
  name: string;
  role: string;
  stars: number;
  route: string;
  commentEn: string;
  commentSi: string;
  date: string;
  createdAt: number;
}

export type ReviewInput = Omit<Review, "id" | "createdAt">;

const REVIEWS_COL = "reviews";

const INITIAL_REVIEWS_SEED: Omit<Review, "id">[] = [];

export async function seedInitialReviewsIfEmpty(): Promise<boolean> {
  return false;
}

export function subscribeReviews(callback: (reviews: Review[]) => void): () => void {
  const colRef = collection(db, REVIEWS_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        callback([]);
        return;
      }
      const items: Review[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          name: data.name || "Customer",
          role: data.role || "Client",
          stars: data.stars || data.rating || 5,
          route: data.route || data.service || "Sri Lanka",
          commentEn: data.commentEn || data.comment || "",
          commentSi: data.commentSi || data.commentEn || data.comment || "",
          date: data.date || "Recently",
          createdAt: Number(data.createdAt) || 0,
        });
      });
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(items);
    },
    (err) => {
      console.warn("Reviews subscription error:", err);
      callback([]);
    }
  );
}

export async function createReview(input: ReviewInput): Promise<string> {
  try {
    const res = await submitReviewAction({
      name: input.name,
      rating: input.stars,
      role: input.role,
      route: input.route,
      commentEn: input.commentEn,
      commentSi: input.commentSi,
    });
    if (res.success) {
      return res.data.id;
    }
  } catch (e) {
    console.warn("Server action review notice:", e);
  }
  return `ST-REV-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function deleteReview(reviewId: string): Promise<void> {
  try {
    await deleteReviewAction(reviewId);
  } catch (e) {
    console.warn("Server action delete review notice:", e);
  }
}

/* ============================================================
 * CONTACT INQUIRIES SERVICE
 * ============================================================ */

export interface Inquiry {
  id: string;
  name: string;
  phone: string;
  message: string;
  type: "quote" | "support" | "general";
  createdAt: number;
  status: "unread" | "resolved";
}

export type InquiryInput = Omit<Inquiry, "id" | "createdAt" | "status">;

const INQUIRIES_COL = "inquiries";

export async function createInquiry(input: InquiryInput): Promise<string> {
  try {
    const res = await submitInquiryAction({
      name: input.name,
      phone: input.phone,
      message: input.message,
      type: input.type,
    });
    if (res.success) {
      return res.data.id;
    }
  } catch (e) {
    console.warn("Server action inquiry notice:", e);
  }
  return `ST-INQ-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function subscribeInquiries(
  callback: (inquiries: Inquiry[]) => void
): () => void {
  const colRef = collection(db, INQUIRIES_COL);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: Inquiry[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          name: data.name || "",
          phone: data.phone || "",
          message: data.message || "",
          type: data.type || "general",
          createdAt: Number(data.createdAt) || 0,
          status: data.status || "unread",
        });
      });
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(items);
    },
    (err) => {
      console.warn("Inquiries subscription error:", err);
      callback([]);
    }
  );
}

/* ============================================================
 * BANNERS SERVICE
 * ============================================================ */

export interface WebBanner {
  id: string;
  title?: string;
  subtitle?: string;
  desktopImage?: string;
  mobileImage?: string;
  viewMode?: "all" | "mobile" | "desktop";
  ctaText?: string;
  isActive: boolean;
  createdAt: number;
}

const BANNERS_COL = "banners";

export function subscribeBanners(
  callback: (banners: WebBanner[]) => void
): () => void {
  try {
    const colRef = collection(db, BANNERS_COL);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: WebBanner[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data.isActive !== false) {
            items.push({
              id: d.id,
              title: data.title,
              subtitle: data.subtitle,
              desktopImage: data.desktopImage || data.image,
              mobileImage: data.mobileImage || data.desktopImage || data.image,
              viewMode: data.viewMode || "all",
              ctaText: data.ctaText || "Book Now",
              isActive: true,
              createdAt: Number(data.createdAt) || 0,
            });
          }
        });
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(items);
      },
      () => {}
    );
  } catch {
    return () => {};
  }
}
