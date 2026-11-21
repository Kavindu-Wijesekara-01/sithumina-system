"use server";

import { revalidatePath } from "next/cache";
import {
  createBookingInStore,
  getAllStoredBookings,
  updateBookingStatusInStore,
  upsertBookingInStore,
  deleteBookingFromStore,
  getAllStoredComplaints,
  recordComplaintInStore,
  checkOutsideLorryBookingEligibility,
  deductCommissionForBookingInStore,
  getStoredOutsideEmployeeByPlate,
  getAllStoredLorries,
  getAllStoredOutsideEmployees,
  updateBookingInStore,
  updateLorryGpsInStore,
  updateLorryStatusInStore,
  StoredBooking,
  StoredComplaint,
  StoredLorry,
  StoredOutsideEmployee,
  BookingStatusValue,
  PaymentSlipStatus,
  BookingPaymentMethod,
} from "@/lib/server-store";
import {
  normalizePhoneNumber,
  phonesMatch,
  normalizePlate,
  getCanonicalCustomerId,
} from "@/lib/phone-utils";
import {
  cleanRiderName,
  findBookingScheduleConflict,
  hasAssignedRider,
  validateTimeRange,
  validateScheduleTimeAndDates,
  getDatesBetween,
} from "@/lib/booking-schedule";
import { ActionResult, BookingActionInput } from "./types";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

function isRealDriverName(val: unknown): string {
  const s = String(val || "").trim();
  return s && s !== "Driver" && s !== "Unassigned" ? s : "";
}

function mapFirestoreBooking(
  resolvedId: string,
  data: Record<string, any>
): StoredBooking {
  const resolvedDate =
    data.date ||
    (Array.isArray(data.dates) && data.dates[0]) ||
    new Date(Number(data.createdAt) || Date.now()).toISOString().split("T")[0];
  const resolvedDates =
    Array.isArray(data.dates) && data.dates.length > 0
      ? data.dates
      : resolvedDate
      ? [resolvedDate]
      : [];

  return {
    id: resolvedId,
    customerName: data.customerName || data.name || "Customer",
    customerPhone: String(data.customerPhone || data.phone || "").trim(),
    customerIdNumber: data.customerIdNumber ? String(data.customerIdNumber).trim() : undefined,
    distanceKm:
      typeof data.distanceKm === "number" && !Number.isNaN(data.distanceKm)
        ? data.distanceKm
        : data.distanceKm !== undefined && !Number.isNaN(Number(data.distanceKm))
        ? Number(data.distanceKm)
        : undefined,
    pickupCity: data.pickupCity || data.pickup || "",
    deliveryCity: data.deliveryCity || data.destination || "",
    pickupLat: data.pickupLat,
    pickupLng: data.pickupLng,
    deliveryLat: data.deliveryLat,
    deliveryLng: data.deliveryLng,
    date: resolvedDate,
    dates: resolvedDates,
    startTime: data.startTime ? String(data.startTime).trim() : "",
    endTime: data.endTime ? String(data.endTime).trim() : "",
    vehicleType: data.vehicleType || "Lorry",
    packageDetails: data.packageDetails || data.notes || "",
    status: data.status || "pending",
    assignedLorryId: data.assignedLorryId || "",
    assignedDriverId: data.assignedDriverId ? String(data.assignedDriverId).trim() : "",
    assignedDriverName: isRealDriverName(data.assignedDriverName),
    assignedDriverPhone: String(data.assignedDriverPhone || "").trim(),
    assignedPlate: data.assignedPlate || data.selectedVehiclePlate || "",
    bookingType: data.bookingType || "individual_vehicle",
    cargoNature: data.cargoNature || "",
    daysNeeded: data.daysNeeded || resolvedDates.length || 1,
    cargoWeight: data.cargoWeight || data.weight || "",
    helpersCount: data.helpersCount ?? "0",
    quotedAmount:
      typeof data.quotedAmount === "number" && !Number.isNaN(data.quotedAmount)
        ? data.quotedAmount
        : undefined,
    quotedAt: Number(data.quotedAt) || undefined,
    quoteNote: data.quoteNote ? String(data.quoteNote) : undefined,
    paymentMethod: (data.paymentMethod as BookingPaymentMethod) || undefined,
    paymentBankUsed: data.paymentBankUsed ? String(data.paymentBankUsed) : undefined,
    advanceAmount:
      typeof data.advanceAmount === "number" && !Number.isNaN(data.advanceAmount)
        ? data.advanceAmount
        : undefined,
    pendingAmount:
      typeof data.pendingAmount === "number" && !Number.isNaN(data.pendingAmount)
        ? data.pendingAmount
        : undefined,
    finalPaymentMethod: (data.finalPaymentMethod as BookingPaymentMethod) || undefined,
    finalPaymentBankUsed: data.finalPaymentBankUsed ? String(data.finalPaymentBankUsed) : undefined,
    finalPaymentAt: Number(data.finalPaymentAt) || undefined,
    paymentSlipId: data.paymentSlipId ? String(data.paymentSlipId) : undefined,
    paymentSlipName: data.paymentSlipName ? String(data.paymentSlipName) : undefined,
    paymentSlipType: data.paymentSlipType ? String(data.paymentSlipType) : undefined,
    paymentSlipSize: Number(data.paymentSlipSize) || undefined,
    paymentSlipUploadedAt: Number(data.paymentSlipUploadedAt) || undefined,
    paymentSlipStatus: (data.paymentSlipStatus as PaymentSlipStatus) || undefined,
    paymentRejectReason: data.paymentRejectReason ? String(data.paymentRejectReason) : undefined,
    paymentApprovedAt: Number(data.paymentApprovedAt) || undefined,
    paymentSlipDeletedAt: Number(data.paymentSlipDeletedAt) || undefined,
    createdAt: Number(data.createdAt) || 0,
    updatedAt: Number(data.updatedAt) || Number(data.createdAt) || 0,
  };
}

async function resolveDriverMetadataForDispatch(
  lorryId?: string,
  plate?: string
): Promise<{ driverId?: string; driverName?: string; driverPhone?: string; resolvedPlate?: string; resolvedLorryId?: string }> {
  const plateNorm = normalizePlate(plate);
  const idLower = String(lorryId || "").trim().toLowerCase();

  try {
    if (plateNorm || idLower) {
      const [fleetSnap, driversSnap] = await Promise.all([
        getDocs(collection(db, "lorries_registry")).catch(() => null),
        getDocs(collection(db, "drivers")).catch(() => null),
      ]);

      const driversById = new Map<string, { driverId: string; name: string; phone: string; plate: string }>();
      const driversByPlate = new Map<string, { driverId: string; name: string; phone: string; plate: string }>();
      if (driversSnap) {
        for (const d of driversSnap.docs) {
          const data = d.data();
          const dId = String(data.driverId || d.id).trim();
          const dName = isRealDriverName(data.name);
          const dPhone = String(data.phone || "").trim();
          const dPlate = String(data.plate || "").trim();
          const entry = { driverId: dId, name: dName, phone: dPhone, plate: dPlate };
          if (dId) driversById.set(dId.toUpperCase(), entry);
          const pNorm = normalizePlate(dPlate);
          if (pNorm) driversByPlate.set(pNorm, entry);
        }
      }

      if (fleetSnap) {
        for (const d of fleetSnap.docs) {
          const data = d.data();
          const dPlate = normalizePlate(data.plate || data.vehiclePlate || d.id.replace(/^lorry-/i, ""));
          if ((idLower && d.id.toLowerCase() === idLower) || (plateNorm && dPlate === plateNorm)) {
            const driverId = data.driverId ? String(data.driverId).trim() : "";
            const matchedDrv =
              (driverId ? driversById.get(driverId.toUpperCase()) : undefined) ||
              (plateNorm ? driversByPlate.get(plateNorm) : undefined);
            const driverName = isRealDriverName(data.driverName) || matchedDrv?.name || "";
            const driverPhone = String(data.driverPhone || "").trim() || matchedDrv?.phone || "";
            return {
              driverId: driverId || matchedDrv?.driverId || undefined,
              driverName: driverName || undefined,
              driverPhone: driverPhone || undefined,
              resolvedPlate: String(data.plate || plate || matchedDrv?.plate || "").trim() || undefined,
              resolvedLorryId: d.id,
            };
          }
        }
      }

      if (plateNorm && driversByPlate.has(plateNorm)) {
        const matched = driversByPlate.get(plateNorm)!;
        return {
          driverId: matched.driverId || undefined,
          driverName: matched.name || undefined,
          driverPhone: matched.phone || undefined,
          resolvedPlate: matched.plate || plate || undefined,
          resolvedLorryId: idLower || `lorry-${plateNorm.toLowerCase()}`,
        };
      }
    }
  } catch {
    // non-blocking metadata enrichment
  }
  return {};
}

