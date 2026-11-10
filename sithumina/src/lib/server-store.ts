import fs from "fs";
import path from "path";
import {
  normalizePhoneNumber,
  phonesMatch,
  getCanonicalCustomerId,
} from "./phone-utils";

export interface StoredDriver {
  id?: string;
  driverId: string;
  name: string;
  phone: string;
  plate: string;
  vehicleType: string;
  route: string;
  lorryId: string;
  active: boolean;
  createdAt: number;
}

export interface StoredLorry {
  id: string;
  plate: string;
  route: string;
  driverName: string;
  driverPhone?: string;
  driverId: string;
  vehicleType: string;
  capacity?: string;
  maxWeight?: string;
  imageUrl?: string;
  images?: string[];
  description?: string;
  startLocation?: string;
  endLocation?: string;
  travelRoute?: string;
  viaWaypoints?: Array<{ name: string; lat: number; lng: number }>;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  finalDestination?: string;
  emptyTime?: string;
  returnRoute?: string;
  availableSpace?: string;
  availableCapacityKg?: string;
  hasFreezer?: boolean;
  hasHelper?: boolean;
  isOnline?: boolean;
  isLive?: boolean;
  lat: number;
  lng: number;
  heading: number;
  speedKmH: number;
  status: "empty" | "on_trip";
  lastUpdated: string;
  updatedAt: number;
}

export interface StoredCustomer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  createdAt: number;
  lastLoginAt: number;
}

export type BookingStatusValue =
  | "pending"
  | "awaiting_payment"
  | "payment_submitted"
  | "accepted"
  | "assigned"
  | "goods_collected"
  | "in_transit"
  | "delivered"
  | "cancelled"
  | "booked";

export type PaymentSlipStatus =
  | "none"
  | "pending_review"
  | "approved"
  | "manual_approved"
  | "rejected"
  | "deleted";

export type BookingPaymentMethod = "bank_slip" | "cash_manual";

