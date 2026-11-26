/**
 * Server data layer. Firestore is the only store: nothing is written to disk,
 * so every server instance (including on Vercel) sees the same records.
 */
import { db, orderBy, limit } from "@/lib/fs-server";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "@/lib/fs-server";
import { normalizePhoneNumber, phonesMatch, getCanonicalCustomerId } from "@/lib/phone-utils";
import { createWithSequentialId } from "@/lib/sequence";
import { allocateDriverId } from "@/lib/driver-ids";
import { findOutsideOwnerByPlate } from "@/lib/outside-owners";
import { todayYmd } from "@/lib/ledger";


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
  | "booked"
  | "completed";

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
  trackingId?: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  customerIdNumber?: string;
  distanceKm?: number;
  actualDistanceKm?: number;
  waypoints?: Array<{ name: string; lat: number; lng: number }>;
  travelRoute?: string;
  rideStartedAt?: number;
  rideEndedAt?: number;
  driverTripStatus?: "pending_acceptance" | "accepted" | "loaded" | "declined" | "in_transit" | "completed" | "empty_return";
  isEmptyReturnActive?: boolean;
  externalOwnerId?: string;
  tripRole?: "primary" | "return";
  parentBookingId?: string;
  acceptedAt?: number;
  loadedAt?: number;
  pickupPinned?: boolean;
  dropoffPinned?: boolean;
  emptyReturnDistanceKm?: number;
  emptyReturnRoute?: string;
  emptyReturnStartedAt?: number;
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
  depositBank?: string;
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
  paymentMethod?: "cash" | "bank" | "unrecorded";
  bank?: string;
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



/* ---------------------------------------------------------------- Helpers */

type AnyRecord = Record<string, any>;

/** Firestore rejects undefined values. */
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

async function readAll<T>(name: string): Promise<T[]> {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map((d) => ({ ...(d.data() as AnyRecord), id: d.id }) as T);
}

/** The newest records only; older ones are reached by paging. */
async function readLatest<T>(name: string, field: string, count: number): Promise<T[]> {
  const snap = await getDocs(query(collection(db, name), orderBy(field, "desc"), limit(count)));
  return snap.docs.map((d) => ({ ...(d.data() as AnyRecord), id: d.id }) as T);
}

const newestFirst = <T extends { createdAt?: number }>(list: T[]): T[] =>
  list.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

const slug = (v?: string) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const realName = (v: unknown) => {
  const name = String(v || "").trim();
  return name && name !== "Driver" && name !== "Unassigned" ? name : "";
};

function stripSinhala(str: any): string {
  if (!str || typeof str !== "string") return "";
  return str.replace(/[\u0D80-\u0DFF]+/g, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
}

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
    vehicleType: stripSinhala(l.vehicleType) || "Lorry Fleet",
    capacity: stripSinhala(l.capacity) || "",
    maxWeight: stripSinhala(l.maxWeight) || "",
    dimensions: stripSinhala(l.dimensions) || "",
    isOutsideLorry: isOutside,
    ownershipType: isOutside ? "outside" : (l.ownershipType || "company"),
    ownerIdNumber: l.ownerIdNumber || "",
    isAvailable: l.isAvailable !== false,
    baseCity: baseCity,
    startLocation: startLoc,
    imageUrl: images[0] || (l.imageUrl && typeof l.imageUrl === "string" && !l.imageUrl.startsWith("/img") ? l.imageUrl : ""),
    images: images,
    description: stripSinhala(l.description) || "",
    route: l.route || (baseCity ? `${baseCity} – Island-wide` : ""),
    driverName: l.driverName || "",
    driverPhone: l.driverPhone || "",
    viaWaypoints: Array.isArray(l.viaWaypoints) ? l.viaWaypoints : undefined,
    status: l.status || "empty",
    lastUpdated: l.isAvailable === false ? "Unavailable" : (l.lastUpdated || "Available"),
    updatedAt: l.updatedAt || Date.now(),
  };
}


/* ============================================================
 * DRIVERS & FLEET
 * ============================================================ */

