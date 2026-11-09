"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StoredBooking,
  BookingStatusValue,
  PaymentSlipStatus,
  BookingPaymentMethod,
  StoredRegistration,
  StoredInquiry,
} from "@/lib/server-store";
import { normalizePlate } from "@/lib/phone-utils";
import {
  BankAccountSetting,
  PaymentSlipRecord,
  subscribePaymentBankAccounts,
  savePaymentBankAccounts,
  subscribePaymentSlipMetadataList,
  fetchPaymentSlipFromDb,
  deletePaymentSlipFromDb,
  dataUrlToBlobUrl,
} from "@/lib/payment-settings";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import {
  subscribeFleetVehicles,
  subscribeAdminDrivers,
  saveAdminFleetVehicle,
  deleteAdminFleetVehicle,
  saveAdminRider,
  deleteAdminRider,
  toggleAdminRiderStatus,
  AdminDriverRecord,
} from "@/lib/db-services";
import { Lorry } from "@/lib/mock-lorries";
import { BookingCalendar } from "@/components/BookingCalendar";
import {
  createBookingAction,
  updateBookingStatusAction,
  BookedDateDetail,
  getAllBookingsAction,
  getAllRegistrationsAction,
  updateRegistrationStatusAction,
  approveRegistrationAndAddToFleetAction,
  getAllInquiriesAction,
  updateInquiryStatusAction,
} from "@/actions";

const ADMIN_PIN = "ST@2024";

type NavSection =
  | "overview"
  | "individual_bookings"
  | "online_bookings"
  | "vehicle_registrations"
  | "contact_submissions"
  | "fleet"
  | "riders"
  | "settings";
type BookingStatus = BookingStatusValue;
type StatusFilter = "all" | "pending" | "awaiting_payment" | "payment_submitted" | "accepted" | "assigned" | "completed";

interface AssignModalState {
  booking: StoredBooking;
  lorryId: string;
  driverName: string;
  driverPhone: string;
  plate: string;
}

interface ManualBookingForm {
  plate: string;
  vehicleType: string;
  customerName: string;
  customerPhone: string;
  pickupCity: string;
  deliveryCity: string;
  date: string;
  dates: string[];
  cargoNature: string;
  cargoWeight: string;
  helpersCount: string;
  notes: string;
}

interface LorryFormState {
  plate: string;
  vehicleType: string;
  capacity: string;
  maxWeight: string;
  baseCity: string;
  description: string;
  rider: string;
  images: string[];
}

interface RiderFormState {
  driverId: string;
  name: string;
  phone: string;
  nic: string;
  plate: string;
  vehicleType: string;
  route: string;
  active: boolean;
}

const CARGO_NATURE_OPTIONS = [
  "Furniture / Household Goods (ගෘහ භාණ්ඩ)",
  "Commercial / Produce / Agriculture (කෘෂිකාර්මික / අස්වනු)",
  "Hardware & Construction (ඉදිකිරීම් ද්‍රව්‍ය)",
  "Machinery & Industrial (කාර්මික යන්ත්‍රෝපකරණ)",
  "Fragile Items / Glassware (බිඳෙනසුලු භාණ්ඩ)",
  "Garments & Textiles (ඇඟලුම් නිෂ්පාදන)",
  "General Cargo / Other (සාමාන්‍ය භාණ්ඩ)",
];

const VEHICLE_TYPE_OPTIONS = [
  "14.5ft Demountable Box Lorry",
  "14ft Closed Canter Lorry",
  "10ft Small Tipper Lorry",
  "14ft Open Dropside Lorry",
  "16.5ft Medium Freight Truck",
  "20ft Flatbed Container Lorry",
  "Freezer / Refrigerated Truck",
  "24ft Heavy Cargo Carrier",
];

const DURATION_OPTIONS = [
  { value: "1", label: "1 Day (දින 1)" },
  { value: "2", label: "2 Days (දින 2)" },
  { value: "3", label: "3 Days (දින 3)" },
  { value: "4", label: "4 Days (දින 4)" },
  { value: "5", label: "5 Days (දින 5)" },
  { value: "7", label: "1 Week (සතියක්)" },
];

