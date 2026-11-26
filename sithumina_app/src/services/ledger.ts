/**
 * Payment ledger and performance totals, derived from booking records.
 *
 * Company revenue is:
 *  - recorded customer payments for company vehicles, and
 *  - registration deposits and wallet top-ups paid by external vehicle owners.
 * External owners collect their own hire fares, so those fares are never company
 * revenue. A booking being assigned or delivered does not make it paid.
 * Refunds are separate negative entries; nothing silently disappears.
 *
 * Pure code with no imports. The Driver/Admin App keeps an identical copy at
 * sithumina_app/src/services/ledger.ts - change both together.
 */

export interface LedgerBooking {
  id: string;
  status?: string;
  date?: string;
  pickupCity?: string;
  deliveryCity?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  assignedPlate?: string;
  selectedVehiclePlate?: string;
  tripRole?: string;
  parentBookingId?: string;
  distanceKm?: number;
  actualDistanceKm?: number;
  rideStartedAt?: number;
  rideEndedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  quotedAmount?: number;
  advanceAmount?: number;
  pendingAmount?: number;
  paymentMethod?: string;
  paymentBankUsed?: string;
  paymentSlipStatus?: string;
  paymentApprovedAt?: number;
  finalPaymentMethod?: string;
  finalPaymentBankUsed?: string;
  finalPaymentAt?: number;
  /** Set when the vehicle belongs to an external owner; "" for company vehicles. */
  externalOwnerId?: string;
}

export interface WalletEntry {
  id: string;
  type: string;
  amount: number;
  employeeId?: string;
  paymentMethod?: string;
  bank?: string;
  createdAt: number;
}

export interface Reversal {
  id: string;
  bookingId: string;
  entries: PaymentEntry[];
  refundedAt: number;
  reason?: string;
  external?: boolean;
  voided?: boolean;
  driverId?: string;
  plate?: string;
}

export interface LedgerContext {
  wallet?: WalletEntry[];
  reversals?: Reversal[];
}

export const isExternalBooking = (b: LedgerBooking) => Boolean(b.externalOwnerId);