export async function getAllStoredDrivers(): Promise<StoredDriver[]> {
  const snap = await getDocs(collection(db, "drivers"));
  return newestFirst(
    snap.docs.map((d) => ({ driverId: d.id, ...(d.data() as AnyRecord), id: d.id }) as unknown as StoredDriver)
  );
}

export async function getAllFleetVehicles(): Promise<StoredLorry[]> {
  const byPlate = new Map<string, StoredLorry>();
  for (const [index, lorry] of (await readAll<AnyRecord>("lorries_registry")).entries()) {
    const normalised = normalizeLorry(lorry, index);
    const key = slug(normalised.plate || lorry.id);
    if (!byPlate.has(key) || String(lorry.id).startsWith("lorry-")) byPlate.set(key, normalised);
  }
  return Array.from(byPlate.values());
}

/** Vehicles currently broadcasting (heartbeat within three minutes). */
export async function getAllStoredLorries(): Promise<StoredLorry[]> {
  const now = Date.now();
  return (await readAll<AnyRecord>("lorries"))
    .filter((l) => {
      if (l.isLive === false || l.status === "offline") return false;
      const updated = Number(l.updatedAt) || 0;
      return !(updated > 0 && now - updated > 180_000);
    })
    .map((l, index) => normalizeLorry(l, index));
}

export async function registerDriverInStore(
  input: {
  name: string;
  phone: string;
  plate: string;
  vehicleType: string;
  route: string;
  driverId?: string;
}
): Promise<{ driver: StoredDriver; lorry: StoredLorry }> {
  const plate = input.plate.trim().toUpperCase();
  const driverId = input.driverId || (await allocateDriverId());
  const lorryId = `lorry-${slug(plate) || slug(driverId)}`;
  const driver: StoredDriver = {
    driverId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    plate,
    vehicleType: input.vehicleType.trim() || "14ft Lorry",
    route: input.route.trim() || "Colombo – Island-wide",
    lorryId,
    active: true,
    createdAt: Date.now(),
  };
  const lorry = {
    id: lorryId,
    plate,
    driverId,
    driverName: driver.name,
    driverPhone: driver.phone,
    vehicleType: driver.vehicleType,
    route: driver.route,
    status: "empty",
    updatedAt: Date.now(),
  } as unknown as StoredLorry;

  await setDoc(doc(db, "drivers", driverId), clean(driver), { merge: true });
  await setDoc(doc(db, "lorries", lorryId), clean(lorry), { merge: true });
  return { driver, lorry };
}

