/**
 * Figures for one rider, lorry or outside owner over a range of calendar days.
 *
 *  - Days are Sri Lanka calendar days written YYYY-MM-DD, compared as text, so
 *    the browser's own timezone never matters.
 *  - A finished trip belongs to the day it ended.
 *  - A pending or running trip belongs to the day(s) it is scheduled for.
 *  - Cancelled bookings are not counted anywhere.
 */
import { commissionFor } from "@/lib/commission";
import { getDistanceFromLatLonInKm } from "@/lib/geo-utils";
import {
  isTripFinished,
  outstandingAmount,
  paymentEntries,
  periodRange,
  todayYmd,
  tripFinishedAt,
  type LedgerBooking,
  type Period,
} from "@/lib/ledger";
import { resolveLocationCoordinates } from "@/lib/sri-lanka-routes";

export interface MetricBooking extends LedgerBooking {
  dates?: string[];
  pickupLat?: number | null;
  pickupLng?: number | null;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  waypoints?: Array<{ lat: number; lng: number }>;
  driverTripStatus?: string;
  loadedAt?: number;
}

/** Inclusive day range; an empty side is open. */
export interface DayRange {
  from: string;
  to: string;
}

export function dayRange(period: Period, from = "", to = "", now = Date.now()): DayRange {
  if (period === "all") return { from: "", to: "" };
  if (period === "custom") return { from, to };
  const [start, end] = periodRange(period, "", "", now);
  return { from: todayYmd(start), to: todayYmd(end - 1) };
}

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const overlaps = (first: string, last: string, r: DayRange) =>
  (!r.to || first <= r.to) && (!r.from || last >= r.from);

export function scheduledDays(b: MetricBooking): string[] {
  const days = [...(Array.isArray(b.dates) ? b.dates : []), b.date].filter(isDay);
  if (days.length > 0) return Array.from(new Set(days)).sort();
  return b.createdAt ? [todayYmd(b.createdAt)] : [];
}

/** The day a booking is listed under: end day when finished, else first scheduled day. */
export function reportDay(b: MetricBooking): string {
  const finished = isTripFinished(b) ? tripFinishedAt(b) : 0;
  return finished ? todayYmd(finished) : scheduledDays(b)[0] || "";
}

export function inRange(b: MetricBooking, r: DayRange): boolean {
  if (!r.from && !r.to) return true;
  if (isTripFinished(b)) {
    const day = reportDay(b);
    return Boolean(day) && overlaps(day, day, r);
  }
  const days = scheduledDays(b);
  // A multi-day trip counts when any part of it falls inside the range
  if (days.length > 0 && overlaps(days[0], days[days.length - 1], r)) return true;
  if (!b.rideStartedAt) return false;
  const started = todayYmd(b.rideStartedAt);
  return overlaps(started, started, r);
}

export interface Distance {
  km: number;
  source: "recorded" | "estimated" | "none";
}

const positive = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);

function point(lat: unknown, lng: unknown, place?: string): [number, number] | null {
  if (positive(lat) && positive(lng)) return [Number(lat), Number(lng)];
  return resolveLocationCoordinates(place);
}

