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
  nic?: string;
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
  dimensions?: string;
  isOutsideLorry?: boolean;
  ownershipType?: "company" | "outside";
  ownerIdNumber?: string;
  isAvailable?: boolean;
  baseCity?: string;
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
  idNumber?: string;
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
  | "cash_pending"
  | "rejected"
  | "deleted";

export type BookingPaymentMethod = "bank_slip" | "cash_manual" | "bank_transfer";

export interface StoredBooking {
  id: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  customerIdNumber?: string;
  distanceKm?: number;
  pickupCity: string;
  deliveryCity: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  date: string;
  dates?: string[];
  startTime?: string;
  endTime?: string;
  vehicleType: string;
  packageDetails?: string;
  status: BookingStatusValue;
  assignedLorryId?: string;
  assignedDriverId?: string;
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
  advanceAmount?: number;
  pendingAmount?: number;
  finalPaymentMethod?: BookingPaymentMethod;
  finalPaymentBankUsed?: string;
  finalPaymentAt?: number;
  paymentSlipId?: string;
  paymentSlipName?: string;
  paymentSlipType?: string;
  paymentSlipSize?: number;
  paymentSlipUploadedAt?: number;
  paymentSlipStatus?: PaymentSlipStatus;
  paymentRejectReason?: string;
  paymentApprovedAt?: number;
  paymentSlipDeletedAt?: number;
  customerArchived?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StoredRegistration {
  id: string;
  ownerName: string;
  phone: string;
  idNumber?: string;
  vehicleNumber: string;
  plateNumber?: string;
  vehicleType: string;
  baseCity?: string;
  capacity: string;
  maxWeight?: string;
  dimensions?: string;
  images?: string[];
  depositSlipUrl?: string;
  initialDepositAmount?: number;
  province: string;
  status: "pending" | "approved" | "rejected";
  outsideEmployeeId?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface StoredOutsideEmployee {
  id: string;
  driverId?: string;
  registrationId: string;
  name: string;
  phone: string;
  idNumber: string;
  plateNumber: string;
  vehicleType: string;
  baseCity: string;
  balance: number;
  isAvailable: boolean;
  status: "active" | "inactive" | "suspended";
  totalCommissionDeducted: number;
  totalHiresCompleted: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredCommissionTransaction {
  id: string;
  employeeId: string;
  idNumber: string;
  bookingId?: string;
  type: "initial_deposit" | "topup" | "commission_deduction" | "adjustment";
  hireAmount?: number;
  commissionRate?: number;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  slipUrl?: string;
  note?: string;
  createdAt: number;
}

export interface StoredTopupSlip {
  id: string;
  employeeId: string;
  idNumber: string;
  employeeName: string;
  phone: string;
  plateNumber: string;
  amount: number;
  bankUsed?: string;
  slipUrl: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: number;
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

export interface StoredComplaint {
  id: string;
  bookingId: string;
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

interface FleetStoreData {
  drivers: StoredDriver[];
  lorries: StoredLorry[];
  customers: StoredCustomer[];
  bookings: StoredBooking[];
  complaints: StoredComplaint[];
  registrations: StoredRegistration[];
  outsideEmployees: StoredOutsideEmployee[];
  commissionTransactions: StoredCommissionTransaction[];
  topupSlips: StoredTopupSlip[];
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

  const isOutside = Boolean(l.isOutsideLorry || l.ownershipType === "outside");
  const baseCity = (l.baseCity || l.startLocation || (isOutside ? "" : "Kiribathgoda")).trim();
  const startLoc = (l.startLocation || baseCity || (isOutside ? "" : "Kiribathgoda")).trim();

  return {
    ...l,
    plate: (l.plate || "").toUpperCase().trim(),
    vehicleType: l.vehicleType || "Lorry Fleet",
    capacity: l.capacity || "",
    maxWeight: l.maxWeight || "",
    dimensions: l.dimensions || "",
    isOutsideLorry: isOutside,
    ownershipType: isOutside ? "outside" : (l.ownershipType || "company"),
    ownerIdNumber: l.ownerIdNumber || "",
    isAvailable: l.isAvailable !== false,
    baseCity: baseCity,
    startLocation: startLoc,
    imageUrl: images[0] || (l.imageUrl && typeof l.imageUrl === "string" && !l.imageUrl.startsWith("/img") ? l.imageUrl : ""),
    images: images,
    description: l.description || "",
    route: l.route || (baseCity ? `${baseCity} – Island-wide` : ""),
    driverName: l.driverName || "",
    driverPhone: l.driverPhone || "",
    viaWaypoints: Array.isArray(l.viaWaypoints) ? l.viaWaypoints : undefined,
    status: l.status || "empty",
    lastUpdated: l.isAvailable === false ? "Unavailable" : (l.lastUpdated || "Available"),
    updatedAt: l.updatedAt || Date.now(),
  };
}

const globalForStore = globalThis as typeof globalThis & {
  __sithuminaFleetStore?: FleetStoreData | null;
  __sithuminaFleetStoreMtime?: number;
  __sithuminaWriteTimeout?: NodeJS.Timeout | null;
};

function readStore(): FleetStoreData {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      if (globalForStore.__sithuminaFleetStore) {
        return globalForStore.__sithuminaFleetStore;
      }
      const initial: FleetStoreData = {
        drivers: [],
        lorries: DEFAULT_LORRIES_SEED,
        customers: [],
        bookings: [],
        complaints: [],
        registrations: [],
        outsideEmployees: [],
        commissionTransactions: [],
        topupSlips: [],
        inquiries: [],
        reviews: DEFAULT_REVIEWS_SEED,
      };
      try {
        const dir = path.dirname(STORE_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf8");
        globalForStore.__sithuminaFleetStoreMtime = fs.statSync(STORE_PATH).mtimeMs;
      } catch {
        // Read-only serverless environment (e.g. Vercel / AWS Lambda)
      }
      globalForStore.__sithuminaFleetStore = initial;
      return initial;
    }

    const stat = fs.statSync(STORE_PATH);
    if (
      globalForStore.__sithuminaFleetStore &&
      globalForStore.__sithuminaFleetStoreMtime === stat.mtimeMs
    ) {
      return globalForStore.__sithuminaFleetStore;
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
      complaints: Array.isArray(parsed.complaints) ? parsed.complaints : [],
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
      outsideEmployees: Array.isArray(parsed.outsideEmployees) ? parsed.outsideEmployees : [],
      commissionTransactions: Array.isArray(parsed.commissionTransactions) ? parsed.commissionTransactions : [],
      topupSlips: Array.isArray(parsed.topupSlips) ? parsed.topupSlips : [],
      inquiries: Array.isArray(parsed.inquiries) ? parsed.inquiries : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
    };
    globalForStore.__sithuminaFleetStore = store;
    globalForStore.__sithuminaFleetStoreMtime = stat.mtimeMs;
    return store;
  } catch (err) {
    console.warn("Could not read fleet-store.json, initializing default:", err);
    if (globalForStore.__sithuminaFleetStore) {
      return globalForStore.__sithuminaFleetStore;
    }
    const fallback: FleetStoreData = {
      drivers: [],
      lorries: DEFAULT_LORRIES_SEED,
      customers: [],
      bookings: [],
      complaints: [],
      registrations: [],
      outsideEmployees: [],
      commissionTransactions: [],
      topupSlips: [],
      inquiries: [],
      reviews: DEFAULT_REVIEWS_SEED,
    };
    globalForStore.__sithuminaFleetStore = fallback;
    return fallback;
  }
}

function writeStore(data: FleetStoreData, immediate = false): void {
  globalForStore.__sithuminaFleetStore = data;
  const doWrite = () => {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
      globalForStore.__sithuminaFleetStoreMtime = fs.statSync(STORE_PATH).mtimeMs;
    } catch {
      // Expected in serverless hosts like Vercel with read-only filesystems.
      // Firestore acts as the primary cloud database.
    }
  };

  if (immediate) {
    if (globalForStore.__sithuminaWriteTimeout) {
      clearTimeout(globalForStore.__sithuminaWriteTimeout);
      globalForStore.__sithuminaWriteTimeout = null;
    }
    doWrite();
  } else {
    if (!globalForStore.__sithuminaWriteTimeout) {
      globalForStore.__sithuminaWriteTimeout = setTimeout(() => {
        globalForStore.__sithuminaWriteTimeout = null;
        if (globalForStore.__sithuminaFleetStore) doWrite();
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

export function generateNextSimpleDriverId(prefix: "D" | "R" = "D"): string {
  const store = readStore();
  const regex = new RegExp(`^${prefix}-(\\d+)$`, "i");
  let maxNum = 9; // starts at 10 (e.g. D-10, R-10)

  for (const d of store.drivers || []) {
    const match = String(d.driverId || "").trim().match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  for (const emp of store.outsideEmployees || []) {
    const match = String(emp.driverId || emp.id || "").trim().match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  for (const l of store.lorries || []) {
    const match = String(l.driverId || "").trim().match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `${prefix}-${maxNum + 1}`;
}

export function generateUniqueDriverId(): string {
  return generateNextSimpleDriverId("D");
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
  idNumber?: string;
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
    idNumber: input.idNumber?.trim() || existingCustomer?.idNumber || "",
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

export function deleteCustomerFromStore(idOrPhone: string, phone?: string): boolean {
  const store = readStore();
  const cleanId = (idOrPhone || "").trim().toLowerCase();
  const lookupPhone = (phone || "").trim() || (idOrPhone || "").trim();
  const initialLen = store.customers.length;

  store.customers = store.customers.filter((c) => {
    const cId = (c.id || "").trim().toLowerCase();
    const matchById = Boolean(cleanId && cId === cleanId);
    const matchByPhone = Boolean(lookupPhone && c.phone && phonesMatch(c.phone, lookupPhone));
    return !matchById && !matchByPhone;
  });

  if (store.customers.length !== initialLen) {
    writeStore(store, true);
    return true;
  }
  return false;
}

export function archiveOrDeleteCustomerBookingsInStore(
  phone: string,
  deleteBookings: boolean
): number {
  const cleanPhone = (phone || "").trim();
  if (!cleanPhone) return 0;
  const store = readStore();
  let affected = 0;

  if (deleteBookings) {
    const remaining: StoredBooking[] = [];
    for (const b of store.bookings) {
      if (b.customerPhone && phonesMatch(b.customerPhone, cleanPhone)) {
        affected += 1;
      } else {
        remaining.push(b);
      }
    }
    store.bookings = remaining;
  } else {
    for (const b of store.bookings) {
      if (b.customerPhone && phonesMatch(b.customerPhone, cleanPhone)) {
        b.customerArchived = true;
        b.updatedAt = Date.now();
        affected += 1;
      }
    }
  }

  if (affected > 0) {
    writeStore(store, true);
  }
  return affected;
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
  customerWhatsapp?: string;
  customerIdNumber?: string;
  distanceKm?: number;
  pickupCity: string;
  deliveryCity: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  date: string;
  dates?: string[];
  startTime?: string;
  endTime?: string;
  vehicleType: string;
  packageDetails?: string;
  assignedPlate?: string;
  assignedLorryId?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
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
  advanceAmount?: number;
  pendingAmount?: number;
  finalPaymentMethod?: BookingPaymentMethod;
  finalPaymentBankUsed?: string;
  finalPaymentAt?: number;
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
    customerWhatsapp: input.customerWhatsapp?.trim(),
    customerIdNumber: input.customerIdNumber?.trim(),
    distanceKm: input.distanceKm !== undefined && !Number.isNaN(Number(input.distanceKm)) ? Number(input.distanceKm) : undefined,
    pickupCity: input.pickupCity.trim(),
    deliveryCity: input.deliveryCity.trim(),
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    deliveryLat: input.deliveryLat,
    deliveryLng: input.deliveryLng,
    date: resolvedDates[0],
    dates: resolvedDates,
    startTime: input.startTime?.trim() || undefined,
    endTime: input.endTime?.trim() || undefined,
    vehicleType: input.vehicleType.trim(),
    packageDetails: input.packageDetails?.trim() || "",
    status: input.status || "pending",
    assignedPlate: input.assignedPlate?.trim(),
    assignedLorryId: input.assignedLorryId?.trim(),
    assignedDriverId: input.assignedDriverId?.trim(),
    assignedDriverName: input.assignedDriverName?.trim(),
    assignedDriverPhone: input.assignedDriverPhone?.trim(),
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
    advanceAmount: input.advanceAmount,
    pendingAmount: input.pendingAmount,
    finalPaymentMethod: input.finalPaymentMethod,
    finalPaymentBankUsed: input.finalPaymentBankUsed,
    finalPaymentAt: input.finalPaymentAt,
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
    idNumber: booking.customerIdNumber,
  });

  return booking;
}

export function updateBookingStatusInStore(
  id: string,
  status: BookingStatusValue,
  assignment?: {
    assignedLorryId?: string;
    assignedDriverId?: string;
    assignedDriverName?: string;
    assignedDriverPhone?: string;
    assignedPlate?: string;
    date?: string;
    dates?: string[];
    daysNeeded?: number | string;
    startTime?: string;
    endTime?: string;
    distanceKm?: number;
    customerIdNumber?: string;
  },
  paymentMeta?: {
    quotedAmount?: number;
    quotedAt?: number;
    quoteNote?: string;
    paymentMethod?: BookingPaymentMethod;
    paymentBankUsed?: string;
    advanceAmount?: number;
    pendingAmount?: number;
    finalPaymentMethod?: BookingPaymentMethod;
    finalPaymentBankUsed?: string;
    finalPaymentAt?: number;
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
    if (assignment.assignedDriverId !== undefined && assignment.assignedDriverId.trim() !== "") {
      store.bookings[idx].assignedDriverId = assignment.assignedDriverId.trim();
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
    if (assignment.date && assignment.date.trim()) {
      const cleanDate = assignment.date.trim();
      store.bookings[idx].date = cleanDate;
      store.bookings[idx].dates =
        Array.isArray(assignment.dates) && assignment.dates.length > 0
          ? assignment.dates
          : [cleanDate];
    } else if (Array.isArray(assignment.dates) && assignment.dates.length > 0) {
      store.bookings[idx].dates = assignment.dates;
      store.bookings[idx].date = assignment.dates[0];
    }
    if (assignment.daysNeeded !== undefined) {
      store.bookings[idx].daysNeeded = assignment.daysNeeded;
    }
    if (assignment.startTime !== undefined && assignment.startTime.trim() !== "") {
      store.bookings[idx].startTime = assignment.startTime.trim();
    }
    if (assignment.endTime !== undefined && assignment.endTime.trim() !== "") {
      store.bookings[idx].endTime = assignment.endTime.trim();
    }
    if (assignment.distanceKm !== undefined && !Number.isNaN(Number(assignment.distanceKm))) {
      store.bookings[idx].distanceKm = Number(assignment.distanceKm);
    }
    if (assignment.customerIdNumber !== undefined && assignment.customerIdNumber.trim() !== "") {
      store.bookings[idx].customerIdNumber = assignment.customerIdNumber.trim();
    }

    // For outside lorries, permanently lock driver assignment to the registered owner/driver
    const targetPlate = (store.bookings[idx].assignedPlate || "").trim().toUpperCase();
    const matchedOutEmp = targetPlate
      ? store.outsideEmployees.find((e) => e.plateNumber?.trim().toUpperCase() === targetPlate)
      : null;
    const matchedOutLorry = targetPlate
      ? store.lorries.find((l) => (l.isOutsideLorry || l.ownershipType === "outside") && l.plate?.trim().toUpperCase() === targetPlate)
      : null;
    if (matchedOutEmp) {
      store.bookings[idx].assignedDriverId = matchedOutEmp.driverId || matchedOutEmp.id;
      store.bookings[idx].assignedDriverName = matchedOutEmp.name;
      store.bookings[idx].assignedDriverPhone = matchedOutEmp.phone;
    } else if (matchedOutLorry) {
      store.bookings[idx].assignedDriverId = matchedOutLorry.driverId || "";
      store.bookings[idx].assignedDriverName = matchedOutLorry.driverName || "";
      store.bookings[idx].assignedDriverPhone = matchedOutLorry.driverPhone || "";
    }
  }

  if (paymentMeta) {
    if (paymentMeta.quotedAmount !== undefined) store.bookings[idx].quotedAmount = paymentMeta.quotedAmount;
    if (paymentMeta.quotedAt !== undefined) store.bookings[idx].quotedAt = paymentMeta.quotedAt;
    if (paymentMeta.quoteNote !== undefined) store.bookings[idx].quoteNote = paymentMeta.quoteNote;
    if (paymentMeta.paymentMethod !== undefined) store.bookings[idx].paymentMethod = paymentMeta.paymentMethod;
    if (paymentMeta.paymentBankUsed !== undefined) store.bookings[idx].paymentBankUsed = paymentMeta.paymentBankUsed;
    if (paymentMeta.advanceAmount !== undefined) store.bookings[idx].advanceAmount = paymentMeta.advanceAmount;
    if (paymentMeta.pendingAmount !== undefined) store.bookings[idx].pendingAmount = paymentMeta.pendingAmount;
    if (paymentMeta.finalPaymentMethod !== undefined) store.bookings[idx].finalPaymentMethod = paymentMeta.finalPaymentMethod;
    if (paymentMeta.finalPaymentBankUsed !== undefined) store.bookings[idx].finalPaymentBankUsed = paymentMeta.finalPaymentBankUsed;
    if (paymentMeta.finalPaymentAt !== undefined) store.bookings[idx].finalPaymentAt = paymentMeta.finalPaymentAt;
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
 * COMPLAINTS & DELETION REASONS
 * ============================================================ */

export function getAllStoredComplaints(): StoredComplaint[] {
  return readStore().complaints;
}

export function recordComplaintInStore(complaint: StoredComplaint): StoredComplaint {
  const store = readStore();
  const existingIdx = store.complaints.findIndex((c) => c.id === complaint.id);
  if (existingIdx >= 0) {
    store.complaints[existingIdx] = complaint;
  } else {
    store.complaints.unshift(complaint);
  }
  writeStore(store);
  return complaint;
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
  plateNumber?: string;
  vehicleType: string;
  baseCity?: string;
  capacity?: string;
  province?: string;
  idNumber?: string;
  maxWeight?: string;
  dimensions?: string;
  images?: string[];
  depositSlipUrl?: string;
  initialDepositAmount?: number;
}): StoredRegistration {
  const store = readStore();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const id = `ST-REG-${randomSuffix}`;
  const cleanPlate = (input.plateNumber || input.vehicleNumber || "").trim().toUpperCase();

  const reg: StoredRegistration = {
    id,
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    idNumber: input.idNumber?.trim() || "",
    vehicleNumber: cleanPlate,
    plateNumber: cleanPlate,
    vehicleType: input.vehicleType.trim(),
    baseCity: input.baseCity?.trim() || "Colombo",
    capacity: input.capacity?.trim() || "Standard",
    maxWeight: input.maxWeight?.trim() || "",
    dimensions: input.dimensions?.trim() || "",
    images: Array.isArray(input.images) ? input.images : [],
    depositSlipUrl: input.depositSlipUrl || "",
    initialDepositAmount: input.initialDepositAmount || 5000,
    province: input.province?.trim() || "Western",
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
  store.registrations[idx].updatedAt = Date.now();
  const reg = store.registrations[idx];

  if (status === "approved") {
    // Generate outside driver ID (e.g. D-10, D-11...) if not set
    if (!reg.outsideEmployeeId) {
      reg.outsideEmployeeId = generateNextSimpleDriverId("D");
    }

    // Upsert into outsideEmployees
    const existingEmpIdx = store.outsideEmployees.findIndex(
      (e) => e.registrationId === reg.id || e.idNumber === reg.idNumber || e.id === reg.outsideEmployeeId || e.driverId === reg.outsideEmployeeId
    );
    const empData: StoredOutsideEmployee = {
      id: reg.outsideEmployeeId,
      driverId: reg.outsideEmployeeId,
      registrationId: reg.id,
      name: reg.ownerName,
      phone: reg.phone,
      idNumber: reg.idNumber || "",
      plateNumber: reg.vehicleNumber,
      vehicleType: reg.vehicleType,
      baseCity: reg.baseCity || "Colombo",
      balance: existingEmpIdx >= 0 ? store.outsideEmployees[existingEmpIdx].balance : (reg.initialDepositAmount || 5000),
      isAvailable: true,
      status: "active",
      totalCommissionDeducted: existingEmpIdx >= 0 ? store.outsideEmployees[existingEmpIdx].totalCommissionDeducted : 0,
      totalHiresCompleted: existingEmpIdx >= 0 ? store.outsideEmployees[existingEmpIdx].totalHiresCompleted : 0,
      createdAt: existingEmpIdx >= 0 ? store.outsideEmployees[existingEmpIdx].createdAt : Date.now(),
      updatedAt: Date.now(),
    };

    if (existingEmpIdx >= 0) {
      store.outsideEmployees[existingEmpIdx] = empData;
    } else {
      store.outsideEmployees.unshift(empData);

      // Record initial Rs. 5,000 deposit transaction
      store.commissionTransactions.unshift({
        id: `TX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        employeeId: empData.id,
        idNumber: empData.idNumber,
        type: "initial_deposit",
        amount: reg.initialDepositAmount || 5000,
        balanceBefore: 0,
        balanceAfter: reg.initialDepositAmount || 5000,
        note: `Approved Initial Registration Deposit (රු. ${(reg.initialDepositAmount || 5000).toLocaleString()})`,
        slipUrl: reg.depositSlipUrl || "",
        createdAt: Date.now(),
      });
    }

    // Register / update permanent driver in store.drivers
    const cleanPlate = reg.vehicleNumber.trim().toUpperCase();
    const docId = `lorry-${cleanPlate.replace(/[^A-Z0-9]/gi, "").toLowerCase()}`;
    const driverIdx = store.drivers.findIndex(
      (d) => d.driverId === reg.outsideEmployeeId || d.plate === cleanPlate
    );
    const driverData: StoredDriver = {
      driverId: reg.outsideEmployeeId,
      name: reg.ownerName,
      phone: reg.phone,
      nic: reg.idNumber || "",
      plate: cleanPlate,
      vehicleType: reg.vehicleType,
      route: `${reg.baseCity || "Colombo"} – Island-wide`,
      lorryId: docId,
      active: true,
      createdAt: Date.now(),
    };
    if (driverIdx >= 0) {
      store.drivers[driverIdx] = driverData;
    } else {
      store.drivers.unshift(driverData);
    }

    // Register / update vehicle in lorries
    const lorryIdx = store.lorries.findIndex(
      (l) => l.plate.toUpperCase() === cleanPlate || l.id === docId
    );

    const lorryPayload: StoredLorry = {
      id: docId,
      plate: cleanPlate,
      route: `${reg.baseCity || "Island-wide"} – Island-wide`,
      driverName: reg.ownerName,
      driverPhone: reg.phone,
      driverId: reg.outsideEmployeeId,
      vehicleType: reg.vehicleType,
      capacity: reg.capacity || "",
      maxWeight: reg.maxWeight || "",
      dimensions: reg.dimensions || "",
      isOutsideLorry: true,
      ownershipType: "outside",
      ownerIdNumber: reg.idNumber || "",
      isAvailable: true,
      baseCity: reg.baseCity || "Colombo",
      startLocation: reg.baseCity || "Colombo",
      imageUrl: (reg.images && reg.images[0]) || "",
      images: reg.images || [],
      description: `Outside Partner Lorry operated by ${reg.ownerName}. Base: ${reg.baseCity || "Colombo"}.`,
      lat: 6.9271,
      lng: 79.8612,
      heading: 0,
      speedKmH: 0,
      status: "empty",
      lastUpdated: "Available",
      updatedAt: Date.now(),
    };

    if (lorryIdx >= 0) {
      store.lorries[lorryIdx] = { ...store.lorries[lorryIdx], ...lorryPayload };
    } else {
      store.lorries.unshift(lorryPayload);
    }
  }

  writeStore(store);
  return reg;
}

/* ============================================================
 * OUTSIDE EMPLOYEES & COMMISSION LEDGER
 * ============================================================ */

export function getAllStoredOutsideEmployees(): StoredOutsideEmployee[] {
  return readStore().outsideEmployees || [];
}

export function getStoredOutsideEmployeeByIdNumber(idNumber: string): StoredOutsideEmployee | null {
  const store = readStore();
  const cleanId = (idNumber || "").trim().toLowerCase();
  if (!cleanId) return null;
  return (store.outsideEmployees || []).find(
    (e) =>
      (e.idNumber || "").trim().toLowerCase() === cleanId ||
      (e.id || "").trim().toLowerCase() === cleanId ||
      (e.driverId || "").trim().toLowerCase() === cleanId
  ) || null;
}

export function getStoredOutsideEmployeeByPlate(plate: string): StoredOutsideEmployee | null {
  const store = readStore();
  const cleanPlate = (plate || "").trim().toUpperCase();
  if (!cleanPlate) return null;
  return (store.outsideEmployees || []).find(
    (e) => (e.plateNumber || "").trim().toUpperCase() === cleanPlate
  ) || null;
}

export function getStoredOutsideEmployeeById(id: string): StoredOutsideEmployee | null {
  const store = readStore();
  const cleanId = (id || "").trim().toUpperCase();
  if (!cleanId) return null;
  return (store.outsideEmployees || []).find(
    (e) => (e.id || "").trim().toUpperCase() === cleanId
  ) || null;
}

export function toggleOutsideEmployeeAvailabilityInStore(
  idNumberOrId: string,
  isAvailable: boolean
): { success: boolean; isAvailable: boolean; employee?: StoredOutsideEmployee; error?: string } {
  const store = readStore();
  const cleanKey = (idNumberOrId || "").trim().toLowerCase();
  const empIdx = (store.outsideEmployees || []).findIndex(
    (e) =>
      (e.idNumber || "").trim().toLowerCase() === cleanKey ||
      (e.id || "").trim().toLowerCase() === cleanKey ||
      (e.driverId || "").trim().toLowerCase() === cleanKey
  );
  if (empIdx === -1) {
    return { success: false, isAvailable: false, error: "Employee not found." };
  }

  store.outsideEmployees[empIdx].isAvailable = isAvailable;
  store.outsideEmployees[empIdx].updatedAt = Date.now();
  const emp = store.outsideEmployees[empIdx];

  // Also update lorry availability
  const cleanPlate = (emp.plateNumber || "").trim().toUpperCase();
  const lorryIdx = store.lorries.findIndex(
    (l) => (l.plate || "").trim().toUpperCase() === cleanPlate
  );
  if (lorryIdx !== -1) {
    store.lorries[lorryIdx].isAvailable = isAvailable;
    store.lorries[lorryIdx].status = isAvailable ? "empty" : "on_trip";
    store.lorries[lorryIdx].lastUpdated = isAvailable ? "Available" : "Unavailable";
    store.lorries[lorryIdx].updatedAt = Date.now();
  }

  writeStore(store);
  return { success: true, isAvailable, employee: emp };
}

export function getStoredCommissionTransactions(employeeIdOrIdNumber: string): StoredCommissionTransaction[] {
  const store = readStore();
  const key = (employeeIdOrIdNumber || "").trim().toLowerCase();
  if (!key) return store.commissionTransactions || [];
  return (store.commissionTransactions || []).filter(
    (tx) => (tx.employeeId || "").trim().toLowerCase() === key || (tx.idNumber || "").trim().toLowerCase() === key
  );
}

export function getAllStoredCommissionTransactions(): StoredCommissionTransaction[] {
  return readStore().commissionTransactions || [];
}

export function checkOutsideLorryBookingEligibility(
  plate: string,
  hireAmount: number
): {
  isOutside: boolean;
  allowed: boolean;
  reason?: string;
  balance?: number;
  requiredCommission?: number;
  employee?: StoredOutsideEmployee;
} {
  const store = readStore();
  const cleanPlate = (plate || "").trim().toUpperCase();
  if (!cleanPlate) return { isOutside: false, allowed: true };

  const employee = (store.outsideEmployees || []).find(
    (e) => (e.plateNumber || "").trim().toUpperCase() === cleanPlate
  );
  if (!employee) {
    return { isOutside: false, allowed: true };
  }

  if (employee.isAvailable === false) {
    return {
      isOutside: true,
      allowed: false,
      reason: `Vehicle ${cleanPlate} is currently marked Unavailable by the owner.`,
      balance: employee.balance,
      employee,
    };
  }

  const requiredCommission = Math.round(Number(hireAmount || 0) * 0.20);
  if (employee.balance < requiredCommission) {
    return {
      isOutside: true,
      allowed: false,
      reason: `Owner balance (LKR ${employee.balance.toLocaleString()}) is insufficient for 20% commission (LKR ${requiredCommission.toLocaleString()}). Top-up required before confirming new bookings.`,
      balance: employee.balance,
      requiredCommission,
      employee,
    };
  }

  return {
    isOutside: true,
    allowed: true,
    balance: employee.balance,
    requiredCommission,
    employee,
  };
}

export function deductCommissionForBookingInStore(
  bookingId: string,
  hireAmount: number,
  plate: string
): {
  success: boolean;
  isOutside: boolean;
  error?: string;
  deductedAmount?: number;
  newBalance?: number;
} {
  const store = readStore();
  const cleanPlate = (plate || "").trim().toUpperCase();
  const employeeIdx = (store.outsideEmployees || []).findIndex(
    (e) => (e.plateNumber || "").trim().toUpperCase() === cleanPlate
  );
  if (employeeIdx === -1) {
    return { success: true, isOutside: false };
  }

  const employee = store.outsideEmployees[employeeIdx];

  // Prevent duplicate deduction for same booking
  const alreadyDeducted = (store.commissionTransactions || []).some(
    (tx) => tx.bookingId === bookingId && tx.type === "commission_deduction"
  );
  if (alreadyDeducted) {
    return { success: true, isOutside: true, newBalance: employee.balance };
  }

  const commissionAmount = Math.round(Number(hireAmount || 0) * 0.20);
  if (employee.balance < commissionAmount) {
    return {
      success: false,
      isOutside: true,
      error: `Insufficient balance (Current: LKR ${employee.balance.toLocaleString()}) to deduct 20% commission (LKR ${commissionAmount.toLocaleString()}) for booking ${bookingId}. Please top up.`,
    };
  }

  const balanceBefore = employee.balance;
  const balanceAfter = balanceBefore - commissionAmount;
  employee.balance = balanceAfter;
  employee.totalCommissionDeducted = (employee.totalCommissionDeducted || 0) + commissionAmount;
  employee.totalHiresCompleted = (employee.totalHiresCompleted || 0) + 1;
  employee.updatedAt = Date.now();

  const tx: StoredCommissionTransaction = {
    id: `TX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    employeeId: employee.id,
    idNumber: employee.idNumber,
    bookingId,
    type: "commission_deduction",
    hireAmount: Number(hireAmount || 0),
    commissionRate: 20,
    amount: -commissionAmount,
    balanceBefore,
    balanceAfter,
    note: `20% Commission for Booking ${bookingId} (Hire Value: LKR ${Number(hireAmount).toLocaleString()})`,
    createdAt: Date.now(),
  };

  store.commissionTransactions.unshift(tx);
  writeStore(store);
  return {
    success: true,
    isOutside: true,
    deductedAmount: commissionAmount,
    newBalance: balanceAfter,
  };
}

export function getAllTopupSlipsInStore(): StoredTopupSlip[] {
  return readStore().topupSlips || [];
}

export function addTopupSlipInStore(input: {
  employeeId?: string;
  idNumber: string;
  employeeName?: string;
  phone?: string;
  plateNumber?: string;
  amount: number;
  bankUsed?: string;
  slipUrl: string;
}): StoredTopupSlip {
  const store = readStore();
  const emp = (store.outsideEmployees || []).find(
    (e) => (e.idNumber || "").trim().toLowerCase() === (input.idNumber || "").trim().toLowerCase() ||
           (e.id || "").trim().toUpperCase() === (input.employeeId || "").trim().toUpperCase()
  );

  const id = `SLIP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const slip: StoredTopupSlip = {
    id,
    employeeId: emp?.id || input.employeeId || "",
    idNumber: input.idNumber.trim(),
    employeeName: emp?.name || input.employeeName || "Lorry Owner",
    phone: emp?.phone || input.phone || "",
    plateNumber: emp?.plateNumber || input.plateNumber || "",
    amount: Number(input.amount || 0),
    bankUsed: input.bankUsed || "",
    slipUrl: input.slipUrl,
    status: "pending",
    createdAt: Date.now(),
  };

  store.topupSlips.unshift(slip);
  writeStore(store);
  return slip;
}

export function approveTopupSlipInStore(slipId: string): { success: boolean; slip?: StoredTopupSlip; error?: string } {
  const store = readStore();
  const slipIdx = (store.topupSlips || []).findIndex((s) => s.id === slipId);
  if (slipIdx === -1) return { success: false, error: "Top-up slip not found" };

  const slip = store.topupSlips[slipIdx];
  if (slip.status === "approved") {
    return { success: true, slip };
  }

  slip.status = "approved";
  slip.reviewedAt = Date.now();

  const empIdx = (store.outsideEmployees || []).findIndex(
    (e) => (e.idNumber || "").trim().toLowerCase() === (slip.idNumber || "").trim().toLowerCase() ||
           (e.id || "").trim().toUpperCase() === (slip.employeeId || "").trim().toUpperCase()
  );

  if (empIdx !== -1) {
    const emp = store.outsideEmployees[empIdx];
    const balanceBefore = emp.balance;
    const balanceAfter = balanceBefore + slip.amount;
    emp.balance = balanceAfter;
    emp.updatedAt = Date.now();

    const tx: StoredCommissionTransaction = {
      id: `TX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      employeeId: emp.id,
      idNumber: emp.idNumber,
      type: "topup",
      amount: slip.amount,
      balanceBefore,
      balanceAfter,
      slipUrl: slip.slipUrl,
      note: `Bank Slip Top-up Approved (Slip: ${slip.id})`,
      createdAt: Date.now(),
    };
    store.commissionTransactions.unshift(tx);
  }

  writeStore(store);
  return { success: true, slip };
}

export function deleteTopupSlipInStore(slipId: string): boolean {
  const store = readStore();
  const idx = (store.topupSlips || []).findIndex((s) => s.id === slipId);
  if (idx === -1) return false;
  store.topupSlips.splice(idx, 1);
  writeStore(store);
  return true;
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