const lorryDocId = (identifier: string, meta?: AnyRecord) => {
  const raw = String(identifier || "").trim().toLowerCase().replace(/\//g, "-");
  return raw && raw !== "lorry-" ? raw : `lorry-${slug(meta?.plate || meta?.driverId) || Date.now()}`;
};

export async function updateLorryGpsInStore(
  identifier: string,
  lat: number,
  lng: number,
  heading: number = 0,
  speedKmH: number = 0,
  meta?: Record<string, any>
): Promise<StoredLorry> {
  const id = lorryDocId(identifier, meta);
  const ref = doc(db, "lorries", id);
  const existing = (await getDoc(ref)).data() || {};
  const provided = Object.fromEntries(
    Object.entries(meta || {}).filter(([key, v]) => v !== undefined && v !== "" && key !== "id")
  );
  if (!realName(provided.driverName)) delete provided.driverName;
  const patch = clean({
    ...provided,
    id,
    plate: String(meta?.plate || existing.plate || identifier).trim().toUpperCase(),
    lat: Number.isFinite(Number(lat)) ? Number(lat) : 6.9271,
    lng: Number.isFinite(Number(lng)) ? Number(lng) : 79.8612,
    heading: Math.round(heading) || 0,
    speedKmH: Math.round(speedKmH) || 0,
    isLive: true,
    isOnline: true,
    lastUpdated: "Just now",
    updatedAt: Date.now(),
  });
  await setDoc(ref, patch, { merge: true });
  return { ...existing, ...patch } as unknown as StoredLorry;
}

export async function upsertLorryTripInStore(
  input: {
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
}
): Promise<StoredLorry> {
  const { lorryId, id: givenId, lat, lng, ...rest } = input as AnyRecord;
  return updateLorryGpsInStore(
    String(lorryId || givenId || `lorry-${slug(rest.plate || rest.driverId)}`),
    Number(lat ?? 6.9271),
    Number(lng ?? 79.8612),
    Number(rest.heading) || 0,
    Number(rest.speedKmH) || 0,
    { status: "empty", ...rest }
  );
}

export const upsertLorryInStore = upsertLorryTripInStore;

const matchesVehicle = (record: AnyRecord, identifier: string) => {
  const key = slug(identifier.replace(/^lorry-/i, ""));
  return Boolean(key) && [record.id, record.plate, record.driverId, record.lorryId].some(
    (v) => slug(String(v || "").replace(/^lorry-/i, "")) === key
  );
};

export async function updateLorryStatusInStore(
  identifier: string,
  status: "empty" | "on_trip"
): Promise<StoredLorry | null> {
  const matches = (await readAll<AnyRecord>("lorries")).filter((l) => matchesVehicle(l, identifier));
  const patch = { status, lastUpdated: "Just now", updatedAt: Date.now() };
  await Promise.all(matches.map((l) => updateDoc(doc(db, "lorries", l.id), patch)));
  return matches[0] ? ({ ...matches[0], ...patch } as unknown as StoredLorry) : null;
}

export async function deleteLorryFromStore(idOrPlate: string): Promise<boolean> {
  let removed = false;
  for (const name of ["lorries", "lorries_registry", "lorries_live"]) {
    const matches = (await readAll<AnyRecord>(name)).filter((l) => matchesVehicle(l, idOrPlate));
    await Promise.all(matches.map((l) => deleteDoc(doc(db, name, l.id))));
    removed = removed || matches.length > 0;
  }
  return removed;
}

export async function deleteDriverFromStore(idOrPlate: string): Promise<boolean> {
  const matches = (await readAll<AnyRecord>("drivers")).filter((d) => matchesVehicle(d, idOrPlate));
  await Promise.all(matches.map((d) => deleteDoc(doc(db, "drivers", d.id))));
  return matches.length > 0;
}

/* ============================================================
 * CUSTOMERS
 * ============================================================ */

export async function getAllStoredCustomers(): Promise<StoredCustomer[]> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "customer")));
  return newestFirst(snap.docs.map((d) => ({ ...(d.data() as AnyRecord), id: d.id }) as unknown as StoredCustomer));
}

const isGenericName = (name: string) =>
  !name || name === "Customer" || name === "Valued Customer" || name.startsWith("Customer (");

export async function upsertCustomerInStore(
  input: {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  idNumber?: string;
}
): Promise<StoredCustomer> {
  const phone = normalizePhoneNumber(input.phone) || input.phone.trim();
  const id = getCanonicalCustomerId(input.phone);
  const ref = doc(db, "users", id);
  const existing = (await getDoc(ref)).data() as AnyRecord | undefined;
  const incoming = (input.name || "").trim();
  const previous = String(existing?.name || "").trim();
  const customer: StoredCustomer = {
    id,
    name: !isGenericName(incoming) ? incoming : !isGenericName(previous) ? previous : incoming || "Customer",
    phone,
    email: input.email?.trim() || existing?.email || "",
    city: input.city?.trim() || existing?.city || "",
    idNumber: input.idNumber?.trim() || existing?.idNumber || "",
    createdAt: existing?.createdAt || Date.now(),
    lastLoginAt: Date.now(),
  };
  await setDoc(ref, clean({ ...customer, uid: id, role: "customer" }), { merge: true });
  return customer;
}

export async function deleteCustomerFromStore(idOrPhone: string, phone?: string): Promise<boolean> {
  const id = (idOrPhone || "").trim().toLowerCase();
  const lookup = (phone || "").trim() || (idOrPhone || "").trim();
  const matches = (await getAllStoredCustomers()).filter(
    (c) => c.id.toLowerCase() === id || (lookup && c.phone && phonesMatch(c.phone, lookup))
  );
  await Promise.all(matches.map((c) => deleteDoc(doc(db, "users", c.id))));
  return matches.length > 0;
}