/** Recorded kilometres, otherwise an estimate of the road route (straight lines x 1.3). */
export function tripDistance(b: MetricBooking): Distance {
  const recorded = positive(b.actualDistanceKm) || positive(b.distanceKm);
  if (recorded) return { km: recorded, source: "recorded" };
  const start = point(b.pickupLat, b.pickupLng, b.pickupCity);
  const end = point(b.deliveryLat, b.deliveryLng, b.deliveryCity);
  if (!start || !end) return { km: 0, source: "none" };
  const stops = (b.waypoints || [])
    .filter((w) => positive(w?.lat) && positive(w?.lng))
    .map((w) => [Number(w.lat), Number(w.lng)] as [number, number]);
  const path = [start, ...stops, end];
  let straight = 0;
  for (let i = 1; i < path.length; i++) {
    straight += getDistanceFromLatLonInKm(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
  }
  // Same town to same town is not a measurable route
  if (straight < 0.5) return { km: 0, source: "none" };
  return { km: Math.round(straight * 1.3), source: "estimated" };
}

export interface Report<T> {
  completed: T[];
  open: T[];
  /** Fare value of the completed trips. */
  fare: number;
  /** Money recorded against those trips, and what is still owed (company trips only). */
  paid: number;
  due: number;
  km: number;
  estimatedTrips: number;
  unknownDistanceTrips: number;
  returnTrips: number;
}

/** Totals and lists for the bookings of one rider, lorry or owner. */
export function report<T extends MetricBooking>(bookings: T[], range: DayRange): Report<T> {
  const unique = Array.from(new Map(bookings.map((b) => [b.id, b])).values());
  const chosen = unique.filter((b) => b.status !== "cancelled" && inRange(b, range));
  const newestFirst = (a: T, b: T) => reportDay(b).localeCompare(reportDay(a)) || b.id.localeCompare(a.id);
  const completed = chosen.filter(isTripFinished).sort(newestFirst);
  const open = chosen.filter((b) => !isTripFinished(b)).sort((a, b) => newestFirst(b, a));

  const result: Report<T> = {
    completed, open, fare: 0, paid: 0, due: 0, km: 0,
    estimatedTrips: 0, unknownDistanceTrips: 0, returnTrips: 0,
  };
  for (const b of completed) {
    result.fare += Number(b.quotedAmount) || 0;
    if (!b.externalOwnerId) {
      result.paid += paymentEntries(b).reduce((sum, e) => sum + e.amount, 0);
      result.due += outstandingAmount(b);
    }
    const distance = tripDistance(b);
    result.km += distance.km;
    if (distance.source === "estimated") result.estimatedTrips += 1;
    if (distance.source === "none") result.unknownDistanceTrips += 1;
    if (b.tripRole === "return") result.returnTrips += 1;
  }
  result.km = Math.round(result.km * 10) / 10;
  return result;
}

export interface WalletLine {
  type: string;
  amount: number;
  bookingId?: string;
}

const isCommission = (e: WalletLine) => e.type === "commission_deduction" || e.type === "adjustment";

/** Net commission currently charged for each booking (refunds and corrections included). */
export function commissionByBooking(entries: WalletLine[]): Map<string, number> {
  const charged = new Map<string, number>();
  for (const e of entries) {
    if (!isCommission(e) || !e.bookingId) continue;
    // Deductions are negative amounts, refunds positive
    charged.set(e.bookingId, (charged.get(e.bookingId) || 0) - (Number(e.amount) || 0));
  }
  return charged;
}

export const expectedCommission = (b: MetricBooking) => commissionFor(Number(b.quotedAmount) || 0);

export interface WalletSummary {
  openingDeposit: number;
  topups: number;
  deposited: number;
  used: number;
  /** Hires that currently carry a commission charge. */
  hires: number;
  balance: number;
  /** Any part of the balance the recorded entries do not explain. */
  unexplained: number;
  /** 0-100: how much of the money paid in has gone on commission. */
  usedPercent: number;
}

export function walletSummary(entries: WalletLine[], balance: number): WalletSummary {
  const total = (match: (e: WalletLine) => boolean) =>
    entries.filter(match).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const openingDeposit = total((e) => e.type === "initial_deposit");
  const topups = total((e) => e.type === "topup");
  const deposited = openingDeposit + topups;
  const used = -total(isCommission) || 0;
  const current = Number(balance) || 0;
  return {
    openingDeposit,
    topups,
    deposited,
    used,
    hires: Array.from(commissionByBooking(entries).values()).filter((v) => v > 0).length,
    balance: current,
    unexplained: Math.round((current - (deposited - used)) * 100) / 100,
    usedPercent:
      deposited > 0 ? Math.min(100, Math.max(0, Math.round((used / deposited) * 100))) : used > 0 ? 100 : 0,
  };
}

/** Short wording for the status column. */
export function bookingStatusLabel(b: MetricBooking): string {
  const status = String(b.status || "");
  if (["accepted", "booked", "assigned"].includes(status)) {
    if (b.driverTripStatus === "pending_acceptance") return "Ringing";
    if (b.driverTripStatus === "declined") return "Declined by driver";
    if (b.driverTripStatus === "scheduled") return "Scheduled";
    return status === "assigned" ? "Assigned" : "Approved";
  }
  if (status === "in_transit" || status === "goods_collected") {
    return b.loadedAt || status === "goods_collected" ? "Loaded" : "On the way";
  }
  const labels: Record<string, string> = {
    pending: "Pending",
    awaiting_payment: "Awaiting payment",
    payment_submitted: "Slip submitted",
    delivered: "Delivered",
    completed: "Completed",
  };
  return labels[status] || status || "Unknown";
}
