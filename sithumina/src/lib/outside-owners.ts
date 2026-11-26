/**
 * Outside (external) vehicle owners - Firestore is the only source of truth.
 *
 * Business rules:
 *  - The owner's Rs. 5,000 registration deposit is their opening wallet balance.
 *  - 20% of every completed hire is deducted from that wallet. The owner
 *    collects the fare from the customer.
 *  - The balance may go negative. A low balance never blocks a hire.
 *  - Deposits and top-ups are company revenue, recorded with their method.
 */
import { db, limit, orderBy } from "@/lib/fs-server";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
} from "@/lib/fs-server";
import { reserveDriverIdInTransaction, scanHighestDriverNumber } from "@/lib/driver-ids";
import { commissionFor, formatRs, COMMISSION_PERCENT, REGISTRATION_DEPOSIT } from "@/lib/commission";
import type {
  StoredOutsideEmployee,
  StoredCommissionTransaction,
  StoredTopupSlip,
} from "@/lib/server-store";

/** An error whose message is safe and useful to show to the user. */
export class OwnerError extends Error {}

const OWNERS = "outside_employees";
const LEDGER = "commission_transactions";
const SLIPS = "outside_topup_slips";
const UNIQUE_KEYS = "outside_owner_keys";
const COMMISSION_STATE = "commission_state";