async function syncBookingDispatchDoc(
  booking: StoredBooking,
  status: string,
  extra?: { driverId?: string; driverName?: string; driverPhone?: string; lorryId?: string; plate?: string }
): Promise<void> {
  const dispatchDocId = `dispatch-${booking.id}`;

  // Individual Vehicle bookings NEVER dispatch to the Driver Mobile App; only live_lorry bookings do.
  if (booking.bookingType !== "live_lorry") {
    try {
      await deleteDoc(doc(db, "dispatches", dispatchDocId));
      const snap = await getDocs(
        query(collection(db, "dispatches"), where("bookingId", "==", booking.id))
      );
      for (const d of snap.docs) {
        await deleteDoc(doc(db, "dispatches", d.id));
      }
    } catch {
      // non-blocking cleanup
    }
    return;
  }

  const isTerminal = status === "delivered" || status === "cancelled";
  const isDispatchable = ["accepted", "assigned", "goods_collected", "in_transit", "booked"].includes(status);

  if (!isDispatchable && !isTerminal) {
    return;
  }

  const plate = (extra?.plate || booking.assignedPlate || "").trim();
  const plateNorm = normalizePlate(plate);
  const effectiveLorryId = (
    extra?.lorryId ||
    booking.assignedLorryId ||
    (plateNorm ? `lorry-${plateNorm.toLowerCase()}` : "")
  ).trim();

  let targetDispatchStatus = "pending_acceptance";
  if (status === "delivered") {
    targetDispatchStatus = "completed";
  } else if (status === "cancelled") {
    targetDispatchStatus = "cancelled";
  } else if (status === "goods_collected") {
    targetDispatchStatus = "goods_collected";
  } else if (status === "in_transit") {
    targetDispatchStatus = "in_transit";
  } else {
    try {
      const existingSnap = await getDoc(doc(db, "dispatches", dispatchDocId));
      const curSt = existingSnap.data()?.status;
      if (existingSnap.exists() && ["accepted", "goods_collected", "in_transit"].includes(curSt)) {
        targetDispatchStatus = curSt;
      }
    } catch {
      // keep pending_acceptance
    }
  }

  const resolvedDriverName =
    isRealDriverName(extra?.driverName) || isRealDriverName(booking.assignedDriverName);
  const resolvedDriverPhone =
    String(extra?.driverPhone || booking.assignedDriverPhone || "").trim();

  if (isDispatchable && effectiveLorryId) {
    const hasSlip = Boolean(
      booking.paymentSlipId ||
      booking.paymentSlipStatus === "approved" ||
      booking.paymentSlipStatus === "pending_review" ||
      booking.paymentSlipStatus === "manual_approved" ||
      booking.paymentMethod === "cash_manual"
    );

    const dispatchPayload: Record<string, any> = {
      riderId: effectiveLorryId,
      assignedPlate: plate,
      bookingId: booking.id,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      customerWhatsapp: booking.customerWhatsapp || "",
      pickupCity: booking.pickupCity,
      pickupLat: booking.pickupLat ?? null,
      pickupLng: booking.pickupLng ?? null,
      deliveryCity: booking.deliveryCity,
      deliveryLat: booking.deliveryLat ?? null,
      deliveryLng: booking.deliveryLng ?? null,
      cargo: booking.packageDetails || booking.cargoNature || "",
      cargoNature: booking.cargoNature || "",
      vehicleType: booking.vehicleType,
      date: booking.date,
      dates: booking.dates || (booking.date ? [booking.date] : []),
      daysNeeded: booking.daysNeeded || 1,
      helpersCount: booking.helpersCount ?? "0",
      status: targetDispatchStatus,
      bookingType: booking.bookingType || "live_lorry",
      hasPaymentSlip: hasSlip,
      paymentSlipStatus: booking.paymentSlipStatus || "",
      paymentSlipId: booking.paymentSlipId || "",
      quotedAmount: booking.quotedAmount ?? null,
      updatedAt: Date.now(),
      createdAt: booking.createdAt || Date.now(),
    };
    if (extra?.driverId) dispatchPayload.driverId = extra.driverId;
    if (resolvedDriverName) dispatchPayload.driverName = resolvedDriverName;
    if (resolvedDriverPhone) dispatchPayload.driverPhone = resolvedDriverPhone;

    await setDoc(doc(db, "dispatches", dispatchDocId), dispatchPayload, { merge: true });
  }

  // Sync any pre-existing dispatch docs referencing this bookingId (e.g. legacy auto-ID dispatches)
  try {
    const snap = await getDocs(
      query(collection(db, "dispatches"), where("bookingId", "==", booking.id))
    );
    for (const d of snap.docs) {
      if (d.id !== dispatchDocId) {
        const legacyUpdates: Record<string, any> = {
          status: targetDispatchStatus,
          updatedAt: Date.now(),
        };
        if (effectiveLorryId) legacyUpdates.riderId = effectiveLorryId;
        if (extra?.driverId) legacyUpdates.driverId = extra.driverId;
        if (resolvedDriverName) legacyUpdates.driverName = resolvedDriverName;
        if (resolvedDriverPhone) legacyUpdates.driverPhone = resolvedDriverPhone;
        if (plate) legacyUpdates.assignedPlate = plate;
        await updateDoc(doc(db, "dispatches", d.id), legacyUpdates);
      }
    }
  } catch {
    // non-blocking
  }
}

async function fetchBookingsAuthoritative(): Promise<StoredBooking[]> {
  try {
    const [snap, dispSnap, drvSnap] = await Promise.all([
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "dispatches")).catch(() => null),
      getDocs(collection(db, "drivers")).catch(() => null),
    ]);

    const dispByBooking = new Map<
      string,
      { driverId: string; driverName: string; driverPhone: string; assignedPlate: string }
    >();
    if (dispSnap) {
      dispSnap.forEach((d) => {
        const dd = d.data();
        const bid = String(
          dd.bookingId || (d.id.startsWith("dispatch-") ? d.id.replace(/^dispatch-/, "") : "")
        ).trim();
        if (!bid) return;
        const dName = isRealDriverName(dd.driverName);
        const dPhone = String(dd.driverPhone || "").trim();
        const prev = dispByBooking.get(bid);
        dispByBooking.set(bid, {
          driverId: String(dd.driverId || prev?.driverId || "").trim(),
          driverName: dName || prev?.driverName || "",
          driverPhone: dPhone || prev?.driverPhone || "",
          assignedPlate: String(dd.assignedPlate || prev?.assignedPlate || "").trim(),
        });
      });
    }

    const driversById = new Map<string, { driverId: string; name: string; phone: string }>();
    const driversByPlate = new Map<string, { driverId: string; name: string; phone: string }>();
    if (drvSnap) {
      drvSnap.forEach((d) => {
        const dd = d.data();
        const dName = isRealDriverName(dd.name);
        const dPhone = String(dd.phone || "").trim();
        const dId = String(dd.driverId || d.id).trim();
        if (!dName && !dPhone) return;
        const idKey = String(dd.driverId || d.id).trim().toUpperCase();
        if (idKey) driversById.set(idKey, { driverId: dId, name: dName, phone: dPhone });
        const pKey = normalizePlate(dd.plate);
        if (pKey) driversByPlate.set(pKey, { driverId: dId, name: dName, phone: dPhone });
      });
    }

    try {
      const storeLorries = getAllStoredLorries();
      const storeOutside = getAllStoredOutsideEmployees();
      storeLorries.forEach((l: StoredLorry) => {
        if ((l.isOutsideLorry || l.ownershipType === "outside") && l.driverName && l.plate) {
          const pKey = normalizePlate(l.plate);
          if (pKey && !driversByPlate.has(pKey)) {
            driversByPlate.set(pKey, { driverId: l.driverId || "", name: l.driverName, phone: l.driverPhone || "" });
          }
        }
      });
      storeOutside.forEach((o: StoredOutsideEmployee) => {
        if (o.plateNumber && o.name) {
          const pKey = normalizePlate(o.plateNumber);
          if (pKey) {
            driversByPlate.set(pKey, { driverId: o.driverId || o.id, name: o.name, phone: o.phone || "" });
          }
        }
      });
    } catch {}

    const items: StoredBooking[] = [];
    const seenIds = new Set<string>();
    snap.forEach((d) => {
      const data = d.data();
      const resolvedId = String(data.id || data.trackingId || d.id);
      if (seenIds.has(resolvedId)) return;
      seenIds.add(resolvedId);
      const mapped = mapFirestoreBooking(resolvedId, data);

      const disp = dispByBooking.get(resolvedId);
      const plateNorm = normalizePlate(mapped.assignedPlate || disp?.assignedPlate);
      const matchedDrv =
        (disp?.driverId ? driversById.get(disp.driverId.toUpperCase()) : undefined) ||
        (plateNorm ? driversByPlate.get(plateNorm) : undefined);

      if (!mapped.assignedPlate && disp?.assignedPlate) {
        mapped.assignedPlate = disp.assignedPlate;
      }
      const isOutsideLorry = plateNorm ? Boolean(driversByPlate.get(plateNorm)) : false;
      if (
        ["assigned", "in_transit", "delivered"].includes(mapped.status) ||
        mapped.bookingType === "live_lorry" ||
        isOutsideLorry
      ) {
        if (!mapped.assignedDriverName) {
          mapped.assignedDriverName = disp?.driverName || matchedDrv?.name || "";
        }
        if (!mapped.assignedDriverPhone) {
          mapped.assignedDriverPhone = disp?.driverPhone || matchedDrv?.phone || "";
        }
        if (!mapped.assignedDriverId) {
          mapped.assignedDriverId = disp?.driverId || matchedDrv?.driverId || "";
        }
      }

      items.push(mapped);
    });
    items.sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
    return items;
  } catch {
    return getAllStoredBookings();
  }
}

/**
 * High-performance Server Action to create a freight booking.
 * 1. Synchronous ultra-fast update to in-memory & persisted server store (<2ms).
 * 2. Non-blocking asynchronous mirroring to Firestore cloud database.
 * 3. Next.js cache revalidation for instant UI responsiveness.
 */
