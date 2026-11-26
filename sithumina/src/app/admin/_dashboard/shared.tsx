"use client";

import { StoredBooking, BookingStatusValue } from "@/lib/server-store";
import { getSriLankaTimestampForDateTime, parseTimeToMinutes } from "@/lib/booking-schedule";
import { SRI_LANKA_CITIES } from "@/lib/sri-lanka-routes";
import { getDistanceFromLatLonInKm } from "@/lib/geo-utils";

export function stripSinhalaText(val?: string | null): string {
  if (!val || typeof val !== "string") return "";
  const cleaned = val.replace(/[\u0D80-\u0DFF]+/g, "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return cleaned.replace(/^[\s/\\-]+|[\s/\\-]+$/g, "").trim() || val;
}
export type NavSection =
  | "overview"
  | "all_bookings"
  | "individual_bookings"
  | "online_bookings"
  | "customers"
  | "complaints"
  | "revenue"
  | "vehicle_registrations"
  | "outside_employees"
  | "topup_slips"
  | "contact_submissions"
  | "fleet"
  | "riders"
  | "settings";
export interface CustomerMetric {
  id: string;
  name: string;
  phone: string;
  canonicalPhone: string;
  idNumber?: string;
  email?: string;
  city?: string;
  registeredAt: number;
  lastActiveAt: number;
  totalBookings: number;
  completedBookings: number;
  activeBookings: number;
  pendingBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
  averageBookingValue: number;
  status: "vip" | "gold" | "silver" | "active" | "registered";
  frequentRoutes: string[];
  bookingsList: StoredBooking[];
}
export type BookingStatus = BookingStatusValue;
export type StatusFilter = "all" | "pending" | "awaiting_payment" | "payment_submitted" | "accepted" | "assigned" | "completed";
export interface AssignModalState {
  booking: StoredBooking;
  lorryId: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  plate: string;
  date: string;
  endDate?: string;
  isMultiDate?: boolean;
  startTime: string;
  endTime: string;
  distanceKm?: string;
}
export interface ScheduleDraft {
  date: string;
  endDate?: string;
  isMultiDate?: boolean;
  dates?: string[];
  startTime: string;
  endTime: string;
  plate: string;
  lorryId: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  distanceKm?: string;
}
export interface ManualBookingForm {
  plate: string;
  vehicleType: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  customerName: string;
  customerPhone: string;
  customerIdNumber: string;
  pickupCity: string;
  deliveryCity: string;
  distanceKm: string;
  date: string;
  endDate?: string;
  isMultiDate?: boolean;
  startTime: string;
  endTime: string;
  quotedAmount: string;
  paymentStatusMode: "pending" | "success" | "partial";
  advanceAmount: string;
  paymentMethod: "cash_manual" | "bank_transfer";
  paymentBankUsed: string;
  paymentNote: string;
  cargoNature: string;
  cargoWeight: string;
  helpersCount: string;
  notes: string;
}
export interface LorryFormState {
  plate: string;
  vehicleType: string;
  capacity: string;
  maxWeight: string;
  baseCity: string;
  description: string;
  rider: string;
  images: string[];
}
export interface RiderFormState {
  driverId: string;
  name: string;
  phone: string;
  nic: string;
  plate: string;
  vehicleType: string;
  route: string;
  active: boolean;
}
export const CARGO_NATURE_OPTIONS = [
  "Furniture & Household Goods",
  "Commercial & Produce Cargo",
  "Hardware & Construction Materials",
  "Machinery & Industrial Equipment",
  "Fragile Items & Glassware",
  "Garments & Textiles",
  "General Cargo & Miscellaneous",
];
export const VEHICLE_TYPE_OPTIONS = [
  "14.5ft Demountable Box Lorry",
  "14ft Closed Canter Lorry",
  "10ft Small Tipper Lorry",
  "14ft Open Dropside Lorry",
  "16.5ft Medium Freight Truck",
  "20ft Flatbed Container Lorry",
  "Freezer / Refrigerated Truck",
  "24ft Heavy Cargo Carrier",
];
export const DURATION_OPTIONS = [
  { value: "1", label: "1 Day" },
  { value: "2", label: "2 Days" },
  { value: "3", label: "3 Days" },
  { value: "4", label: "4 Days" },
  { value: "5", label: "5 Days" },
  { value: "7", label: "1 Week (7 Days)" },
];
export const BOOKING_STAGES: { key: BookingStatus; label: string }[] = [
  { key: "pending", label: "1. Pending Review" },
  { key: "awaiting_payment", label: "2. Awaiting Payment" },
  { key: "payment_submitted", label: "3. Slip Submitted" },
  { key: "accepted", label: "4. Payment Approved" },
  { key: "assigned", label: "5. Rider & Time Assigned" },
  { key: "in_transit", label: "6. In Transit" },
  { key: "delivered", label: "7. Delivered / Completed" },
  { key: "cancelled", label: "8. Cancelled" },
];
export const PROGRESS_KEYS: BookingStatus[] = [
  "pending",
  "awaiting_payment",
  "payment_submitted",
  "accepted",
  "assigned",
  "in_transit",
  "delivered",
];
export function formatBookingDateTime(ts?: number): { date: string; time: string; display: string } | null {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return null;
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
    const time = d.toLocaleTimeString("en-US", {
      timeZone: "Asia/Colombo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return { date, time, display: `${date} · ${time}` };
  } catch {
    return null;
  }
}
export const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export function getSriLankaDateStr(timestamp: number = Date.now()): string {
  const d = new Date(timestamp + SRI_LANKA_OFFSET_MS);
  return d.toISOString().split("T")[0];
}
export function getSriLankaMidnightTimestamp(timestamp: number = Date.now()): number {
  const d = new Date(timestamp + SRI_LANKA_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const dt = d.getUTCDate();
  return Date.UTC(y, m, dt) - SRI_LANKA_OFFSET_MS;
}
export function getRouteDistanceKm(pickup?: string, delivery?: string, recordedKm?: number | string): string {
  if (recordedKm && !Number.isNaN(Number(recordedKm)) && Number(recordedKm) > 0) {
    return `${Number(recordedKm)} km`;
  }
  if (!pickup || !delivery) return "—";
  const pNorm = pickup.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const dNorm = delivery.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const pCoord = SRI_LANKA_CITIES[pNorm];
  const dCoord = SRI_LANKA_CITIES[dNorm];
  if (pCoord && dCoord) {
    const rawDist = getDistanceFromLatLonInKm(pCoord[0], pCoord[1], dCoord[0], dCoord[1]);
    const roadDist = Math.max(10, Math.round(rawDist * 1.3));
    return `~${roadDist} km`;
  }
  return "Island-wide";
}
export function addMinutesToHHMM(hhmm?: string | null, minsToAdd: number = 5): string {
  if (!hhmm) return "";
  const m = parseTimeToMinutes(hhmm);
  if (m === null) return hhmm;
  const nextM = Math.min(1440, m + minsToAdd);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(nextM / 60))}:${pad(nextM % 60)}`;
}
export interface BookingRideLifecycle {
  stage: "upcoming" | "ongoing" | "completed" | "cancelled" | "unscheduled";
  isUpcoming: boolean;
  isOngoing: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  startTimestamp: number | null;
  endTimestamp: number | null;
  startPlus15: number | null;
  endPlus5: number | null;
}
/**
 * Evaluates real-time dispatch trip lifecycle:
 * - Upcoming: Scheduled trip before start time + 15 min grace window (e.g. before 09:15 for 09:00 start)
 * - Ongoing: Active trip on the road from start time up to end time + 5 min (e.g. 09:00 - 11:00 until 11:05)
 * - Completed: Finished/delivered trip once end time + 5 min passes (11:05 onwards) or marked delivered
 *   -> Once completed, time slot is released and becomes available for new bookings!
 */
export function getBookingLifecycle(b: StoredBooking, nowMs: number = Date.now()): BookingRideLifecycle {
  if (b.status === "cancelled") {
    return {
      stage: "cancelled",
      isUpcoming: false,
      isOngoing: false,
      isCompleted: false,
      isCancelled: true,
      startTimestamp: null,
      endTimestamp: null,
      startPlus15: null,
      endPlus5: null,
    };
  }
  // Explicit delivered/completed status
  if (b.status === "delivered" || b.status === "completed" || Boolean(b.rideEndedAt && b.driverTripStatus === "completed")) {
    return {
      stage: "completed",
      isUpcoming: false,
      isOngoing: false,
      isCompleted: true,
      isCancelled: false,
      startTimestamp: null,
      endTimestamp: null,
      startPlus15: null,
      endPlus5: null,
    };
  }
  const bDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : (b.date ? [b.date] : []);
  const bDate = b.date || bDates[0] || "";
  const bEndDate = bDates.length > 1 ? bDates[bDates.length - 1] : bDate;
  const startTime = b.startTime || "";
  const endTime = b.endTime || "";
  if (!bDate) {
    return {
      stage: "unscheduled",
      isUpcoming: true,
      isOngoing: false,
      isCompleted: false,
      isCancelled: false,
      startTimestamp: null,
      endTimestamp: null,
      startPlus15: null,
      endPlus5: null,
    };
  }
  const startTimestamp = getSriLankaTimestampForDateTime(bDate, startTime || "08:00");
  const endTimestamp = getSriLankaTimestampForDateTime(bEndDate, endTime || (startTime ? "12:00" : "17:00"));
  const startPlus15 = startTimestamp !== null ? startTimestamp + 15 * 60 * 1000 : null;
  const endPlus5 = endTimestamp !== null ? endTimestamp + 5 * 60 * 1000 : null;
  // Active on Road / Ongoing check:
  // - Explicitly started via Admin "Start Ride" button OR Driver App live location share
  // - Automatic departure-time trigger is removed as per user requirement!
  const isManuallyOngoing =
    b.status === "in_transit" ||
    b.status === "goods_collected" ||
    b.driverTripStatus === "in_transit" ||
    Boolean(b.rideStartedAt && !b.rideEndedAt);
  if (isManuallyOngoing) {
    return {
      stage: "ongoing",
      isUpcoming: false,
      isOngoing: true,
      isCompleted: false,
      isCancelled: false,
      startTimestamp,
      endTimestamp,
      startPlus15,
      endPlus5,
    };
  }
  // Upcoming check: before departure start time
  return {
    stage: "upcoming",
    isUpcoming: true,
    isOngoing: false,
    isCompleted: false,
    isCancelled: false,
    startTimestamp,
    endTimestamp,
    startPlus15,
    endPlus5,
  };
}
export type RevenueTimeFilter = "today" | "yesterday" | "pick_date" | "days_count" | "this_month" | "last_month" | "all_time" | "custom";