/** Marks a removed customer's bookings as archived. Bookings are never deleted here. */
export async function archiveCustomerBookingsInStore(phone: string): Promise<number> {
  const matches = await getBookingsByCustomerPhone(phone);
  await Promise.all(
    matches.map((b) => updateDoc(doc(db, "bookings", b.id), { customerArchived: true, updatedAt: Date.now() }))
  );
  return matches.length;
}

/* ============================================================
 * BOOKINGS
 * ============================================================ */

export async function getAllStoredBookings(): Promise<StoredBooking[]> {
  return readLatest<StoredBooking>("bookings", "createdAt", 500);
}

export async function getStoredBooking(id: string): Promise<StoredBooking | null> {
  const snap = await getDoc(doc(db, "bookings", (id || "").trim()));
  return snap.exists() ? ({ ...(snap.data() as AnyRecord), id: snap.id } as StoredBooking) : null;
}

export async function getBookingsByCustomerPhone(phone: string): Promise<StoredBooking[]> {
  const key = normalizePhoneNumber(phone);
  if (!key) return [];
  const snap = await getDocs(query(collection(db, "bookings"), where("customerPhone", "==", key)));
  return newestFirst(snap.docs.map((d) => ({ ...(d.data() as AnyRecord), id: d.id }) as StoredBooking));
}

export async function upsertBookingInStore(booking: StoredBooking): Promise<StoredBooking> {
  const next = {
    ...booking,
    customerPhone: normalizePhoneNumber(booking.customerPhone) || String(booking.customerPhone || "").trim(),
    updatedAt: booking.updatedAt || Date.now(),
  };
  await setDoc(doc(db, "bookings", next.id), clean(next), { merge: true });
  return next;
}

