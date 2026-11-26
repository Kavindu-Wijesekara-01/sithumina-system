import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import {
  getAllStoredBookings,
  getBookingsByCustomerPhone,
  createBookingInStore,
  updateBookingStatusInStore,
  updateBookingInStore,
  upsertBookingInStore,
  deleteBookingFromStore,
} from "@/lib/server-store";
import { normalizePhoneNumber, phonesMatch } from "@/lib/phone-utils";
import {
  cleanRiderName,
  findBookingScheduleConflict,
  hasAssignedRider,
  validateTimeRange,
} from "@/lib/booking-schedule";
import { db, orderBy, limit } from "@/lib/fs-server";
import { closeDispatchesForBooking } from "@/lib/dispatch-sync";
import { deleteBookingAction, updateBookingStatusAction } from "@/actions/bookings";
import { syncHireCommission } from "@/lib/outside-owners";
import { refreshVehicleTripState } from "@/lib/trip-workflow";
import { tripFields, OPEN_STATUSES } from "@/lib/trip-state";
import { todayYmd } from "@/lib/ledger";
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, query, where } from "@/lib/fs-server";

function isRealDriverName(val: unknown): string {
  const s = String(val || "").trim();
  return s && s !== "Driver" && s !== "Unassigned" ? s : "";
}

async function getCombinedBookingsForSchedule() {
  // Only bookings that are still open can clash with a schedule
  const snap = await getDocs(query(collection(db, "bookings"), where("status", "in", OPEN_STATUSES)));
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      ...data,
      id: d.id,
      date: data.date || (Array.isArray(data.dates) && data.dates[0]) || "",
      dates: Array.isArray(data.dates) && data.dates.length > 0 ? data.dates : data.date ? [data.date] : [],
    };
  });
}

export async function GET(request: Request) {
  const auth = await authorize("admin", "customer");
  if (!auth.ok) return deniedResponse(auth.denied);
  const { searchParams } = new URL(request.url);
  const phone =
    auth.session.role === "customer" ? auth.session.customerPhone : searchParams.get("phone")?.trim() || "";

  try {
    // A customer's own bookings, or one page (newest first) for the office
    const before = Number(searchParams.get("before")) || 0;
    const snap = await getDocs(
      phone
        ? query(collection(db, "bookings"), where("customerPhone", "==", normalizePhoneNumber(phone)))
        : query(
            collection(db, "bookings"),
            ...(before ? [where("createdAt", "<", before)] : []),
            orderBy("createdAt", "desc"),
            limit(500)
          )
    );

    const byId = new Map<string, any>();

    snap.docs.forEach((d) => {
      const data = d.data();
      const resolvedId = String(data.id || data.trackingId || d.id);
      if (byId.has(resolvedId)) return;

      const resolvedPhone = String(data.customerPhone || data.phone || "").trim();
      if (phone && !phonesMatch(resolvedPhone, phone)) {
        return;
      }

      const resolvedDate =
        data.date ||
        (Array.isArray(data.dates) && data.dates[0]) ||
        todayYmd(data.createdAt || Date.now());
      const resolvedDates =
        Array.isArray(data.dates) && data.dates.length > 0
          ? data.dates
          : resolvedDate
          ? [resolvedDate]
          : [];

      const statusVal = data.status || "pending";
      const cleanDrvId = String(data.assignedDriverId || "").trim();
      const cleanDrvName = isRealDriverName(data.assignedDriverName);
      const cleanDrvPhone = String(data.assignedDriverPhone || "").trim();
      const rawPlate = data.assignedPlate || data.selectedVehiclePlate || "";
      const bookingTypeVal = data.bookingType || "individual_vehicle";

      byId.set(resolvedId, {
        id: resolvedId,
        trackingId: resolvedId,
        customerName: data.customerName || data.name || "Customer",
        customerPhone: resolvedPhone,
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
        status: statusVal,
        assignedLorryId: data.assignedLorryId || "",
        assignedDriverId: cleanDrvId,
        assignedDriverName: cleanDrvName,
        assignedDriverPhone: cleanDrvPhone,
        assignedPlate: rawPlate,
        bookingType: bookingTypeVal,
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
        paymentMethod: data.paymentMethod || undefined,
        paymentBankUsed: data.paymentBankUsed ? String(data.paymentBankUsed) : undefined,
        paymentSlipId: data.paymentSlipId ? String(data.paymentSlipId) : undefined,
        paymentSlipName: data.paymentSlipName ? String(data.paymentSlipName) : undefined,
        paymentSlipType: data.paymentSlipType ? String(data.paymentSlipType) : undefined,
        paymentSlipSize: Number(data.paymentSlipSize) || undefined,
        paymentSlipUploadedAt: Number(data.paymentSlipUploadedAt) || undefined,
        paymentSlipStatus: data.paymentSlipStatus || undefined,
        paymentRejectReason: data.paymentRejectReason ? String(data.paymentRejectReason) : undefined,
        paymentApprovedAt: Number(data.paymentApprovedAt) || undefined,
        paymentSlipDeletedAt: Number(data.paymentSlipDeletedAt) || undefined,
        advanceAmount:
          typeof data.advanceAmount === "number" && !Number.isNaN(data.advanceAmount)
            ? data.advanceAmount
            : undefined,
        pendingAmount:
          typeof data.pendingAmount === "number" && !Number.isNaN(data.pendingAmount)
            ? data.pendingAmount
            : undefined,
        waypoints: Array.isArray(data.waypoints) ? data.waypoints : undefined,
        travelRoute: data.travelRoute ? String(data.travelRoute) : undefined,
        ...tripFields(data),
        actualDistanceKm: Number(data.actualDistanceKm) || undefined,
        createdAt: Number(data.createdAt) || 0,
        updatedAt: Number(data.updatedAt) || Number(data.createdAt) || 0,
      });
    });

    const bookings = Array.from(byId.values()).sort(
      (a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0)
    );
    return NextResponse.json({ success: true, bookings });
  } catch (err) {
    console.warn("Firestore bookings GET fallback to local store:", err);
    const localBookings = phone
      ? await getBookingsByCustomerPhone(phone)
      : await getAllStoredBookings();
    return NextResponse.json({ success: true, bookings: localBookings });
  }
}