/** Fill in `externalOwnerId` on older records from the list of registered owners. */
export function withExternalOwners<T extends LedgerBooking>(
  bookings: T[],
  owners: Array<{ id: string; plateNumber?: string }>
): T[] {
  const byPlate = new Map(owners.map((o) => [String(o.plateNumber || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), o.id]));
  byPlate.delete("");
  return bookings.map((b) => {
    if (b.externalOwnerId !== undefined) return b;
    const key = String(b.assignedPlate || b.selectedVehiclePlate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const owner = byPlate.get(key);
    return owner ? { ...b, externalOwnerId: owner } : b;
  });
}

export type PayMethod = "cash" | "bank" | "unrecorded";

export interface PaymentEntry {
  bookingId: string;
  kind: "advance" | "balance" | "full";
  amount: number;
  method: PayMethod;
  bank: string;
  at: number;
}

const methodOf = (method?: string, bank?: string): PayMethod => {
  if (method === "cash_manual") return "cash";
  if (method === "bank_transfer" || method === "bank_slip" || bank) return "bank";
  return "unrecorded";
};

export function paymentEntries(b: LedgerBooking): PaymentEntry[] {
  const total = Number(b.quotedAmount) || 0;
  if (total <= 0 || b.status === "cancelled") return [];
  const advance = Number(b.advanceAmount) || 0;
  const pending = Number(b.pendingAmount) || 0;
  const approvedAt = Number(b.paymentApprovedAt) || 0;
  const entry = (kind: PaymentEntry["kind"], amount: number, method: string | undefined, bank: string | undefined, at: number): PaymentEntry => {
    const m = methodOf(method, bank);
    return { bookingId: b.id, kind, amount, method: m, bank: m === "bank" ? bank || "Account not recorded" : "", at };
  };

  if (b.finalPaymentAt) {
    const part = advance > 0 && advance < total ? advance : 0;
    const list: PaymentEntry[] = [];
    if (part) list.push(entry("advance", part, b.paymentMethod, b.paymentBankUsed, approvedAt || b.finalPaymentAt));
    list.push(
      entry(
        part ? "balance" : "full",
        total - part,
        b.finalPaymentMethod || b.paymentMethod,
        b.finalPaymentMethod ? b.finalPaymentBankUsed : b.finalPaymentBankUsed || b.paymentBankUsed,
        b.finalPaymentAt
      )
    );
    return list;
  }

  const approved = approvedAt > 0 || b.paymentSlipStatus === "approved" || b.paymentSlipStatus === "manual_approved";
  let paid = 0;
  if (advance > 0) paid = Math.min(advance, total);
  else if (approved && pending <= 0 && b.paymentSlipStatus !== "cash_pending" && b.paymentSlipStatus !== "pending_review") paid = total;
  if (paid <= 0) return [];
  return [entry(paid < total ? "advance" : "full", paid, b.paymentMethod, b.paymentBankUsed, approvedAt || b.updatedAt || b.createdAt || 0)];
}

export const isTripFinished = (b: LedgerBooking) => b.status === "delivered" || b.status === "completed";

/** What a customer still owes the company. */
export function outstandingAmount(b: LedgerBooking): number {
  if (b.status === "cancelled" || isExternalBooking(b)) return 0;
  const received = paymentEntries(b).reduce((sum, e) => sum + e.amount, 0);
  return Math.max(0, (Number(b.quotedAmount) || 0) - received);
}

export interface Totals {
  trips: number;
  returnTrips: number;
  km: number;
  /** Fare value of finished company-vehicle trips. */
  fareValue: number;
  /** Fares of finished external trips, collected by the owners. */
  ownerFares: number;
  /** Company revenue: money in, less refunds. */
  received: number;
  /** Part of `received` that is owner deposits and top-ups. */
  deposits: number;
  refunds: number;
  cash: number;
  bank: number;
  unrecorded: number;
  outstanding: number;
  banks: Array<{ bank: string; amount: number; payments: number }>;
}

export interface RevenueLine {
  id: string;
  kind: "advance" | "balance" | "full" | "deposit" | "topup" | "refund";
  amount: number;
  method: PayMethod;
  bank: string;
  at: number;
  bookingId?: string;
  employeeId?: string;
}

/** Every movement of company money, newest first. */
export function revenueLines(bookings: LedgerBooking[], ctx: LedgerContext = {}): RevenueLine[] {
  const lines: RevenueLine[] = [];
  const add = (e: PaymentEntry, id: string) => lines.push({ ...e, id });
  for (const b of bookings) {
    if (isExternalBooking(b)) continue;
    paymentEntries(b).forEach((e) => add(e, `${b.id}-${e.kind}`));
  }
  for (const r of ctx.reversals || []) {
    if (r.voided || r.external) continue;
    for (const e of r.entries) {
      // The original receipt stays on its own date; the refund lands on the cancellation date
      add(e, `${r.id}-${e.kind}`);
      lines.push({ ...e, id: `${r.id}-${e.kind}-refund`, kind: "refund", amount: -e.amount, at: r.refundedAt });
    }
  }
  for (const w of ctx.wallet || []) {
    if (w.type !== "initial_deposit" && w.type !== "topup") continue;
    const method = w.paymentMethod === "cash" ? "cash" : w.paymentMethod === "bank" || w.bank ? "bank" : "unrecorded";
    lines.push({
      id: w.id,
      kind: w.type === "topup" ? "topup" : "deposit",
      amount: Number(w.amount) || 0,
      method,
      bank: method === "bank" ? w.bank || "Account not recorded" : "",
      at: w.createdAt,
      employeeId: w.employeeId,
    });
  }
  return lines.sort((x, y) => y.at - x.at);
}

/**
 * Totals for a set of bookings. `from`/`to` (ms, to exclusive) limit money by
 * the date it moved, and trips by the date finished.
 */
export function summarise(
  bookings: LedgerBooking[],
  from = 0,
  to = Number.MAX_SAFE_INTEGER,
  ctx: LedgerContext = {}
): Totals {
  const t: Totals = {
    trips: 0, returnTrips: 0, km: 0, fareValue: 0, ownerFares: 0, received: 0, deposits: 0,
    refunds: 0, cash: 0, bank: 0, unrecorded: 0, outstanding: 0, banks: [],
  };
  for (const b of bookings) {
    const finishedAt = b.rideEndedAt || b.updatedAt || b.createdAt || 0;
    if (!isTripFinished(b) || finishedAt < from || finishedAt >= to) continue;
    t.trips += 1;
    if (b.tripRole === "return") t.returnTrips += 1;
    t.km += Number(b.actualDistanceKm || b.distanceKm) || 0;
    if (isExternalBooking(b)) t.ownerFares += Number(b.quotedAmount) || 0;
    else t.fareValue += Number(b.quotedAmount) || 0;
    t.outstanding += outstandingAmount(b);
  }
  const banks = new Map<string, { amount: number; payments: number }>();
  for (const line of revenueLines(bookings, ctx)) {
    if (line.at < from || line.at >= to) continue;
    t.received += line.amount;
    t[line.method] += line.amount;
    if (line.kind === "deposit" || line.kind === "topup") t.deposits += line.amount;
    if (line.kind === "refund") t.refunds -= line.amount;
    if (line.method === "bank") {
      const row = banks.get(line.bank) || { amount: 0, payments: 0 };
      banks.set(line.bank, {
        amount: row.amount + line.amount,
        payments: row.payments + (line.kind === "refund" ? 0 : 1),
      });
    }
  }
  t.km = Math.round(t.km * 10) / 10;
  t.banks = Array.from(banks, ([bank, v]) => ({ bank, ...v })).sort((x, y) => y.amount - x.amount);
  return t;
}

const SRI_LANKA_OFFSET = 5.5 * 3600 * 1000;
const DAY = 86400000;

/** Start of a Sri Lanka calendar day given as YYYY-MM-DD. */
export function dayStart(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - SRI_LANKA_OFFSET;
}

export function todayYmd(now = Date.now()): string {
  return new Date(now + SRI_LANKA_OFFSET).toISOString().slice(0, 10);
}

export type Period = "today" | "month" | "custom" | "all";

export function periodRange(period: Period, from = "", to = "", now = Date.now()): [number, number] {
  const today = todayYmd(now);
  if (period === "today") return [dayStart(today), dayStart(today) + DAY];
  if (period === "month") {
    const [y, m] = today.split("-").map(Number);
    return [Date.UTC(y, m - 1, 1) - SRI_LANKA_OFFSET, Date.UTC(y, m, 1) - SRI_LANKA_OFFSET];
  }
  if (period === "custom") {
    return [from ? dayStart(from) : 0, to ? dayStart(to) + DAY : Number.MAX_SAFE_INTEGER];
  }
  return [0, Number.MAX_SAFE_INTEGER];
}

const plateKey = (v?: string) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const phoneKey = (v?: string) => String(v || "").replace(/\D/g, "").slice(-9);

/** All bookings (primary and return legs) driven by a driver. */
export function bookingsForDriver<T extends LedgerBooking>(all: T[], d: { id?: string; phone?: string; name?: string }): T[] {
  const id = String(d.id || "").trim().toUpperCase();
  const phone = phoneKey(d.phone);
  const name = String(d.name || "").trim().toLowerCase();
  return all.filter((b) => {
    const bId = String(b.assignedDriverId || "").trim().toUpperCase();
    // A recorded Driver ID is authoritative; fall back to phone, then name
    if (bId) return bId === id;
    const bPhone = phoneKey(b.assignedDriverPhone);
    if (bPhone) return bPhone === phone;
    return Boolean(name) && String(b.assignedDriverName || "").trim().toLowerCase() === name;
  });
}

export function bookingsForVehicle<T extends LedgerBooking>(all: T[], plate: string): T[] {
  const key = plateKey(plate);
  return key ? all.filter((b) => plateKey(b.assignedPlate || b.selectedVehiclePlate) === key) : [];
}
