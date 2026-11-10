import { NextResponse } from "next/server";
import {
  getAllStoredBookings,
  getBookingsByCustomerPhone,
  createBookingInStore,
  updateBookingStatusInStore,
  upsertBookingInStore,
} from "@/lib/server-store";
import { normalizePhoneNumber, phonesMatch } from "@/lib/phone-utils";
import { db } from "@/lib/firebase";
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, query, where } from "firebase/firestore";

function isRealDriverName(val: unknown): string {
  const s = String(val || "").trim();
  return s && s !== "Driver" && s !== "Unassigned" ? s : "";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone")?.trim() || "";

  try {
    const [snap, dispSnap, drvSnap] = await Promise.all([
      getDocs(collection(db, "bookings")),
      getDocs(collection(db, "dispatches")).catch(() => null),
      getDocs(collection(db, "drivers")).catch(() => null),
    ]);

    const dispByBooking = new Map<string, { driverId: string; driverName: string; driverPhone: string; assignedPlate: string }>();
    if (dispSnap) {
      dispSnap.forEach((d) => {
        const dd = d.data();
        const bid = String(dd.bookingId || (d.id.startsWith("dispatch-") ? d.id.replace(/^dispatch-/, "") : "")).trim();
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

    const driversById = new Map<string, { name: string; phone: string }>();
    const driversByPlate = new Map<string, { name: string; phone: string }>();
    if (drvSnap) {
      drvSnap.forEach((d) => {
        const dd = d.data();
        const dName = isRealDriverName(dd.name);
        const dPhone = String(dd.phone || "").trim();
        if (!dName && !dPhone) return;
        const idKey = String(dd.driverId || d.id).trim().toUpperCase();
        if (idKey) driversById.set(idKey, { name: dName, phone: dPhone });
        const pKey = String(dd.plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (pKey) driversByPlate.set(pKey, { name: dName, phone: dPhone });
      });
    }

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
        new Date(data.createdAt || Date.now()).toISOString().split("T")[0];
      const resolvedDates =
        Array.isArray(data.dates) && data.dates.length > 0
          ? data.dates
          : resolvedDate
          ? [resolvedDate]
          : [];

      const disp = dispByBooking.get(resolvedId);
      const rawPlate = String(data.assignedPlate || data.selectedVehiclePlate || disp?.assignedPlate || "").trim();
      const plateKey = rawPlate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const matchedDrv =
        (disp?.driverId ? driversById.get(disp.driverId.toUpperCase()) : undefined) ||
        (plateKey ? driversByPlate.get(plateKey) : undefined);

      const statusVal = String(data.status || "pending");
      const bookingTypeVal = data.bookingType || "individual_vehicle";
      const allowDriverFallback =
        ["assigned", "in_transit", "delivered"].includes(statusVal) ||
        bookingTypeVal === "live_lorry";

      const cleanDrvName =
        isRealDriverName(data.assignedDriverName) ||
        (allowDriverFallback ? disp?.driverName || matchedDrv?.name || "" : "");
      const cleanDrvPhone =
        String(data.assignedDriverPhone || "").trim() ||
        (allowDriverFallback ? disp?.driverPhone || matchedDrv?.phone || "" : "");

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
        vehicleType: data.vehicleType || "Lorry",
        packageDetails: data.packageDetails || data.notes || "",
        status: statusVal,
        assignedLorryId: data.assignedLorryId || "",
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
      ? getBookingsByCustomerPhone(phone)
      : getAllStoredBookings();
    return NextResponse.json({ success: true, bookings: localBookings });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const customerName = (body.customerName || body.name || "Customer").toString().trim();
    const rawPhone = (body.customerPhone || body.phone || "").toString().trim();
    const customerPhone = normalizePhoneNumber(rawPhone) || rawPhone;
    const pickupCity = (body.pickupCity || body.pickup || "").toString().trim();
    const deliveryCity = (body.deliveryCity || body.destination || "").toString().trim();
    const dates = Array.isArray(body.dates) && body.dates.length > 0 ? body.dates : undefined;
    const date = (body.date || (dates && dates[0]) || new Date().toISOString().split("T")[0]).toString().trim();
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

    const resolvedName = customerName || `Customer (${customerPhone.slice(-4)})`;
    const booking = createBookingInStore({
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
      vehicleType,
      packageDetails,
      assignedPlate: body.assignedPlate,
      assignedLorryId: body.assignedLorryId,
      bookingType: body.bookingType || "individual_vehicle",
      cargoNature: body.cargoNature,
      daysNeeded: body.daysNeeded || (dates ? dates.length : 1),
      cargoWeight: body.cargoWeight || body.weight,
      helpersCount: body.helpersCount,
      status: body.status || "pending",
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
  try {
    const body = await request.json();
    const {
      id,
      status,
      assignedLorryId,
      assignedDriverName,
      assignedDriverPhone,
      assignedPlate,
      quotedAmount,
      quoteNote,
      paymentMethod,
      paymentSlipStatus,
      paymentRejectReason,
    } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Booking ID and status are required." },
        { status: 400 }
      );
    }

    const validDriverName =
      typeof assignedDriverName === "string" &&
      assignedDriverName.trim() !== "" &&
      assignedDriverName.trim() !== "Driver" &&
      assignedDriverName.trim() !== "Unassigned"
        ? assignedDriverName.trim()
        : undefined;
    const validDriverPhone =
      typeof assignedDriverPhone === "string" && assignedDriverPhone.trim() !== ""
        ? assignedDriverPhone.trim()
        : undefined;

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

    let updated = updateBookingStatusInStore(
      id,
      status,
      {
        assignedLorryId,
        assignedDriverName: validDriverName,
        assignedDriverPhone: validDriverPhone,
        assignedPlate,
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
    if (validDriverName !== undefined) updateFields.assignedDriverName = validDriverName;
    if (validDriverPhone !== undefined) updateFields.assignedDriverPhone = validDriverPhone;
    if (assignedPlate !== undefined && assignedPlate !== "") updateFields.assignedPlate = assignedPlate;

    try {
      const docRef = doc(db, "bookings", id);
      if (!updated) {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          updated = upsertBookingInStore({
            id,
            customerName: data.customerName || data.name || "Customer",
            customerPhone: String(data.customerPhone || data.phone || "").trim(),
            pickupCity: data.pickupCity || data.pickup || "",
            deliveryCity: data.deliveryCity || data.destination || "",
            date: data.date || (Array.isArray(data.dates) && data.dates[0]) || new Date().toISOString().split("T")[0],
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
    } catch (e) {
      console.warn("Firestore booking status sync notice:", e);
    }

    return NextResponse.json({ success: true, booking: updated || { id, status } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update booking";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