export async function POST(request: Request) {
  const auth = await authorize("admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  try {
    const body = await request.json();
    const customerName = (body.customerName || body.name || "Customer").toString().trim();
    const rawPhone = (body.customerPhone || body.phone || "").toString().trim();
    const customerPhone = normalizePhoneNumber(rawPhone) || rawPhone;
    const pickupCity = (body.pickupCity || body.pickup || "").toString().trim();
    const deliveryCity = (body.deliveryCity || body.destination || "").toString().trim();
    const dates = Array.isArray(body.dates) && body.dates.length > 0 ? body.dates : undefined;
    const date = (body.date || (dates && dates[0]) || todayYmd()).toString().trim();
    const vehicleType = (body.vehicleType || "Lorry").toString().trim();
    const packageDetails = (body.packageDetails || body.notes || body.weight || "").toString().trim();

    if (!customerPhone || !pickupCity || !deliveryCity) {
      return NextResponse.json(
        {
          success: false,
          error: "Customer phone, pickup, and delivery cities are required.",
        },
        { status: 400 }
      );
    }

    const bookingType = body.bookingType || "individual_vehicle";
    const status = body.status || "pending";
    const startTimeRaw = String(body.startTime || "").trim();
    const endTimeRaw = String(body.endTime || "").trim();
    const assignedDriverId = String(body.assignedDriverId || "").trim();
    const assignedDriverName = cleanRiderName(body.assignedDriverName);
    const assignedDriverPhone = String(body.assignedDriverPhone || "").trim();

    let cleanStartTime = startTimeRaw;
    let cleanEndTime = endTimeRaw;

    const requiresScheduleValidation =
      bookingType !== "live_lorry" &&
      (Boolean(cleanStartTime || cleanEndTime) ||
        ["accepted", "booked", "assigned", "in_transit"].includes(status));

    if (requiresScheduleValidation) {
      const timeCheck = validateTimeRange(cleanStartTime, cleanEndTime);
      if (!timeCheck.valid) {
        return NextResponse.json({ success: false, error: timeCheck.error }, { status: 400 });
      }
      cleanStartTime = timeCheck.startTime;
      cleanEndTime = timeCheck.endTime;

      if (
        !hasAssignedRider({
          assignedDriverId,
          assignedDriverName,
          assignedDriverPhone,
        })
      ) {
        return NextResponse.json(
          { success: false, error: "A Rider must be assigned to this booking." },
          { status: 400 }
        );
      }

      const existing = await getCombinedBookingsForSchedule();
      const conflict = findBookingScheduleConflict(
        {
          date,
          dates,
          startTime: cleanStartTime,
          endTime: cleanEndTime,
          assignedPlate: body.assignedPlate,
          assignedLorryId: body.assignedLorryId,
          assignedDriverId,
          assignedDriverName,
          assignedDriverPhone,
          bookingType,
        },
        existing
      );
      if (conflict.hasConflict) {
        return NextResponse.json(
          { success: false, error: conflict.message || "Schedule conflict detected." },
          { status: 409 }
        );
      }
    }

    const resolvedName = customerName || `Customer (${customerPhone.slice(-4)})`;
    const booking = await createBookingInStore({
      customerName: resolvedName,
      customerPhone,
      pickupCity,
      deliveryCity,
      pickupLat: body.pickupLat,
      pickupLng: body.pickupLng,
      deliveryLat: body.deliveryLat,
      deliveryLng: body.deliveryLng,
      date,
      dates,
      startTime: cleanStartTime || undefined,
      endTime: cleanEndTime || undefined,
      vehicleType,
      packageDetails,
      assignedPlate: body.assignedPlate,
      assignedLorryId: body.assignedLorryId,
      assignedDriverId: assignedDriverId || undefined,
      assignedDriverName: assignedDriverName || undefined,
      assignedDriverPhone: assignedDriverPhone || undefined,
      bookingType,
      cargoNature: body.cargoNature,
      daysNeeded: body.daysNeeded || (dates ? dates.length : 1),
      cargoWeight: body.cargoWeight || body.weight,
      helpersCount: body.helpersCount,
      status,
      quotedAmount: typeof body.quotedAmount === "number" ? body.quotedAmount : undefined,
      advanceAmount: typeof body.advanceAmount === "number" ? body.advanceAmount : undefined,
      pendingAmount: typeof body.pendingAmount === "number" ? body.pendingAmount : undefined,
      paymentMethod: body.paymentMethod,
      paymentSlipStatus: body.paymentSlipStatus,
      waypoints: Array.isArray(body.waypoints) ? body.waypoints : undefined,
      travelRoute: body.travelRoute,
      driverTripStatus: body.driverTripStatus,
      rideStartedAt: typeof body.rideStartedAt === "number" ? body.rideStartedAt : undefined,
      rideEndedAt: typeof body.rideEndedAt === "number" ? body.rideEndedAt : undefined,
    });

    try {
      const docRef = doc(db, "bookings", booking.id);
      const cleanBookingPayload = Object.fromEntries(
        Object.entries({
          ...booking,
          trackingId: booking.id,
          phone: booking.customerPhone,
          pickup: booking.pickupCity,
          destination: booking.deliveryCity,
          notes: booking.packageDetails || "",
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        }).filter(([, val]) => val !== undefined)
      );
      await setDoc(docRef, cleanBookingPayload, { merge: true });
    } catch (e) {
      console.warn("Firestore booking sync notice:", e);
    }

    return NextResponse.json({ success: true, booking });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create booking";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await authorize("admin", "driver");
  if (!auth.ok) return deniedResponse(auth.denied);
  if (auth.session.role === "driver") {
    // Drivers may only record the route of a trip that is theirs and in progress
    const body = await request.clone().json().catch(() => ({}));
    const permitted = ["id", "status", "driverTripStatus", "waypoints", "travelRoute"];
    const limited =
      body.status === "in_transit" &&
      [undefined, "in_transit"].includes(body.driverTripStatus) &&
      Object.keys(body).every((key) => permitted.includes(key));
    if (!limited || !(await driverOwnsBooking(auth.session, String(body.id || "")))) {
      return deniedResponse(FORBIDDEN);
    }
  }
  try {
    const body = await request.json();
    const {
      id,
      status,
      assignedLorryId,
      assignedDriverId,
      assignedDriverName,
      assignedDriverPhone,
      assignedPlate,
      date,
      dates,
      startTime,
      endTime,
      quotedAmount,
      quoteNote,
      paymentMethod,
      paymentSlipStatus,
      paymentRejectReason,
      driverTripStatus,
      rideStartedAt,
      rideEndedAt,
      waypoints,
      travelRoute,
      actualDistanceKm,
      cancelReason,
    } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Booking ID and status are required." },
        { status: 400 }
      );
    }

    if (status === "cancelled") {
      const result = await updateBookingStatusAction(String(id), "cancelled", {
        cancelReason: String(cancelReason || ""),
      });
      return result.success
        ? NextResponse.json({ success: true, booking: result.data })
        : NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    const validDriverId =
      typeof assignedDriverId === "string" && assignedDriverId.trim() !== ""
        ? assignedDriverId.trim()
        : undefined;
    const validDriverName = cleanRiderName(assignedDriverName) || undefined;
    const validDriverPhone =
      typeof assignedDriverPhone === "string" && assignedDriverPhone.trim() !== ""
        ? assignedDriverPhone.trim()
        : undefined;
    const cleanDate = typeof date === "string" && date.trim() !== "" ? date.trim() : undefined;
    const cleanDates = Array.isArray(dates) && dates.length > 0 ? dates : undefined;
    let cleanStartTime = typeof startTime === "string" && startTime.trim() !== "" ? startTime.trim() : undefined;
    let cleanEndTime = typeof endTime === "string" && endTime.trim() !== "" ? endTime.trim() : undefined;

    const allStored = await getCombinedBookingsForSchedule();
    const currentBooking = allStored.find((b) => b.id === id);
    const isIndividual = (currentBooking?.bookingType || "individual_vehicle") !== "live_lorry";

    if (isIndividual && status !== "cancelled" && status !== "delivered") {
      const mergedDate = cleanDate || (cleanDates && cleanDates[0]) || currentBooking?.date || "";
      const mergedDates = cleanDates || (cleanDate ? [cleanDate] : currentBooking?.dates) || (mergedDate ? [mergedDate] : []);
      const mergedStartTime = cleanStartTime || currentBooking?.startTime || "";
      const mergedEndTime = cleanEndTime || currentBooking?.endTime || "";
      const mergedPlate = assignedPlate || currentBooking?.assignedPlate || "";
      const mergedLorryId = assignedLorryId || currentBooking?.assignedLorryId || "";
      const mergedDriverId = validDriverId || currentBooking?.assignedDriverId || "";
      const mergedDriverName = validDriverName || cleanRiderName(currentBooking?.assignedDriverName);
      const mergedDriverPhone = validDriverPhone || currentBooking?.assignedDriverPhone || "";

      const schedulingActive =
        Boolean(cleanStartTime || cleanEndTime) ||
        Boolean(mergedStartTime || mergedEndTime) ||
        ["accepted", "booked", "assigned", "in_transit"].includes(status);

      if (schedulingActive) {
        const timeCheck = validateTimeRange(mergedStartTime, mergedEndTime);
        if (!timeCheck.valid) {
          return NextResponse.json({ success: false, error: timeCheck.error }, { status: 400 });
        }
        cleanStartTime = timeCheck.startTime;
        cleanEndTime = timeCheck.endTime;

        if (
          !hasAssignedRider({
            assignedDriverId: mergedDriverId,
            assignedDriverName: mergedDriverName,
            assignedDriverPhone: mergedDriverPhone,
          })
        ) {
          return NextResponse.json(
            { success: false, error: "A Rider must be assigned to this booking." },
            { status: 400 }
          );
        }

        const conflict = findBookingScheduleConflict(
          {
            excludeBookingId: id,
            date: mergedDate,
            dates: mergedDates,
            startTime: cleanStartTime,
            endTime: cleanEndTime,
            assignedPlate: mergedPlate,
            assignedLorryId: mergedLorryId,
            assignedDriverId: mergedDriverId,
            assignedDriverName: mergedDriverName,
            assignedDriverPhone: mergedDriverPhone,
            bookingType: currentBooking?.bookingType || "individual_vehicle",
          },
          allStored
        );
        if (conflict.hasConflict) {
          return NextResponse.json(
            { success: false, error: conflict.message || "Schedule conflict detected." },
            { status: 409 }
          );
        }
      }
    }

    const paymentPatch = {
      ...(typeof quotedAmount === "number" ? { quotedAmount, quotedAt: Date.now() } : {}),
      ...(quoteNote !== undefined ? { quoteNote: String(quoteNote) } : {}),
      ...(paymentMethod !== undefined ? { paymentMethod } : {}),
      ...(paymentSlipStatus !== undefined ? { paymentSlipStatus } : {}),
      ...(paymentRejectReason !== undefined ? { paymentRejectReason: String(paymentRejectReason) } : {}),
      ...(status === "accepted" && (paymentSlipStatus === "approved" || paymentSlipStatus === "manual_approved")
        ? { paymentApprovedAt: Date.now() }
        : {}),
    };

    let updated = await updateBookingStatusInStore(
      id,
      status,
      {
        assignedLorryId,
        assignedDriverId: validDriverId,
        assignedDriverName: validDriverName,
        assignedDriverPhone: validDriverPhone,
        assignedPlate,
        date: cleanDate,
        dates: cleanDates,
        startTime: cleanStartTime,
        endTime: cleanEndTime,
      },
      paymentPatch
    );

    const updateFields: Record<string, any> = {
      id,
      trackingId: id,
      status,
      ...paymentPatch,
      updatedAt: Date.now(),
    };
    if (assignedLorryId !== undefined && assignedLorryId !== "") updateFields.assignedLorryId = assignedLorryId;
    if (validDriverId !== undefined) updateFields.assignedDriverId = validDriverId;
    if (validDriverName !== undefined) updateFields.assignedDriverName = validDriverName;
    if (validDriverPhone !== undefined) updateFields.assignedDriverPhone = validDriverPhone;
    if (assignedPlate !== undefined && assignedPlate !== "") updateFields.assignedPlate = assignedPlate;
    if (cleanDate !== undefined) updateFields.date = cleanDate;
    if (cleanDates !== undefined) updateFields.dates = cleanDates;
    if (cleanStartTime !== undefined) updateFields.startTime = cleanStartTime;
    if (cleanEndTime !== undefined) updateFields.endTime = cleanEndTime;
    if (driverTripStatus !== undefined) updateFields.driverTripStatus = driverTripStatus;
    if (rideStartedAt !== undefined) updateFields.rideStartedAt = rideStartedAt;
    if (rideEndedAt !== undefined) updateFields.rideEndedAt = rideEndedAt;
    if (Array.isArray(waypoints)) updateFields.waypoints = waypoints;
    if (travelRoute !== undefined) updateFields.travelRoute = travelRoute;
    if (actualDistanceKm !== undefined) updateFields.actualDistanceKm = actualDistanceKm;

    if (updated) {
      await updateBookingInStore(id, {
        ...(driverTripStatus !== undefined ? { driverTripStatus } : {}),
        ...(rideStartedAt !== undefined ? { rideStartedAt } : {}),
        ...(rideEndedAt !== undefined ? { rideEndedAt } : {}),
        ...(Array.isArray(waypoints) ? { waypoints } : {}),
        ...(travelRoute !== undefined ? { travelRoute } : {}),
        ...(actualDistanceKm !== undefined ? { actualDistanceKm } : {}),
      });
    }

    try {
      const docRef = doc(db, "bookings", id);
      if (!updated) {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          updated = await upsertBookingInStore({
            id,
            customerName: data.customerName || data.name || "Customer",
            customerPhone: String(data.customerPhone || data.phone || "").trim(),
            pickupCity: data.pickupCity || data.pickup || "",
            deliveryCity: data.deliveryCity || data.destination || "",
            date: data.date || (Array.isArray(data.dates) && data.dates[0]) || todayYmd(),
            dates: Array.isArray(data.dates) && data.dates.length > 0 ? data.dates : undefined,
            vehicleType: data.vehicleType || "Lorry",
            packageDetails: data.packageDetails || data.notes || "",
            status,
            assignedLorryId: assignedLorryId || data.assignedLorryId || "",
            assignedDriverName: validDriverName || isRealDriverName(data.assignedDriverName) || "",
            assignedDriverPhone: validDriverPhone || String(data.assignedDriverPhone || "").trim() || "",
            assignedPlate: assignedPlate || data.assignedPlate || "",
            bookingType: data.bookingType || "individual_vehicle",
            cargoNature: data.cargoNature || "",
            daysNeeded: data.daysNeeded || 1,
            cargoWeight: data.cargoWeight || "",
            helpersCount: data.helpersCount ?? "0",
            createdAt: Number(data.createdAt) || Date.now(),
            updatedAt: Date.now(),
          });
        }
      }
      await setDoc(docRef, updateFields, { merge: true });
      const legacySnap = await getDocs(
        query(collection(db, "bookings"), where("trackingId", "==", id))
      );
      for (const d of legacySnap.docs) {
        if (d.id !== id) {
          await updateDoc(doc(db, "bookings", d.id), updateFields);
        }
      }
      await closeDispatchesForBooking(id, status);
      await syncHireCommission(id);
      await refreshVehicleTripState(assignedPlate || updated?.assignedPlate || currentBooking?.assignedPlate);
    } catch (e) {
      console.warn("Firestore booking status sync notice:", e);
    }

    return NextResponse.json({ success: true, booking: updated || { id, status } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update booking";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await authorize("admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const reason = searchParams.get("reason") || "";
  // Same path as the dashboard: no reason, no deletion; the reason is kept
  const result = await deleteBookingAction(id, reason, undefined, "API");
  return result.success
    ? NextResponse.json({ success: true, deletedId: id })
    : NextResponse.json({ success: false, error: result.error }, { status: 400 });
}