export async function createBookingAction(
  input: BookingActionInput
): Promise<ActionResult<{ id: string; trackingId: string; booking: StoredBooking }>> {
  try {
    // 1. Rigorous input validation
    const pickup = input.pickup?.trim();
    const destination = input.destination?.trim();
    const rawPhone = input.phone?.trim() || "";
    const phone = normalizePhoneNumber(rawPhone) || rawPhone;
    const digitsOnly = phone.replace(/[^0-9]/g, "");
    const date = input.date?.trim() || new Date().toISOString().split("T")[0];
    const vehicleType = input.vehicleType?.trim() || "14ft Lorry";
    const customerName = input.customerName?.trim() || (phone ? `Customer (${phone.slice(-4)})` : "Valued Customer");
    const packageDetails = (input.notes || input.weight || "").trim();

    if (!pickup) {
      return { success: false, error: "Pickup location is required." };
    }
    if (!destination) {
      return { success: false, error: "Destination city is required." };
    }
    if (!digitsOnly || digitsOnly.length < 8) {
      return { success: false, error: "A valid phone number (at least 8-10 digits) is required." };
    }

    const bookingType = input.bookingType || "individual_vehicle";
    const initialStatus: BookingStatusValue = input.status || "pending";
    const resolvedInputDriverName = cleanRiderName(input.assignedDriverName);
    const resolvedInputDriverPhone = String(input.assignedDriverPhone || "").trim();
    const resolvedInputDriverId = String(input.assignedDriverId || "").trim();

    let cleanStartTime = String(input.startTime || "").trim();
    let cleanEndTime = String(input.endTime || "").trim();
    const rawDates = input.dates && input.dates.length > 0 ? input.dates : [date];
    const rawEndDate = input.endDate || (rawDates.length > 1 ? rawDates[rawDates.length - 1] : date);
    let resolvedDates: string[] = rawDates;
    let resolvedDaysNeeded: number = Number(input.daysNeeded) || rawDates.length || 1;

    // When creating an already-scheduled / manual Individual booking (time provided or approved/assigned status),
    // require a valid time duration, mandatory Rider, and zero schedule overlap for Lorry or Rider.
    const requiresScheduleValidation =
      bookingType !== "live_lorry" &&
      (Boolean(cleanStartTime || cleanEndTime) ||
        ["accepted", "booked", "assigned", "in_transit"].includes(initialStatus));

    if (requiresScheduleValidation) {
      const scheduleCheck = validateScheduleTimeAndDates(
        date,
        cleanStartTime,
        rawEndDate,
        cleanEndTime,
        rawDates
      );
      if (!scheduleCheck.valid) {
        return { success: false, error: scheduleCheck.error };
      }
      cleanStartTime = scheduleCheck.startTime;
      cleanEndTime = scheduleCheck.endTime;
      resolvedDates = scheduleCheck.dates;
      resolvedDaysNeeded = scheduleCheck.daysCount;

      if (
        !hasAssignedRider({
          assignedDriverId: resolvedInputDriverId,
          assignedDriverName: resolvedInputDriverName,
          assignedDriverPhone: resolvedInputDriverPhone,
        })
      ) {
        return {
          success: false,
          error: "A Rider must be assigned to this booking.",
        };
      }

      const [cloudBookings, storeBookings] = await Promise.all([
        fetchBookingsAuthoritative().catch(() => [] as StoredBooking[]),
        Promise.resolve(getAllStoredBookings()),
      ]);
      const combinedMap = new Map<string, StoredBooking>();
      cloudBookings.forEach((b) => combinedMap.set(b.id, b));
      storeBookings.forEach((b) => combinedMap.set(b.id, b));

      const conflict = findBookingScheduleConflict(
        {
          date: scheduleCheck.startDate,
          dates: scheduleCheck.dates,
          startTime: scheduleCheck.startTime,
          endTime: scheduleCheck.endTime,
          assignedPlate: input.assignedPlate?.trim(),
          assignedLorryId: input.assignedLorryId?.trim(),
          assignedDriverId: resolvedInputDriverId,
          assignedDriverName: resolvedInputDriverName,
          assignedDriverPhone: resolvedInputDriverPhone,
          bookingType,
        },
        Array.from(combinedMap.values())
      );

      if (conflict.hasConflict) {
        return {
          success: false,
          error: conflict.message || "Schedule conflict detected for this lorry or rider.",
        };
      }
    }

    const effectivePlateInput = (input.assignedPlate || "").trim().toUpperCase();
    const outsideOwnerForCreate = effectivePlateInput ? getStoredOutsideEmployeeByPlate(effectivePlateInput) : null;
    let finalAssignedDriverId = resolvedInputDriverId;
    let finalAssignedDriverName = resolvedInputDriverName;
    let finalAssignedDriverPhone = resolvedInputDriverPhone;

    if (outsideOwnerForCreate) {
      finalAssignedDriverId = outsideOwnerForCreate.driverId || outsideOwnerForCreate.id;
      finalAssignedDriverName = outsideOwnerForCreate.name;
      finalAssignedDriverPhone = outsideOwnerForCreate.phone;
    } else if (effectivePlateInput) {
      const storeLorries = getAllStoredLorries();
      const matchedL = storeLorries.find((l: StoredLorry) => normalizePlate(l.plate) === normalizePlate(effectivePlateInput));
      if (matchedL && (matchedL.isOutsideLorry || matchedL.ownershipType === "outside")) {
        finalAssignedDriverId = matchedL.driverId || "";
        finalAssignedDriverName = matchedL.driverName || "";
        finalAssignedDriverPhone = matchedL.driverPhone || "";
      }
    }

    // 2. Atomic store creation in server memory + file persistence
    const booking = createBookingInStore({
      customerName,
      customerPhone: phone,
      pickupCity: pickup,
      deliveryCity: destination,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      deliveryLat: input.deliveryLat,
      deliveryLng: input.deliveryLng,
      customerIdNumber: input.customerIdNumber?.trim(),
      distanceKm: input.distanceKm !== undefined && !Number.isNaN(Number(input.distanceKm)) ? Number(input.distanceKm) : undefined,
      date,
      dates: resolvedDates,
      startTime: cleanStartTime || undefined,
      endTime: cleanEndTime || undefined,
      vehicleType,
      packageDetails,
      assignedPlate: input.assignedPlate?.trim(),
      assignedLorryId: input.assignedLorryId?.trim(),
      assignedDriverId: finalAssignedDriverId || undefined,
      assignedDriverName: finalAssignedDriverName || undefined,
      assignedDriverPhone: finalAssignedDriverPhone || undefined,
      bookingType,
      cargoNature: input.cargoNature?.trim(),
      daysNeeded: resolvedDaysNeeded,
      cargoWeight: input.cargoWeight?.trim() || input.weight?.trim(),
      helpersCount: input.helpersCount,
      status: initialStatus,
      quotedAmount: input.quotedAmount,
      quotedAt: input.quotedAmount !== undefined ? Date.now() : undefined,
      quoteNote: input.quoteNote,
      paymentMethod: input.paymentMethod,
      paymentBankUsed: input.paymentBankUsed,
      advanceAmount: input.advanceAmount,
      pendingAmount: input.pendingAmount,
      finalPaymentMethod: input.finalPaymentMethod,
      finalPaymentBankUsed: input.finalPaymentBankUsed,
      finalPaymentAt: input.finalPaymentAt,
      paymentSlipStatus: input.paymentSlipStatus,
      paymentApprovedAt: input.paymentApprovedAt,
    });

    // 3. Synchronized authoritative cloud Firestore persistence with deterministic ID
    try {
      let resolvedDriverMeta: {
        driverId?: string;
        driverName?: string;
        driverPhone?: string;
        resolvedPlate?: string;
        resolvedLorryId?: string;
      } = {};
      if (
        (booking.assignedLorryId || booking.assignedPlate) &&
        (booking.bookingType === "live_lorry" ||
          (booking.status === "assigned" && !resolvedInputDriverName))
      ) {
        resolvedDriverMeta = await resolveDriverMetadataForDispatch(
          booking.assignedLorryId,
          booking.assignedPlate
        );
      }

      const bookingPayload: Record<string, any> = {
        id: booking.id,
        trackingId: booking.id,
        customerName,
        customerPhone: booking.customerPhone,
        phone: booking.customerPhone,
        pickupCity: pickup,
        pickup,
        deliveryCity: destination,
        destination,
        pickupLat: input.pickupLat ?? null,
        pickupLng: input.pickupLng ?? null,
        deliveryLat: input.deliveryLat ?? null,
        deliveryLng: input.deliveryLng ?? null,
        date: booking.date,
        dates: booking.dates || (input.dates && input.dates.length > 0 ? input.dates : [date]),
        startTime: cleanStartTime || "",
        endTime: cleanEndTime || "",
        vehicleType,
        packageDetails,
        notes: packageDetails,
        assignedPlate: input.assignedPlate?.trim() || resolvedDriverMeta.resolvedPlate || "",
        assignedLorryId: input.assignedLorryId?.trim() || resolvedDriverMeta.resolvedLorryId || "",
        assignedDriverId: finalAssignedDriverId || resolvedDriverMeta.driverId || "",
        assignedDriverName: finalAssignedDriverName || resolvedDriverMeta.driverName || "",
        assignedDriverPhone: finalAssignedDriverPhone || resolvedDriverMeta.driverPhone || "",
        bookingType: booking.bookingType,
        cargoNature: booking.cargoNature || "",
        daysNeeded: booking.daysNeeded || 1,
        cargoWeight: booking.cargoWeight || "",
        helpersCount: booking.helpersCount ?? "0",
        status: booking.status,
        paymentSlipStatus: booking.paymentSlipStatus || "none",
        customerIdNumber: booking.customerIdNumber || "",
        distanceKm: booking.distanceKm ?? null,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      };
      if (booking.quotedAmount !== undefined) bookingPayload.quotedAmount = booking.quotedAmount;
      if (booking.quotedAt !== undefined) bookingPayload.quotedAt = booking.quotedAt;
      if (booking.quoteNote) bookingPayload.quoteNote = booking.quoteNote;
      if (booking.paymentMethod) bookingPayload.paymentMethod = booking.paymentMethod;
      if (booking.paymentBankUsed) bookingPayload.paymentBankUsed = booking.paymentBankUsed;
      if (booking.advanceAmount !== undefined) bookingPayload.advanceAmount = booking.advanceAmount;
      if (booking.pendingAmount !== undefined) bookingPayload.pendingAmount = booking.pendingAmount;
      if (booking.finalPaymentMethod) bookingPayload.finalPaymentMethod = booking.finalPaymentMethod;
      if (booking.finalPaymentBankUsed) bookingPayload.finalPaymentBankUsed = booking.finalPaymentBankUsed;
      if (booking.finalPaymentAt) bookingPayload.finalPaymentAt = booking.finalPaymentAt;
      if (booking.paymentApprovedAt) bookingPayload.paymentApprovedAt = booking.paymentApprovedAt;
      if (resolvedDriverMeta.driverName || resolvedDriverMeta.driverPhone) {
        booking.assignedDriverName = resolvedDriverMeta.driverName || booking.assignedDriverName;
        booking.assignedDriverPhone = resolvedDriverMeta.driverPhone || booking.assignedDriverPhone;
        upsertBookingInStore(booking);
      }
      await setDoc(doc(db, "bookings", booking.id), bookingPayload);

      // Ensure customer is persisted in Firestore users collection as well as local store
      const isGenericCustName =
        !customerName ||
        customerName === "Customer" ||
        customerName === "Valued Customer" ||
        customerName.startsWith("Customer (");
      const custPhoneNorm = normalizePhoneNumber(booking.customerPhone || phone);
      if (custPhoneNorm) {
        const custId = getCanonicalCustomerId(custPhoneNorm);
        const nowTs = Date.now();
        await setDoc(
          doc(db, "users", custId),
          {
            uid: custId,
            phone: custPhoneNorm,
            ...(!isGenericCustName ? { name: customerName } : {}),
            ...(pickup ? { city: pickup } : {}),
            role: "customer",
            lastLoginAt: nowTs,
          },
          { merge: true }
        );
      }

      // Notify rider dispatch deterministically ONLY when live_lorry booking is confirmed/accepted/assigned
      if (
        booking.bookingType === "live_lorry" &&
        (booking.assignedLorryId || booking.assignedPlate || resolvedDriverMeta.resolvedLorryId) &&
        ["accepted", "assigned", "booked"].includes(booking.status)
      ) {
        await syncBookingDispatchDoc(booking, booking.status, {
          driverId: resolvedDriverMeta.driverId,
          driverName: resolvedDriverMeta.driverName,
          driverPhone: resolvedDriverMeta.driverPhone,
          lorryId: booking.assignedLorryId || resolvedDriverMeta.resolvedLorryId,
          plate: booking.assignedPlate || resolvedDriverMeta.resolvedPlate,
        });
      }
    } catch (cloudErr) {
      console.warn("Firestore booking sync notice:", cloudErr);
    }

    // 4. Cache revalidation across relevant routes
    try {
      revalidatePath("/book-vehicle");
      revalidatePath("/login");
      revalidatePath("/admin");
      revalidatePath("/");
    } catch {
      // Revalidation is best-effort in tests/edge
    }

    return {
      success: true,
      data: {
        id: booking.id,
        trackingId: booking.id,
        booking,
      },
      message: "Booking confirmed successfully.",
    };
  } catch (err: unknown) {
    console.error("createBookingAction unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to process booking.",
    };
  }
}