function formatBookingDateTime(ts?: number): { date: string; time: string; display: string } | null {
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

export default function MasterAdminDashboard() {
  // ---- Auth Gate ----
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  // ---- Navigation State ----
  const [activeNav, setActiveNav] = useState<NavSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // ---- Section Data States ----
  const [bookings, setBookings] = useState<StoredBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [individualSearch, setIndividualSearch] = useState("");
  const [expandedIndividualBookings, setExpandedIndividualBookings] = useState<Record<string, boolean>>({});
  const [bookingViewSubTab, setBookingViewSubTab] = useState<"list" | "calendar">("list");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ---- Vehicle Registrations State ----
  const [registrations, setRegistrations] = useState<
    (StoredRegistration & { plateNumber?: string; baseCity?: string; updatedAt?: number })[]
  >([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(true);
  const [regFilter, setRegFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [regSearch, setRegSearch] = useState("");
  const [regActionId, setRegActionId] = useState<string | null>(null);

  // ---- Contact Inquiries State ----
  const [inquiries, setInquiries] = useState<(StoredInquiry & { type?: string })[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(true);
  const [inquiryFilter, setInquiryFilter] = useState<"all" | "unread" | "resolved">("all");
  const [inquirySearch, setInquirySearch] = useState("");
  const [inquiryActionId, setInquiryActionId] = useState<string | null>(null);

  const toggleIndividualBookingCard = (bookingId: string, currentExpanded: boolean) => {
    setExpandedIndividualBookings((prev) => ({
      ...prev,
      [bookingId]: !currentExpanded,
    }));
  };

  // ---- Fleet Vehicles State ----
  const [fleetVehicles, setFleetVehicles] = useState<Lorry[]>([]);
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [showLorryModal, setShowLorryModal] = useState(false);
  const [editingLorryPlate, setEditingLorryPlate] = useState<string | null>(null);
  const [lorrySearch, setLorrySearch] = useState("");
  const [lorryForm, setLorryForm] = useState<LorryFormState>({
    plate: "",
    vehicleType: VEHICLE_TYPE_OPTIONS[0],
    capacity: "14.5ft × 6.5ft × 7ft Cargo Space",
    maxWeight: "3.5 Tons (3,500 kg)",
    baseCity: "Peliyagoda / Colombo",
    description: "Dedicated fleet lorry available for individual bookings across Sri Lanka.",
    rider: "Unassigned",
    images: [],
  });
  const [lorrySubmitting, setLorrySubmitting] = useState(false);

  // ---- Riders / Drivers State ----
  const [drivers, setDrivers] = useState<AdminDriverRecord[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [showRiderModal, setShowRiderModal] = useState(false);
  const [riderSearch, setRiderSearch] = useState("");
  const [riderForm, setRiderForm] = useState<RiderFormState>({
    driverId: "",
    name: "",
    phone: "",
    nic: "",
    plate: "",
    vehicleType: VEHICLE_TYPE_OPTIONS[0],
    route: "Colombo – Island-wide",
    active: true,
  });
  const [riderSubmitting, setRiderSubmitting] = useState(false);

  // ---- Assign Modal ----
  const [assignModal, setAssignModal] = useState<AssignModalState | null>(null);

  // ---- Payment Quote, Slip Review, Manual Progress & Bank Settings State ----
  const [quoteInputs, setQuoteInputs] = useState<Record<string, { amount: string; note: string }>>({});
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [manualStageDraft, setManualStageDraft] = useState<Record<string, BookingStatus>>({});
  const [bankAccounts, setBankAccounts] = useState<BankAccountSetting[]>([]);
  const [savingBankSettings, setSavingBankSettings] = useState(false);
  const [storedSlips, setStoredSlips] = useState<Omit<PaymentSlipRecord, "dataUrl">[]>([]);
  const [reviewModal, setReviewModal] = useState<{
    booking?: StoredBooking;
    slipMeta?: Omit<PaymentSlipRecord, "dataUrl">;
    slip: PaymentSlipRecord | null;
    loading: boolean;
    error: string;
    blobUrl: string;
    rejectReason: string;
  } | null>(null);

  // ---- Manual Booking Modal ----
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState<ManualBookingForm>({
    plate: "",
    vehicleType: "",
    customerName: "",
    customerPhone: "",
    pickupCity: "",
    deliveryCity: "",
    date: new Date().toISOString().split("T")[0],
    dates: [new Date().toISOString().split("T")[0]],
    cargoNature: CARGO_NATURE_OPTIONS[0],
    cargoWeight: "",
    helpersCount: "0",
    notes: "",
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [modalBookedDates, setModalBookedDates] = useState<string[]>([]);
  const [modalBookingsByDate, setModalBookingsByDate] = useState<Record<string, BookedDateDetail>>({});
  const [modalCalendarLoading, setModalCalendarLoading] = useState(false);

  const loadModalBookedDates = useCallback((plate: string) => {
    const cleanNorm = normalizePlate(plate);
    if (!cleanNorm) {
      setModalBookedDates([]);
      setModalBookingsByDate({});
      setModalCalendarLoading(false);
      return;
    }
    if (loadingBookings) {
      setModalCalendarLoading(true);
      return;
    }
    const byDate: Record<string, BookedDateDetail> = {};
    const dates: string[] = [];
    bookings.forEach((b) => {
      const pMatch = b.assignedPlate && normalizePlate(b.assignedPlate) === cleanNorm;
      const isConfirmed = ["accepted", "assigned", "in_transit", "delivered", "booked"].includes(b.status);
      if (pMatch && isConfirmed) {
        const rawDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : (b.date ? [b.date] : []);
        rawDates.forEach((d) => {
          if (d) {
            dates.push(d);
            byDate[d] = {
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
    setModalBookedDates(Array.from(new Set(dates)));
    setModalBookingsByDate(byDate);
    setModalCalendarLoading(false);
  }, [bookings, loadingBookings]);

  useEffect(() => {
    if (showManualModal && manualForm.plate) {
      loadModalBookedDates(manualForm.plate);
    }
  }, [showManualModal, manualForm.plate, loadModalBookedDates]);

  const handleOpenManualModal = () => {
    const defaultPlate = selectedCalendarVehicle?.plate || fleetVehicles[0]?.plate || "";
    const matched = fleetVehicles.find((v) => v.plate === defaultPlate);
    setManualForm({
      plate: defaultPlate,
      vehicleType: (matched && matched.vehicleType) ? matched.vehicleType : "Lorry",
      customerName: "",
      customerPhone: "",
      pickupCity: "",
      deliveryCity: "",
      date: "",
      dates: [],
      cargoNature: CARGO_NATURE_OPTIONS[0],
      cargoWeight: "",
      helpersCount: "0",
      notes: "",
    });
    if (defaultPlate) {
      loadModalBookedDates(defaultPlate);
    } else {
      setModalBookedDates([]);
      setModalBookingsByDate({});
    }
    setShowManualModal(true);
  };

  // ---- Calendar Selected Vehicle ----
  const [selectedCalendarVehicle, setSelectedCalendarVehicle] = useState<Lorry | null>(null);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [vehicleBookedDates, setVehicleBookedDates] = useState<string[]>([]);
  const [vehicleBookingsByDate, setVehicleBookingsByDate] = useState<Record<string, BookedDateDetail>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);

  const unsubBookingsRef = useRef<(() => void) | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSignOut = () => {
    setBookings([]);
    setFleetVehicles([]);
    setDrivers([]);
    setRegistrations([]);
    setInquiries([]);
    setSelectedCalendarVehicle(null);
    setLoadingBookings(true);
    setLoadingFleet(true);
    setLoadingDrivers(true);
    setLoadingRegistrations(true);
    setLoadingInquiries(true);
    setAuthed(false);
  };

  // ---- Realtime Subscriptions ----
  useEffect(() => {
    if (!authed) {
      setFleetVehicles([]);
      setDrivers([]);
      setRegistrations([]);
      setInquiries([]);
      setSelectedCalendarVehicle(null);
      setLoadingFleet(true);
      setLoadingDrivers(true);
      setLoadingRegistrations(true);
      setLoadingInquiries(true);
      return;
    }

    setLoadingFleet(true);
    setLoadingDrivers(true);
    setLoadingRegistrations(true);
    setLoadingInquiries(true);

    const unsubFleet = subscribeFleetVehicles((vehicles) => {
      setFleetVehicles(vehicles);
      setSelectedCalendarVehicle((prev) =>
        prev
          ? vehicles.find((v) => v.plate === prev.plate) || vehicles[0] || null
          : vehicles[0] || null
      );
      setLoadingFleet(false);
    });

    const unsubDrivers = subscribeAdminDrivers((drvs) => {
      setDrivers(drvs);
      setLoadingDrivers(false);
    });

    const unsubBankAccounts = subscribePaymentBankAccounts((accs) => {
      setBankAccounts(accs);
    });

    const unsubSlipsMeta = subscribePaymentSlipMetadataList((slips) => {
      setStoredSlips(slips);
    });

    const unsubRegistrations = onSnapshot(
      collection(db, "vehicle_registrations"),
      (snap) => {
        const list: (StoredRegistration & { plateNumber?: string; baseCity?: string; updatedAt?: number })[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            ownerName: String(data.ownerName || ""),
            phone: String(data.phone || ""),
            plateNumber: String(data.plateNumber || data.vehicleNumber || ""),
            vehicleNumber: String(data.vehicleNumber || data.plateNumber || ""),
            vehicleType: String(data.vehicleType || "Lorry"),
            baseCity: String(data.baseCity || ""),
            capacity: String(data.capacity || ""),
            province: String(data.province || ""),
            status: (data.status as "pending" | "approved" | "rejected") || "pending",
            createdAt: Number(data.createdAt) || Date.now(),
            updatedAt: Number(data.updatedAt) || Date.now(),
          });
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setRegistrations(list);
        setLoadingRegistrations(false);
      },
      async (err) => {
        console.warn("Firestore vehicle_registrations subscription notice:", err);
        const res = await getAllRegistrationsAction();
        if (res.success && res.data) {
          setRegistrations(res.data);
        }
        setLoadingRegistrations(false);
      }
    );

    const unsubInquiries = onSnapshot(
      collection(db, "inquiries"),
      (snap) => {
        const list: (StoredInquiry & { type?: string })[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: String(data.id || d.id),
            name: String(data.name || ""),
            phone: String(data.phone || ""),
            email: data.email || "",
            subject: String(data.subject || "General Inquiry"),
            message: String(data.message || ""),
            type: data.type || "general",
            status: (data.status as "unread" | "resolved") || "unread",
            createdAt: Number(data.createdAt) || Date.now(),
          });
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setInquiries(list);
        setLoadingInquiries(false);
      },
      async (err) => {
        console.warn("Firestore inquiries subscription notice:", err);
        const res = await getAllInquiriesAction();
        if (res.success && res.data) {
          setInquiries(res.data);
        }
        setLoadingInquiries(false);
      }
    );

    return () => {
      unsubFleet();
      unsubDrivers();
      unsubBankAccounts();
      unsubSlipsMeta();
      unsubRegistrations();
      unsubInquiries();
    };
  }, [authed]);

  // ---- Bookings Realtime Subscription (Single Authoritative Firestore Stream) ----
  const loadBookingsFromStore = useCallback(async () => {
    try {
      const res = await getAllBookingsAction();
      if (res.success && Array.isArray(res.data)) {
        setBookings(res.data);
      }
    } catch {}
    setLoadingBookings(false);
  }, []);

  const subscribeBookingsRealtime = useCallback(() => {
    setLoadingBookings(true);
    const colRef = collection(db, "bookings");
    return onSnapshot(
      colRef,
      (snap) => {
        const items: StoredBooking[] = [];
        const seenIds = new Set<string>();
        snap.forEach((d) => {
          const data = d.data();
          const resolvedId = data.id || data.trackingId || d.id;
          if (seenIds.has(resolvedId)) return;
          seenIds.add(resolvedId);
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
          items.push({
            id: resolvedId,
            customerName: data.customerName || data.name || "Customer",
            customerPhone: data.customerPhone || data.phone || "",
            pickupCity: data.pickupCity || data.pickup || "",
            deliveryCity: data.deliveryCity || data.destination || "",
            pickupLat: data.pickupLat,
            pickupLng: data.pickupLng,
            deliveryLat: data.deliveryLat,
            deliveryLng: data.deliveryLng,
            date: resolvedDate,
            dates: resolvedDates,
            vehicleType: data.vehicleType || "Lorry",
            bookingType: (data.bookingType as "individual_vehicle" | "live_lorry") || "live_lorry",
            cargoNature: data.cargoNature || "",
            daysNeeded: data.daysNeeded || resolvedDates.length || "1",
            cargoWeight: data.cargoWeight || "",
            helpersCount: data.helpersCount || "0",
            packageDetails: data.packageDetails || data.notes || "",
            status: (data.status as BookingStatus) || "pending",
            assignedLorryId: data.assignedLorryId || "",
            assignedDriverName:
              data.assignedDriverName &&
              data.assignedDriverName !== "Driver" &&
              data.assignedDriverName !== "Unassigned"
                ? String(data.assignedDriverName).trim()
                : "",
            assignedDriverPhone: String(data.assignedDriverPhone || "").trim(),
            assignedPlate: data.assignedPlate || data.selectedVehiclePlate || "",
            quotedAmount:
              typeof data.quotedAmount === "number" && !Number.isNaN(data.quotedAmount)
                ? data.quotedAmount
                : undefined,
            quotedAt: Number(data.quotedAt) || undefined,
            quoteNote: data.quoteNote ? String(data.quoteNote) : undefined,
            paymentMethod: (data.paymentMethod as BookingPaymentMethod) || undefined,
            paymentBankUsed: data.paymentBankUsed ? String(data.paymentBankUsed) : undefined,
            paymentSlipId: data.paymentSlipId ? String(data.paymentSlipId) : "",
            paymentSlipName: data.paymentSlipName ? String(data.paymentSlipName) : "",
            paymentSlipType: data.paymentSlipType ? String(data.paymentSlipType) : "",
            paymentSlipSize: Number(data.paymentSlipSize) || undefined,
            paymentSlipUploadedAt: Number(data.paymentSlipUploadedAt) || undefined,
            paymentSlipStatus: (data.paymentSlipStatus as PaymentSlipStatus) || "none",
            paymentRejectReason: data.paymentRejectReason ? String(data.paymentRejectReason) : "",
            paymentApprovedAt: Number(data.paymentApprovedAt) || undefined,
            paymentSlipDeletedAt: Number(data.paymentSlipDeletedAt) || undefined,
            createdAt: Number(data.createdAt) || 0,
            updatedAt: Number(data.updatedAt) || Number(data.createdAt) || 0,
          });
        });
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setBookings(items);
        setLoadingBookings(false);
      },
      () => {
        // Offline / Firestore unavailable fallback ONLY
        loadBookingsFromStore();
      }
    );
  }, [loadBookingsFromStore]);

  useEffect(() => {
    if (!authed) {
      setBookings([]);
      setLoadingBookings(true);
      return;
    }
    unsubBookingsRef.current = subscribeBookingsRealtime();
    return () => {
      unsubBookingsRef.current?.();
    };
  }, [authed, subscribeBookingsRealtime]);

  // ---- Vehicle Calendar Loader (Reactive + Manual Sync) ----
  const refreshVehicleCalendar = useCallback(async (plate?: string) => {
    const targetPlateNorm = normalizePlate(plate || selectedCalendarVehicle?.plate);
    if (!targetPlateNorm) return;
    if (loadingBookings) {
      setCalendarLoading(true);
      return;
    }

    // Derive immediately from authoritative live bookings stream
    const byDate: Record<string, BookedDateDetail> = {};
    const dates: string[] = [];
    bookings.forEach((b) => {
      const pMatch = b.assignedPlate && normalizePlate(b.assignedPlate) === targetPlateNorm;
      const isConfirmed = ["accepted", "assigned", "in_transit", "delivered", "booked"].includes(b.status);
      if (pMatch && isConfirmed) {
        const rawDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : (b.date ? [b.date] : []);
        rawDates.forEach((d) => {
          if (d) {
            dates.push(d);
            byDate[d] = {
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
    setVehicleBookedDates(Array.from(new Set(dates)));
    setVehicleBookingsByDate(byDate);
    setCalendarLoading(false);
  }, [selectedCalendarVehicle?.plate, bookings, loadingBookings]);

  useEffect(() => {
    if (!selectedCalendarVehicle?.plate) return;
    if (loadingBookings) {
      setCalendarLoading(true);
      return;
    }
    refreshVehicleCalendar(selectedCalendarVehicle.plate);
  }, [selectedCalendarVehicle?.plate, bookings, loadingBookings, refreshVehicleCalendar]);

  // ---- Update Booking Status ----
  const updateBooking = useCallback(
    async (
      id: string,
      status: BookingStatus,
      assignment?: {
        assignedLorryId?: string;
        assignedDriverName?: string;
        assignedDriverPhone?: string;
        assignedPlate?: string;
      },
      paymentMeta?: {
        quotedAmount?: number;
        quotedAt?: number;
        quoteNote?: string;
        paymentMethod?: BookingPaymentMethod;
        paymentSlipStatus?: PaymentSlipStatus;
        paymentRejectReason?: string;
        paymentApprovedAt?: number;
        paymentSlipDeletedAt?: number;
      }
    ) => {
      setActionLoading(id);
      try {
        const existingBooking = bookings.find((b) => b.id === id);
        let effectiveAssignment = assignment;

        // Only enrich driver details when assigning a driver or approving live_lorry bookings
        if (
          !effectiveAssignment &&
          existingBooking &&
          (status === "assigned" ||
            (status === "accepted" && existingBooking.bookingType === "live_lorry"))
        ) {
          const bPlateNorm = normalizePlate(existingBooking.assignedPlate);
          const bLorryId = (existingBooking.assignedLorryId || "").trim().toLowerCase();
          const matchedFleet = fleetVehicles.find(
            (v) =>
              (bPlateNorm && normalizePlate(v.plate) === bPlateNorm) ||
              (bLorryId && (v.id || "").toLowerCase() === bLorryId)
          );
          const matchedDriver = drivers.find(
            (d) =>
              (bPlateNorm && normalizePlate(d.plate) === bPlateNorm) ||
              (matchedFleet?.driverId && d.driverId === matchedFleet.driverId) ||
              (matchedFleet?.driverName && d.name === matchedFleet.driverName)
          );
          const cleanExistingDriver =
            existingBooking.assignedDriverName &&
            existingBooking.assignedDriverName !== "Driver" &&
            existingBooking.assignedDriverName !== "Unassigned"
              ? existingBooking.assignedDriverName
              : "";
          const cleanFleetDriver =
            matchedFleet?.driverName &&
            matchedFleet.driverName !== "Driver" &&
            matchedFleet.driverName !== "Unassigned"
              ? matchedFleet.driverName
              : "";
          const resolvedDriverName =
            cleanExistingDriver ||
            cleanFleetDriver ||
            matchedDriver?.name ||
            "";
          const resolvedDriverPhone =
            existingBooking.assignedDriverPhone ||
            matchedFleet?.driverPhone ||
            matchedDriver?.phone ||
            "";
          if (resolvedDriverName || resolvedDriverPhone || matchedFleet?.id) {
            effectiveAssignment = {
              assignedLorryId: existingBooking.assignedLorryId || matchedFleet?.id || "",
              assignedPlate: existingBooking.assignedPlate || matchedFleet?.plate || "",
              assignedDriverName: resolvedDriverName,
              assignedDriverPhone: resolvedDriverPhone,
            };
          }
        }

        const actionRes = await updateBookingStatusAction(id, status, effectiveAssignment, paymentMeta);

        if (!actionRes.success) {
          try {
            const docRef = doc(db, "bookings", id);
            await setDoc(
              docRef,
              {
                id,
                trackingId: id,
                status,
                ...(effectiveAssignment || {}),
                ...(paymentMeta || {}),
                updatedAt: Date.now(),
              },
              { merge: true }
            );
          } catch {
            throw new Error(actionRes.error || "Failed to update booking.");
          }
        }

        const updatedFromServer = actionRes.success ? actionRes.data : null;
        setBookings((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  ...(updatedFromServer || {}),
                  status,
                  ...(effectiveAssignment || {}),
                  ...(paymentMeta || {}),
                  updatedAt: updatedFromServer?.updatedAt || Date.now(),
                }
              : b
          )
        );

        if (selectedCalendarVehicle?.plate) {
          refreshVehicleCalendar(selectedCalendarVehicle.plate);
        }

        setManualStageDraft((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });

        showToast(
          status === "awaiting_payment"
            ? "Amount quote sent to customer. Calendar remains open until payment is approved."
            : status === "accepted"
            ? "Payment approved! Calendar date is now locked RED."
            : status === "assigned"
            ? "Driver assigned. Rider phone number is now visible to customer."
            : status === "in_transit"
            ? "Booking marked In Transit."
            : status === "delivered"
            ? "Booking marked Delivered."
            : status === "cancelled"
            ? "Booking cancelled and calendar date freed."
            : "Booking status updated."
        );
      } catch {
        showToast("Failed to update booking. Please retry.", "error");
      } finally {
        setActionLoading(null);
      }
    },
    [bookings, fleetVehicles, drivers, selectedCalendarVehicle?.plate, refreshVehicleCalendar]
  );

  // ---- Payment Quote, Slip Review, Approve & Delete Handlers ----
  const handleSendQuote = async (booking: StoredBooking) => {
    const entry = quoteInputs[booking.id] || {
      amount: booking.quotedAmount ? String(booking.quotedAmount) : "",
      note: booking.quoteNote || "",
    };
    const numericAmount = Number(String(entry.amount || "").replace(/[^0-9.]/g, ""));
    if (!numericAmount || numericAmount <= 0) {
      showToast("Please enter a valid transport amount (LKR).", "error");
      return;
    }

    await updateBooking(booking.id, "awaiting_payment", undefined, {
      quotedAmount: numericAmount,
      quotedAt: Date.now(),
      quoteNote: entry.note.trim(),
    });
    setEditingQuoteId(null);
  };

  const closeReviewModal = () => {
    setReviewModal((prev) => {
      if (prev?.blobUrl && prev.blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(prev.blobUrl);
      }
      return null;
    });
  };

  const openSlipReviewModal = async (
    booking?: StoredBooking,
    slipMeta?: Omit<PaymentSlipRecord, "dataUrl">
  ) => {
    const targetSlipId = slipMeta?.id || booking?.paymentSlipId || "";
    if (!targetSlipId) {
      showToast("No payment slip found in database for this booking.", "error");
      return;
    }
    setReviewModal({
      booking,
      slipMeta,
      slip: null,
      loading: true,
      error: "",
      blobUrl: "",
      rejectReason: booking?.paymentRejectReason || "",
    });
    try {
      const fullSlip = await fetchPaymentSlipFromDb(targetSlipId);
      if (!fullSlip || !fullSlip.dataUrl) {
        setReviewModal((prev) =>
          prev ? { ...prev, loading: false, error: "Slip file could not be loaded or was deleted from database." } : null
        );
        return;
      }
      const isPdf =
        fullSlip.mimeType === "application/pdf" ||
        fullSlip.fileName.toLowerCase().endsWith(".pdf");
      const blobUrl = isPdf ? dataUrlToBlobUrl(fullSlip.dataUrl, "application/pdf") : fullSlip.dataUrl;
      setReviewModal((prev) =>
        prev ? { ...prev, slip: fullSlip, loading: false, blobUrl } : null
      );
    } catch {
      setReviewModal((prev) =>
        prev ? { ...prev, loading: false, error: "Error loading payment slip from Firestore database." } : null
      );
    }
  };

  const handleApproveSlipPayment = async (booking: StoredBooking) => {
    await updateBooking(booking.id, "accepted", undefined, {
      paymentMethod: "bank_slip",
      paymentSlipStatus: "approved",
      paymentApprovedAt: Date.now(),
      paymentRejectReason: "",
    });
    setManualStageDraft((prev) => ({ ...prev, [booking.id]: "accepted" }));
    closeReviewModal();
  };

  const handleManualApprovePayment = async (booking: StoredBooking) => {
    const entry = quoteInputs[booking.id];
    const draftAmount = Number(String(entry?.amount || "").replace(/[^0-9.]/g, ""));
    const finalAmount =
      draftAmount > 0
        ? draftAmount
        : booking.quotedAmount !== undefined && booking.quotedAmount > 0
        ? booking.quotedAmount
        : undefined;
    const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
    const draftNote = (entry?.note || "").trim();
    const resolvedNote =
      draftNote ||
      booking.quoteNote ||
      (hasSlip ? "" : "Cash / Direct payment approved manually by Head Office");

    await updateBooking(booking.id, "accepted", undefined, {
      ...(finalAmount !== undefined
        ? { quotedAmount: finalAmount, quotedAt: booking.quotedAt || Date.now() }
        : {}),
      ...(resolvedNote ? { quoteNote: resolvedNote } : {}),
      paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
      paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
      paymentApprovedAt: Date.now(),
      paymentRejectReason: "",
    });
    setEditingQuoteId(null);
    setManualStageDraft((prev) => ({ ...prev, [booking.id]: "accepted" }));
  };

  const handleManualProgressUpdate = async (booking: StoredBooking) => {
    const targetStatus = manualStageDraft[booking.id] || booking.status;
    if (targetStatus === booking.status) {
      showToast("Select a different progress stage to update.", "error");
      return;
    }

    if (targetStatus === "accepted") {
      await handleManualApprovePayment(booking);
      return;
    }

    if (targetStatus === "awaiting_payment") {
      const entry = quoteInputs[booking.id];
      const draftAmount = Number(String(entry?.amount || "").replace(/[^0-9.]/g, ""));
      const validAmount =
        draftAmount > 0
          ? draftAmount
          : booking.quotedAmount && booking.quotedAmount > 0
          ? booking.quotedAmount
          : 0;
      if (!validAmount) {
        setEditingQuoteId(booking.id);
        showToast("Please enter a valid Amount (LKR) first.", "error");
        return;
      }
      await updateBooking(booking.id, "awaiting_payment", undefined, {
        quotedAmount: validAmount,
        quotedAt: Date.now(),
        quoteNote: (entry?.note ?? booking.quoteNote ?? "").trim(),
      });
      setEditingQuoteId(null);
      return;
    }

    if (targetStatus === "assigned") {
      const hasRealDriver =
        Boolean(booking.assignedDriverName && booking.assignedDriverName !== "Driver" && booking.assignedDriverName !== "Unassigned") &&
        Boolean(booking.assignedDriverPhone);
      if (!hasRealDriver) {
        openAssignModal(booking);
        return;
      }
      const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
      await updateBooking(
        booking.id,
        "assigned",
        {
          assignedLorryId: booking.assignedLorryId,
          assignedDriverName: booking.assignedDriverName,
          assignedDriverPhone: booking.assignedDriverPhone,
          assignedPlate: booking.assignedPlate,
        },
        !booking.paymentApprovedAt
          ? {
              paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
              paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
              paymentApprovedAt: Date.now(),
            }
          : undefined
      );
      return;
    }

    if (targetStatus === "in_transit" || targetStatus === "delivered") {
      const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
      await updateBooking(
        booking.id,
        targetStatus,
        undefined,
        !booking.paymentApprovedAt
          ? {
              paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
              paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
              paymentApprovedAt: Date.now(),
            }
          : undefined
      );
      return;
    }

    if (targetStatus === "pending") {
      const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
      await updateBooking(
        booking.id,
        "pending",
        undefined,
        !hasSlip
          ? { paymentApprovedAt: 0, paymentSlipStatus: "none" }
          : { paymentApprovedAt: 0 }
      );
      return;
    }

    await updateBooking(booking.id, targetStatus);
  };

  const handleRejectSlipRequestReupload = async (booking: StoredBooking, reason: string) => {
    const cleanReason =
      reason.trim() || "Payment slip was unclear or amount mismatched. Please upload a clear slip again.";
    await updateBooking(booking.id, "awaiting_payment", undefined, {
      paymentSlipStatus: "rejected",
      paymentRejectReason: cleanReason,
    });
    closeReviewModal();
    showToast("Slip rejected and customer asked to re-upload.");
  };

  const handleDeleteSlipFromDb = async (bookingId: string, slipId?: string) => {
    setActionLoading(bookingId || slipId || "slip");
    try {
      await deletePaymentSlipFromDb(bookingId, slipId);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                paymentSlipId: "",
                paymentSlipName: "",
                paymentSlipType: "",
                paymentSlipSize: 0,
                paymentSlipStatus: "deleted",
                paymentSlipDeletedAt: Date.now(),
              }
            : b
        )
      );
      closeReviewModal();
      showToast("Payment slip deleted permanently from database.");
    } catch {
      showToast("Failed to delete payment slip from database.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveBankSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBankSettings(true);
    try {
      const saved = await savePaymentBankAccounts(bankAccounts);
      setBankAccounts(saved);
      showToast("Payment bank account settings saved to Firestore database.");
    } catch {
      showToast("Failed to save bank settings.", "error");
    } finally {
      setSavingBankSettings(false);
    }
  };

  // ---- Assign Modal Handlers ----
  const openAssignModal = (booking: StoredBooking) => {
    const bPlateNorm = normalizePlate(booking.assignedPlate);
    const bLorryId = (booking.assignedLorryId || "").trim().toLowerCase();
    const targetLorry =
      fleetVehicles.find(
        (v) =>
          (bPlateNorm && normalizePlate(v.plate) === bPlateNorm) ||
          (bLorryId && (v.id || "").toLowerCase() === bLorryId)
      ) ||
      fleetVehicles[0] ||
      null;
    const matchedDriver = drivers.find(
      (d) =>
        (targetLorry?.plate && normalizePlate(d.plate) === normalizePlate(targetLorry.plate)) ||
        (targetLorry?.driverId && d.driverId === targetLorry.driverId) ||
        (targetLorry?.driverName && d.name === targetLorry.driverName)
    );
    const cleanBookingDriver =
      booking.assignedDriverName &&
      booking.assignedDriverName !== "Driver" &&
      booking.assignedDriverName !== "Unassigned"
        ? booking.assignedDriverName
        : "";
    const cleanLorryDriver =
      targetLorry?.driverName &&
      targetLorry.driverName !== "Driver" &&
      targetLorry.driverName !== "Unassigned"
        ? targetLorry.driverName
        : "";
    const resolvedAssignDriverName =
      cleanBookingDriver ||
      cleanLorryDriver ||
      matchedDriver?.name ||
      drivers[0]?.name ||
      "";
    const resolvedAssignDriverPhone =
      booking.assignedDriverPhone ||
      targetLorry?.driverPhone ||
      matchedDriver?.phone ||
      (resolvedAssignDriverName === drivers[0]?.name ? drivers[0]?.phone : "") ||
      "";
    setAssignModal({
      booking,
      lorryId: targetLorry?.id || booking.assignedLorryId || "",
      driverName: resolvedAssignDriverName,
      driverPhone: resolvedAssignDriverPhone,
      plate: targetLorry?.plate || booking.assignedPlate || matchedDriver?.plate || "",
    });
  };

  const confirmAssign = async () => {
    if (!assignModal) return;
    const b = assignModal.booking;
    const hasSlip = Boolean(b.paymentSlipId && b.paymentSlipStatus !== "deleted");
    await updateBooking(
      b.id,
      "assigned",
      {
        assignedLorryId: assignModal.lorryId,
        assignedDriverName: assignModal.driverName,
        assignedDriverPhone: assignModal.driverPhone,
        assignedPlate: assignModal.plate,
      },
      !b.paymentApprovedAt
        ? {
            paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
            paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
            paymentApprovedAt: Date.now(),
          }
        : undefined
    );
    setManualStageDraft((prev) => ({ ...prev, [b.id]: "assigned" }));
    setAssignModal(null);
  };

  // ---- Manual Booking Creation ----
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phoneClean = String(manualForm.customerPhone || "").replace(/[^0-9]/g, "");
    if (phoneClean.length < 9) {
      showToast("Please enter a valid customer phone number.", "error");
      return;
    }
    if (!manualForm.customerName.trim()) {
      showToast("Customer name is required.", "error");
      return;
    }
    if (!manualForm.pickupCity.trim() || !manualForm.deliveryCity.trim()) {
      showToast("Pickup and delivery locations are required.", "error");
      return;
    }
    if (manualForm.dates.length === 0) {
      showToast("Please select at least one booking date.", "error");
      return;
    }

    const resolvedPlate = manualForm.plate || (selectedCalendarVehicle?.plate || fleetVehicles[0]?.plate || "");
    const matchedVehicle = fleetVehicles.find((v) => v.plate === resolvedPlate);
    const resolvedType = matchedVehicle?.vehicleType || manualForm.vehicleType || "Lorry";

    setManualSubmitting(true);
    try {
      const res = await createBookingAction({
        customerName: manualForm.customerName.trim(),
        phone: manualForm.customerPhone.trim(),
        pickup: manualForm.pickupCity.trim(),
        destination: manualForm.deliveryCity.trim(),
        date: manualForm.dates[0],
        dates: manualForm.dates,
        vehicleType: resolvedType,
        assignedPlate: resolvedPlate,
        assignedLorryId: `lorry-${String(resolvedPlate || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        bookingType: "individual_vehicle",
        cargoNature: manualForm.cargoNature,
        daysNeeded: manualForm.dates.length,
        cargoWeight: manualForm.cargoWeight.trim() || undefined,
        helpersCount: Number(manualForm.helpersCount) || 0,
        status: "accepted",
        notes: manualForm.notes.trim() || undefined,
      });

      if (res.success) {
        if (res.data?.booking) {
          const createdB = res.data.booking;
          setBookings((prev) => [createdB, ...prev.filter((b) => b.id !== createdB.id)]);
        }
        showToast(`Manual booking created successfully. ${manualForm.dates.length} date(s) locked on calendar.`);
        setShowManualModal(false);
        const todayStr = new Date().toISOString().split("T")[0];
        setManualForm({
          plate: resolvedPlate,
          vehicleType: resolvedType,
          customerName: "",
          customerPhone: "",
          pickupCity: "",
          deliveryCity: "",
          date: todayStr,
          dates: [todayStr],
          cargoNature: CARGO_NATURE_OPTIONS[0],
          cargoWeight: "",
          helpersCount: "0",
          notes: "",
        });
        if (resolvedPlate) {
          refreshVehicleCalendar(resolvedPlate);
        }
      } else {
        showToast(res.error || "Failed to create manual booking.", "error");
      }
    } catch {
      showToast("Error creating booking. Please retry.", "error");
    } finally {
      setManualSubmitting(false);
    }
  };

  // ---- Fleet Vehicle Registration & Edit ----
  const handleOpenAddLorry = () => {
    setEditingLorryPlate(null);
    setLorryForm({
      plate: "",
      vehicleType: VEHICLE_TYPE_OPTIONS[0],
      capacity: "14.5ft × 6.5ft × 7ft Cargo Space",
      maxWeight: "3.5 Tons (3,500 kg)",
      baseCity: "Peliyagoda / Colombo",
      description: "Dedicated fleet lorry available for individual bookings across Sri Lanka.",
      rider: drivers[0]?.name || "Unassigned",
      images: [],
    });
    setShowLorryModal(true);
  };

  const handleOpenEditLorry = (v: Lorry) => {
    setEditingLorryPlate(v.plate);
    const existingImgs = Array.isArray((v as any).images)
      ? (v as any).images.filter((img: string) => img && !img.startsWith("/img"))
      : (v.imageUrl && !v.imageUrl.startsWith("/img") ? [v.imageUrl] : []);

    setLorryForm({
      plate: v.plate,
      vehicleType: v.vehicleType || VEHICLE_TYPE_OPTIONS[0],
      capacity: (v as any).capacity || "14.5ft × 6.5ft × 7ft Cargo Space",
      maxWeight: (v as any).maxWeight || "3.5 Tons (3,500 kg)",
      baseCity: v.startLocation || "Peliyagoda / Colombo",
      description: (v as any).description || "",
      rider: v.driverName || "Unassigned",
      images: existingImgs,
    });
    setShowLorryModal(true);
  };

  const handleLorryImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files).slice(0, 3);
    const readers = fileList.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve((event.target?.result as string) || "");
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then((newImages) => {
      const validImages = newImages.filter(Boolean);
      setLorryForm((p) => ({
        ...p,
        images: [...p.images, ...validImages].slice(0, 3),
      }));
    });
  };

  const handleSaveLorry = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPlate = lorryForm.plate.trim().toUpperCase();
    if (!cleanPlate) {
      showToast("Lorry Plate Number is required.", "error");
      return;
    }

    const matchedDriverObj = drivers.find((d) => d.name === lorryForm.rider);
    setLorrySubmitting(true);
    try {
      await saveAdminFleetVehicle({
        plate: cleanPlate,
        vehicleType: lorryForm.vehicleType,
        capacity: lorryForm.capacity,
        maxWeight: lorryForm.maxWeight,
        baseCity: lorryForm.baseCity,
        description: lorryForm.description,
        rider: lorryForm.rider,
        driverId: matchedDriverObj?.driverId || "",
        driverPhone: matchedDriverObj?.phone || "",
        images: lorryForm.images,
        imageUrl: lorryForm.images[0] || "",
      });

      showToast(editingLorryPlate ? "Vehicle updated successfully." : "New vehicle registered into fleet.");
      setShowLorryModal(false);
    } catch {
      showToast("Failed to save fleet vehicle. Please retry.", "error");
    } finally {
      setLorrySubmitting(false);
    }
  };

  const handleDeleteLorry = async (plate: string) => {
    if (!confirm(`Are you sure you want to delete vehicle ${plate} from the fleet?`)) return;
    try {
      await deleteAdminFleetVehicle(plate);
      showToast(`Vehicle ${plate} removed from fleet.`);
      if (selectedCalendarVehicle?.plate === plate) {
        setSelectedCalendarVehicle(null);
      }
    } catch {
      showToast("Failed to delete vehicle.", "error");
    }
  };

  // ---- Rider Registration & Management ----
  const handleOpenAddRider = () => {
    const nextIdNum = Math.floor(1000 + Math.random() * 9000);
    setRiderForm({
      driverId: `ST-DRV-${nextIdNum}`,
      name: "",
      phone: "",
      nic: "",
      plate: fleetVehicles[0]?.plate || "",
      vehicleType: VEHICLE_TYPE_OPTIONS[0],
      route: "Colombo – Island-wide",
      active: true,
    });
    setShowRiderModal(true);
  };

  const handleSaveRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!riderForm.name.trim()) {
      showToast("Rider name is required.", "error");
      return;
    }
    const phoneClean = String(riderForm.phone || "").replace(/[^0-9]/g, "");
    if (phoneClean.length < 9) {
      showToast("Valid mobile phone number is required.", "error");
      return;
    }

    setRiderSubmitting(true);
    try {
      await saveAdminRider({
        driverId: riderForm.driverId,
        name: riderForm.name,
        phone: riderForm.phone,
        nic: riderForm.nic,
        plate: riderForm.plate,
        vehicleType: riderForm.vehicleType,
        route: riderForm.route,
        active: riderForm.active,
      });

      showToast("Rider registered successfully.");
      setShowRiderModal(false);
    } catch {
      showToast("Failed to register rider. Please retry.", "error");
    } finally {
      setRiderSubmitting(false);
    }
  };

  const handleDeleteRider = async (driverId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove rider ${name} (${driverId})?`)) return;
    try {
      await deleteAdminRider(driverId);
      showToast(`Rider ${name} removed.`);
    } catch {
      showToast("Failed to delete rider.", "error");
    }
  };

  const handleToggleRider = async (driverId: string, currentActive: boolean) => {
    try {
      await toggleAdminRiderStatus(driverId, !currentActive);
      showToast(`Rider status set to ${!currentActive ? "Active" : "Inactive"}.`);
    } catch {
      showToast("Failed to update status.", "error");
    }
  };

  // ---- Vehicle Registration Handlers ----
  const handleApproveRegistration = async (
    reg: StoredRegistration & { plateNumber?: string; baseCity?: string; updatedAt?: number }
  ) => {
    setRegActionId(reg.id);
    try {
      const res = await approveRegistrationAndAddToFleetAction(
        reg.id,
        reg.province ? `${reg.province} – Island-wide` : undefined
      );
      if (res.success) {
        showToast("Registration approved & added to active live fleet!", "success");
      } else {
        showToast(res.error || "Failed to approve registration.", "error");
      }
    } catch {
      showToast("An error occurred while approving registration.", "error");
    } finally {
      setRegActionId(null);
    }
  };

  const handleUpdateRegistrationStatus = async (
    id: string,
    status: "pending" | "approved" | "rejected"
  ) => {
    setRegActionId(id);
    try {
      const res = await updateRegistrationStatusAction(id, status);
      if (res.success) {
        showToast(`Registration marked as ${status}.`, "success");
      } else {
        showToast(res.error || "Failed to update registration status.", "error");
      }
    } catch {
      showToast("An error occurred while updating status.", "error");
    } finally {
      setRegActionId(null);
    }
  };

  const handleDeleteRegistration = async (id: string, label: string) => {
    if (!confirm(`Are you sure you want to permanently delete registration for ${label || "this vehicle"}?`)) {
      return;
    }
    setRegActionId(id);
    try {
      await deleteDoc(doc(db, "vehicle_registrations", id));
      setRegistrations((prev) => prev.filter((r) => r.id !== id));
      showToast("Registration deleted successfully.", "success");
    } catch {
      showToast("Failed to delete registration document.", "error");
    } finally {
      setRegActionId(null);
    }
  };

  // ---- Contact Inquiry Handlers ----
  const handleUpdateInquiryStatus = async (
    id: string,
    status: "unread" | "resolved"
  ) => {
    setInquiryActionId(id);
    try {
      const res = await updateInquiryStatusAction(id, status);
      if (res.success) {
        showToast(`Inquiry marked as ${status}.`, "success");
      } else {
        showToast(res.error || "Failed to update inquiry status.", "error");
      }
    } catch {
      showToast("An error occurred while updating inquiry.", "error");
    } finally {
      setInquiryActionId(null);
    }
  };

  const handleDeleteInquiry = async (id: string, senderName: string) => {
    if (!confirm(`Are you sure you want to delete inquiry from ${senderName || "this customer"}?`)) {
      return;
    }
    setInquiryActionId(id);
    try {
      await deleteDoc(doc(db, "inquiries", id));
      setInquiries((prev) => prev.filter((i) => i.id !== id));
      showToast("Inquiry deleted successfully.", "success");
    } catch {
      showToast("Failed to delete inquiry.", "error");
    } finally {
      setInquiryActionId(null);
    }
  };

  const formatWhatsAppUrl = (phone?: string) => {
    const digits = String(phone || "").replace(/[^0-9]/g, "");
    if (!digits) return "";
    let clean = digits;
    if (clean.startsWith("0")) clean = `94${clean.slice(1)}`;
    else if (!clean.startsWith("94")) clean = `94${clean}`;
    return `https://wa.me/${clean}`;
  };

  const formatInquiryDate = (timestamp?: number) => {
    if (!timestamp) return "—";
    try {
      const d = new Date(timestamp);
      return d.toLocaleString("en-GB", {
        timeZone: "Asia/Colombo",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "—";
    }
  };

  // ---- Filtered Lists ----
  const individualBookings = bookings.filter((b) => b.bookingType === "individual_vehicle");
  const onlineBookings = bookings.filter((b) => b.bookingType !== "individual_vehicle");

  const matchesIndividualSearchQuery = useCallback((b: StoredBooking, rawQuery: string) => {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return true;
    const qCompact = q.replace(/\s+/g, "");
    const qDigits = q.replace(/[^0-9]/g, "");
    const qDigitsCore = qDigits.replace(/^(94|0)+/, "");
    const phoneDigits = String(b.customerPhone || "").replace(/[^0-9]/g, "");
    const phoneDigitsCore = phoneDigits.replace(/^(94|0)+/, "");
    const driverPhoneDigits = String(b.assignedDriverPhone || "").replace(/[^0-9]/g, "");
    const driverPhoneCore = driverPhoneDigits.replace(/^(94|0)+/, "");
    const plateCompact = String(b.assignedPlate || "").toLowerCase().replace(/\s+/g, "");
    const datesJoined = Array.isArray(b.dates) ? b.dates.join(" ") : "";

    return (
      String(b.id || "").toLowerCase().includes(q) ||
      String(b.id || "").toLowerCase().replace(/\s+/g, "").includes(qCompact) ||
      String(b.customerName || "").toLowerCase().includes(q) ||
      String(b.customerPhone || "").toLowerCase().includes(q) ||
      (qDigits.length >= 3 &&
        (phoneDigits.includes(qDigits) ||
          driverPhoneDigits.includes(qDigits) ||
          (qDigitsCore.length >= 3 &&
            (phoneDigitsCore.includes(qDigitsCore) || driverPhoneCore.includes(qDigitsCore))))) ||
      String(b.assignedPlate || "").toLowerCase().includes(q) ||
      plateCompact.includes(qCompact) ||
      String(b.vehicleType || "").toLowerCase().includes(q) ||
      String(b.pickupCity || "").toLowerCase().includes(q) ||
      String(b.deliveryCity || "").toLowerCase().includes(q) ||
      String(b.assignedDriverName || "").toLowerCase().includes(q) ||
      String(b.date || "").toLowerCase().includes(q) ||
      datesJoined.toLowerCase().includes(q)
    );
  }, []);

  const individualSearchMatchesAnyStatusCount = individualSearch.trim()
    ? individualBookings.filter((b) => matchesIndividualSearchQuery(b, individualSearch)).length
    : individualBookings.length;

  const filteredIndividualBookings = individualBookings.filter((b) => {
    const matchesStatus =
      statusFilter === "pending"
        ? b.status === "pending"
        : statusFilter === "awaiting_payment"
        ? b.status === "awaiting_payment"
        : statusFilter === "payment_submitted"
        ? b.status === "payment_submitted"
        : statusFilter === "accepted"
        ? b.status === "accepted" || b.status === "booked"
        : statusFilter === "assigned"
        ? ["assigned", "in_transit"].includes(b.status)
        : statusFilter === "completed"
        ? ["delivered", "cancelled"].includes(b.status)
        : true;
    if (!matchesStatus) return false;
    return matchesIndividualSearchQuery(b, individualSearch);
  });

  const filteredOnlineBookings = onlineBookings.filter((b) => {
    if (statusFilter === "pending") return b.status === "pending";
    if (statusFilter === "awaiting_payment") return b.status === "awaiting_payment";
    if (statusFilter === "payment_submitted") return b.status === "payment_submitted";
    if (statusFilter === "accepted") return b.status === "accepted" || b.status === "booked";
    if (statusFilter === "assigned") return ["assigned", "in_transit"].includes(b.status);
    if (statusFilter === "completed") return ["delivered", "cancelled"].includes(b.status);
    return true;
  });

  const slipReviewCount = individualBookings.filter((b) => b.status === "payment_submitted").length;
  const pendingIndividualCount = individualBookings.filter(
    (b) => b.status === "pending" || b.status === "payment_submitted"
  ).length;
  const pendingOnlineCount = onlineBookings.filter((b) => b.status === "pending").length;
  const totalPendingCount = bookings.filter(
    (b) => b.status === "pending" || b.status === "payment_submitted"
  ).length;

  const filteredFleet = fleetVehicles.filter((v) => {
    if (!lorrySearch.trim()) return true;
    const q = lorrySearch.toLowerCase();
    return (
      v.plate.toLowerCase().includes(q) ||
      (v.vehicleType && v.vehicleType.toLowerCase().includes(q)) ||
      (v.startLocation && v.startLocation.toLowerCase().includes(q)) ||
      (v.driverName && v.driverName.toLowerCase().includes(q))
    );
  });

  const filteredDrivers = drivers.filter((d) => {
    if (!riderSearch.trim()) return true;
    const q = riderSearch.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.phone.toLowerCase().includes(q) ||
      d.driverId.toLowerCase().includes(q) ||
      (d.plate && d.plate.toLowerCase().includes(q)) ||
      (d.route && d.route.toLowerCase().includes(q))
    );
  });

  // ---- Vehicle Registrations Memos & Filtering ----
  const pendingRegistrationsCount = useMemo(
    () => registrations.filter((r) => r.status === "pending").length,
    [registrations]
  );
  const approvedRegistrationsCount = useMemo(
    () => registrations.filter((r) => r.status === "approved").length,
    [registrations]
  );
  const rejectedRegistrationsCount = useMemo(
    () => registrations.filter((r) => r.status === "rejected").length,
    [registrations]
  );

  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      if (regFilter !== "all" && r.status !== regFilter) return false;
      if (!regSearch.trim()) return true;
      const q = regSearch.toLowerCase();
      const plate = (r.plateNumber || r.vehicleNumber || "").toLowerCase();
      return (
        (r.ownerName && r.ownerName.toLowerCase().includes(q)) ||
        (r.phone && r.phone.toLowerCase().includes(q)) ||
        plate.includes(q) ||
        (r.baseCity && r.baseCity.toLowerCase().includes(q)) ||
        (r.vehicleType && r.vehicleType.toLowerCase().includes(q)) ||
        (r.province && r.province.toLowerCase().includes(q))
      );
    });
  }, [registrations, regFilter, regSearch]);

  // ---- Contact Inquiries Memos & Filtering ----
  const unreadInquiriesCount = useMemo(
    () => inquiries.filter((i) => i.status === "unread").length,
    [inquiries]
  );
  const resolvedInquiriesCount = useMemo(
    () => inquiries.filter((i) => i.status === "resolved").length,
    [inquiries]
  );

  const filteredInquiries = useMemo(() => {
    return inquiries.filter((i) => {
      if (inquiryFilter !== "all" && i.status !== inquiryFilter) return false;
      if (!inquirySearch.trim()) return true;
      const q = inquirySearch.toLowerCase();
      return (
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.phone && i.phone.toLowerCase().includes(q)) ||
        (i.email && i.email.toLowerCase().includes(q)) ||
        (i.subject && i.subject.toLowerCase().includes(q)) ||
        (i.message && i.message.toLowerCase().includes(q))
      );
    });
  }, [inquiries, inquiryFilter, inquirySearch]);

  // ---- Status Badge Component ----
  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { cls: string; label: string }> = {
      pending: { cls: "bg-amber-50 text-amber-800 border-amber-200", label: "Pending Quote" },
      awaiting_payment: { cls: "bg-sky-50 text-sky-800 border-sky-200", label: "Awaiting Payment" },
      payment_submitted: { cls: "bg-purple-50 text-purple-800 border-purple-300 font-bold", label: "Slip Submitted — Review" },
      accepted: { cls: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold", label: "Approved (Date Locked)" },
      booked: { cls: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold", label: "Booked" },
      assigned: { cls: "bg-green-50 text-green-800 border-green-200", label: "Driver Assigned" },
      in_transit: { cls: "bg-blue-50 text-blue-800 border-blue-200", label: "In Transit" },
      delivered: { cls: "bg-gray-100 text-gray-700 border-gray-200", label: "Delivered" },
      cancelled: { cls: "bg-red-50 text-red-700 border-red-200", label: "Cancelled" },
    };
    const s = map[status] || map.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${s.cls}`}>
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            status === "in_transit" || status === "payment_submitted"
              ? "animate-pulse bg-current"
              : status === "accepted" || status === "booked"
              ? "bg-emerald-600"
              : "bg-current"
          }`}
        />
        {s.label}
      </span>
    );
  };

  // ---- PIN Authentication Gate ----
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[#F7F5EE]">
        <div className="w-full max-w-sm bg-white border border-[#E7E2D0] rounded-3xl p-8 shadow-sm">
          <div className="mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#FFC20E] flex items-center justify-center mb-4 shadow-sm border border-[#E7E2D0]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#26231B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h1 className="text-xl font-black text-[#26231B]">Head Office Admin Portal</h1>
            <p className="text-xs text-[#6F6A5A] mt-1">
              Sithumina Transport — Secure Command Center
            </p>
          </div>

          {pinError && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
              {pinError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pin === ADMIN_PIN) {
                setAuthed(true);
                setPinError("");
              } else {
                setPinError("Invalid PIN. Please check with Head Office.");
              }
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="block text-xs font-bold text-[#26231B] mb-1.5">
                Admin Security PIN
              </label>
              <input
                suppressHydrationWarning
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-sm font-mono text-[#26231B] focus:outline-none focus:border-[#26231B] tracking-widest text-center"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#FFC20E] text-[#26231B] text-sm font-black border-0 cursor-pointer hover:bg-[#e6ad00] transition-all shadow-sm"
            >
              Sign In to Command Center
            </button>
          </form>

          <p className="text-center text-[11px] text-[#6F6A5A] mt-6">
            Authorized personnel only. Direct fleet and booking dispatch controls.
          </p>
        </div>
      </main>
    );
  }

  // ---- DEDICATED ADMIN DASHBOARD WITH SIDE NAVIGATION ----
  return (
    <div className="min-h-screen bg-[#F7F5EE] flex text-[#26231B] font-sans select-none">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-4 sm:bottom-auto sm:top-4 z-[99999] max-w-[calc(100vw-2rem)] px-5 py-3 rounded-2xl text-xs font-black shadow-xl border ${
            toast.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-red-50 border-red-300 text-red-800"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* ========================================================= */}
      {/* 1. PROFESSIONAL SIDE NAVIGATION (Sidebar)                 */}
      {/* ========================================================= */}
      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 h-screen bg-[#1F1E19] text-white flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex flex-col">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FFC20E] flex items-center justify-center font-black text-[#26231B] text-sm shadow-sm">
                ST
              </div>
              <div>
                <span className="font-black text-sm tracking-tight block">Sithumina Admin</span>
                <span className="text-[10px] text-white/50 block">Command Center</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-white/70 hover:text-white p-1 text-base font-bold"
            >
              ✕
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 flex flex-col gap-1">
            {/* Overview */}
            <button
              onClick={() => {
                setActiveNav("overview");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "overview"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                </svg>
                <span>Dashboard Overview</span>
              </div>
              {!loadingBookings && totalPendingCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeNav === "overview" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B] animate-pulse"
                }`}>
                  {totalPendingCount}
                </span>
              )}
            </button>

            {/* Individual Bookings */}
            <button
              onClick={() => {
                setActiveNav("individual_bookings");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "individual_bookings"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13"/>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                <span>Individual Bookings</span>
              </div>
              {!loadingBookings && pendingIndividualCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeNav === "individual_bookings" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B] animate-pulse"
                }`}>
                  {pendingIndividualCount}
                </span>
              )}
            </button>

            {/* Online / Live Lorry Bookings */}
            <button
              onClick={() => {
                setActiveNav("online_bookings");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "online_bookings"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
                  <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
                  <circle cx="12" cy="12" r="2"/>
                  <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
                  <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>
                </svg>
                <span>Online / Live Bookings</span>
              </div>
              {!loadingBookings && pendingOnlineCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeNav === "online_bookings" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B]"
                }`}>
                  {pendingOnlineCount}
                </span>
              )}
            </button>

            {/* Vehicle Partner Registrations */}
            <button
              onClick={() => {
                setActiveNav("vehicle_registrations");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "vehicle_registrations"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <path d="M9 14l2 2 4-4" />
                </svg>
                <span>Vehicle Registrations</span>
              </div>
              {!loadingRegistrations && pendingRegistrationsCount > 0 ? (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeNav === "vehicle_registrations" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B] animate-pulse"
                }`}>
                  {pendingRegistrationsCount}
                </span>
              ) : (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeNav === "vehicle_registrations" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
                }`}>
                  {loadingRegistrations ? "..." : registrations.length}
                </span>
              )}
            </button>

            {/* Contact Inquiries */}
            <button
              onClick={() => {
                setActiveNav("contact_submissions");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "contact_submissions"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Contact Inquiries</span>
              </div>
              {!loadingInquiries && unreadInquiriesCount > 0 ? (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeNav === "contact_submissions" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B] animate-pulse"
                }`}>
                  {unreadInquiriesCount}
                </span>
              ) : (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeNav === "contact_submissions" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
                }`}>
                  {loadingInquiries ? "..." : inquiries.length}
                </span>
              )}
            </button>

            {/* Fleet Lorries */}
            <button
              onClick={() => {
                setActiveNav("fleet");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "fleet"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
                  <path d="M15 18H9"/>
                  <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
                  <circle cx="17" cy="18" r="2"/>
                  <circle cx="7" cy="18" r="2"/>
                </svg>
                <span>Fleet Lorries</span>
              </div>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeNav === "fleet" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
              }`}>
                {loadingFleet ? "..." : fleetVehicles.length}
              </span>
            </button>

            {/* Riders & Drivers */}
            <button
              onClick={() => {
                setActiveNav("riders");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "riders"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>Riders & Drivers</span>
              </div>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeNav === "riders" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
              }`}>
                {loadingDrivers ? "..." : drivers.length}
              </span>
            </button>

            {/* Settings */}
            <button
              onClick={() => {
                setActiveNav("settings");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "settings"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span>Settings</span>
              </div>
              {storedSlips.length > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeNav === "settings" ? "bg-[#26231B] text-[#FFC20E]" : "bg-white/15 text-white/80"
                }`}>
                  {storedSlips.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-white/10 flex flex-col gap-2">
          <button
            onClick={handleOpenManualModal}
            className="w-full py-2.5 px-3 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>+ Manual Booking</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full py-2 px-3 rounded-xl border border-white/20 text-white/70 hover:bg-white/10 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ========================================================= */}
      {/* 2. MAIN WORKSPACE AREA (Offset by fixed sidebar on lg+)   */}
      {/* ========================================================= */}
      <div className="flex-1 lg:ml-64 flex flex-col min-w-0 min-h-screen">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E7E2D0] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-[#26231B] font-bold"
              aria-label="Open Navigation"
            >
              ☰
            </button>
            <div>
              <h1 className="text-base font-black text-[#26231B] tracking-tight">
                {activeNav === "overview" && "Executive Dashboard Overview"}
                {activeNav === "individual_bookings" && "Individual Vehicle Bookings"}
                {activeNav === "online_bookings" && "Online / Live Lorry Bookings"}
                {activeNav === "vehicle_registrations" && "Vehicle & Partner Registrations"}
                {activeNav === "contact_submissions" && "Contact Inquiries & Support"}
                {activeNav === "fleet" && "Fleet Lorries Management"}
                {activeNav === "riders" && "Riders & Drivers Registry"}
                {activeNav === "settings" && "System & Payment Settings"}
              </h1>
              <p className="text-[11px] text-[#6F6A5A]">
                {activeNav === "vehicle_registrations"
                  ? "Incoming lorry partner applications from /register-vehicle"
                  : activeNav === "contact_submissions"
                  ? "Direct customer inquiries & rate quotes from /contact"
                  : "Head Office Dispatch Operations"}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {activeNav === "vehicle_registrations" && (
              <a
                href="/register-vehicle"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <span>Open Registration Form ↗</span>
              </a>
            )}
            {activeNav === "contact_submissions" && (
              <a
                href="/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <span>Open Contact Page ↗</span>
              </a>
            )}
            {activeNav === "fleet" && (
              <button
                onClick={handleOpenAddLorry}
                className="px-3.5 py-2 rounded-xl bg-[#26231B] hover:bg-[#3D3A31] text-white text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1"
              >
                <span>+ Add Lorry</span>
              </button>
            )}
            {activeNav === "riders" && (
              <button
                onClick={handleOpenAddRider}
                className="px-3.5 py-2 rounded-xl bg-[#26231B] hover:bg-[#3D3A31] text-white text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1"
              >
                <span>+ Add Rider</span>
              </button>
            )}
            {activeNav === "individual_bookings" && (
              <button
                onClick={handleOpenManualModal}
                className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-all cursor-pointer shadow-xs"
              >
                + Manual Booking
              </button>
            )}
            {activeNav === "settings" && (
              <button
                onClick={() => setActiveNav("individual_bookings")}
                className="px-3.5 py-2 rounded-xl bg-[#26231B] hover:bg-[#3D3A31] text-white text-xs font-black transition-all cursor-pointer shadow-xs"
              >
                ← Bookings
              </button>
            )}
          </div>
        </header>

        {/* Work Area Content */}
        <main className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-7xl w-full mx-auto">
          {/* ========================================================= */}
          {/* HIGH-VISIBILITY ALERT BANNER FOR NEW BOOKINGS             */}
          {/* ========================================================= */}
          {!loadingBookings && totalPendingCount > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 animate-ping" />
                <div>
                  <h3 className="text-sm font-black text-[#26231B]">
                    Action Required ({totalPendingCount} Pending)
                  </h3>
                  <p className="text-xs text-[#6F6A5A]">
                    Quote pending booking requests or review uploaded customer payment slips to lock dates.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {slipReviewCount > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("individual_bookings");
                      setBookingViewSubTab("list");
                      setStatusFilter("payment_submitted");
                    }}
                    className="px-3 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-bold hover:bg-purple-800 transition-colors cursor-pointer"
                  >
                    Review Payment Slips ({slipReviewCount})
                  </button>
                )}
                {individualBookings.filter((b) => b.status === "pending").length > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("individual_bookings");
                      setBookingViewSubTab("list");
                      setStatusFilter("pending");
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#26231B] text-white text-xs font-bold hover:bg-[#FFC20E] hover:text-[#26231B] transition-colors cursor-pointer"
                  >
                    Pending Quotes ({individualBookings.filter((b) => b.status === "pending").length})
                  </button>
                )}
                {pendingOnlineCount > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("online_bookings");
                      setStatusFilter("pending");
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#26231B] text-white text-xs font-bold hover:bg-[#FFC20E] hover:text-[#26231B] transition-colors cursor-pointer"
                  >
                    View Online ({pendingOnlineCount})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 1: OVERVIEW & COMMAND CENTER                          */}
          {/* ========================================================= */}
          {activeNav === "overview" && (
            <div className="flex flex-col gap-6">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs">
                  <span className="text-[11px] font-bold text-[#6F6A5A] uppercase block">Total Bookings</span>
                  <span className="text-2xl font-black text-[#26231B] mt-1 block font-mono">
                    {loadingBookings ? "..." : bookings.length}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs">
                  <span className="text-[11px] font-bold text-amber-700 uppercase block">Pending Bookings</span>
                  <span className="text-2xl font-black text-amber-800 mt-1 block font-mono">
                    {loadingBookings ? "..." : totalPendingCount}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs">
                  <span className="text-[11px] font-bold text-amber-700 uppercase block">Pending Regs</span>
                  <span className="text-2xl font-black text-amber-800 mt-1 block font-mono">
                    {loadingRegistrations ? "..." : pendingRegistrationsCount}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs">
                  <span className="text-[11px] font-bold text-purple-700 uppercase block">Unread Inquiries</span>
                  <span className="text-2xl font-black text-purple-800 mt-1 block font-mono">
                    {loadingInquiries ? "..." : unreadInquiriesCount}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase block">Fleet Vehicles</span>
                  <span className="text-2xl font-black text-emerald-800 mt-1 block font-mono">
                    {loadingFleet ? "..." : fleetVehicles.length}
                  </span>
                </div>
                <div className="p-4 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs">
                  <span className="text-[11px] font-bold text-blue-700 uppercase block">Active Riders</span>
                  <span className="text-2xl font-black text-blue-800 mt-1 block font-mono">
                    {loadingDrivers ? "..." : drivers.filter((d) => d.active).length}
                  </span>
                </div>
              </div>

              {/* Quick Jump Modules */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">Individual Vehicle Bookings</h2>
                    <p className="text-xs text-[#6F6A5A] mt-1">
                      Quote requests, verify uploaded PDF/image slips, and lock calendar dates.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-[#26231B]">
                      <span>Total: {loadingBookings ? "..." : individualBookings.length}</span>
                      <span className="text-amber-700">
                        Needs Quote: {loadingBookings ? "..." : individualBookings.filter((b) => b.status === "pending").length}
                      </span>
                      {slipReviewCount > 0 && (
                        <span className="text-purple-700">
                          Slips to Review: {slipReviewCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNav("individual_bookings")}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#26231B] hover:bg-[#FFC20E] hover:text-[#26231B] text-white text-xs font-black transition-colors cursor-pointer"
                  >
                    Open Individual Bookings →
                  </button>
                </div>

                {/* Vehicle Registrations Quick Jump */}
                <div className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">Vehicle Partner Registrations</h2>
                    <p className="text-xs text-[#6F6A5A] mt-1">
                      Incoming lorry owner applications from /register-vehicle. Approve to add directly to live fleet.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-[#26231B]">
                      <span>Total: {loadingRegistrations ? "..." : registrations.length}</span>
                      <span className="text-amber-700">
                        Pending: {loadingRegistrations ? "..." : pendingRegistrationsCount}
                      </span>
                      <span className="text-emerald-700">
                        Approved: {loadingRegistrations ? "..." : approvedRegistrationsCount}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNav("vehicle_registrations")}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs"
                  >
                    Review Registrations →
                  </button>
                </div>

                {/* Contact Inquiries Quick Jump */}
                <div className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">Contact Inquiries & Support</h2>
                    <p className="text-xs text-[#6F6A5A] mt-1">
                      Customer questions, freight rate quotes, and message submissions from /contact.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-[#26231B]">
                      <span>Total: {loadingInquiries ? "..." : inquiries.length}</span>
                      <span className="text-purple-700">
                        Unread: {loadingInquiries ? "..." : unreadInquiriesCount}
                      </span>
                      <span className="text-emerald-700">
                        Resolved: {loadingInquiries ? "..." : resolvedInquiriesCount}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNav("contact_submissions")}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#26231B] hover:bg-[#FFC20E] hover:text-[#26231B] text-white text-xs font-black transition-colors cursor-pointer"
                  >
                    View Inquiries →
                  </button>
                </div>

                <div className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">Fleet & Riders Management</h2>
                    <p className="text-xs text-[#6F6A5A] mt-1">
                      Register and manage company lorries (3 photos) and drivers.
                    </p>
                    <div className="mt-4 flex items-center gap-3 text-xs font-bold text-[#26231B]">
                      <span>Fleet: {loadingFleet ? "..." : fleetVehicles.length} Vehicles</span>
                      <span>Drivers: {loadingDrivers ? "..." : drivers.length} Registered</span>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center gap-2">
                    <button
                      onClick={() => setActiveNav("fleet")}
                      className="flex-1 py-2.5 rounded-xl bg-[#26231B] hover:bg-[#FFC20E] hover:text-[#26231B] text-white text-xs font-black transition-colors cursor-pointer"
                    >
                      Manage Fleet →
                    </button>
                    <button
                      onClick={() => setActiveNav("riders")}
                      className="flex-1 py-2.5 rounded-xl border border-[#E7E2D0] hover:bg-[#F7F5EE] text-[#26231B] text-xs font-bold transition-colors cursor-pointer"
                    >
                      Manage Riders →
                    </button>
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">Bank Accounts & Slips DB</h2>
                    <p className="text-xs text-[#6F6A5A] mt-1">
                      Manage customer payment bank account numbers and clean up reviewed DB slips.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-[#26231B]">
                      <span>Active Accounts: {bankAccounts.filter((a) => a.active).length}</span>
                      <span>Stored Slips: {storedSlips.length}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNav("settings")}
                    className="mt-5 w-full py-2.5 rounded-xl border border-[#26231B] hover:bg-[#FFC20E] hover:border-[#FFC20E] text-[#26231B] text-xs font-black transition-colors cursor-pointer"
                  >
                    Open Settings →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: INDIVIDUAL VEHICLE BOOKINGS                        */}
          {/* ========================================================= */}
          {activeNav === "individual_bookings" && (
            <div className="flex flex-col gap-5">
              {/* Sub-view switcher, Status Filters & Search Bar */}
              <div className="flex flex-col gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-[#E7E2D0] shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setBookingViewSubTab("list")}
                      className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                        bookingViewSubTab === "list"
                          ? "bg-[#26231B] text-white"
                          : "text-[#6F6A5A] hover:bg-[#F7F5EE]"
                      }`}
                    >
                      Booking Requests List
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookingViewSubTab("calendar")}
                      className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-black whitespace-nowrap transition-all cursor-pointer ${
                        bookingViewSubTab === "calendar"
                          ? "bg-[#26231B] text-white"
                          : "text-[#6F6A5A] hover:bg-[#F7F5EE]"
                      }`}
                    >
                      Dedicated Vehicle Calendars
                    </button>
                  </div>

                  {/* Status Filter for list view */}
                  {bookingViewSubTab === "list" && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                      {([
                        { key: "all", label: "All" },
                        { key: "pending", label: "Pending Quote" },
                        { key: "awaiting_payment", label: "Awaiting Pay" },
                        { key: "payment_submitted", label: "Slip Review" },
                        { key: "accepted", label: "Approved" },
                        { key: "assigned", label: "Assigned" },
                        { key: "completed", label: "Completed" },
                      ] as { key: StatusFilter; label: string }[]).map((st) => (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() => setStatusFilter(st.key)}
                          className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                            statusFilter === st.key
                              ? "bg-[#FFC20E] text-[#26231B] font-black"
                              : "text-[#6F6A5A] hover:bg-[#F7F5EE]"
                          }`}
                        >
                          {st.label}
                          {st.key === "payment_submitted" && slipReviewCount > 0 ? ` (${slipReviewCount})` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Search Box + Accordion Toolbar for list view */}
                {bookingViewSubTab === "list" && (
                  <div className="pt-3 border-t border-[#E7E2D0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="relative flex-1 min-w-0">
                      <span
                        aria-hidden="true"
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F6A5A] pointer-events-none"
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </span>
                      <input
                        type="text"
                        aria-label="Search individual bookings by name, phone, booking ID, lorry plate, or city"
                        placeholder="Search name, phone, booking ID, lorry plate, city..."
                        value={individualSearch}
                        onChange={(e) => setIndividualSearch(e.target.value)}
                        className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#26231B] placeholder:text-[#8A836E] transition-colors"
                      />
                      {individualSearch.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIndividualSearch("")}
                          aria-label="Clear booking search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E7E2D0]/70 hover:bg-[#FFC20E] text-[#26231B] flex items-center justify-center text-xs font-black transition-colors cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 flex-shrink-0">
                      <span className="px-2.5 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-bold text-[#6F6A5A]">
                        Showing <b className="text-[#26231B]">{filteredIndividualBookings.length}</b> of{" "}
                        <b className="text-[#26231B]">{individualBookings.length}</b>
                      </span>

                      {filteredIndividualBookings.length > 0 && (() => {
                        const allExpanded = filteredIndividualBookings.every((b, idx) =>
                          expandedIndividualBookings[b.id] !== undefined
                            ? expandedIndividualBookings[b.id]
                            : idx === 0 || b.status === "pending" || b.status === "payment_submitted" || editingQuoteId === b.id
                        );
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              const nextState: Record<string, boolean> = { ...expandedIndividualBookings };
                              filteredIndividualBookings.forEach((b) => {
                                nextState[b.id] = !allExpanded;
                              });
                              setExpandedIndividualBookings(nextState);
                            }}
                            className="px-3 py-1.5 rounded-xl border border-[#E7E2D0] bg-white hover:bg-[#FFF4D1] hover:border-[#F0CE68] text-[#26231B] text-[11px] font-black transition-colors cursor-pointer"
                          >
                            {allExpanded ? "Collapse All" : "Expand All"}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* LIST VIEW OF INDIVIDUAL BOOKINGS */}
              {bookingViewSubTab === "list" && (
                <div className="flex flex-col gap-4">
                  {loadingBookings ? (
                    <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                      <p className="text-sm font-bold text-[#6F6A5A]">Loading live bookings from Firestore...</p>
                    </div>
                  ) : filteredIndividualBookings.length === 0 ? (
                    <div className="p-10 sm:p-12 text-center rounded-3xl bg-white border border-[#E7E2D0] flex flex-col items-center gap-3">
                      {individualSearch.trim() && statusFilter !== "all" && individualSearchMatchesAnyStatusCount > 0 ? (
                        <>
                          <p className="text-sm font-bold text-[#26231B]">
                            No bookings match &ldquo;{individualSearch.trim()}&rdquo; under the selected tab, but{" "}
                            <span className="text-emerald-700">{individualSearchMatchesAnyStatusCount} match(es)</span> exist across all statuses.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setStatusFilter("all")}
                              className="px-4 py-2 rounded-xl bg-[#FFC20E] text-[#26231B] text-xs font-black cursor-pointer shadow-xs"
                            >
                              Show All {individualSearchMatchesAnyStatusCount} Matches
                            </button>
                            <button
                              type="button"
                              onClick={() => setIndividualSearch("")}
                              className="px-4 py-2 rounded-xl border border-[#E7E2D0] bg-white text-[#26231B] text-xs font-bold cursor-pointer hover:bg-[#F7F5EE]"
                            >
                              Clear Search
                            </button>
                          </div>
                        </>
                      ) : individualSearch.trim() ? (
                        <>
                          <p className="text-sm font-bold text-[#6F6A5A]">
                            No individual bookings matched &ldquo;{individualSearch.trim()}&rdquo;.
                          </p>
                          <button
                            type="button"
                            onClick={() => setIndividualSearch("")}
                            className="px-4 py-2 rounded-xl bg-[#26231B] text-white text-xs font-black cursor-pointer shadow-xs hover:bg-[#FFC20E] hover:text-[#26231B]"
                          >
                            Clear Search
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-[#6F6A5A]">
                            No individual vehicle bookings match this filter.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {statusFilter !== "all" && individualBookings.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setStatusFilter("all")}
                                className="px-4 py-2 rounded-xl border border-[#E7E2D0] bg-white text-[#26231B] text-xs font-bold cursor-pointer hover:bg-[#F7F5EE]"
                              >
                                Show All ({individualBookings.length})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleOpenManualModal}
                              className="px-4 py-2 rounded-xl bg-[#FFC20E] text-[#26231B] text-xs font-black cursor-pointer shadow-xs"
                            >
                              + Create Manual Booking
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    filteredIndividualBookings.map((b, idx) => {
                      const quoteDraft = quoteInputs[b.id] || {
                        amount: b.quotedAmount ? String(b.quotedAmount) : "",
                        note: b.quoteNote || "",
                      };
                      const hasStoredSlip = Boolean(b.paymentSlipId && b.paymentSlipStatus !== "deleted");
                      const isPdfSlip =
                        (b.paymentSlipType || "").toLowerCase().includes("pdf") ||
                        (b.paymentSlipName || "").toLowerCase().endsWith(".pdf");
                      const isCashManual =
                        b.paymentMethod === "cash_manual" || b.paymentSlipStatus === "manual_approved";
                      const isPaymentLocked = [
                        "accepted",
                        "booked",
                        "assigned",
                        "in_transit",
                        "delivered",
                      ].includes(b.status);
                      const selectedManualStage =
                        manualStageDraft[b.id] || (b.status === "booked" ? "accepted" : b.status);
                      const isExpanded =
                        expandedIndividualBookings[b.id] !== undefined
                          ? expandedIndividualBookings[b.id]
                          : idx === 0 ||
                            b.status === "pending" ||
                            b.status === "payment_submitted" ||
                            editingQuoteId === b.id;
                      const resolvedBookedDates =
                        Array.isArray(b.dates) && b.dates.length > 0
                          ? b.dates
                          : b.date
                            ? [b.date]
                            : [];
                      const dayCount =
                        resolvedBookedDates.length > 1
                          ? resolvedBookedDates.length
                          : Math.max(1, Number(b.daysNeeded) || resolvedBookedDates.length || 1);
                      const bookedDaysLabel = `${dayCount} ${dayCount === 1 ? "Day" : "Days"}`;
                      const bookedDatesDisplay =
                        resolvedBookedDates.length > 0
                          ? `${resolvedBookedDates.join(", ")} (${bookedDaysLabel})`
                          : "Date Not Set";
                      const requestTiming = formatBookingDateTime(b.createdAt);
                      const quotedTiming = formatBookingDateTime(b.quotedAt);
                      const slipTiming = formatBookingDateTime(b.paymentSlipUploadedAt);
                      const approvedTiming = formatBookingDateTime(b.paymentApprovedAt);

                      return (
                        <div
                          key={b.id}
                          className={`rounded-2xl bg-white border overflow-hidden shadow-xs transition-all duration-200 hover:shadow-md ${
                            b.status === "payment_submitted"
                              ? "border-purple-300 ring-1 ring-purple-200/70"
                              : b.status === "pending"
                                ? "border-[#FFC20E] ring-1 ring-[#FFC20E]/35"
                                : b.status === "cancelled"
                                  ? "border-red-200/90"
                                  : "border-[#E7E2D0] hover:border-[#D6CEB8]"
                          }`}
                        >
                          {/* Top Status Accent Strip */}
                          <div
                            aria-hidden="true"
                            className={`h-1 w-full ${
                              b.status === "cancelled"
                                ? "bg-red-400"
                                : b.status === "delivered"
                                  ? "bg-slate-400"
                                  : ["accepted", "booked", "assigned", "in_transit"].includes(b.status)
                                    ? "bg-gradient-to-r from-[#10B981] to-[#137333]"
                                    : b.status === "payment_submitted"
                                      ? "bg-gradient-to-r from-purple-500 to-indigo-600"
                                      : "bg-gradient-to-r from-[#FFC20E] to-[#E6A800]"
                            }`}
                          />

                          {/* Accordion Header: Top Section with Lorry No, Booking No, Booked Date(s), Request Date & Time, Status & Corner Arrow */}
                          <button
                            type="button"
                            onClick={() => toggleIndividualBookingCard(b.id, isExpanded)}
                            aria-expanded={isExpanded}
                            aria-label={`${
                              isExpanded ? "Minimize booking details" : "Open booking details"
                            } for ${b.id}`}
                            className="relative w-full text-left border-0 bg-transparent px-4 pt-4 pb-3.5 sm:px-5 sm:pt-4 sm:pb-4 pr-14 sm:pr-16 hover:bg-[#FAF8F2]/80 transition-colors cursor-pointer group"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
                              {/* Left: Lorry Plate + Model + Booking ID */}
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="px-2.5 py-1 rounded-lg bg-[#26231B] text-[#FFC20E] text-xs font-black font-mono tracking-wider shadow-xs">
                                  {b.assignedPlate || "No Plate"}
                                </span>
                                <span className="text-xs sm:text-sm font-black text-[#26231B]">
                                  {b.vehicleType}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-lg bg-[#F7F5EE] border border-[#D8D0B8] text-[#26231B] text-xs font-black font-mono tracking-wide">
                                  {b.id}
                                </span>
                              </div>

                              {/* Right: Amount + Cash badge + Live Status */}
                              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                                {b.quotedAmount !== undefined && (
                                  <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-300 text-xs font-black text-amber-900 font-mono">
                                    Rs. {b.quotedAmount.toLocaleString()}
                                  </span>
                                )}
                                {isCashManual && isPaymentLocked && (
                                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-300 text-[10.5px] font-black text-emerald-800">
                                    Cash Approved
                                  </span>
                                )}
                                <StatusBadge status={b.status} />
                              </div>
                            </div>

                            {/* Top Section Quick Info Row: Booked Trip Date(s), Booked/Request Date & Time, Customer & Route */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F7F5EE] border border-[#E7E2D0] text-[11.5px] font-bold text-[#26231B] font-mono">
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="text-[#6F6A5A] flex-shrink-0"
                                >
                                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                  <line x1="16" y1="2" x2="16" y2="6" />
                                  <line x1="8" y1="2" x2="8" y2="6" />
                                  <line x1="3" y1="10" x2="21" y2="10" />
                                </svg>
                                <span>Trip Date: {bookedDatesDisplay}</span>
                              </span>

                              {requestTiming && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50/80 border border-amber-200 text-[11.5px] font-bold text-[#5B4300] font-mono">
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-amber-700 flex-shrink-0"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                  </svg>
                                  <span>Booked At: {requestTiming.display}</span>
                                </span>
                              )}

                              <span className="inline-flex flex-wrap items-center gap-1.5 text-[12px] text-[#26231B] font-semibold">
                                <span className="font-black">{b.customerName}</span>
                                {b.customerPhone && (
                                  <span className="font-mono text-[#137333] font-bold">
                                    ({b.customerPhone})
                                  </span>
                                )}
                                <span className="text-[#6F6A5A]">
                                  · {b.pickupCity} → {b.deliveryCity}
                                </span>
                              </span>
                            </div>

                            {/* Top-Right Corner Minimize / Expand Arrow Button */}
                            <span
                              aria-hidden="true"
                              title={isExpanded ? "Minimize Booking Details" : "Open Booking Details"}
                              className={`absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center transition-all duration-200 shadow-xs ${
                                isExpanded
                                  ? "bg-[#FFF4D1] border-[#F0CE68] text-[#5B4300] group-hover:bg-[#FFE89D]"
                                  : "bg-[#F7F5EE] border-[#E7E2D0] text-[#26231B] group-hover:bg-[#FFF4D1] group-hover:border-[#F0CE68]"
                              }`}
                            >
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`transition-transform duration-200 ${
                                  isExpanded ? "rotate-180" : "rotate-0"
                                }`}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </span>
                          </button>

                          {/* Collapsible Bottom Booking Details & Actions */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5 border-t border-[#E7E2D0] flex flex-col gap-4">
                              {/* Customer & Request Details + Trip & Cargo Details */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Customer Information & Lorry Request Timing */}
                                <div className="bg-[#F7F5EE] p-4 rounded-2xl border border-[#E7E2D0] flex flex-col gap-2.5 text-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10.5px] font-bold text-[#6F6A5A] uppercase tracking-wider">
                                      Customer &amp; Request Details
                                    </span>
                                    <code className="text-[11px] font-mono font-black text-[#26231B] bg-white px-2 py-0.5 rounded-md border border-[#E7E2D0]">
                                      {b.id}
                                    </code>
                                  </div>

                                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <div className="text-sm font-black text-[#26231B]">{b.customerName}</div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[#6F6A5A]">Phone:</span>
                                      {b.customerPhone ? (
                                        <a
                                          href={`tel:${String(b.customerPhone || "").replace(/\s+/g, "")}`}
                                          className="font-mono font-black text-[#1E9E5A] hover:underline"
                                        >
                                          {b.customerPhone}
                                        </a>
                                      ) : (
                                        <span className="text-[#6F6A5A] italic font-mono">Not provided</span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Lorry Requested Date & Time Box */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-[#E7E2D0]">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[10px] font-bold text-[#6F6A5A] uppercase">
                                        Lorry Requested Date
                                      </span>
                                      <span className="font-mono font-black text-xs text-[#26231B]">
                                        {requestTiming ? requestTiming.date : "Not recorded"}
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[10px] font-bold text-[#6F6A5A] uppercase">
                                        Lorry Requested Time
                                      </span>
                                      <span className="font-mono font-black text-xs text-[#26231B]">
                                        {requestTiming ? requestTiming.time : "Not recorded"}
                                      </span>
                                    </div>
                                  </div>

                                  {(quotedTiming || slipTiming || approvedTiming) && (
                                    <div className="flex flex-wrap gap-1.5 text-[10.5px] font-semibold text-[#6F6A5A]">
                                      {quotedTiming && (
                                        <span className="px-2 py-0.5 rounded-md bg-white border border-[#E7E2D0] font-mono">
                                          Quoted: {quotedTiming.display}
                                        </span>
                                      )}
                                      {slipTiming && (
                                        <span className="px-2 py-0.5 rounded-md bg-white border border-[#E7E2D0] font-mono">
                                          Slip Uploaded: {slipTiming.display}
                                        </span>
                                      )}
                                      {approvedTiming && (
                                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono">
                                          Approved: {approvedTiming.display}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {b.packageDetails && (
                                    <div className="text-[#26231B] bg-white/85 px-3 py-2 rounded-xl border border-[#E7E2D0] text-[11.5px]">
                                      <span className="font-bold text-[#6F6A5A]">Notes: </span>
                                      {b.packageDetails}
                                    </div>
                                  )}
                                </div>

                                {/* Lorry, Route & Cargo Specifications */}
                                <div className="bg-[#F7F5EE] p-4 rounded-2xl border border-[#E7E2D0] flex flex-col gap-2.5 text-xs">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[10.5px] font-bold text-[#6F6A5A] uppercase tracking-wider">
                                      Trip, Lorry &amp; Cargo Specifications
                                    </span>
                                    <span className="font-mono font-black text-[11px] text-[#26231B] bg-white px-2 py-0.5 rounded-md border border-[#E7E2D0]">
                                      {b.assignedPlate || "No Plate"} · {b.vehicleType}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div className="bg-white px-3 py-2 rounded-xl border border-[#E7E2D0]">
                                      <span className="block text-[10px] font-bold text-[#6F6A5A] uppercase">
                                        Pickup Point
                                      </span>
                                      <span className="text-xs font-black text-[#26231B] break-words">
                                        {b.pickupCity}
                                      </span>
                                    </div>
                                    <div className="bg-white px-3 py-2 rounded-xl border border-[#E7E2D0]">
                                      <span className="block text-[10px] font-bold text-[#6F6A5A] uppercase">
                                        Destination
                                      </span>
                                      <span className="text-xs font-black text-[#26231B] break-words">
                                        {b.deliveryCity}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10.5px] font-bold text-[#6F6A5A] mr-0.5">
                                      Booked Trip Date(s):
                                    </span>
                                    {resolvedBookedDates.map((dStr) => (
                                      <span
                                        key={dStr}
                                        className="font-mono text-[11px] font-black text-[#26231B] bg-white px-2 py-0.5 rounded-md border border-[#E7E2D0]"
                                      >
                                        {dStr}
                                      </span>
                                    ))}
                                    <span className="font-mono text-[11px] font-bold text-[#5B4300] bg-[#FFF4D1] px-2 py-0.5 rounded-md border border-[#F0CE68]">
                                      {bookedDaysLabel}
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#26231B]">
                                    {b.cargoNature && (
                                      <span>
                                        Goods: <b>{b.cargoNature}</b>
                                      </span>
                                    )}
                                    {b.cargoWeight && (
                                      <span>
                                        Weight: <b>{b.cargoWeight}</b>
                                      </span>
                                    )}
                                    {b.helpersCount !== undefined && (
                                      <span>
                                        Helpers: <b>{b.helpersCount}</b>
                                      </span>
                                    )}
                                  </div>

                                  {b.assignedDriverName && (
                                    <div className="bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs text-[#137333] font-semibold flex flex-wrap items-center justify-between gap-2">
                                      <span>
                                        Assigned Driver: <b>{b.assignedDriverName}</b>
                                      </span>
                                      {b.assignedDriverPhone && (
                                        <a
                                          href={`tel:${String(b.assignedDriverPhone).replace(/\s+/g, "")}`}
                                          className="font-mono font-black underline"
                                        >
                                          {b.assignedDriverPhone}
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Step 1: Enter Amount / Quote Box OR Manual Cash Approve */}
                              {(b.status === "pending" || editingQuoteId === b.id) && (
                                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-300 flex flex-col gap-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <span className="text-xs font-black text-[#26231B] block">
                                        Set Booking Amount, Request Slip OR Approve Cash Payment
                                      </span>
                                      <span className="text-[11px] text-[#6F6A5A]">
                                        Send a quote to wait for customer bank slip, or approve Cash / Direct payment immediately to lock dates RED.
                                      </span>
                                    </div>
                                    {editingQuoteId === b.id && (
                                      <button
                                        type="button"
                                        onClick={() => setEditingQuoteId(null)}
                                        className="text-xs font-bold text-[#6F6A5A] hover:text-[#26231B] cursor-pointer"
                                      >
                                        Cancel Edit
                                      </button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                                    <div className="sm:col-span-5">
                                      <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                                        Amount (LKR) *
                                      </label>
                                      <input
                                        type="number"
                                        min="1"
                                        placeholder="e.g. 25000"
                                        value={quoteDraft.amount}
                                        onChange={(e) =>
                                          setQuoteInputs((prev) => ({
                                            ...prev,
                                            [b.id]: { ...quoteDraft, amount: e.target.value },
                                          }))
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs font-mono font-bold text-[#26231B]"
                                      />
                                    </div>
                                    <div className="sm:col-span-7">
                                      <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                                        Payment Note (Optional)
                                      </label>
                                      <input
                                        type="text"
                                        placeholder="e.g. Full fare / Cash paid at office"
                                        value={quoteDraft.note}
                                        onChange={(e) =>
                                          setQuoteInputs((prev) => ({
                                            ...prev,
                                            [b.id]: { ...quoteDraft, note: e.target.value },
                                          }))
                                        }
                                        className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs text-[#26231B]"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => handleSendQuote(b)}
                                      className="px-4 py-2 rounded-xl bg-[#26231B] hover:bg-[#FFC20E] hover:text-[#26231B] text-white text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                      {actionLoading === b.id ? "Sending..." : "Send Amount & Request Pay"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => handleManualApprovePayment(b)}
                                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                      Manual Approve (Cash) & Lock Date
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Step 2: Awaiting Customer Payment Summary */}
                              {b.status === "awaiting_payment" && editingQuoteId !== b.id && (
                                <div className="p-3.5 rounded-2xl bg-sky-50 border border-sky-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-black text-sky-900">
                                      Waiting for Customer Payment Slip — Quoted Rs. {(b.quotedAmount || 0).toLocaleString()}
                                    </span>
                                    {b.quoteNote && (
                                      <span className="text-[11px] text-sky-800">Note: {b.quoteNote}</span>
                                    )}
                                    {b.paymentSlipStatus === "rejected" && b.paymentRejectReason && (
                                      <span className="text-[11px] text-red-700 font-bold">
                                        Previous slip rejected: {b.paymentRejectReason}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setQuoteInputs((prev) => ({
                                          ...prev,
                                          [b.id]: {
                                            amount: b.quotedAmount ? String(b.quotedAmount) : "",
                                            note: b.quoteNote || "",
                                          },
                                        }));
                                        setEditingQuoteId(b.id);
                                      }}
                                      className="px-3 py-1.5 rounded-xl border border-sky-300 bg-white text-sky-900 text-xs font-bold hover:bg-sky-100 cursor-pointer"
                                    >
                                      Edit Amount
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => handleManualApprovePayment(b)}
                                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                      Manual Approve (Cash) & Lock Date
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Manual Cash Approved Summary (when approved without customer slip) */}
                              {isPaymentLocked && isCashManual && !hasStoredSlip && !b.paymentSlipDeletedAt && (
                                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-black text-emerald-900">
                                      Cash / Direct Payment Approved Manually • Calendar Date Locked RED
                                    </span>
                                    <span className="text-[11px] text-emerald-800">
                                      Approved without customer bank slip{b.quoteNote ? ` (${b.quoteNote})` : ""}. Customer portal updated in real time.
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Step 3 & Post-Approval: Uploaded Slip Card / DB Deletion Badge */}
                              {(hasStoredSlip || (b.paymentSlipDeletedAt && b.paymentSlipStatus === "deleted")) && (
                                <div
                                  className={`p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                                    b.status === "payment_submitted"
                                      ? "bg-purple-50 border-purple-300"
                                      : "bg-[#F7F5EE] border-[#E7E2D0]"
                                  }`}
                                >
                                  {hasStoredSlip ? (
                                    <>
                                      <div className="flex flex-col gap-0.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] text-[10px] font-mono font-black">
                                            {isPdfSlip ? "PDF" : "IMAGE"}
                                          </span>
                                          <span className="font-black text-[#26231B]">
                                            {b.paymentSlipName || "Payment Slip"}
                                          </span>
                                          {b.paymentSlipSize ? (
                                            <span className="text-[11px] text-[#6F6A5A] font-mono">
                                              ({Math.max(1, Math.round(b.paymentSlipSize / 1024))} KB in Firestore DB)
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="text-[11px] text-[#6F6A5A]">
                                          {b.paymentBankUsed ? `Paid to: ${b.paymentBankUsed}` : "Uploaded by customer to Firestore DB"}
                                          {b.status === "payment_submitted" && (
                                            <span className="ml-2 text-purple-800 font-bold">
                                              • Date NOT locked yet — Review slip & approve
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => openSlipReviewModal(b)}
                                          className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black transition-colors cursor-pointer"
                                        >
                                          Review Slip / PDF
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actionLoading === b.id}
                                          onClick={() => {
                                            if (confirm("Delete this payment slip permanently from Firestore database?")) {
                                              handleDeleteSlipFromDb(b.id, b.paymentSlipId);
                                            }
                                          }}
                                          className="px-3 py-1.5 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                                        >
                                          Delete Slip from DB
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-[11px] font-bold text-[#6F6A5A]">
                                      Payment slip reviewed & deleted cleanly from database
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Manual Progress Control Row */}
                              <div className="p-3 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] flex flex-wrap items-center justify-between gap-2.5 text-xs">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[11px] font-black text-[#26231B]">
                                    Manual Progress Update
                                  </span>
                                  <span className="text-[10.5px] text-[#6F6A5A]">
                                    Override stage manually anytime (supports cash payments & date locking without slip)
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                  <select
                                    aria-label={`Manual progress stage for ${b.id}`}
                                    value={selectedManualStage}
                                    onChange={(e) =>
                                      setManualStageDraft((prev) => ({
                                        ...prev,
                                        [b.id]: e.target.value as BookingStatus,
                                      }))
                                    }
                                    className="flex-1 sm:flex-initial min-w-[210px] px-3 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs font-bold text-[#26231B]"
                                  >
                                    <option value="pending">1. Pending Quote (Date Open)</option>
                                    <option value="awaiting_payment">2. Awaiting Payment (Date Open)</option>
                                    <option value="payment_submitted">3. Slip Submitted — Review</option>
                                    <option value="accepted">4. Payment Approved • Lock Date RED</option>
                                    <option value="assigned">5. Driver Assigned (Date Locked RED)</option>
                                    <option value="in_transit">6. In Transit (Date Locked RED)</option>
                                    <option value="delivered">7. Delivered / Completed</option>
                                    <option value="cancelled">8. Cancelled (Unlock Dates)</option>
                                  </select>
                                  <button
                                    type="button"
                                    disabled={actionLoading === b.id || selectedManualStage === (b.status === "booked" ? "accepted" : b.status)}
                                    onClick={() => handleManualProgressUpdate(b)}
                                    className="px-3.5 py-2 rounded-xl bg-[#26231B] hover:bg-[#FFC20E] hover:text-[#26231B] text-white text-xs font-black transition-colors cursor-pointer disabled:opacity-40"
                                  >
                                    Update Stage
                                  </button>
                                </div>
                              </div>

                              {/* Action Buttons Row */}
                              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                                <span className="text-[11px] text-[#6F6A5A]">
                                  Booking ID: <code className="font-mono text-[#26231B]">{b.id}</code>
                                  <span className="ml-2 text-[10px] text-[#6F6A5A]">(Web &amp; Customer Portal only)</span>
                                </span>

                                <div className="flex flex-wrap items-center gap-2">
                                  {b.status === "payment_submitted" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => handleApproveSlipPayment(b)}
                                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                      Approve Payment &amp; Lock Date
                                    </button>
                                  )}

                                  {["accepted", "booked"].includes(b.status) && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => openAssignModal(b)}
                                      className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                    >
                                      Assign Driver
                                    </button>
                                  )}

                                  {b.status === "assigned" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => updateBooking(b.id, "in_transit")}
                                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs"
                                    >
                                      Mark In Transit
                                    </button>
                                  )}

                                  {b.status === "in_transit" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => updateBooking(b.id, "delivered")}
                                      className="px-3.5 py-2 rounded-xl bg-gray-700 hover:bg-gray-800 text-white text-xs font-black transition-colors cursor-pointer shadow-xs"
                                    >
                                      Mark Delivered
                                    </button>
                                  )}

                                  {b.status !== "cancelled" && b.status !== "delivered" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => {
                                        if (confirm("Are you sure you want to cancel this booking and free the calendar date?")) {
                                          updateBooking(b.id, "cancelled");
                                        }
                                      }}
                                      className="px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                                    >
                                      Reject / Cancel
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* CALENDAR VIEW OF DEDICATED VEHICLES */}
              {bookingViewSubTab === "calendar" && (
                <div className="flex flex-col gap-5">
                  {/* Vehicle Selector Pills */}
                  <div className="bg-white p-4 rounded-3xl border border-[#E7E2D0] shadow-xs flex flex-col gap-3">
                    <span className="text-xs font-black text-[#26231B] uppercase tracking-wider">
                      Select Fleet Vehicle to Inspect Calendar:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {fleetVehicles.map((v) => {
                        const isSelected = selectedCalendarVehicle?.plate === v.plate;
                        return (
                          <button
                            key={v.id || v.plate}
                            onClick={() => setSelectedCalendarVehicle(v)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                              isSelected
                                ? "bg-[#26231B] text-[#FFC20E] border-[#26231B] shadow-xs font-black"
                                : "bg-[#F7F5EE] text-[#26231B] border-[#E7E2D0] hover:bg-white"
                            }`}
                          >
                            <span>{v.plate}</span>
                            <span className="text-[10px] ml-1 opacity-70">({v.vehicleType})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Calendar Display */}
                  {loadingFleet || loadingBookings ? (
                    <div className="p-8 text-center bg-white rounded-3xl border border-[#E7E2D0]">
                      <p className="text-xs font-bold text-[#6F6A5A]">Loading live vehicle calendar...</p>
                    </div>
                  ) : selectedCalendarVehicle ? (
                    <div className="bg-white p-5 rounded-3xl border border-[#E7E2D0] shadow-xs flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-[#E7E2D0] pb-3">
                        <div>
                          <h3 className="text-base font-black text-[#26231B]">
                            {selectedCalendarVehicle.plate} — Booking Calendar
                          </h3>
                          <p className="text-xs text-[#6F6A5A]">
                            Red dates are officially locked for bookings. Click any booked date to view details.
                          </p>
                        </div>
                        <button
                          onClick={() => refreshVehicleCalendar(selectedCalendarVehicle.plate)}
                          disabled={calendarLoading}
                          className="px-3 py-1.5 rounded-xl border border-[#E7E2D0] text-xs font-bold hover:bg-[#F7F5EE] transition-colors cursor-pointer"
                        >
                          {calendarLoading ? "Syncing..." : "Refresh"}
                        </button>
                      </div>

                      <BookingCalendar
                        selectedDate={calendarSelectedDate}
                        onSelectDate={setCalendarSelectedDate}
                        bookedDates={vehicleBookedDates}
                        bookingsByDate={vehicleBookingsByDate}
                        isAdmin={true}
                        locale="en"
                        onCancelBooking={async (bookingId) => {
                          await updateBooking(bookingId, "cancelled");
                        }}
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-white rounded-3xl border border-[#E7E2D0]">
                      <p className="text-xs font-bold text-[#6F6A5A]">No vehicle selected. Register vehicles in the Fleet section.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: ONLINE / LIVE LORRY BOOKINGS                       */}
          {/* ========================================================= */}
          {activeNav === "online_bookings" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#E7E2D0]">
                <div>
                  <h2 className="text-sm font-black text-[#26231B]">Live / Empty Return Bookings</h2>
                  <p className="text-xs text-[#6F6A5A]">Bookings received from the Find Empty Lorry live map broadcast.</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black font-mono">
                  {loadingBookings ? "..." : `${onlineBookings.length} Requests`}
                </span>
              </div>

              {loadingBookings ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">Loading live bookings from Firestore...</p>
                </div>
              ) : filteredOnlineBookings.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">No live lorry bookings currently.</p>
                </div>
              ) : (
                filteredOnlineBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E2D0] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-[#FFC20E] text-[#26231B] text-xs font-black font-mono">
                          Live Lorry Booking
                        </span>
                        <span className="text-xs font-bold text-[#26231B]">{b.customerName}</span>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-[#F7F5EE] p-3.5 rounded-2xl border border-[#E7E2D0]">
                      <div>
                        <span className="text-[#6F6A5A]">Phone: </span>
                        {b.customerPhone ? (
                          <a
                            href={`tel:${String(b.customerPhone || "").replace(/\s+/g, "")}`}
                            className="font-bold text-[#1E9E5A] font-mono hover:underline"
                          >
                            {b.customerPhone}
                          </a>
                        ) : (
                          <span className="text-[#6F6A5A] italic font-mono">Not provided</span>
                        )}
                        <div className="mt-1">
                          <span className="text-[#6F6A5A]">Route: </span>
                          <b>{b.pickupCity}</b> → <b>{b.deliveryCity}</b>
                        </div>
                      </div>
                      <div>
                        <div><span className="text-[#6F6A5A]">Date: </span><b>{b.date}</b></div>
                        {b.packageDetails && <div className="mt-1 text-[#6F6A5A]"><b>Notes:</b> {b.packageDetails}</div>}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {b.status === "pending" && (
                        <button
                          onClick={() => updateBooking(b.id, "accepted")}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black cursor-pointer"
                        >
                          Accept
                        </button>
                      )}
                      <button
                        onClick={() => openAssignModal(b)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#FFC20E] text-[#26231B] text-xs font-black cursor-pointer"
                      >
                        Assign Driver
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: FLEET LORRIES MANAGEMENT (Add Lorry)               */}
          {/* ========================================================= */}
          {activeNav === "fleet" && (
            <div className="flex flex-col gap-5">
              {/* Top Action & Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-[#E7E2D0] shadow-xs">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search lorries by plate, type, or city..."
                    value={lorrySearch}
                    onChange={(e) => setLorrySearch(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleOpenAddLorry}
                  className="px-4 py-2.5 rounded-xl bg-[#26231B] hover:bg-[#3D3A31] text-white text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <span>+ Add New Fleet Lorry</span>
                </button>
              </div>

              {/* Lorries Grid */}
              {loadingFleet ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">Loading fleet vehicles from Firestore...</p>
                </div>
              ) : filteredFleet.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">No fleet vehicles found. Click &quot;+ Add New Fleet Lorry&quot; above.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredFleet.map((v) => {
                    const imgs = Array.isArray((v as any).images) && (v as any).images.length > 0
                      ? (v as any).images
                      : (v.imageUrl ? [v.imageUrl] : []);

                    return (
                      <div
                        key={v.id || v.plate}
                        className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between gap-4"
                      >
                        {/* Vehicle Photos Gallery / Preview */}
                        <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-[#F7F5EE] border border-[#E7E2D0] flex items-center justify-center">
                          {imgs.length > 0 ? (
                            <img
                              src={imgs[0]}
                              alt={v.plate}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-3 text-xs text-[#6F6A5A]">
                              <span className="block font-bold">No Photos Uploaded</span>
                              <span className="text-[10px]">Add photos via Edit button</span>
                            </div>
                          )}

                          {imgs.length > 0 && (
                            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-[#26231B]/80 text-white text-[10px] font-mono font-bold">
                              {imgs.length}/3 Photos
                            </span>
                          )}
                        </div>

                        {/* Vehicle Specs */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 rounded-lg bg-[#26231B] text-[#FFC20E] font-black text-xs font-mono">
                              {v.plate}
                            </span>
                            <span className="text-[11px] font-bold text-[#6F6A5A]">
                              {v.startLocation || "Head Office"}
                            </span>
                          </div>

                          <h3 className="text-sm font-black text-[#26231B] mt-1">{v.vehicleType}</h3>
                          <div className="text-[11.5px] text-[#6F6A5A]">
                            <span>Dimensions: </span>
                            <b className="text-[#26231B]">{(v as any).capacity || "14.5ft × 6.5ft × 7ft"}</b>
                          </div>
                          <div className="text-[11.5px] text-[#6F6A5A]">
                            <span>Max Payload: </span>
                            <b className="text-[#26231B]">{(v as any).maxWeight || "3.5 Tons"}</b>
                          </div>
                          <div className="text-[11.5px] text-[#6F6A5A]">
                            <span>Assigned Driver: </span>
                            <b className="text-[#26231B]">{v.driverName || "Unassigned"}</b>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-3 border-t border-[#E7E2D0]">
                          <button
                            onClick={() => {
                              setSelectedCalendarVehicle(v);
                              setActiveNav("individual_bookings");
                              setBookingViewSubTab("calendar");
                            }}
                            className="text-xs font-extrabold text-[#1E9E5A] hover:underline cursor-pointer"
                          >
                            View Calendar
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenEditLorry(v)}
                              className="px-3 py-1.5 rounded-xl border border-[#E7E2D0] hover:bg-[#F7F5EE] text-xs font-bold transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteLorry(v.plate)}
                              className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 5: RIDERS & DRIVERS REGISTRY                          */}
          {/* ========================================================= */}
          {activeNav === "riders" && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-[#E7E2D0] shadow-xs">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search riders by name, ID, or phone..."
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleOpenAddRider}
                  className="px-4 py-2.5 rounded-xl bg-[#26231B] hover:bg-[#3D3A31] text-white text-xs font-black transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <span>+ Register New Rider</span>
                </button>
              </div>

              {loadingDrivers ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">Loading riders from Firestore...</p>
                </div>
              ) : filteredDrivers.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">No drivers registered. Click &quot;+ Register New Rider&quot; above.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDrivers.map((d) => (
                    <div
                      key={d.driverId}
                      className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between gap-4"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between border-b border-[#E7E2D0] pb-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] text-[11px] font-mono font-black">
                            {d.driverId}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            d.active
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                              : "bg-gray-100 text-gray-600 border-gray-200"
                          }`}>
                            {d.active ? "Active On Duty" : "Off Duty"}
                          </span>
                        </div>

                        <h3 className="text-base font-black text-[#26231B]">{d.name}</h3>

                        <div className="text-xs text-[#6F6A5A] flex flex-col gap-1">
                          <div>
                            <span>Phone: </span>
                            <a href={`tel:${d.phone}`} className="font-mono font-bold text-[#1E9E5A] hover:underline">
                              {d.phone}
                            </a>
                          </div>
                          {d.nic && (
                            <div>
                              <span>NIC: </span>
                              <b className="font-mono text-[#26231B]">{d.nic}</b>
                            </div>
                          )}
                          <div>
                            <span>Assigned Lorry: </span>
                            <b className="font-mono text-[#26231B]">{d.plate || "Unassigned"}</b>
                          </div>
                          <div>
                            <span>Service Route: </span>
                            <b className="text-[#26231B]">{d.route || "Island-wide"}</b>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#E7E2D0]">
                        <button
                          onClick={() => handleToggleRider(d.driverId, d.active)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                            d.active
                              ? "border-amber-300 text-amber-800 hover:bg-amber-50"
                              : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                          }`}
                        >
                          {d.active ? "Set Inactive" : "Set Active"}
                        </button>
                        <button
                          onClick={() => handleDeleteRider(d.driverId, d.name)}
                          className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 6: SYSTEM & PAYMENT SETTINGS (Bank Accounts & Slips)  */}
          {/* ========================================================= */}
          {activeNav === "settings" && (
            <div className="flex flex-col gap-6">
              {/* 1. Company Bank Account Numbers Config */}
              <form
                onSubmit={handleSaveBankSettings}
                className="p-6 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E2D0] pb-4">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">
                      Company Bank Account Numbers
                    </h2>
                    <p className="text-xs text-[#6F6A5A] mt-0.5">
                      Customers see active accounts when paying for approved quote requests and uploading payment slips. Saved in Cloud Firestore.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setBankAccounts((prev) => [
                        ...prev,
                        {
                          id: `bank-${Date.now()}`,
                          bankName: "",
                          branch: "",
                          accountName: "Sithumina Transport (Pvt) Ltd",
                          accountNumber: "",
                          active: true,
                        },
                      ])
                    }
                    className="px-3.5 py-2 rounded-xl border border-[#E7E2D0] hover:bg-[#F7F5EE] text-xs font-bold text-[#26231B] cursor-pointer"
                  >
                    + Add Bank Account
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {bankAccounts.map((acc, idx) => (
                    <div
                      key={acc.id || idx}
                      className="p-4 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#26231B] text-[#FFC20E] text-[11px] font-black font-mono">
                          Bank Account {idx + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#26231B] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={acc.active}
                              onChange={(e) =>
                                setBankAccounts((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, active: e.target.checked } : item
                                  )
                                )
                              }
                              className="rounded border-[#E7E2D0]"
                            />
                            <span>Active</span>
                          </label>
                          {bankAccounts.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setBankAccounts((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                            Bank Name *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Bank of Ceylon (BOC)"
                            value={acc.bankName}
                            onChange={(e) =>
                              setBankAccounts((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, bankName: e.target.value } : item
                                )
                              )
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs text-[#26231B]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                            Branch
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Peliyagoda Branch"
                            value={acc.branch}
                            onChange={(e) =>
                              setBankAccounts((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, branch: e.target.value } : item
                                )
                              )
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs text-[#26231B]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                          Account Holder Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Sithumina Transport (Pvt) Ltd"
                          value={acc.accountName}
                          onChange={(e) =>
                            setBankAccounts((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, accountName: e.target.value } : item
                              )
                            )
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs text-[#26231B]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                          Account Number *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. 0084 5678 9012"
                          value={acc.accountNumber}
                          onChange={(e) =>
                            setBankAccounts((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, accountNumber: e.target.value } : item
                              )
                            )
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs font-mono font-bold text-[#26231B]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E7E2D0]">
                  <button
                    type="submit"
                    disabled={savingBankSettings}
                    className="px-5 py-2.5 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingBankSettings ? "Saving..." : "Save Bank Settings to Database"}
                  </button>
                </div>
              </form>

              {/* 2. Stored Payment Slips Manager (Cloud Firestore DB) */}
              <div className="p-6 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7E2D0] pb-4">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">
                      Stored Payment Slips (Cloud Database)
                    </h2>
                    <p className="text-xs text-[#6F6A5A] mt-0.5">
                      Review uploaded PDFs & image slips directly from Firestore and delete reviewed slips to keep the database clean.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-[#F7F5EE] border border-[#E7E2D0] text-xs font-mono font-bold text-[#26231B]">
                    {storedSlips.length} Stored in DB
                  </span>
                </div>

                {storedSlips.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                    <p className="text-xs font-bold text-[#6F6A5A]">
                      No payment slips stored in database currently.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {storedSlips.map((slip) => {
                      const linkedBooking = bookings.find((bk) => bk.id === slip.bookingId);
                      const isPdf =
                        slip.mimeType === "application/pdf" ||
                        slip.fileName.toLowerCase().endsWith(".pdf");

                      return (
                        <div
                          key={slip.id}
                          className="p-4 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] text-[10px] font-mono font-black">
                                {isPdf ? "PDF" : "IMAGE"}
                              </span>
                              <span className="font-black text-[#26231B]">{slip.fileName}</span>
                              <span className="font-mono text-[11px] text-[#6F6A5A]">
                                ({Math.max(1, Math.round((slip.fileSize || 0) / 1024))} KB)
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  slip.status === "approved"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : slip.status === "rejected"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-purple-50 text-purple-800 border-purple-200"
                                }`}
                              >
                                {slip.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#6F6A5A] flex flex-wrap items-center gap-3">
                              <span>Booking: <b className="font-mono text-[#26231B]">{slip.bookingId}</b></span>
                              <span>Customer: <b>{slip.customerName}</b> ({slip.customerPhone})</span>
                              <span>Amount: <b className="font-mono text-[#26231B]">Rs. {(slip.amount || 0).toLocaleString()}</b></span>
                              {slip.bankAccountUsed && <span>Bank: <b>{slip.bankAccountUsed}</b></span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openSlipReviewModal(linkedBooking, slip)}
                              className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black transition-colors cursor-pointer"
                            >
                              Review / Preview
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading === slip.bookingId || actionLoading === slip.id}
                              onClick={() => {
                                if (confirm("Delete this payment slip permanently from Firestore database?")) {
                                  handleDeleteSlipFromDb(slip.bookingId, slip.id);
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                            >
                              Delete from DB
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 7: VEHICLE & PARTNER REGISTRATIONS                    */}
          {/* ========================================================= */}
          {activeNav === "vehicle_registrations" && (
            <div className="flex flex-col gap-5">
              {/* Top Summary Bar & Filters */}
              <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-[#26231B] flex items-center gap-2">
                      <span>Vehicle & Fleet Partner Registrations</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-mono text-[#6F6A5A]">
                        {registrations.length} Total
                      </span>
                    </h2>
                    <p className="text-xs text-[#6F6A5A] mt-0.5">
                      Lorry owners registering to join the Sithumina transport network via /register-vehicle.
                    </p>
                  </div>

                  {/* Status Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                    <button
                      type="button"
                      onClick={() => setRegFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        regFilter === "all"
                          ? "bg-[#26231B] text-[#FFC20E] shadow-xs"
                          : "text-[#6F6A5A] hover:text-[#26231B]"
                      }`}
                    >
                      All ({registrations.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegFilter("pending")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        regFilter === "pending"
                          ? "bg-amber-400 text-[#26231B] shadow-xs"
                          : "text-[#6F6A5A] hover:text-amber-700"
                      }`}
                    >
                      <span>Pending</span>
                      {pendingRegistrationsCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-[#26231B] text-[#FFC20E]">
                          {pendingRegistrationsCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegFilter("approved")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        regFilter === "approved"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-[#6F6A5A] hover:text-emerald-700"
                      }`}
                    >
                      Approved ({approvedRegistrationsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegFilter("rejected")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        regFilter === "rejected"
                          ? "bg-rose-600 text-white shadow-xs"
                          : "text-[#6F6A5A] hover:text-rose-700"
                      }`}
                    >
                      Rejected ({rejectedRegistrationsCount})
                    </button>
                  </div>
                </div>

                {/* Search Input */}
                <div className="pt-3 border-t border-[#E7E2D0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F6A5A] pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search by owner name, phone, plate number, base city, vehicle type..."
                      value={regSearch}
                      onChange={(e) => setRegSearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#26231B] placeholder:text-[#8A836E] transition-colors"
                    />
                    {regSearch.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setRegSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E7E2D0]/70 hover:bg-[#FFC20E] text-[#26231B] flex items-center justify-center text-xs font-black transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-bold text-[#6F6A5A] flex-shrink-0">
                    Showing <b className="text-[#26231B]">{filteredRegistrations.length}</b> of{" "}
                    <b className="text-[#26231B]">{registrations.length}</b>
                  </span>
                </div>
              </div>

              {/* Registrations List / Grid */}
              {loadingRegistrations ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#6F6A5A]">Syncing vehicle registrations...</p>
                </div>
              ) : filteredRegistrations.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] flex items-center justify-center mb-3 text-[#6F6A5A]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
                      <path d="M15 18H9"/>
                      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
                      <circle cx="17" cy="18" r="2"/>
                      <circle cx="7" cy="18" r="2"/>
                    </svg>
                  </div>
                  <h3 className="text-sm font-black text-[#26231B]">No Vehicle Registrations Found</h3>
                  <p className="text-xs text-[#6F6A5A] mt-1 max-w-sm">
                    {regSearch.trim() || regFilter !== "all"
                      ? "No registrations match your current search or filter criteria."
                      : "No vehicle registration applications have been submitted yet via /register-vehicle."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredRegistrations.map((reg) => {
                    const plate = (reg.plateNumber || reg.vehicleNumber || "UNREGISTERED").toUpperCase();
                    const isActing = regActionId === reg.id;
                    const waUrl = formatWhatsAppUrl(reg.phone);

                    return (
                      <div
                        key={reg.id}
                        className="p-5 sm:p-6 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs hover:border-[#FFC20E] transition-all flex flex-col justify-between gap-4"
                      >
                        {/* Header: Plate, Vehicle Type, Status */}
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-3 py-1 rounded-xl bg-[#26231B] text-[#FFC20E] font-black font-mono text-xs tracking-wider shadow-xs">
                                {plate}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-[#F7F5EE] border border-[#E7E2D0] text-xs font-bold text-[#26231B]">
                                {reg.vehicleType || "Lorry"}
                              </span>
                              {reg.capacity && (
                                <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                                  {reg.capacity}
                                </span>
                              )}
                            </div>

                            {/* Status Badge */}
                            <div>
                              {reg.status === "pending" && (
                                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-black flex items-center gap-1.5 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                                  Pending Review
                                </span>
                              )}
                              {reg.status === "approved" && (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Approved & Active
                                </span>
                              )}
                              {reg.status === "rejected" && (
                                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  Rejected
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Owner Information */}
                          <div className="mt-3.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A]">Lorry Owner / Partner</span>
                            <h3 className="text-base font-black text-[#26231B]">{reg.ownerName}</h3>
                          </div>

                          {/* Details Grid */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Contact Number</span>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs font-mono font-bold text-[#26231B]">{reg.phone}</span>
                                <a
                                  href={`tel:${reg.phone}`}
                                  className="px-2 py-0.5 rounded-lg bg-white border border-[#E7E2D0] hover:bg-[#FFC20E] text-[10px] font-bold text-[#26231B] transition-colors"
                                  title="Call Phone"
                                >
                                  📞 Call
                                </a>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-[10px] font-bold text-white transition-colors"
                                    title="WhatsApp Chat"
                                  >
                                    💬 WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Location / Base</span>
                              <span className="text-xs font-bold text-[#26231B] mt-0.5 block">
                                {reg.baseCity ? `${reg.baseCity}, ` : ""}{reg.province || "Western Province"}
                              </span>
                            </div>

                            <div className="sm:col-span-2 flex items-center justify-between text-[11px] text-[#6F6A5A] pt-1 border-t border-[#E7E2D0]/60">
                              <span>Submitted: {formatInquiryDate(reg.createdAt)}</span>
                              <span className="font-mono text-[10px]">ID: {reg.id}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-3 border-t border-[#E7E2D0] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {reg.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleApproveRegistration(reg)}
                                  className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {isActing ? (
                                    <span>Approving...</span>
                                  ) : (
                                    <>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span>Approve & Add to Live Fleet</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleUpdateRegistrationStatus(reg.id, "rejected")}
                                  className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {reg.status === "approved" && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateRegistrationStatus(reg.id, "pending")}
                                className="px-3 py-1.5 rounded-xl border border-[#E7E2D0] hover:bg-[#F7F5EE] text-[#26231B] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Reset to Pending
                              </button>
                            )}

                            {reg.status === "rejected" && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateRegistrationStatus(reg.id, "pending")}
                                className="px-3 py-1.5 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Re-open as Pending
                              </button>
                            )}
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleDeleteRegistration(reg.id, plate)}
                            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Application"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 8: CONTACT INQUIRIES & SUPPORT                        */}
          {/* ========================================================= */}
          {activeNav === "contact_submissions" && (
            <div className="flex flex-col gap-5">
              {/* Top Summary Bar & Filters */}
              <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-[#26231B] flex items-center gap-2">
                      <span>Contact Inquiries & Freight Quotes</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-mono text-[#6F6A5A]">
                        {inquiries.length} Total
                      </span>
                    </h2>
                    <p className="text-xs text-[#6F6A5A] mt-0.5">
                      Direct customer inquiries, cargo details and rate quote requests submitted via /contact.
                    </p>
                  </div>

                  {/* Status Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                    <button
                      type="button"
                      onClick={() => setInquiryFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        inquiryFilter === "all"
                          ? "bg-[#26231B] text-[#FFC20E] shadow-xs"
                          : "text-[#6F6A5A] hover:text-[#26231B]"
                      }`}
                    >
                      All ({inquiries.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInquiryFilter("unread")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        inquiryFilter === "unread"
                          ? "bg-amber-400 text-[#26231B] shadow-xs"
                          : "text-[#6F6A5A] hover:text-amber-700"
                      }`}
                    >
                      <span>Unread</span>
                      {unreadInquiriesCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-[#26231B] text-[#FFC20E]">
                          {unreadInquiriesCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInquiryFilter("resolved")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        inquiryFilter === "resolved"
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-[#6F6A5A] hover:text-emerald-700"
                      }`}
                    >
                      Resolved ({resolvedInquiriesCount})
                    </button>
                  </div>
                </div>

                {/* Search Input */}
                <div className="pt-3 border-t border-[#E7E2D0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F6A5A] pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search by customer name, phone, email, subject, message content..."
                      value={inquirySearch}
                      onChange={(e) => setInquirySearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#26231B] placeholder:text-[#8A836E] transition-colors"
                    />
                    {inquirySearch.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setInquirySearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E7E2D0]/70 hover:bg-[#FFC20E] text-[#26231B] flex items-center justify-center text-xs font-black transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-bold text-[#6F6A5A] flex-shrink-0">
                    Showing <b className="text-[#26231B]">{filteredInquiries.length}</b> of{" "}
                    <b className="text-[#26231B]">{inquiries.length}</b>
                  </span>
                </div>
              </div>

              {/* Inquiries List */}
              {loadingInquiries ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#6F6A5A]">Loading contact inquiries...</p>
                </div>
              ) : filteredInquiries.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] flex items-center justify-center mb-3 text-[#6F6A5A]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-black text-[#26231B]">No Inquiries Found</h3>
                  <p className="text-xs text-[#6F6A5A] mt-1 max-w-sm">
                    {inquirySearch.trim() || inquiryFilter !== "all"
                      ? "No contact submissions match your search or filter."
                      : "No customer inquiries have been submitted yet via /contact."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredInquiries.map((inq) => {
                    const isActing = inquiryActionId === inq.id;
                    const waUrl = formatWhatsAppUrl(inq.phone);

                    return (
                      <div
                        key={inq.id}
                        className={`p-5 sm:p-6 rounded-3xl bg-white border transition-all flex flex-col gap-4 shadow-xs ${
                          inq.status === "unread"
                            ? "border-amber-300 ring-1 ring-amber-200"
                            : "border-[#E7E2D0] hover:border-[#FFC20E]"
                        }`}
                      >
                        {/* Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-black text-[#26231B]">{inq.name}</h3>
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#F7F5EE] border border-[#E7E2D0] text-xs font-bold text-[#26231B]">
                              {inq.subject || "General Inquiry"}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-medium text-[#6F6A5A]">
                              {formatInquiryDate(inq.createdAt)}
                            </span>
                            {inq.status === "unread" ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-black flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-ping" />
                                Unread
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                Resolved
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Contact Methods Bar */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-[#6F6A5A] font-bold">Contact:</span>
                          <span className="font-mono font-bold text-[#26231B]">{inq.phone}</span>
                          <a
                            href={`tel:${inq.phone}`}
                            className="px-2.5 py-1 rounded-lg bg-[#F7F5EE] border border-[#E7E2D0] hover:bg-[#FFC20E] text-[11px] font-bold text-[#26231B] transition-colors"
                          >
                            📞 Call
                          </a>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-[11px] font-bold text-white transition-colors"
                            >
                              💬 WhatsApp
                            </a>
                          )}
                          {inq.email && (
                            <a
                              href={`mailto:${inq.email}`}
                              className="px-2.5 py-1 rounded-lg bg-[#F7F5EE] border border-[#E7E2D0] hover:bg-sky-100 hover:text-sky-800 text-[11px] font-bold text-[#26231B] transition-colors"
                            >
                              ✉️ {inq.email}
                            </a>
                          )}
                        </div>

                        {/* Message Body */}
                        <div className="p-4 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] text-xs text-[#26231B] leading-relaxed whitespace-pre-wrap font-sans">
                          {inq.message}
                        </div>

                        {/* Bottom Action Footer */}
                        <div className="pt-2 border-t border-[#E7E2D0] flex items-center justify-between">
                          <div>
                            {inq.status === "unread" ? (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateInquiryStatus(inq.id, "resolved")}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                              >
                                {isActing ? (
                                  <span>Updating...</span>
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Mark as Resolved</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateInquiryStatus(inq.id, "unread")}
                                className="px-3.5 py-1.5 rounded-xl border border-[#E7E2D0] hover:bg-[#F7F5EE] text-[#26231B] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Mark as Unread
                              </button>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleDeleteInquiry(inq.id, inq.name)}
                            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Inquiry"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ========================================================= */}
      {/* MODAL 1: ADD / EDIT FLEET LORRY                           */}
      {/* ========================================================= */}
      {showLorryModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-start justify-center p-4 py-6 backdrop-blur-xs overflow-y-auto"
          onClick={() => setShowLorryModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-[#E7E2D0] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E7E2D0] pb-3 mb-4">
              <h2 className="text-base font-black text-[#26231B]">
                {editingLorryPlate ? `Edit Lorry (${editingLorryPlate})` : "Register New Fleet Lorry"}
              </h2>
              <button
                type="button"
                onClick={() => setShowLorryModal(false)}
                className="text-[#6F6A5A] hover:text-[#26231B] font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveLorry} className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Vehicle Plate *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. WP LB-4521"
                    value={lorryForm.plate}
                    onChange={(e) => setLorryForm((p) => ({ ...p, plate: e.target.value }))}
                    disabled={Boolean(editingLorryPlate)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Vehicle Type *</label>
                  <select
                    value={lorryForm.vehicleType}
                    onChange={(e) => setLorryForm((p) => ({ ...p, vehicleType: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  >
                    {VEHICLE_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Dimensions</label>
                  <input
                    type="text"
                    placeholder="14.5ft × 6.5ft × 7ft"
                    value={lorryForm.capacity}
                    onChange={(e) => setLorryForm((p) => ({ ...p, capacity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Max Payload</label>
                  <input
                    type="text"
                    placeholder="3.5 Tons (3,500 kg)"
                    value={lorryForm.maxWeight}
                    onChange={(e) => setLorryForm((p) => ({ ...p, maxWeight: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Base Terminal / City</label>
                  <input
                    type="text"
                    placeholder="Peliyagoda / Colombo"
                    value={lorryForm.baseCity}
                    onChange={(e) => setLorryForm((p) => ({ ...p, baseCity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Assign Driver</label>
                  <select
                    value={lorryForm.rider}
                    onChange={(e) => setLorryForm((p) => ({ ...p, rider: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  >
                    <option value="Unassigned">Unassigned</option>
                    {drivers.map((d) => (
                      <option key={d.driverId} value={d.name}>{d.name} ({d.driverId})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Photos Upload Section (3 photos) */}
              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">
                  Upload Lorry Photos (Up to 3 Photos)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleLorryImageUpload}
                  className="w-full text-xs text-[#6F6A5A] file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-[#FFC20E] file:text-[#26231B] cursor-pointer"
                />

                {lorryForm.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {lorryForm.images.map((img, idx) => (
                      <div key={idx} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[#E7E2D0]">
                        <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setLorryForm((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Dedicated fleet lorry available for individual bookings across Sri Lanka."
                  value={lorryForm.description}
                  onChange={(e) => setLorryForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E2D0]">
                <button
                  type="button"
                  onClick={() => setShowLorryModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E7E2D0] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lorrySubmitting}
                  className="px-5 py-2 rounded-xl bg-[#26231B] text-white hover:bg-[#FFC20E] hover:text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {lorrySubmitting ? "Saving..." : "Save Fleet Lorry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 2: REGISTER NEW RIDER                               */}
      {/* ========================================================= */}
      {showRiderModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-start justify-center p-4 py-6 backdrop-blur-xs overflow-y-auto"
          onClick={() => setShowRiderModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E7E2D0] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E7E2D0] pb-3 mb-4">
              <h2 className="text-base font-black text-[#26231B]">Register New Dispatch Rider</h2>
              <button
                type="button"
                onClick={() => setShowRiderModal(false)}
                className="text-[#6F6A5A] hover:text-[#26231B] font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRider} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Driver ID</label>
                <input
                  type="text"
                  readOnly
                  value={riderForm.driverId}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. D. M. Perera"
                  value={riderForm.name}
                  onChange={(e) => setRiderForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="077 123 4567"
                    value={riderForm.phone}
                    onChange={(e) => setRiderForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">NIC Number</label>
                  <input
                    type="text"
                    placeholder="199012345678"
                    value={riderForm.nic}
                    onChange={(e) => setRiderForm((p) => ({ ...p, nic: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Assign Lorry Plate</label>
                <select
                  value={riderForm.plate}
                  onChange={(e) => setRiderForm((p) => ({ ...p, plate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                >
                  <option value="">Unassigned</option>
                  {fleetVehicles.map((v) => (
                    <option key={v.plate} value={v.plate}>{v.plate} ({v.vehicleType})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Primary Route</label>
                <input
                  type="text"
                  placeholder="Colombo – Island-wide"
                  value={riderForm.route}
                  onChange={(e) => setRiderForm((p) => ({ ...p, route: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activeDuty"
                  checked={riderForm.active}
                  onChange={(e) => setRiderForm((p) => ({ ...p, active: e.target.checked }))}
                  className="rounded border-[#E7E2D0] text-[#1E9E5A]"
                />
                <label htmlFor="activeDuty" className="text-xs font-bold text-[#26231B] cursor-pointer">
                  Active On Duty Status
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E2D0]">
                <button
                  type="button"
                  onClick={() => setShowRiderModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E7E2D0] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={riderSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#26231B] text-white hover:bg-[#FFC20E] hover:text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {riderSubmitting ? "Registering..." : "Register Rider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 3: MANUAL BOOKING CREATION                          */}
      {/* ========================================================= */}
      {showManualModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-start justify-center p-4 py-6 backdrop-blur-xs overflow-y-auto"
          onClick={() => setShowManualModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-[#E7E2D0] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E7E2D0] pb-3 mb-4">
              <h2 className="text-base font-black text-[#26231B]">Create Manual Booking (Direct Lock)</h2>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-[#6F6A5A] hover:text-[#26231B] font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Customer Name"
                    value={manualForm.customerName}
                    onChange={(e) => setManualForm((p) => ({ ...p, customerName: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="077 123 4567"
                    value={manualForm.customerPhone}
                    onChange={(e) => setManualForm((p) => ({ ...p, customerPhone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Pickup Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Deniyaya"
                    value={manualForm.pickupCity}
                    onChange={(e) => setManualForm((p) => ({ ...p, pickupCity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Delivery Destination *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Panadura"
                    value={manualForm.deliveryCity}
                    onChange={(e) => setManualForm((p) => ({ ...p, deliveryCity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Select Vehicle (Fleet) *</label>
                <select
                  required
                  value={manualForm.plate || (fleetVehicles[0]?.plate || "")}
                  onChange={(e) => {
                    const selPlate = e.target.value;
                    const matched = fleetVehicles.find((v) => v.plate === selPlate);
                    setManualForm((p) => ({
                      ...p,
                      plate: selPlate,
                      vehicleType: (matched && matched.vehicleType) ? matched.vehicleType : (p.vehicleType || "Lorry"),
                    }));
                    if (selPlate) {
                      void loadModalBookedDates(selPlate);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B]"
                >
                  {fleetVehicles.length === 0 ? (
                    <option value="">No fleet vehicles registered</option>
                  ) : (
                    fleetVehicles.map((v) => (
                      <option key={v.plate} value={v.plate}>
                        {v.plate} — {v.vehicleType}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-black text-[#26231B]">
                      Select Dates to Lock * <span className="font-normal text-[#6F6A5A]">({manualForm.dates.length} selected)</span>
                    </label>
                    <p className="text-[11px] text-[#6F6A5A]">
                      Dates in <span className="font-bold text-red-600">RED</span> are already booked for this lorry. Click available dates to select/deselect.
                    </p>
                  </div>
                  {manualForm.dates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setManualForm((p) => ({ ...p, dates: [], date: "" }))}
                      className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {modalCalendarLoading ? (
                  <div className="p-8 text-center bg-white rounded-2xl border border-[#E7E2D0]">
                    <span className="text-xs font-bold text-[#6F6A5A]">Loading vehicle calendar...</span>
                  </div>
                ) : (
                  <BookingCalendar
                    selectedDates={manualForm.dates}
                    onSelectDate={(d) => {
                      setManualForm((p) => {
                        const exists = p.dates.includes(d);
                        const next = exists ? p.dates.filter((x) => x !== d) : [...p.dates, d].sort();
                        return { ...p, dates: next, date: next[0] || "" };
                      });
                    }}
                    onToggleDate={(d) => {
                      setManualForm((p) => {
                        const exists = p.dates.includes(d);
                        const next = exists ? p.dates.filter((x) => x !== d) : [...p.dates, d].sort();
                        return { ...p, dates: next, date: next[0] || "" };
                      });
                    }}
                    bookedDates={modalBookedDates}
                    bookingsByDate={modalBookingsByDate}
                    isAdmin={true}
                    locale="en"
                  />
                )}

                {manualForm.dates.length > 0 ? (
                  <div className="mt-1 pt-2 border-t border-[#E7E2D0]">
                    <span className="text-[11px] font-bold text-[#6F6A5A] block mb-1">
                      Selected Booking Dates ({manualForm.dates.length} Days):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {manualForm.dates.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FFC20E] text-[#26231B] text-xs font-mono font-black border border-[#E7A800]"
                        >
                          <span>{d}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = manualForm.dates.filter((x) => x !== d);
                              setManualForm((p) => ({ ...p, dates: next, date: next[0] || "" }));
                            }}
                            className="hover:text-red-700 text-xs font-bold leading-none cursor-pointer"
                            title="Remove date"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-red-600 font-bold italic pt-1">
                    Please click at least one date on the calendar above.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Nature of Goods *</label>
                <select
                  value={manualForm.cargoNature}
                  onChange={(e) => setManualForm((p) => ({ ...p, cargoNature: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                >
                  {CARGO_NATURE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Special Notes</label>
                <textarea
                  rows={2}
                  placeholder="Notes or cargo instructions"
                  value={manualForm.notes}
                  onChange={(e) => setManualForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E2D0]">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E7E2D0] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#FFC20E] text-[#26231B] text-xs font-black hover:bg-[#e6ad00] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {manualSubmitting ? "Locking..." : "Lock Date & Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 4: ASSIGN DRIVER TO BOOKING                         */}
      {/* ========================================================= */}
      {assignModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setAssignModal(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E7E2D0]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E7E2D0] pb-3 mb-4">
              <h2 className="text-base font-black text-[#26231B]">Assign Driver to Booking</h2>
              <button
                type="button"
                onClick={() => setAssignModal(null)}
                className="text-[#6F6A5A] hover:text-[#26231B] font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs bg-[#F7F5EE] p-3.5 rounded-2xl border border-[#E7E2D0] mb-4">
              <div>Customer: <b>{assignModal.booking.customerName}</b> ({assignModal.booking.customerPhone || "N/A"})</div>
              <div className="mt-1">Route: <b>{assignModal.booking.pickupCity}</b> → <b>{assignModal.booking.deliveryCity}</b></div>
              <div className="mt-1">Date: <b>{assignModal.booking.date}</b></div>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Select Driver</label>
                <select
                  value={assignModal.driverName}
                  onChange={(e) => {
                    const drv = drivers.find((d) => d.name === e.target.value);
                    setAssignModal((p) => {
                      if (!p) return null;
                      const preservedPlate =
                        p.booking.bookingType === "individual_vehicle" && p.booking.assignedPlate
                          ? p.booking.assignedPlate
                          : drv?.plate || p.plate;
                      const derivedLorryId = preservedPlate
                        ? `lorry-${normalizePlate(preservedPlate).toLowerCase()}`
                        : p.lorryId;
                      return {
                        ...p,
                        driverName: e.target.value,
                        driverPhone: drv?.phone || p.driverPhone,
                        plate: preservedPlate,
                        lorryId: derivedLorryId,
                      };
                    });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                >
                  {drivers.map((d) => (
                    <option key={d.driverId} value={d.name}>{d.name} ({d.driverId}) - {d.phone}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">
                  Rider / Driver Mobile Number (Shown to Customer)
                </label>
                <input
                  type="tel"
                  placeholder="077 123 4567"
                  value={assignModal.driverPhone}
                  onChange={(e) => setAssignModal((p) => (p ? { ...p, driverPhone: e.target.value } : null))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#26231B] mb-1">Assigned Vehicle Plate</label>
                <input
                  type="text"
                  placeholder="WP LB-4521"
                  value={assignModal.plate}
                  onChange={(e) => setAssignModal((p) => p ? { ...p, plate: e.target.value } : null)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                />
              </div>

              {assignModal.booking.bookingType === "individual_vehicle" && (
                <p className="text-[11px] text-[#6F6A5A] bg-[#F7F5EE] px-3 py-2 rounded-xl border border-[#E7E2D0]">
                  Individual vehicle booking: driver contact is displayed on Customer Portal only (not sent to the Rider mobile app).
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E7E2D0] mt-2">
                <button
                  type="button"
                  onClick={() => setAssignModal(null)}
                  className="px-4 py-2 rounded-xl border border-[#E7E2D0] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmAssign}
                  className="px-5 py-2 rounded-xl bg-[#26231B] text-white hover:bg-[#FFC20E] hover:text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs"
                >
                  Confirm Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL 5: PAYMENT SLIP (PDF & IMAGE) REVIEW MODAL          */}
      {/* ========================================================= */}
      {reviewModal && (() => {
        const linkedBooking =
          reviewModal.booking ||
          (reviewModal.slip
            ? bookings.find((bk) => bk.id === reviewModal.slip?.bookingId)
            : reviewModal.slipMeta
            ? bookings.find((bk) => bk.id === reviewModal.slipMeta?.bookingId)
            : undefined);
        const slipFile = reviewModal.slip;
        const isPdf = slipFile
          ? slipFile.mimeType === "application/pdf" ||
            slipFile.fileName.toLowerCase().endsWith(".pdf")
          : false;
        const targetBookingId =
          linkedBooking?.id || slipFile?.bookingId || reviewModal.slipMeta?.bookingId || "";
        const targetSlipId = slipFile?.id || reviewModal.slipMeta?.id || "";

        return (
          <div
            className="fixed inset-0 z-[99999] bg-black/70 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs overflow-y-auto"
            onClick={closeReviewModal}
          >
            <div
              className="w-full max-w-3xl max-h-[92vh] bg-white rounded-3xl p-5 sm:p-6 shadow-2xl border border-[#E7E2D0] flex flex-col gap-4 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-3 border-b border-[#E7E2D0] pb-3">
                <div>
                  <h2 className="text-base font-black text-[#26231B]">
                    Review Customer Payment Slip
                  </h2>
                  <div className="text-xs text-[#6F6A5A] mt-0.5 flex flex-wrap items-center gap-3">
                    <span>Booking: <b className="font-mono text-[#26231B]">{targetBookingId || "N/A"}</b></span>
                    {(linkedBooking?.customerName || slipFile?.customerName || reviewModal.slipMeta?.customerName) && (
                      <span>
                        Customer: <b>{linkedBooking?.customerName || slipFile?.customerName || reviewModal.slipMeta?.customerName}</b>
                      </span>
                    )}
                    {(linkedBooking?.quotedAmount || slipFile?.amount || reviewModal.slipMeta?.amount) ? (
                      <span className="font-mono font-black text-amber-900">
                        Quoted: Rs. {(linkedBooking?.quotedAmount || slipFile?.amount || reviewModal.slipMeta?.amount || 0).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeReviewModal}
                  className="text-[#6F6A5A] hover:text-[#26231B] font-bold text-base p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Metadata Strip */}
              {(slipFile || reviewModal.slipMeta) && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] text-[10px] font-mono font-black">
                      {isPdf ? "PDF DOCUMENT" : "IMAGE SLIP"}
                    </span>
                    <b className="text-[#26231B]">{slipFile?.fileName || reviewModal.slipMeta?.fileName}</b>
                    {(slipFile?.bankAccountUsed || reviewModal.slipMeta?.bankAccountUsed) && (
                      <span className="text-[#6F6A5A]">
                        • Bank: <b>{slipFile?.bankAccountUsed || reviewModal.slipMeta?.bankAccountUsed}</b>
                      </span>
                    )}
                  </div>
                  {reviewModal.blobUrl && (
                    <div className="flex items-center gap-2">
                      <a
                        href={reviewModal.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg border border-[#E7E2D0] bg-white hover:bg-[#FFC20E] text-[11px] font-bold text-[#26231B]"
                      >
                        Open in New Tab
                      </a>
                      <a
                        href={reviewModal.blobUrl}
                        download={slipFile?.fileName || "payment-slip"}
                        className="px-2.5 py-1 rounded-lg border border-[#E7E2D0] bg-white hover:bg-[#FFC20E] text-[11px] font-bold text-[#26231B]"
                      >
                        Download
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Preview Pane */}
              <div className="w-full min-h-[280px] rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] p-2 flex items-center justify-center">
                {reviewModal.loading ? (
                  <p className="text-xs font-bold text-[#6F6A5A]">
                    Reassembling payment slip from Cloud Firestore database...
                  </p>
                ) : reviewModal.error ? (
                  <p className="text-xs font-bold text-red-600 p-6 text-center">{reviewModal.error}</p>
                ) : !reviewModal.blobUrl ? (
                  <p className="text-xs font-bold text-[#6F6A5A]">No preview available.</p>
                ) : isPdf ? (
                  <iframe
                    src={reviewModal.blobUrl}
                    title="Payment Slip PDF Preview"
                    className="w-full h-[380px] sm:h-[460px] rounded-xl border border-[#E7E2D0] bg-white"
                  />
                ) : (
                  <img
                    src={reviewModal.blobUrl}
                    alt={slipFile?.fileName || "Payment slip preview"}
                    className="max-h-[440px] w-auto max-w-full rounded-xl object-contain bg-white"
                  />
                )}
              </div>

              {/* Review Action Controls */}
              {linkedBooking && linkedBooking.status === "payment_submitted" && (
                <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                  <label className="block text-[11px] font-bold text-[#26231B]">
                    Re-upload / Rejection Note (if slip is unclear or wrong amount)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Slip is blurry / please re-upload clear bank receipt"
                      value={reviewModal.rejectReason}
                      onChange={(e) =>
                        setReviewModal((prev) =>
                          prev ? { ...prev, rejectReason: e.target.value } : null
                        )
                      }
                      className="flex-1 px-3 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs text-[#26231B]"
                    />
                    <button
                      type="button"
                      disabled={actionLoading === linkedBooking.id}
                      onClick={() =>
                        handleRejectSlipRequestReupload(linkedBooking, reviewModal.rejectReason)
                      }
                      className="px-4 py-2 rounded-xl border border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-black cursor-pointer disabled:opacity-50"
                    >
                      Request Re-upload
                    </button>
                  </div>
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E7E2D0]">
                {targetSlipId ? (
                  <button
                    type="button"
                    disabled={actionLoading === targetBookingId || actionLoading === targetSlipId}
                    onClick={() => {
                      if (confirm("Delete this payment slip permanently from Firestore database?")) {
                        handleDeleteSlipFromDb(targetBookingId, targetSlipId);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Delete Slip from DB
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={closeReviewModal}
                    className="px-4 py-2 rounded-xl border border-[#E7E2D0] text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                  {linkedBooking && linkedBooking.status === "payment_submitted" && (
                    <button
                      type="button"
                      disabled={actionLoading === linkedBooking.id}
                      onClick={() => handleApproveSlipPayment(linkedBooking)}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      Approve Payment & Lock Date
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