const cleanPlate = (v: string) => (v || "").trim().toUpperCase();
const plateKey = (v: string) => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const nicKey = (v: string) => (v || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
const phoneKey = (v: string) => (v || "").replace(/\D/g, "").slice(-9);
export const lorryDocIdForPlate = (plate: string) => `lorry-${plateKey(plate).toLowerCase()}`;

/* ---------------------------------------------------------------- Queries */

export async function listOutsideOwners(): Promise<StoredOutsideEmployee[]> {
  const snap = await getDocs(collection(db, OWNERS));
  return snap.docs
    .map((d) => ({ ...(d.data() as StoredOutsideEmployee), id: d.id }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Look up by Driver ID or NIC. */
export async function findOutsideOwner(key: string): Promise<StoredOutsideEmployee | null> {
  const clean = (key || "").trim();
  if (!clean || clean.includes("/")) return null;
  const byId = await getDoc(doc(db, OWNERS, clean.toUpperCase()));
  if (byId.exists()) return { ...(byId.data() as StoredOutsideEmployee), id: byId.id };
  for (const value of new Set([clean, clean.toUpperCase()])) {
    const found = await getDocs(query(collection(db, OWNERS), where("idNumber", "==", value), limit(1)));
    if (!found.empty) return { ...(found.docs[0].data() as StoredOutsideEmployee), id: found.docs[0].id };
  }
  return null;
}

export async function findOutsideOwnerByPlate(plate: string): Promise<StoredOutsideEmployee | null> {
  const key = plateKey(plate);
  if (!key) return null;
  // The unique-key document matches any spacing or dashes
  const lock = await getDoc(doc(db, UNIQUE_KEYS, `plate_${key}`));
  if (lock.exists()) {
    const owner = await getDoc(doc(db, OWNERS, String(lock.data()!.employeeId)));
    if (owner.exists()) {
      const data = owner.data() as StoredOutsideEmployee;
      if (plateKey(data.plateNumber) === key) return { ...data, id: owner.id };
    }
  }
  const found = await getDocs(query(collection(db, OWNERS), where("plateNumber", "==", cleanPlate(plate)), limit(1)));
  return found.empty ? null : { ...(found.docs[0].data() as StoredOutsideEmployee), id: found.docs[0].id };
}

export async function listOwnerTransactions(employeeId: string): Promise<StoredCommissionTransaction[]> {
  const snap = await getDocs(query(collection(db, LEDGER), where("employeeId", "==", employeeId)));
  return snap.docs
    .map((d) => ({ ...(d.data() as StoredCommissionTransaction), id: d.id }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/* ----------------------------------------------------------- Registration */

export interface NewOwnerInput {
  name: string;
  phone: string;
  idNumber: string;
  plateNumber: string;
  vehicleType: string;
  baseCity: string;
  openingBalance: number;
  isAvailable: boolean;
  status: "active" | "inactive" | "suspended";
  registrationId?: string;
  route?: string;
  depositSlipUrl?: string;
  depositMethod?: "cash" | "bank";
  depositBank?: string;
  openingNote: string;
  lorryExtras?: Record<string, unknown>;
}

/**
 * Atomically creates the owner, driver login, lorry records and opening deposit.
 * Rejects duplicates of NIC, phone or plate.
 */
export async function createOutsideOwner(input: NewOwnerInput): Promise<StoredOutsideEmployee> {
  const plate = cleanPlate(input.plateNumber);
  const lorryId = lorryDocIdForPlate(plate);

  const keys = [
    { id: nicKey(input.idNumber) && `nic_${nicKey(input.idNumber)}`, label: "NIC/ID" },
    { id: phoneKey(input.phone) && `phone_${phoneKey(input.phone)}`, label: "Phone number" },
    { id: plateKey(plate) && `plate_${plateKey(plate)}`, label: "Vehicle number" },
  ].filter((k) => k.id);

  // Exact-value checks cover records older than the unique-key documents.
  // A failure here aborts registration.
  for (const [field, value, label] of [
    ["idNumber", input.idNumber, "NIC/ID"],
    ["phone", input.phone, "Phone number"],
    ["plateNumber", plate, "Vehicle number"],
  ] as const) {
    if (!value) continue;
    const found = await getDocs(query(collection(db, OWNERS), where(field, "==", value), limit(1)));
    if (!found.empty) {
      const e = found.docs[0].data();
      throw new OwnerError(`${label} already registered (${found.docs[0].id} - ${e.name}).`);
    }
  }

  const highest = await scanHighestDriverNumber();

  return runTransaction(db, async (tx) => {
    // ---- reads ----
    for (const key of keys) {
      const lock = await tx.get(doc(db, UNIQUE_KEYS, key.id));
      if (lock.exists()) {
        const holder = await tx.get(doc(db, OWNERS, String(lock.data().employeeId)));
        if (holder.exists()) {
          throw new OwnerError(`${key.label} already registered (${holder.id}).`);
        }
      }
    }
    for (const ref of [doc(db, "lorries_registry", plate), doc(db, "lorries_registry", lorryId)]) {
      const existing = await tx.get(ref);
      const data = existing.data();
      if (data && !data.isOutsideLorry && data.ownershipType !== "outside") {
        throw new OwnerError(`Vehicle ${plate} is already in the company fleet.`);
      }
    }
    const reservation = await reserveDriverIdInTransaction(tx, highest);

    // ---- writes ----
    const id = reservation.id;
    const now = Date.now();
    const route = input.route || `${input.baseCity} – Island-wide`;
    const employee: StoredOutsideEmployee = {
      id,
      driverId: id,
      registrationId: input.registrationId || `manual-${id}`,
      name: input.name,
      phone: input.phone,
      idNumber: input.idNumber,
      plateNumber: plate,
      vehicleType: input.vehicleType,
      baseCity: input.baseCity,
      balance: input.openingBalance,
      isAvailable: input.isAvailable,
      status: input.status,
      totalCommissionDeducted: 0,
      totalHiresCompleted: 0,
      createdAt: now,
      updatedAt: now,
    };
    const lorry = {
      ...(input.lorryExtras || {}),
      id: lorryId,
      plate,
      vehicleNumber: plate,
      vehicleType: input.vehicleType,
      ownerName: input.name,
      driverName: input.name,
      driverPhone: input.phone,
      phone: input.phone,
      driverId: id,
      baseCity: input.baseCity,
      startLocation: input.baseCity,
      route,
      isOutsideLorry: true,
      ownershipType: "outside",
      isAvailable: input.isAvailable,
      status: input.isAvailable ? "empty" : "on_trip",
      updatedAt: now,
    };

    reservation.commit();
    tx.set(doc(db, OWNERS, id), employee);
    tx.set(doc(db, "drivers", id), {
      id,
      driverId: id,
      name: input.name,
      phone: input.phone,
      nic: input.idNumber,
      plate,
      vehicleType: input.vehicleType,
      route,
      lorryId,
      active: input.status === "active",
      isOutsideDriver: true,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(doc(db, "lorries_registry", plate), lorry, { merge: true });
    tx.set(doc(db, "lorries_registry", lorryId), lorry, { merge: true });
    tx.set(doc(db, "lorries", lorryId), lorry, { merge: true });
    for (const key of keys) {
      tx.set(doc(db, UNIQUE_KEYS, key.id), { employeeId: id, createdAt: now });
    }
    if (input.openingBalance > 0) {
      tx.set(doc(db, LEDGER, `DEP-${id}`), {
        id: `DEP-${id}`,
        employeeId: id,
        idNumber: input.idNumber,
        type: "initial_deposit",
        amount: input.openingBalance,
        balanceBefore: 0,
        balanceAfter: input.openingBalance,
        note: input.openingNote,
        slipUrl: input.depositSlipUrl || "",
        paymentMethod: input.depositMethod || "unrecorded",
        bank: input.depositMethod === "bank" ? input.depositBank || "" : "",
        createdAt: now,
      });
    }
    if (input.registrationId) {
      tx.set(
        doc(db, "vehicle_registrations", input.registrationId),
        { status: "approved", outsideEmployeeId: id, updatedAt: now },
        { merge: true }
      );
    }
    return employee;
  });
}

/**
 * Approve a vehicle registration. Safe to call repeatedly: an already-approved
 * owner is returned unchanged, so their balance is never reset.
 */
export async function approveOwnerRegistration(
  registrationId: string,
  route?: string
): Promise<{ employee: StoredOutsideEmployee; created: boolean }> {
  const regRef = doc(db, "vehicle_registrations", registrationId);
  const snap = await getDoc(regRef);
  if (!snap.exists()) throw new OwnerError("Registration not found.");
  const reg = snap.data();

  const plate = cleanPlate(String(reg.plateNumber || reg.vehicleNumber || ""));
  const idNumber = String(reg.idNumber || "").trim();

  const sameRegistration = await getDocs(
    query(collection(db, OWNERS), where("registrationId", "==", registrationId), limit(1))
  );
  const samePlate = sameRegistration.empty ? await findOutsideOwnerByPlate(plate) : null;
  const existing = !sameRegistration.empty
    ? { id: sameRegistration.docs[0].id }
    : samePlate && nicKey(samePlate.idNumber) === nicKey(idNumber)
      ? samePlate
      : null;
  if (existing) {
    await setDoc(
      regRef,
      { status: "approved", outsideEmployeeId: existing.id, updatedAt: Date.now() },
      { merge: true }
    );
    const current = await getDoc(doc(db, OWNERS, existing.id));
    return { employee: { ...(current.data() as StoredOutsideEmployee), id: existing.id }, created: false };
  }

  const name = String(reg.ownerName || "").trim();
  const phone = String(reg.phone || "").trim();
  if (!name || !phone || !plate) {
    throw new OwnerError("Registration is missing the owner name, phone or vehicle number.");
  }
  const deposit = Number(reg.initialDepositAmount) || REGISTRATION_DEPOSIT;
  const images = Array.isArray(reg.images) ? reg.images : [];

  const employee = await createOutsideOwner({
    name,
    phone,
    idNumber,
    plateNumber: plate,
    vehicleType: String(reg.vehicleType || "Lorry"),
    baseCity: String(reg.baseCity || "Colombo"),
    openingBalance: deposit,
    isAvailable: true,
    status: "active",
    registrationId,
    route,
    depositSlipUrl: String(reg.depositSlipUrl || ""),
    // A slip or a chosen account means the deposit went to a bank
    depositMethod: reg.depositBank || reg.depositSlipUrl ? "bank" : undefined,
    depositBank: String(reg.depositBank || ""),
    openingNote: `Approved registration deposit (${formatRs(deposit)})`,
    lorryExtras: {
      capacity: reg.capacity || "Standard",
      maxWeight: reg.maxWeight || "",
      dimensions: reg.dimensions || "",
      province: reg.province || "Western",
      images,
      imageUrl: images[0] || "",
    },
  });
  return { employee, created: true };
}

/* ------------------------------------------------------------- Commission */

/**
 * Bring a booking's commission in line with its current state. Idempotent.
 *  - delivered / completed: the owner is charged exactly 20% of the current fare.
 *    A later fare or vehicle change posts the difference.
 *  - cancelled: everything charged is refunded.
 * Adjustments to an existing charge keep the rate that charge was made at.
 */
export async function syncHireCommission(
  bookingId: string,
  statusOverride?: "cancelled"
): Promise<void> {
  if (!bookingId) return;
  const bookingRef = doc(db, "bookings", bookingId);
  const bookingSnap = await getDoc(bookingRef);
  if (!bookingSnap.exists()) return;
  const booking = bookingSnap.data();
  const status = statusOverride || String(booking.status || "");
  const isFinished = status === "delivered" || status === "completed";
  if (!isFinished && status !== "cancelled") return;

  // Entries already in the ledger (includes charges made under earlier rates)
  const prior = await getDocs(query(collection(db, LEDGER), where("bookingId", "==", bookingId)));
  let priorNet = 0;
  let priorEmployeeId = "";
  let priorRate = 0;
  prior.forEach((d) => {
    const t = d.data();
    priorNet += Number(t.amount) || 0;
    priorEmployeeId = String(t.employeeId || priorEmployeeId);
    priorRate = Number(t.commissionRate) || priorRate;
  });

  const owner = isFinished
    ? await findOutsideOwnerByPlate(String(booking.assignedPlate || booking.selectedVehiclePlate || ""))
    : null;
  if (owner && booking.externalOwnerId !== owner.id) {
    await setDoc(bookingRef, { externalOwnerId: owner.id }, { merge: true });
  }
  const hireAmount = Number(booking.quotedAmount) || 0;

  await runTransaction(db, async (tx) => {
    const stateRef = doc(db, COMMISSION_STATE, bookingId);
    const state = (await tx.get(stateRef)).data();
    const charged = state ? Number(state.charged) || 0 : Math.max(0, -priorNet);
    const chargedTo = String(state?.employeeId || priorEmployeeId);
    const sameOwner = Boolean(owner && owner.id === chargedTo);
    const rate = charged > 0 && sameOwner ? Number(state?.rate) || priorRate || COMMISSION_PERCENT : COMMISSION_PERCENT;
    const target = owner ? commissionFor(hireAmount, rate) : 0;

    // How much each wallet's charge must change
    const moves: Array<{ employeeId: string; from: number; to: number }> = [];
    if (charged > 0 && chargedTo && !sameOwner) moves.push({ employeeId: chargedTo, from: charged, to: 0 });
    const employeeId = owner?.id || chargedTo;
    const before = sameOwner || !owner ? charged : 0;
    if (employeeId && before !== target) moves.push({ employeeId, from: before, to: target });
    if (moves.length === 0) return;
    // When the vehicle is no longer external the single refund is already listed
    const unique = moves.filter((m, i) => moves.findIndex((x) => x.employeeId === m.employeeId) === i);

    const wallets = [];
    for (const move of unique) {
      const ref = doc(db, OWNERS, move.employeeId);
      wallets.push({ move, ref, data: (await tx.get(ref)).data() as StoredOutsideEmployee | undefined });
    }

    const now = Date.now();
    for (const { move, ref, data: current } of wallets) {
      if (!current) continue;
      const delta = move.from - move.to; // positive returns money to the wallet
      const balanceBefore = Number(current.balance) || 0;
      const balanceAfter = balanceBefore + delta;
      const isDeduction = delta < 0;
      const txId = `${isDeduction ? "COMM" : "REV"}-${bookingId}-${move.employeeId}-${now}`;
      const note =
        move.from === 0
          ? `${rate}% commission for booking ${bookingId} (hire ${formatRs(hireAmount)})`
          : move.to === 0
            ? `Commission refunded for booking ${bookingId}`
            : `Commission adjusted for booking ${bookingId} (new hire value ${formatRs(hireAmount)})`;

      tx.set(doc(db, LEDGER, txId), {
        id: txId,
        employeeId: move.employeeId,
        idNumber: current.idNumber || "",
        bookingId,
        type: isDeduction ? "commission_deduction" : "adjustment",
        ...(move.to > 0 ? { hireAmount, commissionRate: rate } : {}),
        amount: delta,
        balanceBefore,
        balanceAfter,
        note,
        createdAt: now,
      });
      const hires = (move.from === 0 ? 1 : 0) - (move.to === 0 ? 1 : 0);
      tx.update(ref, {
        balance: balanceAfter,
        totalCommissionDeducted: Math.max(0, (Number(current.totalCommissionDeducted) || 0) - delta),
        totalHiresCompleted: Math.max(0, (Number(current.totalHiresCompleted) || 0) + hires),
        updatedAt: now,
      });
    }
    tx.set(stateRef, { employeeId: target > 0 ? employeeId : chargedTo || employeeId, charged: target, rate, updatedAt: now });
  });
}

/* ----------------------------------------------------------- Availability */

export async function setOwnerAvailability(
  key: string,
  isAvailable: boolean
): Promise<StoredOutsideEmployee> {
  const owner = await findOutsideOwner(key);
  if (!owner) throw new OwnerError("Employee not found.");
  const now = Date.now();
  await updateDoc(doc(db, OWNERS, owner.id), { isAvailable, updatedAt: now });

  const plate = cleanPlate(owner.plateNumber);
  if (plate) {
    const patch = {
      isAvailable,
      status: isAvailable ? "empty" : "on_trip",
      lastUpdated: isAvailable ? "Available" : "Unavailable",
      updatedAt: now,
    };
    const lorryId = lorryDocIdForPlate(plate);
    // A missing mirror document is not an error
    await Promise.allSettled([
      updateDoc(doc(db, "lorries_registry", plate), patch),
      updateDoc(doc(db, "lorries_registry", lorryId), patch),
      updateDoc(doc(db, "lorries", lorryId), patch),
    ]);
  }
  return { ...owner, isAvailable, updatedAt: now };
}

/* ------------------------------------------------------------ Top-up slips */

/** Newest slips, optionally for one owner. */
export async function listTopupSlips(employeeId?: string): Promise<StoredTopupSlip[]> {
  const snap = await getDocs(
    employeeId
      ? query(collection(db, SLIPS), where("employeeId", "==", employeeId))
      : query(collection(db, SLIPS), orderBy("createdAt", "desc"), limit(200))
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as StoredTopupSlip), id: d.id }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function createTopupSlip(input: {
  idNumber: string;
  amount: number;
  bankUsed?: string;
  slipUrl: string;
}): Promise<StoredTopupSlip> {
  const owner = await findOutsideOwner(input.idNumber);
  if (!owner) throw new OwnerError("No outside owner found for this ID.");
  const now = Date.now();
  const id = `SLIP-${now}-${Math.floor(100 + Math.random() * 900)}`;
  const slip: StoredTopupSlip = {
    id,
    employeeId: owner.id,
    idNumber: owner.idNumber,
    employeeName: owner.name,
    phone: owner.phone,
    plateNumber: owner.plateNumber,
    amount: input.amount,
    bankUsed: input.bankUsed || "",
    slipUrl: input.slipUrl,
    status: "pending",
    createdAt: now,
  };
  await setDoc(doc(db, SLIPS, id), slip);
  return slip;
}

/** Credit a pending slip to the wallet exactly once. */
export async function approveTopup(slipId: string): Promise<StoredTopupSlip> {
  return runTransaction(db, async (tx) => {
    const slipRef = doc(db, SLIPS, slipId);
    const slipSnap = await tx.get(slipRef);
    if (!slipSnap.exists()) throw new OwnerError("Top-up slip not found.");
    const slip = slipSnap.data() as StoredTopupSlip;
    if (slip.status !== "pending") throw new OwnerError("This slip has already been reviewed.");

    const ownerRef = doc(db, OWNERS, slip.employeeId);
    const ownerSnap = await tx.get(ownerRef);
    if (!ownerSnap.exists()) throw new OwnerError("The owner of this slip no longer exists.");
    const owner = ownerSnap.data() as StoredOutsideEmployee;

    const now = Date.now();
    const amount = Number(slip.amount) || 0;
    const balanceBefore = Number(owner.balance) || 0;
    const balanceAfter = balanceBefore + amount;

    tx.update(slipRef, { status: "approved", reviewedAt: now });
    tx.update(ownerRef, { balance: balanceAfter, updatedAt: now });
    tx.set(doc(db, LEDGER, `TOPUP-${slipId}`), {
      id: `TOPUP-${slipId}`,
      employeeId: slip.employeeId,
      idNumber: owner.idNumber || "",
      type: "topup",
      amount,
      balanceBefore,
      balanceAfter,
      slipUrl: slip.slipUrl || "",
      paymentMethod: "bank",
      bank: slip.bankUsed || "",
      note: `Top-up approved${slip.bankUsed ? ` (${slip.bankUsed})` : ""}`,
      createdAt: now,
    });
    return { ...slip, status: "approved" as const, reviewedAt: now };
  });
}

export async function removeTopupSlip(slipId: string): Promise<void> {
  await deleteDoc(doc(db, SLIPS, slipId));
}

/* ----------------------------------------------------- Wallet payments */

/** Admin records money an owner paid directly (cash or into a bank account). */
export async function recordWalletTopup(input: {
  employeeId: string;
  amount: number;
  method: "cash" | "bank";
  bank?: string;
}): Promise<void> {
  if (!(input.amount > 0)) throw new OwnerError("Enter an amount greater than zero.");
  if (input.method === "bank" && !input.bank?.trim()) throw new OwnerError("Choose the bank account.");
  await runTransaction(db, async (tx) => {
    const ownerRef = doc(db, OWNERS, input.employeeId);
    const owner = (await tx.get(ownerRef)).data() as StoredOutsideEmployee | undefined;
    if (!owner) throw new OwnerError("Owner not found.");
    const now = Date.now();
    const before = Number(owner.balance) || 0;
    const id = `TOPUP-${input.employeeId}-${now}`;
    tx.set(doc(db, LEDGER, id), {
      id,
      employeeId: input.employeeId,
      idNumber: owner.idNumber || "",
      type: "topup",
      amount: input.amount,
      balanceBefore: before,
      balanceAfter: before + input.amount,
      paymentMethod: input.method,
      bank: input.method === "bank" ? input.bank!.trim() : "",
      note: "Top-up recorded by Admin",
      createdAt: now,
    });
    tx.update(ownerRef, { balance: before + input.amount, updatedAt: now });
  });
}

/** Correct how an existing deposit or top-up was received. Amounts are not editable. */
export async function setWalletEntryPayment(
  entryId: string,
  method: "cash" | "bank",
  bank?: string
): Promise<void> {
  if (method === "bank" && !bank?.trim()) throw new OwnerError("Choose the bank account.");
  const ref = doc(db, LEDGER, entryId);
  const entry = (await getDoc(ref)).data();
  if (!entry || (entry.type !== "initial_deposit" && entry.type !== "topup")) {
    throw new OwnerError("Only deposits and top-ups have a payment method.");
  }
  await updateDoc(ref, { paymentMethod: method, bank: method === "bank" ? bank!.trim() : "" });
}