export async function createBookingInStore(
  input: {
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
  waypoints?: Array<{ name: string; lat: number; lng: number }>;
  travelRoute?: string;
  driverTripStatus?: "pending_acceptance" | "accepted" | "loaded" | "declined" | "in_transit" | "completed" | "empty_return";
  rideStartedAt?: number;
  rideEndedAt?: number;
  actualDistanceKm?: number;
}
): Promise<StoredBooking> {
  const phone = normalizePhoneNumber(input.customerPhone) || input.customerPhone.trim();
  const dates =
    Array.isArray(input.dates) && input.dates.length > 0 ? input.dates : [input.date || todayYmd()];

  const booking = await createWithSequentialId<StoredBooking>("bookings", "booking_ids", "ST-BK", (id) => ({
    ...input,
    id,
    trackingId: id,
    customerName: input.customerName.trim(),
    customerPhone: phone,
    pickupCity: input.pickupCity.trim(),
    deliveryCity: input.deliveryCity.trim(),
    date: dates[0],
    dates,
    vehicleType: input.vehicleType.trim(),
    packageDetails: input.packageDetails?.trim() || "",
    status: input.status || "pending",
    bookingType: input.bookingType || "individual_vehicle",
    paymentSlipStatus: input.paymentSlipStatus || "none",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));

  await upsertCustomerInStore({
    name: booking.customerName,
    phone: booking.customerPhone,
    idNumber: booking.customerIdNumber,
  });
  return booking;
}

/** Outside vehicles are always driven by their registered owner. */
async function lockOutsideDriver(booking: StoredBooking): Promise<void> {
  const owner = booking.assignedPlate ? await findOutsideOwnerByPlate(booking.assignedPlate) : null;
  if (!owner) return;
  booking.assignedDriverId = owner.driverId || owner.id;
  booking.assignedDriverName = owner.name;
  booking.assignedDriverPhone = owner.phone;
}

export async function updateBookingStatusInStore(
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
    pickupCity?: string;
    deliveryCity?: string;
    cargoNature?: string;
    cargoWeight?: string;
    helpersCount?: string | number;
    actualDistanceKm?: number;
    waypoints?: Array<{ name: string; lat: number; lng: number }>;
    rideStartedAt?: number;
    rideEndedAt?: number;
    driverTripStatus?: "pending_acceptance" | "accepted" | "loaded" | "declined" | "in_transit" | "completed" | "empty_return";
    isEmptyReturnActive?: boolean;
  externalOwnerId?: string;
  tripRole?: "primary" | "return";
  parentBookingId?: string;
  acceptedAt?: number;
  loadedAt?: number;
  pickupPinned?: boolean;
  dropoffPinned?: boolean;
    emptyReturnDistanceKm?: number;
    emptyReturnRoute?: string;
    emptyReturnStartedAt?: number;
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
): Promise<StoredBooking | null> {
  const booking = await getStoredBooking(id);
  if (!booking) return null;
  const before: AnyRecord = { ...booking };
  booking.status = status;
  if (assignment) {
    if (assignment.assignedLorryId) {
      booking.assignedLorryId = assignment.assignedLorryId;
    }
    if (assignment.assignedDriverId !== undefined && assignment.assignedDriverId.trim() !== "") {
      booking.assignedDriverId = assignment.assignedDriverId.trim();
    }
    const cleanAssignDriver = String(assignment.assignedDriverName || "").trim();
    if (cleanAssignDriver && cleanAssignDriver !== "Driver" && cleanAssignDriver !== "Unassigned") {
      booking.assignedDriverName = cleanAssignDriver;
    } else if (
      booking.assignedDriverName === "Driver" ||
      booking.assignedDriverName === "Unassigned"
    ) {
      booking.assignedDriverName = "";
    }
    if (assignment.assignedDriverPhone) {
      booking.assignedDriverPhone = assignment.assignedDriverPhone;
    }
    if (assignment.assignedPlate) {
      booking.assignedPlate = assignment.assignedPlate;
    }
    if (assignment.date && assignment.date.trim()) {
      const cleanDate = assignment.date.trim();
      booking.date = cleanDate;
      booking.dates =
        Array.isArray(assignment.dates) && assignment.dates.length > 0
          ? assignment.dates
          : [cleanDate];
    } else if (Array.isArray(assignment.dates) && assignment.dates.length > 0) {
      booking.dates = assignment.dates;
      booking.date = assignment.dates[0];
    }
    if (assignment.daysNeeded !== undefined) {
      booking.daysNeeded = assignment.daysNeeded;
    }
    if (assignment.startTime !== undefined && assignment.startTime.trim() !== "") {
      booking.startTime = assignment.startTime.trim();
    }
    if (assignment.endTime !== undefined && assignment.endTime.trim() !== "") {
      booking.endTime = assignment.endTime.trim();
    }
    if (assignment.distanceKm !== undefined && !Number.isNaN(Number(assignment.distanceKm))) {
      booking.distanceKm = Number(assignment.distanceKm);
    }
    if (assignment.customerIdNumber !== undefined && assignment.customerIdNumber.trim() !== "") {
      booking.customerIdNumber = assignment.customerIdNumber.trim();
    }
    if (assignment.pickupCity !== undefined && assignment.pickupCity.trim() !== "") {
      booking.pickupCity = assignment.pickupCity.trim();
    }
    if (assignment.deliveryCity !== undefined && assignment.deliveryCity.trim() !== "") {
      booking.deliveryCity = assignment.deliveryCity.trim();
    }
    if (assignment.cargoNature !== undefined) {
      booking.cargoNature = assignment.cargoNature;
    }
    if (assignment.cargoWeight !== undefined) {
      booking.cargoWeight = assignment.cargoWeight;
    }
    if (assignment.helpersCount !== undefined) {
      booking.helpersCount = assignment.helpersCount;
    }
    if (assignment.actualDistanceKm !== undefined && !Number.isNaN(Number(assignment.actualDistanceKm))) {
      booking.actualDistanceKm = Number(assignment.actualDistanceKm);
    }
    if (assignment.waypoints !== undefined) {
      booking.waypoints = assignment.waypoints;
    }
    if (assignment.rideStartedAt !== undefined) {
      booking.rideStartedAt = assignment.rideStartedAt;
    }
    if (assignment.rideEndedAt !== undefined) {
      booking.rideEndedAt = assignment.rideEndedAt;
    }
    if (assignment.driverTripStatus !== undefined) {
      booking.driverTripStatus = assignment.driverTripStatus;
    }
    if (assignment.isEmptyReturnActive !== undefined) {
      booking.isEmptyReturnActive = assignment.isEmptyReturnActive;
    }
    if (assignment.emptyReturnDistanceKm !== undefined) {
      booking.emptyReturnDistanceKm = assignment.emptyReturnDistanceKm;
    }
    if (assignment.emptyReturnRoute !== undefined) {
      booking.emptyReturnRoute = assignment.emptyReturnRoute;
    }
    if (assignment.emptyReturnStartedAt !== undefined) {
      booking.emptyReturnStartedAt = assignment.emptyReturnStartedAt;
    }

  }

  if (assignment) await lockOutsideDriver(booking);
  if (paymentMeta) {
    if (paymentMeta.quotedAmount !== undefined) booking.quotedAmount = paymentMeta.quotedAmount;
    if (paymentMeta.quotedAt !== undefined) booking.quotedAt = paymentMeta.quotedAt;
    if (paymentMeta.quoteNote !== undefined) booking.quoteNote = paymentMeta.quoteNote;
    if (paymentMeta.paymentMethod !== undefined) booking.paymentMethod = paymentMeta.paymentMethod;
    if (paymentMeta.paymentBankUsed !== undefined) booking.paymentBankUsed = paymentMeta.paymentBankUsed;
    if (paymentMeta.advanceAmount !== undefined) booking.advanceAmount = paymentMeta.advanceAmount;
    if (paymentMeta.pendingAmount !== undefined) booking.pendingAmount = paymentMeta.pendingAmount;
    if (paymentMeta.finalPaymentMethod !== undefined) booking.finalPaymentMethod = paymentMeta.finalPaymentMethod;
    if (paymentMeta.finalPaymentBankUsed !== undefined) booking.finalPaymentBankUsed = paymentMeta.finalPaymentBankUsed;
    if (paymentMeta.finalPaymentAt !== undefined) booking.finalPaymentAt = paymentMeta.finalPaymentAt;
    if (paymentMeta.paymentSlipId !== undefined) booking.paymentSlipId = paymentMeta.paymentSlipId;
    if (paymentMeta.paymentSlipName !== undefined) booking.paymentSlipName = paymentMeta.paymentSlipName;
    if (paymentMeta.paymentSlipType !== undefined) booking.paymentSlipType = paymentMeta.paymentSlipType;
    if (paymentMeta.paymentSlipSize !== undefined) booking.paymentSlipSize = paymentMeta.paymentSlipSize;
    if (paymentMeta.paymentSlipUploadedAt !== undefined) booking.paymentSlipUploadedAt = paymentMeta.paymentSlipUploadedAt;
    if (paymentMeta.paymentSlipStatus !== undefined) booking.paymentSlipStatus = paymentMeta.paymentSlipStatus;
    if (paymentMeta.paymentRejectReason !== undefined) booking.paymentRejectReason = paymentMeta.paymentRejectReason;
    if (paymentMeta.paymentApprovedAt !== undefined) booking.paymentApprovedAt = paymentMeta.paymentApprovedAt;
    if (paymentMeta.paymentSlipDeletedAt !== undefined) booking.paymentSlipDeletedAt = paymentMeta.paymentSlipDeletedAt;
  }


  // Write only what changed so concurrent updates to other fields survive
  const changes: AnyRecord = { status, updatedAt: Date.now() };
  for (const [key, value] of Object.entries(booking)) {
    if (JSON.stringify(value) !== JSON.stringify(before[key])) changes[key] = value;
  }
  await setDoc(doc(db, "bookings", booking.id), clean(changes), { merge: true });
  return { ...booking, updatedAt: changes.updatedAt };
}

export async function deleteBookingFromStore(id: string): Promise<boolean> {
  const booking = await getStoredBooking(id);
  if (!booking) return false;
  await deleteDoc(doc(db, "bookings", booking.id));
  return true;
}

export async function updateBookingInStore(
  id: string,
  partial: Partial<StoredBooking>
): Promise<StoredBooking | null> {
  const booking = await getStoredBooking(id);
  if (!booking) return null;
  const changes: AnyRecord = { ...partial, updatedAt: Date.now() };
  const next = { ...booking, ...changes } as StoredBooking;
  if (partial.assignedPlate) {
    await lockOutsideDriver(next);
    changes.assignedDriverId = next.assignedDriverId;
    changes.assignedDriverName = next.assignedDriverName;
    changes.assignedDriverPhone = next.assignedDriverPhone;
  }
  await setDoc(doc(db, "bookings", booking.id), clean(changes), { merge: true });
  return next;
}

/* ============================================================
 * COMPLAINTS & DELETION REASONS
 * ============================================================ */

export async function getAllStoredComplaints(): Promise<StoredComplaint[]> {
  return readLatest<StoredComplaint>("complaints", "deletedAt", 300);
}

export async function recordComplaintInStore(complaint: StoredComplaint): Promise<StoredComplaint> {
  await setDoc(doc(db, "complaints", complaint.id), clean(complaint));
  return complaint;
}

/* ============================================================
 * VEHICLE REGISTRATIONS / PARTNER APPLICATIONS
 * ============================================================ */

export async function getAllStoredRegistrations(): Promise<StoredRegistration[]> {
  return readLatest<StoredRegistration>("vehicle_registrations", "createdAt", 300);
}

export async function addRegistrationInStore(
  input: {
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
  depositBank?: string;
  initialDepositAmount?: number;
}
): Promise<StoredRegistration> {
  const plate = (input.plateNumber || input.vehicleNumber || "").trim().toUpperCase();
  return createWithSequentialId<StoredRegistration>("vehicle_registrations", "registration_ids", "ST-REG", (id) => ({
    ...input,
    id,
    ownerName: input.ownerName.trim(),
    phone: input.phone.trim(),
    idNumber: input.idNumber?.trim() || "",
    vehicleNumber: plate,
    plateNumber: plate,
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
  }));
}

export async function updateRegistrationStatusInStore(
  id: string,
  status: "pending" | "approved" | "rejected"
): Promise<StoredRegistration | null> {
  const ref = doc(db, "vehicle_registrations", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const changes = { status, updatedAt: Date.now() };
  await updateDoc(ref, changes);
  return { ...(snap.data() as StoredRegistration), ...changes, id };
}

/* ============================================================
 * INQUIRIES & REVIEWS
 * ============================================================ */

export async function getAllStoredInquiries(): Promise<StoredInquiry[]> {
  return readLatest<StoredInquiry>("inquiries", "createdAt", 300);
}

export async function addInquiryInStore(
  input: {
  name: string;
  phone: string;
  email?: string;
  subject: string;
  message: string;
}
): Promise<StoredInquiry> {
  return createWithSequentialId<StoredInquiry>("inquiries", "inquiry_ids", "ST-INQ", (id) => ({
    id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || "",
    subject: input.subject.trim(),
    message: input.message.trim(),
    status: "unread",
    createdAt: Date.now(),
  }));
}

export async function updateInquiryStatusInStore(
  id: string,
  status: "unread" | "resolved"
): Promise<StoredInquiry | null> {
  const ref = doc(db, "inquiries", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  await updateDoc(ref, { status });
  return { ...(snap.data() as StoredInquiry), status, id };
}

export async function getAllStoredReviews(): Promise<StoredReview[]> {
  return readLatest<StoredReview>("reviews", "createdAt", 100);
}

export async function addReviewInStore(
  input: {
  name: string;
  rating: number;
  comment: string;
  service: string;
}
): Promise<StoredReview> {
  return createWithSequentialId<StoredReview>("reviews", "review_ids", "ST-REV", (id) => ({
    id,
    name: input.name.trim(),
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment.trim(),
    service: input.service.trim() || "Island-wide Transport",
    createdAt: Date.now(),
  }));
}

export async function deleteReviewFromStore(id: string): Promise<boolean> {
  const ref = doc(db, "reviews", id.trim());
  if (!(await getDoc(ref)).exists()) return false;
  await deleteDoc(ref);
  return true;
}