export interface StoredBooking {
  id: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  pickupCity: string;
  deliveryCity: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  date: string;
  dates?: string[];
  vehicleType: string;
  packageDetails?: string;
  status: BookingStatusValue;
  assignedLorryId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedPlate?: string;
  selectedVehiclePlate?: string;
  bookingType?: "individual_vehicle" | "live_lorry";
  cargoNature?: string;
  daysNeeded?: number | string;
  cargoWeight?: string;
  helpersCount?: string | number;
  quotedAmount?: number;
  quotedAt?: number;
  quoteNote?: string;
  paymentMethod?: BookingPaymentMethod;
  paymentBankUsed?: string;
  paymentSlipId?: string;
  paymentSlipName?: string;
  paymentSlipType?: string;
  paymentSlipSize?: number;
  paymentSlipUploadedAt?: number;
  paymentSlipStatus?: PaymentSlipStatus;
  paymentRejectReason?: string;
  paymentApprovedAt?: number;
  paymentSlipDeletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredRegistration {
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

export interface StoredInquiry {
  id: string;
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
  status: "unread" | "resolved";
  createdAt: number;
}

export interface StoredReview {
  id: string;
  name: string;
  rating: number;
  comment: string;
  service: string;
  createdAt: number;
}

interface FleetStoreData {
  drivers: StoredDriver[];
  lorries: StoredLorry[];
  customers: StoredCustomer[];
  bookings: StoredBooking[];
  registrations: StoredRegistration[];
  inquiries: StoredInquiry[];
  reviews: StoredReview[];
}

const STORE_PATH = path.join(process.cwd(), "data", "fleet-store.json");

const DEFAULT_REVIEWS_SEED: StoredReview[] = [];

export const DEFAULT_LORRIES_SEED: StoredLorry[] = [];

function normalizeLorry(l: any, index: number): StoredLorry {
  const images = Array.isArray(l.images)
    ? l.images.filter((img: string) => img && typeof img === "string" && !img.startsWith("/img"))
    : (l.imageUrl && typeof l.imageUrl === "string" && !l.imageUrl.startsWith("/img") ? [l.imageUrl] : []);

  return {
    ...l,
    plate: (l.plate || "").toUpperCase().trim(),
    vehicleType: l.vehicleType || "Lorry Fleet",
    capacity: l.capacity || "",
    maxWeight: l.maxWeight || "",
    imageUrl: images[0] || (l.imageUrl && typeof l.imageUrl === "string" && !l.imageUrl.startsWith("/img") ? l.imageUrl : ""),
    images: images,
    description: l.description || "",
    route: l.route || "",
    driverName: l.driverName || "",
    driverPhone: l.driverPhone || "",
    viaWaypoints: Array.isArray(l.viaWaypoints) ? l.viaWaypoints : undefined,
    status: l.status || "empty",
    lastUpdated: l.lastUpdated || "Available",
    updatedAt: l.updatedAt || Date.now(),
  };
}

let inMemoryStore: FleetStoreData | null = null;
let writeStoreTimeout: NodeJS.Timeout | null = null;

function readStore(): FleetStoreData {
  if (inMemoryStore) {
    return inMemoryStore;
  }
  try {
    if (!fs.existsSync(STORE_PATH)) {
      const initial: FleetStoreData = {
        drivers: [],
        lorries: DEFAULT_LORRIES_SEED,
        customers: [],
        bookings: [],
        registrations: [],
        inquiries: [],
        reviews: DEFAULT_REVIEWS_SEED,
      };
      try {
        const dir = path.dirname(STORE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf8");
      } catch {
        // Read-only serverless environment (e.g. Vercel / AWS Lambda)
      }
      inMemoryStore = initial;
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const rawLorries = Array.isArray(parsed.lorries)
      ? parsed.lorries.map((l: any, idx: number) => normalizeLorry(l, idx))
      : [];

    const store: FleetStoreData = {
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
      lorries: rawLorries,
      customers: Array.isArray(parsed.customers) ? parsed.customers : [],
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
      inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    };
    inMemoryStore = store;
    return store;
  } catch (err) {
    console.warn("Could not read fleet-store.json, initializing default:", err);
    const fallback: FleetStoreData = {
      drivers: [],
      lorries: DEFAULT_LORRIES_SEED,
      customers: [],
      bookings: [],
      registrations: [],
      inquiries: [],
      reviews: DEFAULT_REVIEWS_SEED,
    };
    inMemoryStore = fallback;
    return fallback;
  }
}

function writeStore(data: FleetStoreData, immediate = false): void {
  inMemoryStore = data;
  const doWrite = () => {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // Expected in serverless hosts like Vercel with read-only filesystems.
      // Firestore acts as the primary cloud database.
    }
  };

  if (immediate) {
    if (writeStoreTimeout) {
      clearTimeout(writeStoreTimeout);
      writeStoreTimeout = null;
    }
    doWrite();
  } else {
    if (!writeStoreTimeout) {
      writeStoreTimeout = setTimeout(() => {
        writeStoreTimeout = null;
        if (inMemoryStore) doWrite();
      }, 3000);
    }
  }
}

/* ============================================================
 * DRIVERS & FLEET
 * ============================================================ */

export function getAllStoredDrivers(): StoredDriver[] {
  return readStore().drivers;
}

export function getAllFleetVehicles(): StoredLorry[] {
  const store = readStore();
  return store.lorries;
}

export function getAllStoredLorries(): StoredLorry[] {
  const store = readStore();
  const now = Date.now();
  const HEARTBEAT_STALE_MS = 180_000; // 3 minutes

  // Auto-remove or filter out any stale broadcasts where driver stopped broadcasting or heartbeat ceased
  const activeLorries = store.lorries.filter((l: any) => {
    if (l.isLive === false || l.status === "offline") return false;
    const updateMs = Number(l.updatedAt) || 0;
    if (updateMs > 0 && (now - updateMs) > HEARTBEAT_STALE_MS) {
      return false;
    }
    return true;
  });

  return activeLorries;
}

export function generateUniqueDriverId(): string {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `ST-DRV-${randomSuffix}`;
}

export function registerDriverInStore(input: {
  name: string;
  phone: string;
  plate: string;
  vehicleType: string;
  route: string;
  driverId?: string;
}): { driver: StoredDriver; lorry: StoredLorry } {
  const store = readStore();
  const cleanPlate = input.plate.trim().toUpperCase();
  const driverId = input.driverId || generateUniqueDriverId();
  const lorryId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase() || driverId.toLowerCase()}`;

  const driver: StoredDriver = {
    driverId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    plate: cleanPlate,
    vehicleType: input.vehicleType.trim() || "14ft Lorry",
    route: input.route.trim() || "Colombo – Island-wide",
    lorryId,
    active: true,
    createdAt: Date.now(),
  };

  // Upsert driver
  const existingDriverIdx = store.drivers.findIndex(
    (d) => d.driverId === driverId || d.plate === cleanPlate
  );
  if (existingDriverIdx >= 0) {
    store.drivers[existingDriverIdx] = driver;
  } else {
    store.drivers.unshift(driver);
  }

  // Upsert matching lorry
  const existingLorryIdx = store.lorries.findIndex(
    (l) => l.id === lorryId || l.plate === cleanPlate
  );

  let lorry: StoredLorry;
  if (existingLorryIdx >= 0) {
    lorry = {
      ...store.lorries[existingLorryIdx],
      plate: cleanPlate,
      driverName: driver.name,
      driverId,
      vehicleType: driver.vehicleType,
      route: driver.route,
      updatedAt: Date.now(),
    };
    store.lorries[existingLorryIdx] = lorry;
  } else {
    lorry = {
      id: lorryId,
      plate: cleanPlate,
      route: driver.route,
      driverName: driver.name,
      driverId,
      vehicleType: driver.vehicleType,
      lat: 6.9271,
      lng: 79.8612,
      heading: 0,
      speedKmH: 0,
      status: "empty",
      lastUpdated: "Just registered",
      updatedAt: Date.now(),
    };
    store.lorries.unshift(lorry);
  }

  writeStore(store);
  return { driver, lorry };
}

export function updateLorryGpsInStore(
  identifier: string,
  lat: number,
  lng: number,
  heading: number = 0,
  speedKmH: number = 0,
  meta?: Record<string, any>
): StoredLorry {
  const store = readStore();
  const clean = identifier.trim().toUpperCase();

  const idx = store.lorries.findIndex(
    (l) =>
      l.id.toUpperCase() === clean ||
      l.plate.toUpperCase() === clean ||
      (l.driverId && l.driverId.toUpperCase() === clean)
  );

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  const validLat = Number.isFinite(parsedLat) ? parsedLat : 6.9271;
  const validLng = Number.isFinite(parsedLng) ? parsedLng : 79.8612;

  if (idx === -1) {
    const rawCleanId = identifier.trim().toLowerCase().replace(/\//g, "-");
    const fallbackSlug = String(meta?.plate || meta?.driverId || "fleet")
      .trim()
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    const cleanId =
      rawCleanId && rawCleanId !== "lorry-"
        ? rawCleanId
        : `lorry-${fallbackSlug || Date.now()}`;
    const incomingDrv = String(meta?.driverName || "").trim();
    const cleanIncomingDrv =
      incomingDrv && incomingDrv !== "Driver" && incomingDrv !== "Unassigned" ? incomingDrv : "";
    const newLorry: StoredLorry = {
      id: cleanId,
      plate: (meta?.plate || clean).toString().trim().toUpperCase(),
      route: meta?.route || "",
      driverName: cleanIncomingDrv,
      driverPhone: meta?.driverPhone || "",
      driverId: meta?.driverId || cleanId,
      vehicleType: meta?.vehicleType || "Lorry Fleet",
      capacity: meta?.capacity || "Standard Payload",
      startLocation: meta?.startLocation || "",
      endLocation: meta?.endLocation || "",
      travelRoute: meta?.travelRoute || "",
      startLat: meta?.startLat ? Number(meta.startLat) : undefined,
      startLng: meta?.startLng ? Number(meta.startLng) : undefined,
      endLat: meta?.endLat ? Number(meta.endLat) : undefined,
      endLng: meta?.endLng ? Number(meta.endLng) : undefined,
      finalDestination: meta?.finalDestination || "",
      emptyTime: meta?.emptyTime || "",
      returnRoute: meta?.returnRoute || "",
      availableSpace: meta?.availableSpace || "",
      availableCapacityKg: meta?.availableCapacityKg || "",
      hasFreezer: meta?.hasFreezer !== undefined ? Boolean(meta.hasFreezer) : undefined,
      hasHelper: meta?.hasHelper !== undefined ? Boolean(meta.hasHelper) : undefined,
      isOnline: true,
      isLive: true,
      lat: validLat,
      lng: validLng,
      heading: Math.round(heading) || 0,
      speedKmH: Math.round(speedKmH) || 0,
      status: meta?.status || "empty",
      lastUpdated: "Just now",
      updatedAt: Date.now(),
    };
    store.lorries.unshift(newLorry);
    writeStore(store);
    return newLorry;
  }

  store.lorries[idx].lat = validLat;
  store.lorries[idx].lng = validLng;
  store.lorries[idx].heading = Math.round(heading) || 0;
  store.lorries[idx].speedKmH = Math.round(speedKmH) || 0;
  store.lorries[idx].isLive = true;
  store.lorries[idx].isOnline = true;
  if (meta?.plate) store.lorries[idx].plate = meta.plate.trim().toUpperCase();
  const metaDrv = String(meta?.driverName || "").trim();
  if (metaDrv && metaDrv !== "Driver" && metaDrv !== "Unassigned") store.lorries[idx].driverName = metaDrv;
  if (meta?.driverPhone) store.lorries[idx].driverPhone = meta.driverPhone;
  if (meta?.route) store.lorries[idx].route = meta.route;
  if (meta?.status) store.lorries[idx].status = meta.status;
  if (meta?.startLocation) store.lorries[idx].startLocation = meta.startLocation;
  if (meta?.endLocation) store.lorries[idx].endLocation = meta.endLocation;
  if (meta?.travelRoute) store.lorries[idx].travelRoute = meta.travelRoute;
  if (meta?.startLat) store.lorries[idx].startLat = Number(meta.startLat);
  if (meta?.startLng) store.lorries[idx].startLng = Number(meta.startLng);
  if (meta?.endLat) store.lorries[idx].endLat = Number(meta.endLat);
  if (meta?.endLng) store.lorries[idx].endLng = Number(meta.endLng);
  if (meta?.finalDestination) store.lorries[idx].finalDestination = meta.finalDestination;
  if (meta?.emptyTime) store.lorries[idx].emptyTime = meta.emptyTime;
  if (meta?.returnRoute) store.lorries[idx].returnRoute = meta.returnRoute;
  if (meta?.viaWaypoints && Array.isArray(meta.viaWaypoints)) store.lorries[idx].viaWaypoints = meta.viaWaypoints;
  if (meta?.capacity) store.lorries[idx].capacity = meta.capacity;
  if (meta?.availableSpace) store.lorries[idx].availableSpace = meta.availableSpace;
  if (meta?.availableCapacityKg) store.lorries[idx].availableCapacityKg = meta.availableCapacityKg;
  if (meta?.hasFreezer !== undefined) store.lorries[idx].hasFreezer = Boolean(meta.hasFreezer);
  if (meta?.hasHelper !== undefined) store.lorries[idx].hasHelper = Boolean(meta.hasHelper);
  store.lorries[idx].lastUpdated = "Just now";
  store.lorries[idx].updatedAt = Date.now();

  writeStore(store);
  return store.lorries[idx];
}

export function upsertLorryTripInStore(input: {
  id?: string;
  lorryId?: string;
  plate: string;
  driverName?: string;
  driverPhone?: string;
  driverId?: string;
  vehicleType?: string;
  route?: string;
  status?: "empty" | "on_trip";
  startLocation?: string;
  endLocation?: string;
  travelRoute?: string;
  capacity?: string;
  maxWeight?: string;
  imageUrl?: string;
  images?: string[];
  description?: string;
  lat?: number;
  lng?: number;
  heading?: number;
  speedKmH?: number;
}): StoredLorry {
  const store = readStore();
  const fallbackSlug = (input.plate || input.driverId || "fleet")
    .replace(/[^A-Z0-9]/gi, "")
    .toLowerCase();
  const candidateRaw = String(input.lorryId || input.id || "")
    .trim()
    .toLowerCase()
    .replace(/\//g, "-");
  const cleanId =
    candidateRaw && candidateRaw !== "lorry-"
      ? candidateRaw
      : `lorry-${fallbackSlug || Date.now()}`;
  const cleanPlate = (input.plate || "").trim().toUpperCase();

  const idx = store.lorries.findIndex(
    (l) =>
      l.id.toLowerCase() === cleanId ||
      l.plate.toUpperCase() === cleanPlate ||
      (input.driverId && l.driverId.toUpperCase() === input.driverId.toUpperCase())
  );

  const parsedLat = Number(input.lat);
  const parsedLng = Number(input.lng);

  const existingImages = (idx >= 0 && Array.isArray(store.lorries[idx].images) && store.lorries[idx].images!.length > 0)
    ? store.lorries[idx].images!.filter((img) => img && typeof img === "string" && !img.startsWith("/img"))
    : [];
  const finalImages = Array.isArray(input.images) && input.images.length > 0
    ? input.images.filter((img) => img && typeof img === "string" && !img.startsWith("/img"))
    : (input.imageUrl && typeof input.imageUrl === "string" && !input.imageUrl.startsWith("/img") ? [input.imageUrl] : existingImages);

  const defaultImage = finalImages[0] || ((idx >= 0 && store.lorries[idx].imageUrl && !store.lorries[idx].imageUrl.startsWith("/img")) ? store.lorries[idx].imageUrl : "");
  const defaultDesc = (idx >= 0 && store.lorries[idx].description) ? store.lorries[idx].description : "";
  const defaultMaxWeight = (idx >= 0 && store.lorries[idx].maxWeight) ? store.lorries[idx].maxWeight : "";

  const existingDriverName =
    idx >= 0 && store.lorries[idx].driverName && store.lorries[idx].driverName !== "Driver" && store.lorries[idx].driverName !== "Unassigned"
      ? store.lorries[idx].driverName
      : "";
  const rawIncomingDriverName = String(input.driverName || "").trim();
  const cleanIncomingDriverName =
    rawIncomingDriverName && rawIncomingDriverName !== "Driver" && rawIncomingDriverName !== "Unassigned"
      ? rawIncomingDriverName
      : "";

  const lorry: StoredLorry = {
    id: cleanId,
    plate: cleanPlate || cleanId.toUpperCase(),
    route: input.route || (input.startLocation && input.endLocation ? `${input.startLocation} → ${input.endLocation}` : ""),
    driverName: cleanIncomingDriverName || existingDriverName,
    driverPhone: String(input.driverPhone || "").trim() || (idx >= 0 ? store.lorries[idx].driverPhone : "") || "",
    driverId: input.driverId || cleanId,
    vehicleType: input.vehicleType || "Lorry Fleet",
    capacity: input.capacity || "",
    maxWeight: input.maxWeight || defaultMaxWeight,
    imageUrl: input.imageUrl || defaultImage,
    images: finalImages,
    description: input.description || defaultDesc,
    startLocation: input.startLocation || "",
    endLocation: input.endLocation || "",
    travelRoute: input.travelRoute || "",
    viaWaypoints: Array.isArray((input as any).viaWaypoints) ? (input as any).viaWaypoints : undefined,
    startLat: (input as any).startLat ? Number((input as any).startLat) : undefined,
    startLng: (input as any).startLng ? Number((input as any).startLng) : undefined,
    endLat: (input as any).endLat ? Number((input as any).endLat) : undefined,
    endLng: (input as any).endLng ? Number((input as any).endLng) : undefined,
    finalDestination: (input as any).finalDestination || "",
    emptyTime: (input as any).emptyTime || "",
    returnRoute: (input as any).returnRoute || "",
    availableSpace: (input as any).availableSpace || "",
    availableCapacityKg: (input as any).availableCapacityKg || "",
    hasFreezer: (input as any).hasFreezer !== undefined ? Boolean((input as any).hasFreezer) : undefined,
    hasHelper: (input as any).hasHelper !== undefined ? Boolean((input as any).hasHelper) : undefined,
    isOnline: true,
    isLive: true,
    lat: Number.isFinite(parsedLat) ? parsedLat : 6.9271,
    lng: Number.isFinite(parsedLng) ? parsedLng : 79.8612,
    heading: Math.round(Number(input.heading)) || 0,
    speedKmH: Math.round(Number(input.speedKmH)) || 0,
    status: input.status || "empty",
    lastUpdated: "Just now",
    updatedAt: Date.now(),
  };

  if (idx >= 0) {
    store.lorries[idx] = { ...store.lorries[idx], ...lorry };
  } else {
    store.lorries.unshift(lorry);
  }

  writeStore(store);
  return idx >= 0 ? store.lorries[idx] : lorry;
}

export const upsertLorryInStore = upsertLorryTripInStore;

export function updateLorryStatusInStore(
  identifier: string,
  status: "empty" | "on_trip"
): StoredLorry | null {
  const store = readStore();
  const clean = identifier.trim().toUpperCase();

  const idx = store.lorries.findIndex(
    (l) =>
      l.id.toUpperCase() === clean ||
      l.plate.toUpperCase() === clean ||
      (l.driverId && l.driverId.toUpperCase() === clean)
  );

  if (idx === -1) return null;

  store.lorries[idx].status = status;
  store.lorries[idx].lastUpdated = "Just now";
  store.lorries[idx].updatedAt = Date.now();

  writeStore(store);
  return store.lorries[idx];
}

export function deleteLorryFromStore(idOrPlate: string): boolean {
  const store = readStore();
  const clean = (idOrPlate || "").trim().toLowerCase();
  const cleanPlate = clean.replace(/[^a-z0-9]/g, "");
  const initialLen = store.lorries.length;

  store.lorries = store.lorries.filter((l) => {
    const lId = (l.id || "").toLowerCase();
    const lPlate = (l.plate || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const dId = (l.driverId || "").toLowerCase();
    return lId !== clean && lPlate !== cleanPlate && lId !== `lorry-${cleanPlate}` && dId !== clean;
  });
  store.drivers = store.drivers.filter(
    (d) => d.lorryId.toLowerCase() !== clean && d.driverId.toLowerCase() !== clean
  );

  writeStore(store);
  return store.lorries.length !== initialLen;
}

export function deleteDriverFromStore(idOrPlate: string): boolean {
  const store = readStore();
  const clean = (idOrPlate || "").trim().toLowerCase();
  const cleanAlnum = clean.replace(/[^a-z0-9]/g, "");
  const initialLen = store.drivers.length;

  store.drivers = store.drivers.filter((d) => {
    const dId = (d.driverId || d.id || "").toLowerCase();
    const dPlate = (d.plate || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const dLorryId = (d.lorryId || "").toLowerCase();
    return (
      dId !== clean &&
      dPlate !== cleanAlnum &&
      dLorryId !== clean &&
      dLorryId !== `lorry-${cleanAlnum}`
    );
  });

  if (store.drivers.length !== initialLen) {
    writeStore(store);
    return true;
  }
  return false;
}

/* ============================================================
 * CUSTOMERS
 * ============================================================ */

export function getAllStoredCustomers(): StoredCustomer[] {
  return readStore().customers;
}

export function upsertCustomerInStore(input: {
  name: string;
  phone: string;
  email?: string;
  city?: string;
}): StoredCustomer {
  const store = readStore();
  const canonicalPhone = normalizePhoneNumber(input.phone) || input.phone.trim();
  const id = getCanonicalCustomerId(input.phone);

  const existingIdx = store.customers.findIndex(
    (c) => phonesMatch(c.phone, input.phone) || c.id === id
  );

  const incomingName = (input.name || "").trim();
  const isGenericIncoming =
    !incomingName ||
    incomingName === "Customer" ||
    incomingName === "Valued Customer" ||
    incomingName.startsWith("Customer (");

  const existingCustomer = existingIdx >= 0 ? store.customers[existingIdx] : undefined;
  const existingName = (existingCustomer?.name || "").trim();
  const isGenericExisting =
    !existingName ||
    existingName === "Customer" ||
    existingName === "Valued Customer" ||
    existingName.startsWith("Customer (");

  const resolvedName = !isGenericIncoming
    ? incomingName
    : !isGenericExisting
    ? existingName
    : incomingName || "Customer";

  const customer: StoredCustomer = {
    id,
    name: resolvedName,
    phone: canonicalPhone,
    email: input.email?.trim() || existingCustomer?.email || "",
    city: input.city?.trim() || existingCustomer?.city || "",
    createdAt: existingCustomer ? existingCustomer.createdAt : Date.now(),
    lastLoginAt: Date.now(),
  };

  if (existingIdx >= 0) {
    store.customers[existingIdx] = customer;
  } else {
    store.customers.unshift(customer);
  }

  writeStore(store);
  return customer;
}

/* ============================================================
 * BOOKINGS
 * ============================================================ */

export function getAllStoredBookings(): StoredBooking[] {
  return readStore().bookings;
}

export function getBookingsByCustomerPhone(phone: string): StoredBooking[] {
  return readStore().bookings.filter((b) => phonesMatch(b.customerPhone, phone));
}

export function upsertBookingInStore(booking: StoredBooking): StoredBooking {
  const store = readStore();
  const normalizedPhone =
    normalizePhoneNumber(booking.customerPhone) || booking.customerPhone.trim();
  const nextBooking: StoredBooking = {
    ...booking,
    customerPhone: normalizedPhone,
  };

  const idx = store.bookings.findIndex((b) => b.id === nextBooking.id);
  if (idx >= 0) {
    store.bookings[idx] = {
      ...store.bookings[idx],
      ...nextBooking,
      updatedAt: Math.max(store.bookings[idx].updatedAt || 0, nextBooking.updatedAt || Date.now()),
    };
  } else {
    store.bookings.unshift(nextBooking);
  }

  if (nextBooking.customerPhone) {
    const custId = getCanonicalCustomerId(nextBooking.customerPhone);
    const cIdx = store.customers.findIndex(
      (c) => phonesMatch(c.phone, nextBooking.customerPhone) || c.id === custId
    );
    if (cIdx === -1) {
      store.customers.unshift({
        id: custId,
        name: nextBooking.customerName || "Customer",
        phone: normalizedPhone,
        email: "",
        city: "",
        createdAt: nextBooking.createdAt || Date.now(),
        lastLoginAt: Date.now(),
      });
    }
  }

  writeStore(store);
  return idx >= 0 ? store.bookings[idx] : nextBooking;
}

export function createBookingInStore(input: {
  customerName: string;
  customerPhone: string;
  pickupCity: string;
  deliveryCity: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  date: string;
  dates?: string[];
  vehicleType: string;
  packageDetails?: string;
  assignedPlate?: string;
  assignedLorryId?: string;
  bookingType?: "individual_vehicle" | "live_lorry";
  cargoNature?: string;
  daysNeeded?: number | string;
  cargoWeight?: string;
  helpersCount?: string | number;
  status?: BookingStatusValue;
  quotedAmount?: number;
  quotedAt?: number;
  quoteNote?: string;
  paymentMethod?: BookingPaymentMethod;
  paymentBankUsed?: string;
  paymentSlipId?: string;
  paymentSlipName?: string;
  paymentSlipType?: string;
  paymentSlipSize?: number;
  paymentSlipUploadedAt?: number;
  paymentSlipStatus?: PaymentSlipStatus;
  paymentRejectReason?: string;
  paymentApprovedAt?: number;
  paymentSlipDeletedAt?: number;
}): StoredBooking {
  const store = readStore();
  let id = `ST-BK-${Math.floor(1000 + Math.random() * 9000)}`;
  let guard = 0;
  while (store.bookings.some((b) => b.id === id) && guard < 20) {
    id = `ST-BK-${Math.floor(1000 + Math.random() * 9000)}`;
    guard += 1;
  }

  const normalizedPhone =
    normalizePhoneNumber(input.customerPhone) || input.customerPhone.trim();

  const resolvedDates = Array.isArray(input.dates) && input.dates.length > 0
    ? input.dates
    : (input.date ? [input.date] : [new Date().toISOString().split("T")[0]]);

  const booking: StoredBooking = {
    id,
    customerName: input.customerName.trim(),
    customerPhone: normalizedPhone,
    pickupCity: input.pickupCity.trim(),
    deliveryCity: input.deliveryCity.trim(),
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    deliveryLat: input.deliveryLat,
    deliveryLng: input.deliveryLng,
    date: resolvedDates[0],
    dates: resolvedDates,
    vehicleType: input.vehicleType.trim(),
    packageDetails: input.packageDetails?.trim() || "",
    status: input.status || "pending",
    assignedPlate: input.assignedPlate?.trim(),
    assignedLorryId: input.assignedLorryId?.trim(),
    bookingType: input.bookingType || (input.assignedPlate ? "individual_vehicle" : "individual_vehicle"),
    cargoNature: input.cargoNature?.trim(),
    daysNeeded: input.daysNeeded,
    cargoWeight: input.cargoWeight?.trim(),
    helpersCount: input.helpersCount,
    quotedAmount: input.quotedAmount,
    quotedAt: input.quotedAt,
    quoteNote: input.quoteNote?.trim(),
    paymentMethod: input.paymentMethod,
    paymentBankUsed: input.paymentBankUsed,
    paymentSlipId: input.paymentSlipId,
    paymentSlipName: input.paymentSlipName,
    paymentSlipType: input.paymentSlipType,
    paymentSlipSize: input.paymentSlipSize,
    paymentSlipUploadedAt: input.paymentSlipUploadedAt,
    paymentSlipStatus: input.paymentSlipStatus || "none",
    paymentRejectReason: input.paymentRejectReason,
    paymentApprovedAt: input.paymentApprovedAt,
    paymentSlipDeletedAt: input.paymentSlipDeletedAt,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  store.bookings.unshift(booking);

  writeStore(store);

  // Auto-record customer in customer store
  upsertCustomerInStore({
    name: booking.customerName,
    phone: booking.customerPhone,
  });

  return booking;
}

export function updateBookingStatusInStore(
  id: string,
  status: BookingStatusValue,
  assignment?: {
    assignedLorryId?: string;
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedPlate?: string;
  },
  paymentMeta?: {
    quotedAmount?: number;
    quotedAt?: number;
    quoteNote?: string;
    paymentMethod?: BookingPaymentMethod;
    paymentBankUsed?: string;
    paymentSlipId?: string;
    paymentSlipName?: string;
    paymentSlipType?: string;
    paymentSlipSize?: number;
    paymentSlipUploadedAt?: number;
    paymentSlipStatus?: PaymentSlipStatus;
    paymentRejectReason?: string;
    paymentApprovedAt?: number;
    paymentSlipDeletedAt?: number;
  }
): StoredBooking | null {
  const store = readStore();
  const idx = store.bookings.findIndex((b) => b.id === id);
  if (idx === -1) return null;

  store.bookings[idx].status = status;
  store.bookings[idx].updatedAt = Date.now();

  if (assignment) {
    if (assignment.assignedLorryId) {
      store.bookings[idx].assignedLorryId = assignment.assignedLorryId;
    }
    const cleanAssignDriver = String(assignment.assignedDriverName || "").trim();
    if (cleanAssignDriver && cleanAssignDriver !== "Driver" && cleanAssignDriver !== "Unassigned") {
      store.bookings[idx].assignedDriverName = cleanAssignDriver;
    } else if (
      store.bookings[idx].assignedDriverName === "Driver" ||
      store.bookings[idx].assignedDriverName === "Unassigned"
    ) {
      store.bookings[idx].assignedDriverName = "";
    }
    if (assignment.assignedDriverPhone) {
      store.bookings[idx].assignedDriverPhone = assignment.assignedDriverPhone;
    }
    if (assignment.assignedPlate) {
      store.bookings[idx].assignedPlate = assignment.assignedPlate;
    }
  }

  if (paymentMeta) {
    if (paymentMeta.quotedAmount !== undefined) store.bookings[idx].quotedAmount = paymentMeta.quotedAmount;
    if (paymentMeta.quotedAt !== undefined) store.bookings[idx].quotedAt = paymentMeta.quotedAt;
    if (paymentMeta.quoteNote !== undefined) store.bookings[idx].quoteNote = paymentMeta.quoteNote;
    if (paymentMeta.paymentMethod !== undefined) store.bookings[idx].paymentMethod = paymentMeta.paymentMethod;
    if (paymentMeta.paymentBankUsed !== undefined) store.bookings[idx].paymentBankUsed = paymentMeta.paymentBankUsed;
    if (paymentMeta.paymentSlipId !== undefined) store.bookings[idx].paymentSlipId = paymentMeta.paymentSlipId;
    if (paymentMeta.paymentSlipName !== undefined) store.bookings[idx].paymentSlipName = paymentMeta.paymentSlipName;
    if (paymentMeta.paymentSlipType !== undefined) store.bookings[idx].paymentSlipType = paymentMeta.paymentSlipType;
    if (paymentMeta.paymentSlipSize !== undefined) store.bookings[idx].paymentSlipSize = paymentMeta.paymentSlipSize;
    if (paymentMeta.paymentSlipUploadedAt !== undefined) store.bookings[idx].paymentSlipUploadedAt = paymentMeta.paymentSlipUploadedAt;
    if (paymentMeta.paymentSlipStatus !== undefined) store.bookings[idx].paymentSlipStatus = paymentMeta.paymentSlipStatus;
    if (paymentMeta.paymentRejectReason !== undefined) store.bookings[idx].paymentRejectReason = paymentMeta.paymentRejectReason;
    if (paymentMeta.paymentApprovedAt !== undefined) store.bookings[idx].paymentApprovedAt = paymentMeta.paymentApprovedAt;
    if (paymentMeta.paymentSlipDeletedAt !== undefined) store.bookings[idx].paymentSlipDeletedAt = paymentMeta.paymentSlipDeletedAt;
  }

  writeStore(store);
  return store.bookings[idx];
}

export function deleteBookingFromStore(id: string): boolean {
  const store = readStore();
  const cleanId = (id || "").trim();
  const initialCount = store.bookings.length;
  store.bookings = store.bookings.filter((b) => b.id !== cleanId);
  if (store.bookings.length !== initialCount) {
    writeStore(store);
    return true;
  }
  return false;
}

/* ============================================================
 * VEHICLE REGISTRATIONS / PARTNER APPLICATIONS
 * ============================================================ */

export function getAllStoredRegistrations(): StoredRegistration[] {
  return readStore().registrations;
}

export function addRegistrationInStore(input: {
  ownerName: string;
  phone: string;
  vehicleNumber: string;
  vehicleType: string;
  capacity: string;
  province: string;
}): StoredRegistration {
  const store = readStore();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const id = `ST-REG-${randomSuffix}`;

  const reg: StoredRegistration = {
    id,
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    vehicleNumber: input.vehicleNumber.trim().toUpperCase(),
    vehicleType: input.vehicleType.trim(),
    capacity: input.capacity.trim(),
    province: input.province.trim(),
    status: "pending",
    createdAt: Date.now(),
  };

  store.registrations.unshift(reg);
  writeStore(store);
  return reg;
}

export function updateRegistrationStatusInStore(
  id: string,
  status: "pending" | "approved" | "rejected"
): StoredRegistration | null {
  const store = readStore();
  const idx = store.registrations.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  store.registrations[idx].status = status;
  writeStore(store);
  return store.registrations[idx];
}

/* ============================================================
 * INQUIRIES & REVIEWS
 * ============================================================ */

export function getAllStoredInquiries(): StoredInquiry[] {
  return readStore().inquiries;
}

export function addInquiryInStore(input: {
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
}): StoredInquiry {
  const store = readStore();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const id = `ST-INQ-${randomSuffix}`;

  const inq: StoredInquiry = {
    id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || "",
    subject: input.subject.trim(),
    message: input.message.trim(),
    status: "unread",
    createdAt: Date.now(),
  };

  store.inquiries.unshift(inq);
  writeStore(store);
  return inq;
}

export function updateInquiryStatusInStore(
  id: string,
  status: "unread" | "resolved"
): StoredInquiry | null {
  const store = readStore();
  const idx = store.inquiries.findIndex((i) => i.id === id);
  if (idx === -1) return null;

  store.inquiries[idx].status = status;
  writeStore(store);
  return store.inquiries[idx];
}

export function getAllStoredReviews(): StoredReview[] {
  return readStore().reviews;
}

export function addReviewInStore(input: {
  name: string;
  rating: number;
  comment: string;
  service: string;
}): StoredReview {
  const store = readStore();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const id = `ST-REV-${randomSuffix}`;

  const rev: StoredReview = {
    id,
    name: input.name.trim(),
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment.trim(),
    service: input.service.trim() || "Island-wide Transport",
    createdAt: Date.now(),
  };

  store.reviews.unshift(rev);
  writeStore(store);
  return rev;
}

export function deleteReviewFromStore(id: string): boolean {
  const store = readStore();
  const clean = id.trim();
  const initial = store.reviews.length;
  store.reviews = store.reviews.filter((r) => r.id !== clean);
  if (store.reviews.length !== initial) {
    writeStore(store);
    return true;
  }
  return false;
}

export function findBookingsInStore(searchQuery: string): StoredBooking[] {
  const store = readStore();
  const q = searchQuery.trim().toLowerCase();
  const cleanPhone = q.replace(/[^0-9]/g, "");

  return store.bookings.filter((b) => {
    const idMatch = String(b.id || "").toLowerCase().includes(q);
    const plateMatch = b.assignedPlate?.toLowerCase().includes(q);
    const cityMatch =
      String(b.pickupCity || "").toLowerCase().includes(q) ||
      String(b.deliveryCity || "").toLowerCase().includes(q);

    const bPhoneClean = String(b.customerPhone || "").replace(/[^0-9]/g, "");
    const phoneMatch =
      phonesMatch(b.customerPhone, searchQuery) ||
      (cleanPhone.length >= 4 &&
        bPhoneClean.length > 0 &&
        (bPhoneClean.includes(cleanPhone) || cleanPhone.includes(bPhoneClean)));

    return idMatch || plateMatch || cityMatch || phoneMatch;
  });
}