/**
 * Server Action to instantly track a booking by Tracking ID or Phone Number.
 */
export async function trackBookingAction(
  searchQuery: string
): Promise<ActionResult<StoredBooking[]>> {
  try {
    const q = searchQuery?.trim();
    if (!q) {
      return { success: true, data: [] };
    }

    const qLower = q.toLowerCase();
    const cleanPhone = qLower.replace(/[^0-9]/g, "");
    const all = await fetchBookingsAuthoritative();
    const matches = all.filter((b) => {
      const idMatch = String(b.id || "").toLowerCase().includes(qLower);
      const plateMatch = String(b.assignedPlate || "").toLowerCase().includes(qLower);
      const cityMatch =
        String(b.pickupCity || "").toLowerCase().includes(qLower) ||
        String(b.deliveryCity || "").toLowerCase().includes(qLower);
      const bPhoneClean = String(b.customerPhone || "").replace(/[^0-9]/g, "");
      const phoneMatch =
        phonesMatch(b.customerPhone, q) ||
        (cleanPhone.length >= 4 &&
          bPhoneClean.length > 0 &&
          (bPhoneClean.includes(cleanPhone) || cleanPhone.includes(bPhoneClean)));
      return idMatch || plateMatch || cityMatch || phoneMatch;
    });

    return {
      success: true,
      data: matches,
    };
  } catch (err: unknown) {
    console.error("trackBookingAction error:", err);
    return {
      success: false,
      error: "Error retrieving booking records.",
    };
  }
}

/**
 * Server Action to fetch all bookings associated with a customer phone.
 */
export async function getCustomerBookingsAction(
  customerPhone: string
): Promise<ActionResult<StoredBooking[]>> {
  try {
    const phone = customerPhone?.trim();
    if (!phone) {
      return { success: true, data: [] };
    }

    const all = await fetchBookingsAuthoritative();
    const bookings = all
      .filter((b) => phonesMatch(b.customerPhone, phone))
      .sort((a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0));
    return {
      success: true,
      data: bookings,
    };
  } catch (err: unknown) {
    console.error("getCustomerBookingsAction error:", err);
    return {
      success: false,
      error: "Error retrieving customer bookings.",
    };
  }
}

/**
 * Server Action to retrieve all bookings (for dispatch / admin).
 */
export async function getAllBookingsAction(): Promise<ActionResult<StoredBooking[]>> {
  try {
    const bookings = await fetchBookingsAuthoritative();
    return {
      success: true,
      data: bookings,
    };
  } catch (err: unknown) {
    console.error("getAllBookingsAction error:", err);
    return {
      success: false,
      error: "Error retrieving all bookings.",
    };
  }
}

export interface BookedDateDetail {
  bookingId: string;
  customerName: string;
  customerPhone: string;
  pickupCity: string;
  deliveryCity: string;
  cargoNature?: string;
  daysNeeded?: number | string;
  packageDetails?: string;
  date: string;
  vehicleType: string;
  status: string;
  assignedPlate?: string;
}

export interface LorryBookedDatesResult {
  bookedDates: string[];
  bookingsByDate: Record<string, BookedDateDetail>;
}

/**
 * Server Action to retrieve booked dates for a specific lorry.
 * Used by the individual vehicle booking calendar to highlight reserved dates in RED
 * and provide rich click-to-view booking details.
 */
export async function getLorryBookedDatesAction(
  lorryIdentifier: string
): Promise<ActionResult<LorryBookedDatesResult>> {
  try {
    const clean = lorryIdentifier?.trim().toUpperCase();
    const cleanPlateNorm = normalizePlate(lorryIdentifier);
    if (!clean && !cleanPlateNorm) {
      return { success: true, data: { bookedDates: [], bookingsByDate: {} } };
    }

    const all = await fetchBookingsAuthoritative();
    const bookingsByDate: Record<string, BookedDateDetail> = {};
    const bookedDates: string[] = [];

    all.forEach((b) => {
      // Live online bookings are for immediate runs on the road and do NOT lock calendar dates for future rentals
      if (b.bookingType === "live_lorry") return;

      const plateMatch = Boolean(
        cleanPlateNorm &&
          b.assignedPlate &&
          normalizePlate(b.assignedPlate) === cleanPlateNorm
      );
      const idMatch = Boolean(
        clean &&
          b.assignedLorryId &&
          b.assignedLorryId.trim().toUpperCase() === clean
      );
      // Confirmed & Accepted bookings lock the date on the calendar
      const isConfirmed = ["accepted", "assigned", "in_transit", "delivered", "booked"].includes(b.status);

      if ((plateMatch || idMatch) && isConfirmed) {
        const rawDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : (b.date ? [b.date] : []);
        rawDates.forEach((d) => {
          if (d) {
            bookedDates.push(d);
            bookingsByDate[d] = {
              bookingId: b.id,
              customerName: b.customerName,
              customerPhone: b.customerPhone,
              pickupCity: b.pickupCity,
              deliveryCity: b.deliveryCity,
              cargoNature: b.cargoNature || b.packageDetails,
              daysNeeded: rawDates.length || b.daysNeeded || 1,
              packageDetails: b.packageDetails,
              date: d,
              vehicleType: b.vehicleType,
              status: b.status,
              assignedPlate: b.assignedPlate,
            };
          }
        });
      }
    });

    return {
      success: true,
      data: {
        bookedDates: Array.from(new Set(bookedDates)),
        bookingsByDate,
      },
    };
  } catch (err: unknown) {
    console.error("getLorryBookedDatesAction error:", err);
    return {
      success: false,
      error: "Error retrieving lorry booked dates.",
    };
  }
}

/**
 * Server Action to update booking status and driver assignments.
 */
