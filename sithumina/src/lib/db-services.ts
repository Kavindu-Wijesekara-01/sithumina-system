import { collection, doc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, limit, writeBatch, where, orderBy } from "firebase/firestore";
import { db } from "./firebase";
import { Lorry, LorryStatus } from "./mock-lorries";
import { StoredBooking } from "./server-store";
import {
  createBookingAction,
  trackBookingAction,
  updateBookingStatusAction,
  registerVehicleAction,
  updateRegistrationStatusAction,
  submitInquiryAction,
  submitReviewAction,
  deleteReviewAction,
} from "@/actions";

/* ============================================================
 * LORRIES / FLEET SERVICE
 * ============================================================ */

const LORRIES_REGISTRY_COL = "lorries_registry";

/**
 * Disabled dummy seeding - only real registered drivers appear
 */
export async function seedInitialLorriesIfEmpty(): Promise<boolean> {
  return false;
}

/** One read of the public vehicle list; null when it could not be loaded. */
async function fetchLorriesFromApi(type: "live" | "fleet" = "live"): Promise<Lorry[] | null> {
  try {
    const url = type === "fleet" ? "/api/lorries?type=fleet" : "/api/lorries";
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !Array.isArray(json.lorries)) return null;
    return json.lorries
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
      isOutsideLorry: Boolean(l.isOutsideLorry || l.ownershipType === "outside"),
      ownershipType: (l.ownershipType || (l.isOutsideLorry ? "outside" : "company")) as "company" | "outside",
      isAvailable: l.isAvailable !== false,
    }));
  } catch {
    return null;
  }
}

/**
 * Public pages read vehicles only through /api/lorries, which returns vehicle
 * details without any owner or driver identity. Polling pauses while the tab is
 * hidden, and a failed poll keeps what is already on screen.
 */
function pollPublicLorries(
  type: "live" | "fleet",
  everyMs: number,
  callback: (lorries: Lorry[]) => void,
  onError?: (error: Error) => void
): () => void {
  let stopped = false;
  let shown = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async () => {
    clearTimeout(timer);
    if (stopped) return;
    if (!shown || document.visibilityState !== "hidden") {
      const lorries = await fetchLorriesFromApi(type);
      if (stopped) return;
      if (lorries) {
        shown = true;
        callback(lorries);
      } else {
        onError?.(new Error("Could not load vehicles."));
        if (!shown) callback([]);
      }
    }
    clearTimeout(timer);
    timer = setTimeout(poll, everyMs);
  };
  const wake = () => {
    if (document.visibilityState === "visible") void poll();
  };
  document.addEventListener("visibilitychange", wake);
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", wake);
  };
}

/** Vehicles currently broadcasting their position. */
export function subscribeLorries(
  callback: (lorries: Lorry[]) => void,
  onError?: (error: Error) => void
): () => void {
  return pollPublicLorries("live", 8000, callback, onError);
}

/** Registered vehicles for visitors and customers. */
export function subscribePublicFleet(
  callback: (lorries: Lorry[]) => void,
  onError?: (error: Error) => void
): () => void {
  return pollPublicLorries("fleet", 60000, callback, onError);
}

function stripSinhalaText(val: string): string {
  if (!val || typeof val !== "string") return "";
  return val
    .replace(/[඀-෿]+/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Admin only: the full fleet registry in real time, including assigned riders.
 * The security rules refuse this read to everyone else.
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
            vehicleType: stripSinhalaText(data.vehicleType || data.type || "Lorry Fleet"),
            capacity: stripSinhalaText(data.capacity || data.availableCapacityKg || data.availableSpace || ""),
            maxWeight: stripSinhalaText(data.maxWeight || ""),
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
            isOutsideLorry: Boolean(data.isOutsideLorry || data.ownershipType === "outside"),
            ownershipType: (data.ownershipType || (data.isOutsideLorry ? "outside" : "company")) as "company" | "outside",
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
        callback([]);
      }
    );
  } catch (err) {
    if (err instanceof Error) onError?.(err);
    callback([]);
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
  isOutsideDriver?: boolean;
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
            isOutsideDriver: Boolean(data.isOutsideDriver),
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
    const colRef = query(collection(db, BOOKINGS_COL), orderBy("createdAt", "desc"), limit(200));
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
  const colRef = query(collection(db, REGISTRATIONS_COL), orderBy("createdAt", "desc"), limit(300));
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
  const colRef = query(collection(db, REVIEWS_COL), orderBy("createdAt", "desc"), limit(100));
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
  const colRef = query(collection(db, INQUIRIES_COL), orderBy("createdAt", "desc"), limit(300));
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