export async function updateBookingStatusAction(
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
    endDate?: string;
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
): Promise<ActionResult<StoredBooking>> {
  try {
    if (!id) {
      return { success: false, error: "Booking ID is required." };
    }

    const sanitizedAssignment = assignment
      ? {
          ...assignment,
          assignedDriverId: assignment.assignedDriverId?.trim() || undefined,
          assignedDriverName: isRealDriverName(assignment.assignedDriverName) || undefined,
          assignedDriverPhone: assignment.assignedDriverPhone?.trim() || undefined,
          date: assignment.date?.trim() || undefined,
          dates: Array.isArray(assignment.dates) && assignment.dates.length > 0 ? assignment.dates : undefined,
          endDate: assignment.endDate?.trim() || undefined,
          daysNeeded: assignment.daysNeeded !== undefined ? Number(assignment.daysNeeded) || assignment.daysNeeded : undefined,
          startTime: assignment.startTime?.trim() || undefined,
          endTime: assignment.endTime?.trim() || undefined,
          distanceKm: assignment.distanceKm !== undefined && !Number.isNaN(Number(assignment.distanceKm)) ? Number(assignment.distanceKm) : undefined,
          customerIdNumber: assignment.customerIdNumber?.trim() || undefined,
        }
      : undefined;

    // Fetch existing booking state (local store + Firestore) to validate time-slot & rider constraints before mutating
    const [cloudBookings, storeBookings] = await Promise.all([
      fetchBookingsAuthoritative().catch(() => [] as StoredBooking[]),
      Promise.resolve(getAllStoredBookings()),
    ]);
    const combinedMap = new Map<string, StoredBooking>();
    cloudBookings.forEach((b) => combinedMap.set(b.id, b));
    storeBookings.forEach((b) => combinedMap.set(b.id, b));

    const existingBooking = combinedMap.get(id);
    const isIndividual = (existingBooking?.bookingType || "individual_vehicle") !== "live_lorry";

    if (isIndividual && status !== "cancelled" && status !== "delivered") {
      const mergedDate =
        sanitizedAssignment?.date ||
        (sanitizedAssignment?.dates && sanitizedAssignment.dates[0]) ||
        existingBooking?.date ||
        "";
      const mergedDates =
        sanitizedAssignment?.dates ||
        (sanitizedAssignment?.date ? [sanitizedAssignment.date] : existingBooking?.dates) ||
        (mergedDate ? [mergedDate] : []);
      const mergedEndDate =
        sanitizedAssignment?.endDate ||
        (mergedDates.length > 1 ? mergedDates[mergedDates.length - 1] : mergedDate);
      const mergedStartTime = sanitizedAssignment?.startTime || existingBooking?.startTime || "";
      const mergedEndTime = sanitizedAssignment?.endTime || existingBooking?.endTime || "";
      const mergedPlate = sanitizedAssignment?.assignedPlate || existingBooking?.assignedPlate || "";
      const mergedLorryId = sanitizedAssignment?.assignedLorryId || existingBooking?.assignedLorryId || "";
      const mergedDriverId = sanitizedAssignment?.assignedDriverId || existingBooking?.assignedDriverId || "";
      const mergedDriverName =
        sanitizedAssignment?.assignedDriverName || isRealDriverName(existingBooking?.assignedDriverName);
      const mergedDriverPhone =
        sanitizedAssignment?.assignedDriverPhone || existingBooking?.assignedDriverPhone || "";

      const schedulingActive =
        Boolean(sanitizedAssignment?.startTime || sanitizedAssignment?.endTime) ||
        Boolean(mergedStartTime || mergedEndTime) ||
        ["accepted", "booked", "assigned", "in_transit"].includes(status);

      if (schedulingActive) {
        const scheduleCheck = validateScheduleTimeAndDates(
          mergedDate,
          mergedStartTime,
          mergedEndDate,
          mergedEndTime,
          mergedDates
        );
        if (!scheduleCheck.valid) {
          return { success: false, error: scheduleCheck.error };
        }
        if (sanitizedAssignment) {
          sanitizedAssignment.date = scheduleCheck.startDate;
          sanitizedAssignment.dates = scheduleCheck.dates;
          sanitizedAssignment.startTime = scheduleCheck.startTime;
          sanitizedAssignment.endTime = scheduleCheck.endTime;
          sanitizedAssignment.daysNeeded = scheduleCheck.daysCount;
        }

        if (
          !hasAssignedRider({
            assignedDriverId: mergedDriverId,
            assignedDriverName: mergedDriverName,
            assignedDriverPhone: mergedDriverPhone,
          })
        ) {
          return {
            success: false,
            error: "A Rider must be assigned to this booking.",
          };
        }

        const conflict = findBookingScheduleConflict(
          {
            excludeBookingId: id,
            date: scheduleCheck.startDate,
            dates: scheduleCheck.dates,
            startTime: scheduleCheck.startTime,
            endTime: scheduleCheck.endTime,
            assignedPlate: mergedPlate,
            assignedLorryId: mergedLorryId,
            assignedDriverId: mergedDriverId,
            assignedDriverName: mergedDriverName,
            assignedDriverPhone: mergedDriverPhone,
            bookingType: existingBooking?.bookingType || "individual_vehicle",
          },
          Array.from(combinedMap.values())
        );

        if (conflict.hasConflict) {
          return {
            success: false,
            error: conflict.message || "Schedule conflict detected for this lorry or rider.",
          };
        }
      }
    }

    let updatedLocal = updateBookingStatusInStore(id, status, sanitizedAssignment, paymentMeta);

    // Backfill from Firestore if the booking existed in Firestore only and not yet in local store
    if (!updatedLocal) {
      try {
        const directSnap = await getDoc(doc(db, "bookings", id));
        let fsData: Record<string, any> | null = directSnap.exists() ? directSnap.data() : null;
        if (!fsData) {
          const legacySnap = await getDocs(
            query(collection(db, "bookings"), where("trackingId", "==", id))
          );
          if (!legacySnap.empty) {
            fsData = legacySnap.docs[0].data();
          }
        }
        if (fsData) {
          const mapped = mapFirestoreBooking(id, {
            ...fsData,
            status,
            ...(sanitizedAssignment?.assignedLorryId ? { assignedLorryId: sanitizedAssignment.assignedLorryId } : {}),
            ...(sanitizedAssignment?.assignedDriverId ? { assignedDriverId: sanitizedAssignment.assignedDriverId } : {}),
            ...(sanitizedAssignment?.assignedDriverName ? { assignedDriverName: sanitizedAssignment.assignedDriverName } : {}),
            ...(sanitizedAssignment?.assignedDriverPhone ? { assignedDriverPhone: sanitizedAssignment.assignedDriverPhone } : {}),
            ...(sanitizedAssignment?.assignedPlate ? { assignedPlate: sanitizedAssignment.assignedPlate } : {}),
            ...(sanitizedAssignment?.date ? { date: sanitizedAssignment.date } : {}),
            ...(sanitizedAssignment?.dates ? { dates: sanitizedAssignment.dates } : {}),
            ...(sanitizedAssignment?.daysNeeded ? { daysNeeded: sanitizedAssignment.daysNeeded } : {}),
            ...(sanitizedAssignment?.startTime ? { startTime: sanitizedAssignment.startTime } : {}),
            ...(sanitizedAssignment?.endTime ? { endTime: sanitizedAssignment.endTime } : {}),
            ...(paymentMeta || {}),
            updatedAt: Date.now(),
          });
          updatedLocal = upsertBookingInStore(mapped);
        }
      } catch {
        // fallback handled below
      }
    }

    // Enrich missing driver metadata from fleet registry / drivers ONLY when explicitly assigning driver
    // (or dispatching a live_lorry booking) — never prematurely during individual payment approval
    let enrichedDriverMeta: {
      driverId?: string;
      driverName?: string;
      driverPhone?: string;
      resolvedPlate?: string;
      resolvedLorryId?: string;
    } = {};
    const shouldEnrichDriver =
      ["assigned", "in_transit"].includes(status) ||
      (status === "accepted" && updatedLocal?.bookingType === "live_lorry");

    if (shouldEnrichDriver) {
      enrichedDriverMeta = await resolveDriverMetadataForDispatch(
        sanitizedAssignment?.assignedLorryId || updatedLocal?.assignedLorryId,
        sanitizedAssignment?.assignedPlate || updatedLocal?.assignedPlate
      );
    }

    const existingValidDriver = isRealDriverName(updatedLocal?.assignedDriverName);
    const effectiveAssignment = shouldEnrichDriver
      ? {
          ...(sanitizedAssignment || {}),
          ...(enrichedDriverMeta.resolvedLorryId && !(sanitizedAssignment?.assignedLorryId || updatedLocal?.assignedLorryId)
            ? { assignedLorryId: enrichedDriverMeta.resolvedLorryId }
            : {}),
          ...(enrichedDriverMeta.resolvedPlate && !(sanitizedAssignment?.assignedPlate || updatedLocal?.assignedPlate)
            ? { assignedPlate: enrichedDriverMeta.resolvedPlate }
            : {}),
          ...(enrichedDriverMeta.driverName && !(sanitizedAssignment?.assignedDriverName || existingValidDriver)
            ? { assignedDriverName: enrichedDriverMeta.driverName }
            : {}),
          ...(enrichedDriverMeta.driverPhone && !(sanitizedAssignment?.assignedDriverPhone || updatedLocal?.assignedDriverPhone)
            ? { assignedDriverPhone: enrichedDriverMeta.driverPhone }
            : {}),
        }
      : sanitizedAssignment || {};

    // Outside Lorry handling: if vehicle is an outside lorry, enforce registered owner as driver
    const effectivePlate = (
      effectiveAssignment.assignedPlate ||
      sanitizedAssignment?.assignedPlate ||
      updatedLocal?.assignedPlate ||
      ""
    ).trim().toUpperCase();
    const outsideOwner = effectivePlate ? getStoredOutsideEmployeeByPlate(effectivePlate) : null;
    if (outsideOwner) {
      effectiveAssignment.assignedDriverId = outsideOwner.driverId || outsideOwner.id;
      effectiveAssignment.assignedDriverName = outsideOwner.name;
      effectiveAssignment.assignedDriverPhone = outsideOwner.phone;
      effectiveAssignment.assignedPlate = outsideOwner.plateNumber;
    } else if (effectivePlate) {
      const storeLorries = getAllStoredLorries();
      const matchedL = storeLorries.find((l: StoredLorry) => normalizePlate(l.plate) === normalizePlate(effectivePlate));
      if (matchedL && (matchedL.isOutsideLorry || matchedL.ownershipType === "outside")) {
        effectiveAssignment.assignedDriverId = matchedL.driverId || "";
        effectiveAssignment.assignedDriverName = matchedL.driverName || "";
        effectiveAssignment.assignedDriverPhone = matchedL.driverPhone || "";
        effectiveAssignment.assignedPlate = matchedL.plate;
      }
    }

    // Outside Lorry 20% commission check & deduction on booking confirmation
    const isConfirmedStatus =
      ["accepted", "assigned", "booked"].includes(status) ||
      Boolean(paymentMeta?.paymentApprovedAt) ||
      paymentMeta?.paymentSlipStatus === "approved" ||
      paymentMeta?.paymentSlipStatus === "manual_approved";

    if (isConfirmedStatus && effectivePlate && outsideOwner) {
      const hireAmount = Number(
        paymentMeta?.quotedAmount ??
        updatedLocal?.quotedAmount ??
        0
      );
      if (hireAmount > 0) {
        const commissionCheck = checkOutsideLorryBookingEligibility(effectivePlate, hireAmount);
        if (commissionCheck.isOutside && !commissionCheck.allowed) {
          return {
            success: false,
            error: commissionCheck.reason || "Outside vehicle owner has insufficient balance for 20% commission. Top-up required.",
          };
        }
        // Deduct 20% commission
        const deductResult = deductCommissionForBookingInStore(id, hireAmount, effectivePlate);
        if (deductResult.success && deductResult.isOutside && deductResult.deductedAmount) {
          try {
            const txId = `TX-${Date.now()}-${id}`;
            await setDoc(doc(db, "commission_transactions", txId), {
              id: txId,
              employeeId: outsideOwner.id,
              idNumber: outsideOwner.idNumber,
              bookingId: id,
              type: "commission_deduction",
              hireAmount,
              commissionRate: 20,
              amount: -deductResult.deductedAmount,
              balanceAfter: deductResult.newBalance,
              note: `20% Commission for Booking ${id} (Hire: LKR ${hireAmount.toLocaleString()})`,
              createdAt: Date.now(),
            });
            await updateDoc(doc(db, "outside_employees", outsideOwner.id), {
              balance: deductResult.newBalance,
              totalCommissionDeducted: (outsideOwner.totalCommissionDeducted || 0) + deductResult.deductedAmount,
              totalHiresCompleted: (outsideOwner.totalHiresCompleted || 0) + 1,
              updatedAt: Date.now(),
            });
          } catch (e) {
            console.warn("Firestore commission deduction sync notice:", e);
          }
        }
      }
    }

    if (updatedLocal && (Object.keys(effectiveAssignment).length > 0 || paymentMeta)) {
      updatedLocal =
        updateBookingStatusInStore(id, status, effectiveAssignment, paymentMeta) || updatedLocal;
    }

    // Authoritative awaited Firestore update (merge by doc ID + normalize any legacy trackingId doc)
    let firestoreOk = false;
    try {
      const updateFields: Record<string, any> = {
        id,
        trackingId: id,
        status,
        updatedAt: Date.now(),
      };
      if (effectiveAssignment.assignedLorryId !== undefined && effectiveAssignment.assignedLorryId !== "") {
        updateFields.assignedLorryId = effectiveAssignment.assignedLorryId;
      }
      if ("assignedDriverId" in effectiveAssignment && effectiveAssignment.assignedDriverId) {
        updateFields.assignedDriverId = effectiveAssignment.assignedDriverId;
      }
      const finalDriverName = isRealDriverName(effectiveAssignment.assignedDriverName);
      if (finalDriverName) {
        updateFields.assignedDriverName = finalDriverName;
      }
      if (effectiveAssignment.assignedDriverPhone !== undefined && effectiveAssignment.assignedDriverPhone !== "") {
        updateFields.assignedDriverPhone = effectiveAssignment.assignedDriverPhone;
      }
      if (effectiveAssignment.assignedPlate !== undefined && effectiveAssignment.assignedPlate !== "") {
        updateFields.assignedPlate = effectiveAssignment.assignedPlate;
      }
      if ("date" in effectiveAssignment && effectiveAssignment.date) {
        updateFields.date = effectiveAssignment.date;
        updateFields.dates =
          "dates" in effectiveAssignment && Array.isArray(effectiveAssignment.dates) && effectiveAssignment.dates.length > 0
            ? effectiveAssignment.dates
            : [effectiveAssignment.date];
      } else if ("dates" in effectiveAssignment && Array.isArray(effectiveAssignment.dates) && effectiveAssignment.dates.length > 0) {
        updateFields.dates = effectiveAssignment.dates;
        updateFields.date = effectiveAssignment.dates[0];
      }
      if ("daysNeeded" in effectiveAssignment && effectiveAssignment.daysNeeded !== undefined) {
        updateFields.daysNeeded = effectiveAssignment.daysNeeded;
      }
      if ("startTime" in effectiveAssignment && effectiveAssignment.startTime) {
        updateFields.startTime = effectiveAssignment.startTime;
      }
      if ("endTime" in effectiveAssignment && effectiveAssignment.endTime) {
        updateFields.endTime = effectiveAssignment.endTime;
      }
      if ("distanceKm" in effectiveAssignment && effectiveAssignment.distanceKm !== undefined) {
        updateFields.distanceKm = effectiveAssignment.distanceKm;
      }
      if ("customerIdNumber" in effectiveAssignment && effectiveAssignment.customerIdNumber) {
        updateFields.customerIdNumber = effectiveAssignment.customerIdNumber;
      }

      if (paymentMeta) {
        if (paymentMeta.quotedAmount !== undefined) updateFields.quotedAmount = paymentMeta.quotedAmount;
        if (paymentMeta.quotedAt !== undefined) updateFields.quotedAt = paymentMeta.quotedAt;
        if (paymentMeta.quoteNote !== undefined) updateFields.quoteNote = paymentMeta.quoteNote;
        if (paymentMeta.paymentMethod !== undefined) updateFields.paymentMethod = paymentMeta.paymentMethod;
        if (paymentMeta.paymentBankUsed !== undefined) updateFields.paymentBankUsed = paymentMeta.paymentBankUsed;
        if (paymentMeta.advanceAmount !== undefined) updateFields.advanceAmount = paymentMeta.advanceAmount;
        if (paymentMeta.pendingAmount !== undefined) updateFields.pendingAmount = paymentMeta.pendingAmount;
        if (paymentMeta.finalPaymentMethod !== undefined) updateFields.finalPaymentMethod = paymentMeta.finalPaymentMethod;
        if (paymentMeta.finalPaymentBankUsed !== undefined) updateFields.finalPaymentBankUsed = paymentMeta.finalPaymentBankUsed;
        if (paymentMeta.finalPaymentAt !== undefined) updateFields.finalPaymentAt = paymentMeta.finalPaymentAt;
        if (paymentMeta.paymentSlipId !== undefined) updateFields.paymentSlipId = paymentMeta.paymentSlipId;
        if (paymentMeta.paymentSlipName !== undefined) updateFields.paymentSlipName = paymentMeta.paymentSlipName;
        if (paymentMeta.paymentSlipType !== undefined) updateFields.paymentSlipType = paymentMeta.paymentSlipType;
        if (paymentMeta.paymentSlipSize !== undefined) updateFields.paymentSlipSize = paymentMeta.paymentSlipSize;
        if (paymentMeta.paymentSlipUploadedAt !== undefined) updateFields.paymentSlipUploadedAt = paymentMeta.paymentSlipUploadedAt;
        if (paymentMeta.paymentSlipStatus !== undefined) updateFields.paymentSlipStatus = paymentMeta.paymentSlipStatus;
        if (paymentMeta.paymentRejectReason !== undefined) updateFields.paymentRejectReason = paymentMeta.paymentRejectReason;
        if (paymentMeta.paymentApprovedAt !== undefined) updateFields.paymentApprovedAt = paymentMeta.paymentApprovedAt;
        if (paymentMeta.paymentSlipDeletedAt !== undefined) updateFields.paymentSlipDeletedAt = paymentMeta.paymentSlipDeletedAt;
      }

      const docRef = doc(db, "bookings", id);
      await setDoc(docRef, updateFields, { merge: true });
      firestoreOk = true;

      // Sync slip doc review status if slip exists
      if (
        paymentMeta?.paymentSlipStatus &&
        ["approved", "rejected"].includes(paymentMeta.paymentSlipStatus) &&
        updatedLocal?.paymentSlipId
      ) {
        try {
          await setDoc(
            doc(db, "payment_slips", updatedLocal.paymentSlipId),
            {
              status: paymentMeta.paymentSlipStatus,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        } catch {
          // ignore if slip was already deleted
        }
      }

      // Clean/sync any legacy doc created with random ID that holds trackingId == id
      const legacySnap = await getDocs(query(collection(db, "bookings"), where("trackingId", "==", id)));
      for (const d of legacySnap.docs) {
        if (d.id !== id) {
          await updateDoc(doc(db, "bookings", d.id), updateFields);
        }
      }

      if (updatedLocal) {
        await syncBookingDispatchDoc(updatedLocal, status, {
          driverId: enrichedDriverMeta.driverId,
          driverName: finalDriverName || enrichedDriverMeta.driverName || isRealDriverName(updatedLocal.assignedDriverName),
          driverPhone: effectiveAssignment.assignedDriverPhone || enrichedDriverMeta.driverPhone || updatedLocal.assignedDriverPhone,
          lorryId: effectiveAssignment.assignedLorryId || updatedLocal.assignedLorryId,
          plate: effectiveAssignment.assignedPlate || updatedLocal.assignedPlate,
        });
      }
    } catch (e) {
      console.warn("Firestore updateBookingStatusAction warning:", e);
    }

    if (!updatedLocal && !firestoreOk) {
      return { success: false, error: "Booking record not found." };
    }

    const resultBooking: StoredBooking = updatedLocal || {
      id,
      customerName: "Customer",
      customerPhone: "",
      pickupCity: "",
      deliveryCity: "",
      date: new Date().toISOString().split("T")[0],
      vehicleType: "Lorry",
      status,
      ...effectiveAssignment,
      ...(paymentMeta || {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      revalidatePath("/book-vehicle");
      revalidatePath("/login");
      revalidatePath("/manage");
      revalidatePath("/admin");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: resultBooking,
    };
  } catch (err: unknown) {
    console.error("updateBookingStatusAction error:", err);
    return {
      success: false,
      error: "Failed to update booking status.",
    };
  }
}

/**
 * Server Action to edit booking details (Date, Time, Distance KM, Locations, Quoted Amount, Rider, Vehicle, Cargo).
 * For outside lorries, permanently enforces driver assignment to registered owner.
 */
export async function editBookingAction(
  id: string,
  updates: {
    date?: string;
    dates?: string[];
    startTime?: string;
    endTime?: string;
    distanceKm?: number;
    pickupCity?: string;
    deliveryCity?: string;
    quotedAmount?: number;
    advanceAmount?: number;
    pendingAmount?: number;
    cargoNature?: string;
    cargoWeight?: string;
    helpersCount?: string | number;
    assignedPlate?: string;
    assignedLorryId?: string;
    assignedDriverId?: string;
    assignedDriverName?: string;
    assignedDriverPhone?: string;
  }
): Promise<ActionResult<StoredBooking>> {
  try {
    const cleanId = (id || "").trim();
    if (!cleanId) return { success: false, error: "Booking ID is required." };

    // Resolve outside vehicle driver lock
    const targetPlate = (updates.assignedPlate || "").trim().toUpperCase();
    if (targetPlate) {
      const outsideEmp = getStoredOutsideEmployeeByPlate(targetPlate);
      if (outsideEmp) {
        updates.assignedDriverId = outsideEmp.driverId || outsideEmp.id;
        updates.assignedDriverName = outsideEmp.name;
        updates.assignedDriverPhone = outsideEmp.phone;
      } else {
        const storeLorries = getAllStoredLorries();
        const matchedL = storeLorries.find((l) => normalizePlate(l.plate) === normalizePlate(targetPlate));
        if (matchedL && (matchedL.isOutsideLorry || matchedL.ownershipType === "outside")) {
          updates.assignedDriverId = matchedL.driverId || "";
          updates.assignedDriverName = matchedL.driverName || "";
          updates.assignedDriverPhone = matchedL.driverPhone || "";
        }
      }
    }

    const updated = updateBookingInStore(cleanId, updates);

    // Sync to Firestore
    try {
      await updateDoc(doc(db, "bookings", cleanId), {
        ...updates,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn("Firestore editBookingAction updateDoc notice:", e);
    }

    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/manage");
    } catch {}

    return {
      success: true,
      data: updated || ({} as StoredBooking),
    };
  } catch (err: unknown) {
    console.error("editBookingAction error:", err);
    return { success: false, error: "Failed to edit booking details." };
  }
}

/**
 * Server Action: Start Ride manually.
 * Transitions booking to in_transit and sets rideStartedAt.
 */
export async function startRideAction(bookingId: string): Promise<ActionResult<StoredBooking>> {
  try {
    const cleanId = (bookingId || "").trim();
    if (!cleanId) return { success: false, error: "Booking ID required." };

    const now = Date.now();
    const updated = updateBookingInStore(cleanId, {
      status: "in_transit",
      rideStartedAt: now,
      driverTripStatus: "in_transit",
    });

    const targetLorry = updated?.assignedLorryId || updated?.assignedPlate;
    if (targetLorry) {
      updateLorryStatusInStore(targetLorry, "on_trip");
    }

    try {
      await updateDoc(doc(db, "bookings", cleanId), {
        status: "in_transit",
        rideStartedAt: now,
        driverTripStatus: "in_transit",
        updatedAt: now,
      });
    } catch (e) {
      console.warn("Firestore startRideAction notice:", e);
    }

    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/manage");
    } catch {}

    return { success: true, data: updated || ({} as StoredBooking) };
  } catch (err: unknown) {
    console.error("startRideAction error:", err);
    return { success: false, error: "Failed to start ride." };
  }
}

/**
 * Server Action: End / Close Ride manually.
 * Auto-routes:
 * - If payment pending -> status: delivered (moves to Pending Payment tab)
 * - If payment complete -> status: completed (moves to Completed tab)
 */
export async function endRideAction(
  bookingId: string
): Promise<ActionResult<{ booking: StoredBooking; isPaymentPending: boolean }>> {
  try {
    const cleanId = (bookingId || "").trim();
    if (!cleanId) return { success: false, error: "Booking ID required." };

    const store = getAllStoredBookings();
    const booking = store.find((b) => b.id === cleanId);
    if (!booking) return { success: false, error: "Booking not found." };

    const isPending =
      (typeof booking.pendingAmount === "number" && booking.pendingAmount > 0) ||
      booking.paymentSlipStatus === "cash_pending" ||
      booking.paymentSlipStatus === "pending_review" ||
      (booking.paymentMethod === "cash_manual" && (!booking.paymentApprovedAt || booking.paymentApprovedAt <= 0)) ||
      (!booking.paymentApprovedAt && booking.paymentSlipStatus !== "approved" && (booking.paymentSlipStatus as string) !== "manual_approved");

    const targetStatus: BookingStatusValue = isPending ? "delivered" : "completed";
    const now = Date.now();

    const updated = updateBookingInStore(cleanId, {
      status: targetStatus,
      rideEndedAt: now,
      driverTripStatus: "completed",
    });

    try {
      await updateDoc(doc(db, "bookings", cleanId), {
        status: targetStatus,
        rideEndedAt: now,
        driverTripStatus: "completed",
        updatedAt: now,
      });
    } catch (e) {
      console.warn("Firestore endRideAction notice:", e);
    }

    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/manage");
    } catch {}

    return {
      success: true,
      data: {
        booking: updated || booking,
        isPaymentPending: isPending,
      },
    };
  } catch (err: unknown) {
    console.error("endRideAction error:", err);
    return { success: false, error: "Failed to end ride." };
  }
}

/**
 * Server Action: Driver accepts or declines an assigned booking.
 */
export async function driverAcceptBookingAction(
  bookingId: string,
  accept: boolean
): Promise<ActionResult<StoredBooking>> {
  try {
    const cleanId = (bookingId || "").trim();
    const updated = updateBookingInStore(cleanId, {
      driverTripStatus: accept ? "accepted" : "declined",
    });
    try {
      await updateDoc(doc(db, "bookings", cleanId), {
        driverTripStatus: accept ? "accepted" : "declined",
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn("Firestore driverAcceptBookingAction notice:", e);
    }
    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/manage");
    } catch {}
    return { success: true, data: updated || ({} as StoredBooking) };
  } catch (err: unknown) {
    return { success: false, error: "Failed to update trip status." };
  }
}

/**
 * Server Action: Driver updates route waypoints (up to 3) and actual distance KM.
 * Live-updates the booking record in server-store and Firestore.
 */
export async function driverUpdateTripRouteAction(
  bookingId: string,
  waypoints: Array<{ name: string; lat: number; lng: number }>,
  actualDistanceKm: number
): Promise<ActionResult<StoredBooking>> {
  try {
    const cleanId = (bookingId || "").trim();
    const updated = updateBookingInStore(cleanId, {
      waypoints,
      actualDistanceKm: Number(actualDistanceKm),
    });
    try {
      await updateDoc(doc(db, "bookings", cleanId), {
        waypoints,
        actualDistanceKm: Number(actualDistanceKm),
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn("Firestore driverUpdateTripRouteAction notice:", e);
    }
    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/manage");
    } catch {}
    return { success: true, data: updated || ({} as StoredBooking) };
  } catch (err: unknown) {
    return { success: false, error: "Failed to update route waypoints." };
  }
}

/**
 * Server Action: Driver streams live GPS location.
 * Automatically marks ride as in_transit and ongoing!
 */
export async function driverShareLiveGpsAction(
  bookingId: string,
  lorryId: string,
  lat: number,
  lng: number,
  heading: number = 0,
  speedKmH: number = 0
): Promise<ActionResult<StoredBooking>> {
  try {
    const cleanId = (bookingId || "").trim();
    const now = Date.now();

    // 1. Update lorry live GPS
    if (lorryId) {
      updateLorryGpsInStore(lorryId, lat, lng, heading, speedKmH);
    }

    // 2. Automatically make ride Ongoing if not already ongoing
    const store = getAllStoredBookings();
    const current = store.find((b) => b.id === cleanId);
    const needStart =
      current &&
      current.status !== "in_transit" &&
      current.status !== "delivered" &&
      current.status !== "completed";

    const partialUpdates: Partial<StoredBooking> = {
      pickupLat: lat,
      pickupLng: lng,
    };
    if (needStart) {
      partialUpdates.status = "in_transit";
      partialUpdates.rideStartedAt = now;
      partialUpdates.driverTripStatus = "in_transit";
    }

    const updated = updateBookingInStore(cleanId, partialUpdates);

    // 3. Sync to Firestore
    try {
      const fsPayload: Record<string, any> = {
        lat,
        lng,
        updatedAt: now,
      };
      if (needStart) {
        fsPayload.status = "in_transit";
        fsPayload.rideStartedAt = now;
        fsPayload.driverTripStatus = "in_transit";
      }
      await updateDoc(doc(db, "bookings", cleanId), fsPayload);

      // Also update lorry live record
      if (lorryId) {
        const rawLiveKey = (updated?.assignedPlate || lorryId)
          .replace(/^lorry-/i, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        if (rawLiveKey) {
          await setDoc(
            doc(db, "lorries_live", rawLiveKey),
            { lat, lng, heading, speedKmH, updatedAt: now },
            { merge: true }
          );
        }
      }
    } catch (e) {
      console.warn("Firestore driverShareLiveGpsAction notice:", e);
    }

    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/manage");
    } catch {}

    return { success: true, data: updated || ({} as StoredBooking) };
  } catch (err: unknown) {
    return { success: false, error: "Failed to stream live GPS location." };
  }
}

/**
 * Server Action: Driver toggles Empty Return mode after delivery.
 * Sets lorry status to empty so it appears on /find-empty-lorry.
 */
export async function driverToggleEmptyReturnAction(
  bookingId: string,
  lorryId: string,
  startEmptyReturn: boolean,
  returnDistanceKm?: number,
  returnRoute?: string
): Promise<ActionResult<StoredBooking>> {
  try {
    const cleanId = (bookingId || "").trim();
    const now = Date.now();

    const updated = updateBookingInStore(cleanId, {
      isEmptyReturnActive: startEmptyReturn,
      emptyReturnDistanceKm: returnDistanceKm,
      emptyReturnRoute: returnRoute,
      emptyReturnStartedAt: startEmptyReturn ? now : undefined,
    });

    if (lorryId) {
      updateLorryStatusInStore(lorryId, startEmptyReturn ? "empty" : "on_trip");
    }

    try {
      await updateDoc(doc(db, "bookings", cleanId), {
        isEmptyReturnActive: startEmptyReturn,
        emptyReturnDistanceKm: returnDistanceKm,
        emptyReturnRoute: returnRoute,
        emptyReturnStartedAt: startEmptyReturn ? now : undefined,
        updatedAt: now,
      });
    } catch (e) {
      console.warn("Firestore driverToggleEmptyReturnAction notice:", e);
    }

    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/manage");
      revalidatePath("/find-empty-lorry");
    } catch {}

    return { success: true, data: updated || ({} as StoredBooking) };
  } catch (err: unknown) {
    return { success: false, error: "Failed to toggle empty return mode." };
  }
}

/**
 * Server Action: Fetch bookings assigned to a driver by driverId, phone, or plate.
 */
export async function getDriverAssignedBookingsAction(
  driverIdOrPlate: string
): Promise<ActionResult<StoredBooking[]>> {
  try {
    const clean = (driverIdOrPlate || "").trim().toLowerCase();
    const cleanPlateNorm = normalizePlate(clean);
    if (!clean) return { success: true, data: [] };

    const store = getAllStoredBookings();
    const matched = store.filter((b) => {
      const bDriverId = (b.assignedDriverId || "").trim().toLowerCase();
      const bPlateNorm = normalizePlate(b.assignedPlate || b.selectedVehiclePlate);
      return (
        bDriverId === clean ||
        (cleanPlateNorm && bPlateNorm === cleanPlateNorm) ||
        (clean.length >= 9 && phonesMatch(b.assignedDriverPhone, clean))
      );
    });

    matched.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { success: true, data: matched };
  } catch (err: unknown) {
    return { success: false, error: "Failed to fetch driver bookings." };
  }
}

/**
 * Server Action to delete a booking with a mandatory reason.
 * The deletion reason and booking details are saved as a Complaint record
 * in Firestore and local store, before removing the booking and dispatch records.
 */
export async function deleteBookingAction(
  id: string,
  reason: string,
  requesterPhone?: string,
  deletedBy?: string
): Promise<ActionResult<{ deletedId: string; complaintId: string }>> {
  try {
    const cleanId = (id || "").trim();
    if (!cleanId) {
      return { success: false, error: "Booking ID is required." };
    }
    const cleanReason = (reason || "").trim();
    if (!cleanReason) {
      return {
        success: false,
        error: "Booking එක delete කිරීම සඳහා හේතුවක් (Reason) ඇතුළත් කිරීම අනිවාර්ය වේ.",
      };
    }

    // 1. Fetch booking details to record in complaints before deleting
    let targetBooking = getAllStoredBookings().find((b) => b.id === cleanId);
    if (!targetBooking) {
      try {
        const snap = await getDoc(doc(db, "bookings", cleanId));
        if (snap.exists()) {
          targetBooking = mapFirestoreBooking(snap.id, snap.data());
        }
      } catch {
        // non-blocking
      }
    }

    // 2. Create and persist complaint record
    const complaintId = `complaint-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const complaint: StoredComplaint = {
      id: complaintId,
      bookingId: cleanId,
      customerName: targetBooking?.customerName || "Customer",
      customerPhone: targetBooking?.customerPhone || requesterPhone || "",
      customerIdNumber: targetBooking?.customerIdNumber || "",
      pickupCity: targetBooking?.pickupCity || "",
      deliveryCity: targetBooking?.deliveryCity || "",
      date: targetBooking?.date || new Date().toISOString().split("T")[0],
      vehicleType: targetBooking?.vehicleType || "",
      quotedAmount: targetBooking?.quotedAmount,
      distanceKm: targetBooking?.distanceKm,
      reason: cleanReason,
      deletedAt: Date.now(),
      deletedBy: deletedBy || "Admin",
    };

    recordComplaintInStore(complaint);

    try {
      await setDoc(doc(db, "complaints", complaintId), complaint);
    } catch (compErr) {
      console.warn("Firestore save complaint notice:", compErr);
    }

    // 3. Delete from local server file store
    deleteBookingFromStore(cleanId);

    // 4. Delete from Firestore bookings collection
    try {
      const docRef = doc(db, "bookings", cleanId);
      await deleteDoc(docRef);

      // Clean any legacy doc with random doc ID referencing trackingId == cleanId
      const legacySnap = await getDocs(
        query(collection(db, "bookings"), where("trackingId", "==", cleanId))
      );
      for (const d of legacySnap.docs) {
        await deleteDoc(doc(db, "bookings", d.id));
      }
    } catch (fsErr) {
      console.warn("Firestore delete booking warning:", fsErr);
    }

    // 5. Clean corresponding dispatch in dispatches collection
    try {
      const dispatchDocId = `dispatch-${cleanId}`;
      await deleteDoc(doc(db, "dispatches", dispatchDocId));

      const dispatchSnap = await getDocs(
        query(collection(db, "dispatches"), where("bookingId", "==", cleanId))
      );
      for (const d of dispatchSnap.docs) {
        await deleteDoc(doc(db, "dispatches", d.id));
      }
    } catch (dispErr) {
      console.warn("Firestore delete dispatch warning:", dispErr);
    }

    // 6. Revalidate pages
    try {
      revalidatePath("/admin");
      revalidatePath("/login");
      revalidatePath("/book-vehicle");
      revalidatePath("/find-empty-lorry");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: { deletedId: cleanId, complaintId },
    };
  } catch (err: unknown) {
    console.error("deleteBookingAction error:", err);
    return {
      success: false,
      error: "Failed to delete booking.",
    };
  }
}

/**
 * Server Action to fetch all recorded complaints and cancellation reasons.
 */
export async function getAllComplaintsAction(): Promise<ActionResult<StoredComplaint[]>> {
  try {
    const localComplaints = getAllStoredComplaints();
    const map = new Map<string, StoredComplaint>();
    localComplaints.forEach((c) => map.set(c.id, c));

    try {
      const snap = await getDocs(collection(db, "complaints"));
      snap.docs.forEach((d) => {
        const data = d.data() as StoredComplaint;
        map.set(d.id, {
          ...data,
          id: d.id,
          deletedAt: Number(data.deletedAt) || Date.now(),
        });
      });
    } catch (e) {
      console.warn("Firestore fetch complaints warning:", e);
    }

    const list = Array.from(map.values()).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    return { success: true, data: list };
  } catch (err: unknown) {
    console.error("getAllComplaintsAction error:", err);
    return {
      success: false,
      error: "Failed to fetch complaints.",
    };
  }
}
