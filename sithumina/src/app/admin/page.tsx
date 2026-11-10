"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StoredBooking,
  BookingStatusValue,
  PaymentSlipStatus,
  BookingPaymentMethod,
  StoredRegistration,
  StoredInquiry,
  StoredCustomer,
} from "@/lib/server-store";
import { normalizePlate, normalizePhoneNumber, phonesMatch } from "@/lib/phone-utils";
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
  deleteBookingAction,
  BookedDateDetail,
  getAllBookingsAction,
  getAllRegistrationsAction,
  updateRegistrationStatusAction,
  approveRegistrationAndAddToFleetAction,
  getAllInquiriesAction,
  updateInquiryStatusAction,
  getCustomersAction,
} from "@/actions";

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "ST@2024";

type NavSection =
  | "overview"
  | "individual_bookings"
  | "online_bookings"
  | "customers"
  | "revenue"
  | "vehicle_registrations"
  | "contact_submissions"
  | "fleet"
  | "riders"
  | "settings";

export interface CustomerMetric {
  id: string;
  name: string;
  phone: string;
  canonicalPhone: string;
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

const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getSriLankaDateStr(timestamp: number = Date.now()): string {
  const d = new Date(timestamp + SRI_LANKA_OFFSET_MS);
  return d.toISOString().split("T")[0];
}

function getSriLankaMidnightTimestamp(timestamp: number = Date.now()): number {
  const d = new Date(timestamp + SRI_LANKA_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const dt = d.getUTCDate();
  return Date.UTC(y, m, dt) - SRI_LANKA_OFFSET_MS;
}

type RevenueTimeFilter = "today" | "yesterday" | "pick_date" | "days_count" | "this_month" | "last_month" | "all_time" | "custom";

export default function MasterAdminDashboard() {
  // ---- Auth Gate ----
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  // Persist admin authentication state during browser tab session
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem("st_admin_authed") === "true") {
        setAuthed(true);
      }
    } catch {}
  }, []);

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
  const [onlineSearch, setOnlineSearch] = useState("");
  const [expandedOnlineBookings, setExpandedOnlineBookings] = useState<Record<string, boolean>>({});
  const [bookingViewSubTab, setBookingViewSubTab] = useState<"list" | "calendar">("list");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ---- Revenue Analytics State ----
  const [revenueFilter, setRevenueFilter] = useState<RevenueTimeFilter>("today");
  const [revenueSelectedDate, setRevenueSelectedDate] = useState(() => getSriLankaDateStr());
  const [revenueDaysCount, setRevenueDaysCount] = useState<number>(7);
  const [revenueCustomStart, setRevenueCustomStart] = useState("");
  const [revenueCustomEnd, setRevenueCustomEnd] = useState("");
  const [revenueTypeFilter, setRevenueTypeFilter] = useState<"all" | "individual" | "live_lorry">("all");
  const [revenueSearch, setRevenueSearch] = useState("");

  // ---- Customers State ----
  const [registeredUsers, setRegisteredUsers] = useState<StoredCustomer[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerTierFilter, setCustomerTierFilter] = useState<"all" | "vip" | "repeat" | "active" | "registered">("all");
  const [customerSort, setCustomerSort] = useState<"bookings" | "revenue" | "recent" | "name">("bookings");
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  const toggleCustomerExpanded = (customerId: string) => {
    setExpandedCustomers((prev) => ({
      ...prev,
      [customerId]: !prev[customerId],
    }));
  };

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

  const toggleOnlineBookingCard = (bookingId: string, currentExpanded: boolean) => {
    setExpandedOnlineBookings((prev) => ({
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
    setRegisteredUsers([]);
    setSelectedCalendarVehicle(null);
    setLoadingBookings(true);
    setLoadingFleet(true);
    setLoadingDrivers(true);
    setLoadingRegistrations(true);
    setLoadingInquiries(true);
    setLoadingUsers(true);
    try {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("st_admin_authed");
      }
    } catch {}
    setAuthed(false);
  };

  // ---- Realtime Subscriptions ----
  useEffect(() => {
    if (!authed) {
      setFleetVehicles([]);
      setDrivers([]);
      setRegistrations([]);
      setInquiries([]);
      setRegisteredUsers([]);
      setSelectedCalendarVehicle(null);
      setLoadingFleet(true);
      setLoadingDrivers(true);
      setLoadingRegistrations(true);
      setLoadingInquiries(true);
      setLoadingUsers(true);
      return;
    }

    setLoadingFleet(true);
    setLoadingDrivers(true);
    setLoadingRegistrations(true);
    setLoadingInquiries(true);
    setLoadingUsers(true);

    getCustomersAction().then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setRegisteredUsers(res.data);
      }
      setLoadingUsers(false);
    }).catch(() => setLoadingUsers(false));

    const unsubUsers = onSnapshot(
      collection(db, "users"),
      (snap) => {
        const list: StoredCustomer[] = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.role === "driver" || data.role === "admin") return;
          list.push({
            id: String(data.uid || d.id),
            name: String(data.name || ""),
            phone: String(data.phone || ""),
            email: data.email || "",
            city: data.city || "",
            createdAt: Number(data.createdAt) || 0,
            lastLoginAt: Number(data.lastLoginAt) || Number(data.createdAt) || 0,
          });
        });
        if (list.length > 0) {
          setRegisteredUsers(list);
        }
        setLoadingUsers(false);
      },
      () => {
        setLoadingUsers(false);
      }
    );

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
      unsubUsers();
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

  const handleDeleteBooking = async (bookingId: string) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete booking #${bookingId}? This will remove it from the system, Firestore database, and release any calendar dates.`
      )
    ) {
      return;
    }
    setActionLoading(bookingId);
    try {
      const res = await deleteBookingAction(bookingId);
      if (res.success) {
        setBookings((prev) => prev.filter((b) => b.id !== bookingId));
        if (selectedCalendarVehicle?.plate) {
          refreshVehicleCalendar(selectedCalendarVehicle.plate);
        }
        showToast(`Booking #${bookingId} deleted permanently.`, "success");
      } else {
        showToast(res.error || "Failed to delete booking.", "error");
      }
    } catch (e: any) {
      showToast(e?.message || "Error deleting booking.", "error");
    } finally {
      setActionLoading(null);
    }
  };

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
    if (!hasSlip && (!finalAmount || finalAmount <= 0)) {
      showToast("Please enter the Rs. amount first to manually approve cash payment.", "error");
      return;
    }
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

  const matchesOnlineSearchQuery = useCallback((b: StoredBooking, rawQuery: string) => {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return true;
    const qCompact = q.replace(/\s+/g, "");
    const qDigits = q.replace(/[^0-9]/g, "");
    const qDigitsCore = qDigits.replace(/^(94|0)+/, "");
    const phoneDigits = String(b.customerPhone || "").replace(/[^0-9]/g, "");
    const phoneDigitsCore = phoneDigits.replace(/^(94|0)+/, "");
    const whatsappDigits = String(b.customerWhatsapp || "").replace(/[^0-9]/g, "");
    const whatsappDigitsCore = whatsappDigits.replace(/^(94|0)+/, "");
    const driverPhoneDigits = String(b.assignedDriverPhone || "").replace(/[^0-9]/g, "");
    const driverPhoneCore = driverPhoneDigits.replace(/^(94|0)+/, "");
    const plateCompact = String(b.assignedPlate || b.selectedVehiclePlate || "").toLowerCase().replace(/\s+/g, "");
    const datesJoined = Array.isArray(b.dates) ? b.dates.join(" ") : "";
    const createdTiming = formatBookingDateTime(b.createdAt);

    return (
      String(b.id || "").toLowerCase().includes(q) ||
      String(b.id || "").toLowerCase().replace(/\s+/g, "").includes(qCompact) ||
      String(b.customerName || "").toLowerCase().includes(q) ||
      String(b.customerPhone || "").toLowerCase().includes(q) ||
      String(b.customerWhatsapp || "").toLowerCase().includes(q) ||
      (qDigits.length >= 3 &&
        (phoneDigits.includes(qDigits) ||
          whatsappDigits.includes(qDigits) ||
          driverPhoneDigits.includes(qDigits) ||
          (qDigitsCore.length >= 3 &&
            (phoneDigitsCore.includes(qDigitsCore) ||
              whatsappDigitsCore.includes(qDigitsCore) ||
              driverPhoneCore.includes(qDigitsCore))))) ||
      String(b.assignedPlate || "").toLowerCase().includes(q) ||
      String(b.selectedVehiclePlate || "").toLowerCase().includes(q) ||
      plateCompact.includes(qCompact) ||
      String(b.vehicleType || "").toLowerCase().includes(q) ||
      String(b.pickupCity || "").toLowerCase().includes(q) ||
      String(b.deliveryCity || "").toLowerCase().includes(q) ||
      String(b.assignedDriverName || "").toLowerCase().includes(q) ||
      String(b.date || "").toLowerCase().includes(q) ||
      datesJoined.toLowerCase().includes(q) ||
      String(b.cargoNature || "").toLowerCase().includes(q) ||
      String(b.packageDetails || "").toLowerCase().includes(q) ||
      String(b.cargoWeight || "").toLowerCase().includes(q) ||
      String(b.status || "").toLowerCase().includes(q) ||
      (createdTiming && createdTiming.display.toLowerCase().includes(q))
    );
  }, []);

  const individualSearchMatchesAnyStatusCount = individualSearch.trim()
    ? individualBookings.filter((b) => matchesIndividualSearchQuery(b, individualSearch)).length
    : individualBookings.length;

  const onlineSearchMatchesAnyStatusCount = onlineSearch.trim()
    ? onlineBookings.filter((b) => matchesOnlineSearchQuery(b, onlineSearch)).length
    : onlineBookings.length;

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
        ? ["assigned", "in_transit", "goods_collected"].includes(b.status)
        : statusFilter === "completed"
        ? ["delivered", "cancelled"].includes(b.status)
        : true;
    if (!matchesStatus) return false;
    return matchesOnlineSearchQuery(b, onlineSearch);
  });

  const slipReviewCount = individualBookings.filter((b) => b.status === "payment_submitted").length;
  const onlineSlipReviewCount = onlineBookings.filter((b) => b.status === "payment_submitted").length;
  const pendingIndividualCount = individualBookings.filter(
    (b) => b.status === "pending" || b.status === "payment_submitted"
  ).length;
  const pendingOnlineCount = onlineBookings.filter((b) => b.status === "pending").length;
  const totalPendingCount = bookings.filter(
    (b) => b.status === "pending" || b.status === "payment_submitted"
  ).length;

  const [clockTick, setClockTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const revenueData = useMemo(() => {
    const isPaid = (b: StoredBooking): boolean => {
      if (b.status === "cancelled") return false;
      const amt = Number(b.quotedAmount || 0);
      if (amt <= 0) return false;
      if (b.paymentApprovedAt && b.paymentApprovedAt > 0) return true;
      if (b.paymentSlipStatus === "approved" || (b.paymentSlipStatus as string) === "manual_approved") return true;
      if (["accepted", "booked", "assigned", "goods_collected", "in_transit", "delivered"].includes(b.status)) {
        return true;
      }
      return false;
    };

    const getPayTs = (b: StoredBooking): number => {
      if (b.paymentApprovedAt && b.paymentApprovedAt > 0) return b.paymentApprovedAt;
      if (b.paymentSlipUploadedAt && b.paymentSlipUploadedAt > 0) return b.paymentSlipUploadedAt;
      return b.updatedAt || b.createdAt || clockTick;
    };

    const allPaid = bookings
      .filter(isPaid)
      .sort((a, b) => getPayTs(b) - getPayTs(a));

    const todayStart = getSriLankaMidnightTimestamp(clockTick);
    const todayEnd = todayStart + 86400000;
    const yesterdayStart = todayStart - 86400000;
    const yesterdayEnd = todayStart;

    const slNow = new Date(clockTick + SRI_LANKA_OFFSET_MS);
    const thisMonthStart = Date.UTC(slNow.getUTCFullYear(), slNow.getUTCMonth(), 1) - SRI_LANKA_OFFSET_MS;
    const thisMonthEnd = Date.UTC(slNow.getUTCFullYear(), slNow.getUTCMonth() + 1, 1) - SRI_LANKA_OFFSET_MS;
    const lastMonthStart = Date.UTC(slNow.getUTCFullYear(), slNow.getUTCMonth() - 1, 1) - SRI_LANKA_OFFSET_MS;
    const lastMonthEnd = thisMonthStart;

    const todayBookings = allPaid.filter((b) => {
      const t = getPayTs(b);
      return t >= todayStart && t < todayEnd;
    });
    const todayRevenue = todayBookings.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);

    const thisMonthBookings = allPaid.filter((b) => {
      const t = getPayTs(b);
      return t >= thisMonthStart && t < thisMonthEnd;
    });
    const thisMonthRevenue = thisMonthBookings.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);

    const allTimeRevenue = allPaid.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);

    let rangeStart = 0;
    let rangeEnd = Infinity;
    if (revenueFilter === "today") {
      rangeStart = todayStart;
      rangeEnd = todayEnd;
    } else if (revenueFilter === "yesterday") {
      rangeStart = yesterdayStart;
      rangeEnd = yesterdayEnd;
    } else if (revenueFilter === "pick_date") {
      if (revenueSelectedDate) {
        const parts = revenueSelectedDate.split("-").map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          rangeStart = Date.UTC(parts[0], parts[1] - 1, parts[2]) - SRI_LANKA_OFFSET_MS;
          rangeEnd = rangeStart + 86400000;
        }
      }
    } else if (revenueFilter === "days_count") {
      const safeDays = Math.max(1, Math.min(3650, Number(revenueDaysCount) || 1));
      rangeStart = todayStart - (safeDays - 1) * 86400000;
      rangeEnd = todayEnd;
    } else if (revenueFilter === "this_month") {
      rangeStart = thisMonthStart;
      rangeEnd = thisMonthEnd;
    } else if (revenueFilter === "last_month") {
      rangeStart = lastMonthStart;
      rangeEnd = lastMonthEnd;
    } else if (revenueFilter === "custom") {
      if (revenueCustomStart) {
        const parts = revenueCustomStart.split("-").map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          rangeStart = Date.UTC(parts[0], parts[1] - 1, parts[2]) - SRI_LANKA_OFFSET_MS;
        }
      }
      if (revenueCustomEnd) {
        const parts = revenueCustomEnd.split("-").map(Number);
        if (parts.length === 3 && !parts.some(isNaN)) {
          rangeEnd = Date.UTC(parts[0], parts[1] - 1, parts[2] + 1) - SRI_LANKA_OFFSET_MS;
        }
      }
    }

    const customRangeDaysCount =
      revenueFilter === "custom" && revenueCustomStart && revenueCustomEnd && rangeEnd > rangeStart
        ? Math.round((rangeEnd - rangeStart) / 86400000)
        : 0;

    const periodBookings = allPaid.filter((b) => {
      const t = getPayTs(b);
      if (t < rangeStart || t >= rangeEnd) return false;
      if (revenueTypeFilter === "individual" && b.bookingType !== "individual_vehicle") return false;
      if (revenueTypeFilter === "live_lorry" && b.bookingType === "individual_vehicle") return false;
      if (revenueSearch.trim()) {
        return matchesOnlineSearchQuery(b, revenueSearch) || matchesIndividualSearchQuery(b, revenueSearch);
      }
      return true;
    });

    const periodTotal = periodBookings.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);
    const periodIndividual = periodBookings.filter((b) => b.bookingType === "individual_vehicle");
    const periodLive = periodBookings.filter((b) => b.bookingType !== "individual_vehicle");
    const periodIndividualRevenue = periodIndividual.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);
    const periodLiveRevenue = periodLive.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);

    const periodBankSlip = periodBookings.filter(
      (b) => b.paymentMethod !== "cash_manual" && (b.paymentSlipId || b.paymentSlipStatus === "approved")
    );
    const periodCash = periodBookings.filter((b) => !periodBankSlip.includes(b));
    const periodBankRevenue = periodBankSlip.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);
    const periodCashRevenue = periodCash.reduce((sum, b) => sum + Number(b.quotedAmount || 0), 0);

    return {
      todayDateStr: getSriLankaDateStr(clockTick),
      todayBookingsCount: todayBookings.length,
      todayRevenue,
      thisMonthBookingsCount: thisMonthBookings.length,
      thisMonthRevenue,
      allTimeCount: allPaid.length,
      allTimeRevenue,
      periodBookings,
      periodTotal,
      periodIndividualCount: periodIndividual.length,
      periodIndividualRevenue,
      periodLiveCount: periodLive.length,
      periodLiveRevenue,
      periodBankCount: periodBankSlip.length,
      periodBankRevenue,
      periodCashCount: periodCash.length,
      periodCashRevenue,
      customRangeDaysCount,
      getPayTs,
    };
  }, [
    bookings,
    clockTick,
    revenueFilter,
    revenueSelectedDate,
    revenueDaysCount,
    revenueCustomStart,
    revenueCustomEnd,
    revenueTypeFilter,
    revenueSearch,
    matchesOnlineSearchQuery,
    matchesIndividualSearchQuery,
  ]);

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

  // ---- Customers & Top Clients Computations ----
  const customersWithMetrics: CustomerMetric[] = useMemo(() => {
    const custMap = new Map<
      string,
      {
        id: string;
        name: string;
        phone: string;
        email?: string;
        city?: string;
        registeredAt: number;
        lastActiveAt: number;
        bookings: StoredBooking[];
      }
    >();

    // 1. Ingest registered users from users collection
    registeredUsers.forEach((u) => {
      const phoneNorm = normalizePhoneNumber(u.phone) || u.phone.trim();
      const key = phoneNorm || u.id;
      if (!key) return;

      const rawName = (u.name || "").trim();
      const isRealName =
        rawName &&
        rawName !== "Customer" &&
        rawName !== "Valued Customer" &&
        !rawName.startsWith("Customer (");

      custMap.set(key, {
        id: u.id || `CUST-${phoneNorm}`,
        name: isRealName ? rawName : "",
        phone: u.phone || phoneNorm,
        email: u.email || "",
        city: u.city || "",
        registeredAt: u.createdAt || Date.now(),
        lastActiveAt: u.lastLoginAt || u.createdAt || Date.now(),
        bookings: [],
      });
    });

    // 2. Ingest bookings to correlate clients and discover direct booking users
    bookings.forEach((b) => {
      const bPhone = (b.customerPhone || "").trim();
      const phoneNorm = normalizePhoneNumber(bPhone) || bPhone;
      const key = phoneNorm || (b.customerName || b.id);
      if (!key) return;

      const existing = custMap.get(key);
      const bCreatedAt = Number(b.createdAt) || Date.now();
      const bUpdatedAt = Number(b.updatedAt) || bCreatedAt;
      const bName = (b.customerName || "").trim();
      const isRealName =
        bName &&
        bName !== "Customer" &&
        bName !== "Valued Customer" &&
        !bName.startsWith("Customer (");

      if (existing) {
        existing.bookings.push(b);
        if (!existing.name && isRealName) {
          existing.name = bName;
        }
        if (bCreatedAt > 0 && bCreatedAt < existing.registeredAt) {
          existing.registeredAt = bCreatedAt;
        }
        if (bUpdatedAt > existing.lastActiveAt) {
          existing.lastActiveAt = bUpdatedAt;
        }
        if (!existing.city && b.pickupCity) {
          existing.city = b.pickupCity;
        }
      } else {
        custMap.set(key, {
          id: `CUST-${phoneNorm || b.id}`,
          name: isRealName ? bName : (phoneNorm ? `Customer (${phoneNorm.slice(-4)})` : "Valued Customer"),
          phone: bPhone,
          email: "",
          city: b.pickupCity || "",
          registeredAt: bCreatedAt,
          lastActiveAt: bUpdatedAt,
          bookings: [b],
        });
      }
    });

    // 3. Compute detailed financial and progress metrics
    const list: CustomerMetric[] = [];
    custMap.forEach((c, key) => {
      const totalBookings = c.bookings.length;
      let completedBookings = 0;
      let activeBookings = 0;
      let pendingBookings = 0;
      let cancelledBookings = 0;
      let totalRevenue = 0;

      const routeCounts = new Map<string, number>();

      c.bookings.forEach((b) => {
        if (b.status === "delivered") {
          completedBookings++;
        } else if (
          ["accepted", "assigned", "goods_collected", "in_transit", "booked"].includes(b.status)
        ) {
          activeBookings++;
        } else if (
          ["pending", "awaiting_payment", "payment_submitted"].includes(b.status)
        ) {
          pendingBookings++;
        } else if (b.status === "cancelled") {
          cancelledBookings++;
        }

        const amt = Number(b.quotedAmount) || 0;
        const isRevenueContributing =
          amt > 0 &&
          (b.status === "delivered" ||
            b.paymentSlipStatus === "approved" ||
            b.paymentSlipStatus === "manual_approved" ||
            ["accepted", "assigned", "goods_collected", "in_transit", "booked"].includes(b.status));

        if (isRevenueContributing) {
          totalRevenue += amt;
        }

        if (b.pickupCity && b.deliveryCity) {
          const rKey = `${b.pickupCity} → ${b.deliveryCity}`;
          routeCounts.set(rKey, (routeCounts.get(rKey) || 0) + 1);
        }
      });

      const frequentRoutes = Array.from(routeCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([r, count]) => (count > 1 ? `${r} (${count}x)` : r));

      const billableCount = completedBookings + activeBookings;
      const averageBookingValue =
        billableCount > 0 ? Math.round(totalRevenue / billableCount) : totalRevenue;

      let statusTier: CustomerMetric["status"] = "registered";
      if (totalBookings >= 5 || totalRevenue >= 100000) {
        statusTier = "vip";
      } else if (totalBookings >= 3 || totalRevenue >= 40000) {
        statusTier = "gold";
      } else if (completedBookings >= 1) {
        statusTier = "silver";
      } else if (totalBookings >= 1) {
        statusTier = "active";
      }

      const sortedBookings = [...c.bookings].sort(
        (a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)
      );

      list.push({
        id: c.id,
        name: c.name || (c.phone ? `Customer (${c.phone.slice(-4)})` : "Valued Customer"),
        phone: c.phone,
        canonicalPhone: key,
        email: c.email,
        city: c.city,
        registeredAt: c.registeredAt,
        lastActiveAt: c.lastActiveAt,
        totalBookings,
        completedBookings,
        activeBookings,
        pendingBookings,
        cancelledBookings,
        totalRevenue,
        averageBookingValue,
        status: statusTier,
        frequentRoutes,
        bookingsList: sortedBookings,
      });
    });

    return list.sort((a, b) => {
      if (b.totalBookings !== a.totalBookings) {
        return b.totalBookings - a.totalBookings;
      }
      return b.totalRevenue - a.totalRevenue;
    });
  }, [registeredUsers, bookings]);

  // Top 10 clients who have actually placed bookings
  const top10Customers = useMemo(() => {
    return customersWithMetrics
      .filter((c) => c.totalBookings > 0)
      .slice(0, 10);
  }, [customersWithMetrics]);

  // Filtered & sorted customers for the Complete Directory
  const filteredCustomers = useMemo(() => {
    return customersWithMetrics
      .filter((c) => {
        if (customerTierFilter === "vip" && c.status !== "vip" && c.status !== "gold") {
          return false;
        }
        if (customerTierFilter === "repeat" && c.totalBookings < 2) {
          return false;
        }
        if (customerTierFilter === "active" && c.totalBookings < 1) {
          return false;
        }
        if (customerTierFilter === "registered" && c.totalBookings > 0) {
          return false;
        }

        if (!customerSearch.trim()) return true;
        const q = customerSearch.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.city && c.city.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          c.frequentRoutes.some((r) => r.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (customerSort === "bookings") {
          return b.totalBookings - a.totalBookings || b.totalRevenue - a.totalRevenue;
        }
        if (customerSort === "revenue") {
          return b.totalRevenue - a.totalRevenue || b.totalBookings - a.totalBookings;
        }
        if (customerSort === "recent") {
          return b.lastActiveAt - a.lastActiveAt;
        }
        if (customerSort === "name") {
          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [customersWithMetrics, customerTierFilter, customerSearch, customerSort]);

  const totalClientsRevenue = useMemo(
    () => customersWithMetrics.reduce((sum, c) => sum + c.totalRevenue, 0),
    [customersWithMetrics]
  );
  const totalClientBookingsCount = useMemo(
    () => customersWithMetrics.reduce((sum, c) => sum + c.totalBookings, 0),
    [customersWithMetrics]
  );
  const repeatClientsCount = useMemo(
    () => customersWithMetrics.filter((c) => c.totalBookings >= 2).length,
    [customersWithMetrics]
  );
  const activeInTransitClientsCount = useMemo(
    () => customersWithMetrics.filter((c) => c.activeBookings > 0).length,
    [customersWithMetrics]
  );
  const vipGoldClientsCount = useMemo(
    () => customersWithMetrics.filter((c) => c.status === "vip" || c.status === "gold").length,
    [customersWithMetrics]
  );
  const registeredOnlyClientsCount = useMemo(
    () => customersWithMetrics.filter((c) => c.totalBookings === 0).length,
    [customersWithMetrics]
  );
  const overallAverageOrderValue = useMemo(() => {
    const billable = customersWithMetrics.reduce((sum, c) => sum + c.completedBookings + c.activeBookings, 0);
    return billable > 0 ? Math.round(totalClientsRevenue / billable) : 0;
  }, [customersWithMetrics, totalClientsRevenue]);

  // ---- Status Badge Component ----
  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { cls: string; label: string }> = {
      pending: { cls: "bg-amber-50 text-amber-800 border-amber-200", label: "Pending Quote" },
      awaiting_payment: { cls: "bg-sky-50 text-sky-800 border-sky-200", label: "Awaiting Payment" },
      payment_submitted: { cls: "bg-purple-50 text-purple-800 border-purple-300 font-bold", label: "Slip Submitted — Review" },
      accepted: { cls: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold", label: "Approved" },
      booked: { cls: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold", label: "Booked" },
      assigned: { cls: "bg-green-50 text-green-800 border-green-200", label: "Driver Assigned" },
      goods_collected: { cls: "bg-teal-50 text-teal-900 border-teal-300 font-bold", label: "📦 Goods Collected by Rider" },
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
                try {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("st_admin_authed", "true");
                  }
                } catch {}
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
              <img
                src="/logo.png"
                alt="Sithumina Transport Logo"
                className="w-10 h-10 rounded-xl object-cover shadow-sm shrink-0"
              />
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

            {/* Customers & Top Clients */}
            <button
              onClick={() => {
                setActiveNav("customers");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "customers"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Customers &amp; Top Clients</span>
              </div>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeNav === "customers" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
              }`}>
                {loadingUsers ? "..." : customersWithMetrics.length}
              </span>
            </button>

            {/* Revenue & Financials */}
            <button
              onClick={() => {
                setActiveNav("revenue");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "revenue"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <span>Revenue &amp; Financials</span>
              </div>
              {!loadingBookings && revenueData.todayRevenue > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeNav === "revenue" ? "bg-[#26231B] text-[#FFC20E]" : "bg-emerald-500/20 text-emerald-300"
                }`}>
                  Rs
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
                {activeNav === "customers" && "Registered Customers & Top Clients"}
                {activeNav === "revenue" && "Revenue"}
                {activeNav === "vehicle_registrations" && "Vehicle & Partner Registrations"}
                {activeNav === "contact_submissions" && "Contact Inquiries & Support"}
                {activeNav === "fleet" && "Fleet Lorries Management"}
                {activeNav === "riders" && "Riders & Drivers Registry"}
                {activeNav === "settings" && "System & Payment Settings"}
              </h1>
              <p className="text-[11px] text-[#6F6A5A]">
                {activeNav === "customers"
                  ? "Directory of all registered clients, Top 10 loyal client ranking, and customer lifetime revenue analytics"
                  : activeNav === "revenue"
                  ? "Individual & Live Lorry · Resets daily at 12:00 AM"
                  : activeNav === "vehicle_registrations"
                  ? "Incoming lorry partner applications from /register-vehicle"
                  : activeNav === "contact_submissions"
                  ? "Direct customer inquiries & rate quotes from /contact"
                  : "Head Office Dispatch Operations"}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {activeNav === "customers" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-xs font-mono font-bold text-[#26231B] whitespace-nowrap shrink-0">
                  {customersWithMetrics.length} Clients Total
                </span>
              </div>
            )}
            {activeNav === "revenue" && (
              <div className="px-3 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-xs font-mono font-bold text-[#26231B] whitespace-nowrap shrink-0">
                {revenueData.todayDateStr}
              </div>
            )}
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
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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
                <div
                  onClick={() => setActiveNav("customers")}
                  className="p-4 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs cursor-pointer hover:border-[#FFC20E] transition-all"
                >
                  <span className="text-[11px] font-bold text-amber-700 uppercase block">Total Clients</span>
                  <span className="text-2xl font-black text-[#26231B] mt-1 block font-mono">
                    {loadingUsers ? "..." : customersWithMetrics.length}
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
                {/* Revenue & Financials Quick Jump */}
                <div className="p-5 rounded-3xl bg-gradient-to-br from-[#26231B] to-[#3A3529] text-white border border-[#FFC20E]/40 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-black text-white">Today&apos;s Revenue</h2>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold">
                        {revenueData.todayDateStr}
                      </span>
                    </div>
                    <p className="text-2xl font-black text-[#FFC20E] font-mono mt-2">
                      Rs. {loadingBookings ? "..." : revenueData.todayRevenue.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-white/70 mt-1">
                      Resets daily at 12:00 AM midnight • {revenueData.todayBookingsCount} paid today
                    </p>
                    <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center gap-3 text-xs font-bold text-white/90">
                      <span>This Month: Rs. {loadingBookings ? "..." : revenueData.thisMonthRevenue.toLocaleString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNav("revenue")}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs"
                  >
                    Open Revenue & History →
                  </button>
                </div>

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

                {/* Customers & Top Clients Quick Jump */}
                <div className="p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-base font-black text-[#26231B]">Customers &amp; Top Clients</h2>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                        {top10Customers.length} Top Ranked
                      </span>
                    </div>
                    <p className="text-xs text-[#6F6A5A] mt-1">
                      Directory of all registered clients, lifetime booking volumes, and Top 10 loyal client rankings.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-bold text-[#26231B]">
                      <span>Total Clients: {loadingUsers ? "..." : customersWithMetrics.length}</span>
                      <span className="text-emerald-700 font-mono">LTV: Rs. {totalClientsRevenue.toLocaleString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveNav("customers")}
                    className="mt-5 w-full py-2.5 rounded-xl bg-[#26231B] hover:bg-[#FFC20E] hover:text-[#26231B] text-white text-xs font-black transition-colors cursor-pointer shadow-xs"
                  >
                    View Top Clients &amp; Directory →
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
                                      className="px-3 py-2 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-bold transition-colors cursor-pointer"
                                    >
                                      Reject / Cancel
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    disabled={actionLoading === b.id}
                                    onClick={() => handleDeleteBooking(b.id)}
                                    className="px-3 py-2 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                    title="Permanently Delete Booking from Database"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x1="14" y1="11" x2="14" y2="17" />
                                    </svg>
                                    <span>Delete</span>
                                  </button>
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
              {/* Header Card with Title and Counts */}
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#E7E2D0]">
                <div>
                  <h2 className="text-sm font-black text-[#26231B]">Live / Empty Return Bookings</h2>
                  <p className="text-xs text-[#6F6A5A]">Bookings received from the Find Empty Lorry live map broadcast.</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black font-mono">
                  {loadingBookings ? "..." : `${onlineBookings.length} Requests`}
                </span>
              </div>

              {/* Status Filters + Search Toolbar */}
              <div className="flex flex-col gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-[#E7E2D0] shadow-xs">
                {/* Status Filter Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                        {st.key === "pending" && pendingOnlineCount > 0 ? ` (${pendingOnlineCount})` : ""}
                        {st.key === "payment_submitted" && onlineSlipReviewCount > 0 ? ` (${onlineSlipReviewCount})` : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Box + Accordion Toolbar */}
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
                      aria-label="Search live bookings by date, customer name, phone, lorry plate, corridor, or cargo"
                      placeholder="Search date, customer name, phone, lorry plate, corridor, cargo..."
                      value={onlineSearch}
                      onChange={(e) => setOnlineSearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#26231B] placeholder:text-[#8A836E] transition-colors"
                    />
                    {onlineSearch.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOnlineSearch("")}
                        aria-label="Clear live booking search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E7E2D0]/70 hover:bg-[#FFC20E] text-[#26231B] flex items-center justify-center text-xs font-black transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 flex-shrink-0">
                    <span className="px-2.5 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-bold text-[#6F6A5A]">
                      Showing <b className="text-[#26231B]">{filteredOnlineBookings.length}</b> of{" "}
                      <b className="text-[#26231B]">{onlineBookings.length}</b>
                    </span>

                    {filteredOnlineBookings.length > 0 && (() => {
                      const allExpanded = filteredOnlineBookings.every((b, idx) =>
                        expandedOnlineBookings[b.id] !== undefined
                          ? expandedOnlineBookings[b.id]
                          : idx === 0 || b.status === "pending" || b.status === "payment_submitted"
                      );
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const nextState: Record<string, boolean> = { ...expandedOnlineBookings };
                            filteredOnlineBookings.forEach((b) => {
                              nextState[b.id] = !allExpanded;
                            });
                            setExpandedOnlineBookings(nextState);
                          }}
                          className="px-3 py-1.5 rounded-xl border border-[#E7E2D0] bg-white hover:bg-[#FFF4D1] hover:border-[#F0CE68] text-[#26231B] text-[11px] font-black transition-colors cursor-pointer"
                        >
                          {allExpanded ? "Collapse All" : "Expand All"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {loadingBookings ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">Loading live bookings from Firestore...</p>
                </div>
              ) : filteredOnlineBookings.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-white border border-[#E7E2D0]">
                  <p className="text-sm font-bold text-[#6F6A5A]">
                    {onlineSearch.trim() || statusFilter !== "all"
                      ? "No live bookings match your current filter or search."
                      : "No live lorry bookings currently."}
                  </p>
                  {(onlineSearch.trim() || statusFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setOnlineSearch("");
                        setStatusFilter("all");
                      }}
                      className="mt-3 px-4 py-1.5 rounded-xl bg-[#26231B] text-[#FFC20E] text-xs font-black hover:bg-[#3D3A31] transition-colors cursor-pointer"
                    >
                      Reset Filter &amp; Search
                    </button>
                  )}
                </div>
              ) : (
                filteredOnlineBookings.map((b, idx) => {
                  const quoteDraft = quoteInputs[b.id] || {
                    amount: b.quotedAmount ? String(b.quotedAmount) : "",
                    note: b.quoteNote || "",
                  };
                  const hasStoredSlip = Boolean(b.paymentSlipId && b.paymentSlipStatus !== "deleted");
                  const isQuoted = Boolean(b.quotedAmount && b.quotedAmount > 0);
                  const isExpanded =
                    expandedOnlineBookings[b.id] !== undefined
                      ? expandedOnlineBookings[b.id]
                      : idx === 0 || b.status === "pending" || b.status === "payment_submitted";
                  const requestTiming = formatBookingDateTime(b.createdAt);

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
                              : ["accepted", "booked", "assigned", "in_transit", "goods_collected"].includes(b.status)
                                ? "bg-gradient-to-r from-[#10B981] to-[#137333]"
                                : b.status === "payment_submitted"
                                  ? "bg-gradient-to-r from-purple-500 to-indigo-600"
                                  : "bg-gradient-to-r from-[#FFC20E] to-[#E6A800]"
                        }`}
                      />

                      {/* Accordion Header Button with Arrow */}
                      <button
                        type="button"
                        onClick={() => toggleOnlineBookingCard(b.id, isExpanded)}
                        aria-expanded={isExpanded}
                        aria-label={`${
                          isExpanded ? "Minimize live booking details" : "Open live booking details"
                        } for #${b.id}`}
                        className="relative w-full text-left border-0 bg-transparent px-4 pt-4 pb-3.5 sm:px-5 sm:pt-4 sm:pb-4 pr-14 sm:pr-16 hover:bg-[#FAF8F2]/80 transition-colors cursor-pointer group"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
                          {/* Left: Plate + Badge + Booking ID + Customer Name */}
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="px-2.5 py-1 rounded-lg bg-[#26231B] text-[#FFC20E] text-xs font-black font-mono tracking-wider shadow-xs">
                              {b.assignedPlate || b.selectedVehiclePlate || "Live Lorry"}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-[#FFF4D1] text-[#7A5A00] text-[11px] font-black font-mono">
                              Live Booking
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-[#F7F5EE] border border-[#D8D0B8] text-[#26231B] text-xs font-black font-mono tracking-wide">
                              #{b.id}
                            </span>
                            <span className="text-xs sm:text-sm font-black text-[#26231B]">
                              {b.customerName}
                            </span>
                          </div>

                          {/* Right: Quoted Amount + Status Badge */}
                          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                            {isQuoted && (
                              <span className="px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-300 text-xs font-black text-amber-900 font-mono">
                                Rs. {Number(b.quotedAmount).toLocaleString()}
                              </span>
                            )}
                            <StatusBadge status={b.status} />
                          </div>
                        </div>

                        {/* Quick Info Row: Trip Date, Booked Timing, Customer Phone & Corridor */}
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
                            <span>Trip Date: {b.date || "Today (Live)"}</span>
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

                        {/* Top-Right Corner Arrow Button */}
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

                      {/* Collapsible Details Panel */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5 border-t border-[#E7E2D0] flex flex-col gap-4">
                          {/* Assigned Lorry & Driver Information */}
                          <div className="p-3 rounded-2xl bg-[#FFF9E6] border border-[#FFEBAC] flex flex-wrap items-center justify-between gap-2.5 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] font-mono font-black text-[11px]">
                                {b.assignedPlate || b.selectedVehiclePlate || "No Vehicle Locked"}
                              </span>
                              <span className="font-bold text-[#26231B]">
                                {b.assignedDriverName || "Awaiting Driver Assignment"}
                              </span>
                            </div>
                            {b.assignedDriverPhone && (
                              <a
                                href={`tel:${String(b.assignedDriverPhone).replace(/\s+/g, "")}`}
                                className="font-mono font-bold text-[#1E9E5A] bg-white px-2.5 py-1 rounded-lg border border-[#1E9E5A]/30 flex items-center gap-1 hover:bg-[#1E9E5A] hover:text-white transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                                <span>Driver: {b.assignedDriverPhone}</span>
                              </a>
                            )}
                          </div>

                          {/* Main Details Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-[#F7F5EE] p-3.5 rounded-2xl border border-[#E7E2D0]">
                            <div className="flex flex-col gap-1.5">
                              <div>
                                <span className="text-[#6F6A5A]">Customer Mobile: </span>
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
                              </div>
                              <div>
                                <span className="text-[#6F6A5A]">WhatsApp: </span>
                                {b.customerWhatsapp || b.customerPhone ? (
                                  <a
                                    href={`https://wa.me/94${String(b.customerWhatsapp || b.customerPhone).replace(/[^0-9]/g, "").replace(/^0/, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-bold text-[#1E9E5A] font-mono hover:underline inline-flex items-center gap-1"
                                  >
                                    <span>{b.customerWhatsapp || b.customerPhone}</span>
                                    <span className="text-[10px] px-1 rounded bg-[#E8F8F0] text-[#1E9E5A]">Chat</span>
                                  </a>
                                ) : (
                                  <span className="text-[#6F6A5A] italic">N/A</span>
                                )}
                              </div>
                              <div>
                                <span className="text-[#6F6A5A]">Trip Corridor: </span>
                                <span className="font-bold text-[#26231B]">
                                  {b.pickupCity} → {b.deliveryCity}
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <div>
                                <span className="text-[#6F6A5A]">Date: </span>
                                <b>{b.date || "Today"}</b>
                              </div>
                              <div>
                                <span className="text-[#6F6A5A]">Cargo / Goods Nature: </span>
                                <span className="font-bold text-[#26231B]">
                                  {b.cargoNature || b.packageDetails || "General Cargo"}
                                </span>
                              </div>
                              {b.cargoWeight && (
                                <div>
                                  <span className="text-[#6F6A5A]">Weight: </span>
                                  <b>{b.cargoWeight}</b>
                                </div>
                              )}
                              {b.packageDetails && b.packageDetails !== b.cargoNature && (
                                <div className="text-[11px] text-[#6F6A5A] italic">
                                  <b>Details:</b> {b.packageDetails}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Quoting & Fee Section */}
                          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col gap-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-[#5B4300]">Price / Quotation Fee:</span>
                                {isQuoted && (
                                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-mono font-black text-xs">
                                    Rs. {Number(b.quotedAmount).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              {b.quoteNote && (
                                <span className="text-[11px] text-[#8C6D00] italic">
                                  Note: {b.quoteNote}
                                </span>
                              )}
                            </div>

                            {/* Quote Inputs */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <input
                                type="text"
                                placeholder="Quoted Amount (e.g. 15000)"
                                value={quoteDraft.amount}
                                onChange={(e) =>
                                  setQuoteInputs((prev) => ({
                                    ...prev,
                                    [b.id]: { ...quoteDraft, amount: e.target.value },
                                  }))
                                }
                                className="px-3 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-mono font-bold text-[#26231B] w-36 focus:outline-none"
                              />
                              <input
                                type="text"
                                placeholder="Optional Note to Customer"
                                value={quoteDraft.note}
                                onChange={(e) =>
                                  setQuoteInputs((prev) => ({
                                    ...prev,
                                    [b.id]: { ...quoteDraft, note: e.target.value },
                                  }))
                                }
                                className="px-3 py-1.5 rounded-xl border border-amber-300 bg-white text-xs text-[#26231B] flex-1 min-w-[160px] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  const amt = Number(String(quoteDraft.amount).replace(/[^0-9.]/g, ""));
                                  if (!amt || amt <= 0) {
                                    alert("Please enter a valid numeric quote amount");
                                    return;
                                  }
                                  await updateBooking(b.id, "awaiting_payment", undefined, {
                                    quotedAmount: amt,
                                    quotedAt: Date.now(),
                                    quoteNote: quoteDraft.note || "",
                                  });
                                }}
                                className="px-4 py-1.5 rounded-xl bg-[#26231B] hover:bg-[#3D3A31] text-[#FFC20E] text-xs font-black transition-colors cursor-pointer"
                              >
                                {isQuoted ? "Update Quote" : "Send Quote (Rs.)"}
                              </button>
                              {["pending", "awaiting_payment", "payment_submitted"].includes(b.status) && (
                                <button
                                  type="button"
                                  disabled={actionLoading === b.id}
                                  onClick={() => handleManualApprovePayment(b)}
                                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                                >
                                  Manual Approve (Cash)
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Manual Cash Approved Summary (when approved without customer slip) */}
                          {!hasStoredSlip &&
                            (b.paymentMethod === "cash_manual" || b.paymentSlipStatus === "manual_approved") && (
                              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                                <span className="font-black text-emerald-900">
                                  Cash / Direct Payment Approved Manually • Driver Contact Unlocked for Customer
                                </span>
                              </div>
                            )}

                          {/* Bank Payment Slip Review Section */}
                          {hasStoredSlip && (
                            <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse" />
                                <span className="font-black text-purple-900">
                                  Payment Slip Uploaded:
                                </span>
                                <span className="px-2 py-0.5 rounded-md bg-purple-200 text-purple-900 font-mono text-[11px] font-bold">
                                  {b.paymentSlipStatus || "pending_review"}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openSlipReviewModal(b)}
                                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors cursor-pointer"
                                >
                                  View Bank Slip
                                </button>
                                {b.paymentSlipStatus !== "approved" && (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveSlipPayment(b)}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Approve Slip
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Action Buttons & Lifecycle Transitions */}
                          <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-[#E7E2D0]">
                            <button
                              type="button"
                              onClick={() => openAssignModal(b)}
                              className="px-3.5 py-1.5 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black cursor-pointer shadow-xs"
                            >
                              {b.assignedPlate ? "Change Lorry/Driver" : "Assign Driver"}
                            </button>

                            {(b.status === "assigned" || b.status === "accepted") && (
                              <span className="px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                                <span>⏳ Awaiting Rider to Collect Goods</span>
                              </span>
                            )}

                            {b.status === "goods_collected" && (
                              <span className="px-3 py-1.5 rounded-xl bg-teal-100 border border-teal-300 text-teal-900 text-xs font-black flex items-center gap-1.5 shadow-2xs">
                                <span>📦 Goods Collected by Rider</span>
                              </span>
                            )}

                            {b.status === "goods_collected" && (
                              <button
                                type="button"
                                onClick={() => updateBooking(b.id, "in_transit")}
                                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black cursor-pointer shadow-xs"
                              >
                                🚚 Mark In Transit
                              </button>
                            )}

                            {["goods_collected", "in_transit"].includes(b.status) && (
                              <button
                                type="button"
                                onClick={() => updateBooking(b.id, "delivered")}
                                className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-black text-white text-xs font-black cursor-pointer shadow-xs"
                              >
                                ✅ Mark Delivered
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={actionLoading === b.id}
                              onClick={() => handleDeleteBooking(b.id)}
                              className="px-3.5 py-1.5 rounded-xl border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                              title="Permanently Delete Booking from Database"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB: REGISTERED CUSTOMERS & TOP CLIENTS LEADERBOARD       */}
          {/* ========================================================= */}
          {activeNav === "customers" && (
            <div className="flex flex-col gap-6">
              {/* Top 4 Core KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Customers */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6A5A]">
                      Registered Clients
                    </span>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      All-Time Directory
                    </span>
                  </div>
                  <div className="text-3xl font-black text-[#26231B] font-mono mt-2 tracking-tight">
                    {loadingUsers ? "..." : customersWithMetrics.length}
                  </div>
                  <div className="text-xs text-[#6F6A5A] mt-1 font-medium">
                    {repeatClientsCount} repeat bookers ({customersWithMetrics.length > 0 ? Math.round((repeatClientsCount / customersWithMetrics.length) * 100) : 0}% loyalty rate)
                  </div>
                </div>

                {/* 2. Total Lifetime Volume */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6A5A]">
                      Client Bookings
                    </span>
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      {activeInTransitClientsCount} Active in Transit
                    </span>
                  </div>
                  <div className="text-3xl font-black text-[#26231B] font-mono mt-2 tracking-tight">
                    {totalClientBookingsCount}
                  </div>
                  <div className="text-xs text-[#6F6A5A] mt-1 font-medium">
                    Individual &amp; Live empty lorry freight jobs
                  </div>
                </div>

                {/* 3. Total Lifetime Revenue */}
                <div className="p-5 rounded-2xl bg-[#26231B] text-white shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                      Lifetime Revenue (LTV)
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-400">
                      Confirmed &amp; Delivered
                    </span>
                  </div>
                  <div className="text-3xl font-black text-[#FFC20E] font-mono mt-2 tracking-tight">
                    Rs. {totalClientsRevenue.toLocaleString()}
                  </div>
                  <div className="text-xs text-white/70 mt-1 font-medium">
                    Avg. Order Value: Rs. {overallAverageOrderValue.toLocaleString()}
                  </div>
                </div>

                {/* 4. VIP & High Value Clients */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6A5A]">
                      High-Value Clients
                    </span>
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      VIP &amp; Gold Tiers
                    </span>
                  </div>
                  <div className="text-3xl font-black text-amber-600 font-mono mt-2 tracking-tight">
                    {vipGoldClientsCount}
                  </div>
                  <div className="text-xs text-[#6F6A5A] mt-1 font-medium">
                    Clients with 3+ bookings or Rs. 40,000+ spend
                  </div>
                </div>
              </div>

              {/* ========================================================= */}
              {/* SECTION 1: TOP 10 CLIENTS LEADERBOARD                     */}
              {/* ========================================================= */}
              <div className="bg-white border border-[#E7E2D0] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E7E2D0]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#FFC20E] text-[#26231B] flex items-center justify-center font-black text-lg shadow-xs">
                      🏆
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base sm:text-lg font-black text-[#26231B] tracking-tight">
                          Top Clients Leaderboard (ප්‍රමුඛ පාරිභෝගිකයින්)
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-wider">
                          Ranked by Volume
                        </span>
                      </div>
                      <p className="text-xs text-[#6F6A5A] mt-0.5">
                        Our highest-frequency repeat clients ranked by total confirmed freight orders and financial turnover.
                      </p>
                    </div>
                  </div>

                  <span className="text-xs text-[#6F6A5A] font-bold self-start sm:self-auto bg-[#F7F5EE] px-3 py-1.5 rounded-xl border border-[#E7E2D0]">
                    Showing Top {top10Customers.length} {top10Customers.length === 1 ? "Client" : "Clients"}
                  </span>
                </div>

                {top10Customers.length === 0 ? (
                  <div className="py-12 px-4 rounded-2xl bg-[#F7F5EE] border border-dashed border-[#E7E2D0] text-center flex flex-col items-center justify-center">
                    <span className="text-3xl mb-2">⭐</span>
                    <h3 className="text-sm font-black text-[#26231B]">No client bookings placed yet</h3>
                    <p className="text-xs text-[#6F6A5A] max-w-md mt-1">
                      As customers place individual bookings or reserve live empty lorries on the web platform, the Top 10 clients will automatically be ranked here in real time.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {top10Customers.map((c, idx) => {
                      const rank = idx + 1;
                      const isGold = rank === 1;
                      const isSilver = rank === 2;
                      const isBronze = rank === 3;
                      const isExpanded = !!expandedCustomers[c.id];

                      const cleanPhoneDigits = c.phone.replace(/[^0-9]/g, "");
                      const intlPhone = cleanPhoneDigits.startsWith("0")
                        ? `94${cleanPhoneDigits.slice(1)}`
                        : cleanPhoneDigits.startsWith("94")
                        ? cleanPhoneDigits
                        : `94${cleanPhoneDigits}`;

                      return (
                        <div
                          key={c.id}
                          className={`rounded-2xl border transition-all flex flex-col justify-between overflow-hidden shadow-xs ${
                            isGold
                              ? "bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 border-amber-300 ring-1 ring-amber-300/60"
                              : isSilver
                              ? "bg-gradient-to-br from-slate-50 via-white to-slate-50/50 border-slate-300"
                              : isBronze
                              ? "bg-gradient-to-br from-amber-50/30 via-white to-orange-50/30 border-amber-200"
                              : "bg-white border-[#E7E2D0] hover:border-[#26231B]/30"
                          }`}
                        >
                          {/* Card Header & Rank Ribbon */}
                          <div className="p-4 sm:p-5 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-2xs ${
                                  isGold
                                    ? "bg-[#FFC20E] text-[#26231B]"
                                    : isSilver
                                    ? "bg-slate-200 text-slate-800"
                                    : isBronze
                                    ? "bg-amber-200/80 text-amber-900 border border-amber-300"
                                    : "bg-[#F7F5EE] text-[#4A4538] border border-[#E7E2D0]"
                                }`}
                              >
                                <span>{isGold ? "👑" : isSilver ? "🥈" : isBronze ? "🥉" : "🎖️"}</span>
                                <span>#{rank} TOP CLIENT</span>
                              </span>

                              {/* Tier Badge */}
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                  c.status === "vip"
                                    ? "bg-amber-100 text-amber-900 border-amber-300"
                                    : c.status === "gold"
                                    ? "bg-yellow-100 text-yellow-900 border-yellow-300"
                                    : c.status === "silver"
                                    ? "bg-slate-100 text-slate-800 border-slate-300"
                                    : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                }`}
                              >
                                {c.status === "vip"
                                  ? "👑 VIP Platinum"
                                  : c.status === "gold"
                                  ? "🥇 Gold Tier"
                                  : c.status === "silver"
                                  ? "🥈 Silver Client"
                                  : "🥉 Active Client"}
                              </span>
                            </div>

                            {/* Client Name & Phone */}
                            <div>
                              <h3 className="text-base font-black text-[#26231B] tracking-tight">
                                {c.name}
                              </h3>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className="text-xs font-mono font-bold text-[#6F6A5A]">
                                  {c.phone || "No phone provided"}
                                </span>
                                {c.city && (
                                  <span className="text-[11px] text-[#8C877A] font-semibold bg-[#F7F5EE] px-2 py-0.2 rounded-md">
                                    📍 {c.city}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Direct Contact Links */}
                            <div className="flex items-center gap-2 pt-1">
                              {c.phone && (
                                <>
                                  <a
                                    href={`tel:${c.phone}`}
                                    className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold text-center flex items-center justify-center gap-1.5 transition-colors"
                                  >
                                    <span>📞</span>
                                    <span>Call</span>
                                  </a>
                                  <a
                                    href={`https://wa.me/${intlPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold text-center flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                                  >
                                    <span>💬</span>
                                    <span>WhatsApp</span>
                                  </a>
                                </>
                              )}
                            </div>

                            {/* Key Performance Metrics Box */}
                            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-[#F7F5EE]/70 border border-[#E7E2D0] mt-1 text-xs">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#6F6A5A] block">Total Bookings</span>
                                <span className="text-base font-black text-[#26231B] font-mono mt-0.5 block">
                                  {c.totalBookings} <span className="text-[11px] font-normal text-[#6F6A5A]">Trips</span>
                                </span>
                                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">
                                  {c.completedBookings} Delivered
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#6F6A5A] block">Total Spent (LTV)</span>
                                <span className="text-base font-black text-[#26231B] font-mono mt-0.5 block">
                                  Rs. {c.totalRevenue.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-[#6F6A5A] font-semibold block mt-0.5">
                                  Avg: Rs. {c.averageBookingValue.toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {/* Favorite Corridor / Route */}
                            {c.frequentRoutes.length > 0 && (
                              <div className="text-[11px] text-[#4A4538] font-medium flex items-start gap-1.5 pt-1">
                                <span className="text-[#FFC20E] font-bold">🛣️</span>
                                <span>
                                  <strong className="text-[#26231B]">Route:</strong> {c.frequentRoutes.join(", ")}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Footer Action to expand client's booking history */}
                          <div className="border-t border-[#E7E2D0] bg-[#F7F5EE]/40 px-4 py-2.5 flex items-center justify-between">
                            <span className="text-[11px] text-[#8C877A]">
                              Joined: {new Date(c.registeredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleCustomerExpanded(c.id)}
                              className="text-xs font-bold text-[#26231B] hover:text-amber-800 flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <span>{isExpanded ? "Hide History ▲" : `View ${c.totalBookings} Bookings ▼`}</span>
                            </button>
                          </div>

                          {/* Expandable Booking History Accordion */}
                          {isExpanded && (
                            <div className="p-4 bg-white border-t border-[#E7E2D0] flex flex-col gap-2 max-h-72 overflow-y-auto">
                              <span className="text-[11px] font-bold uppercase text-[#6F6A5A] tracking-wider block mb-1">
                                Complete Order History ({c.bookingsList.length}):
                              </span>
                              {c.bookingsList.map((b) => (
                                <div
                                  key={b.id}
                                  className="p-2.5 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE]/40 flex flex-col gap-1 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-mono font-bold text-[#26231B]">#{b.id}</span>
                                    <StatusBadge status={b.status} />
                                  </div>
                                  <div className="text-[11px] font-semibold text-[#4A4538]">
                                    📍 {b.pickupCity} → {b.deliveryCity}
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-[#6F6A5A] mt-0.5">
                                    <span>📅 {b.date || "Date unspecified"}</span>
                                    {b.quotedAmount !== undefined && (
                                      <span className="font-mono font-bold text-[#26231B]">
                                        Rs. {b.quotedAmount.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ========================================================= */}
              {/* SECTION 2: COMPLETE CUSTOMER DIRECTORY (ALL CLIENTS)     */}
              {/* ========================================================= */}
              <div className="bg-white border border-[#E7E2D0] rounded-3xl p-5 sm:p-6 shadow-xs flex flex-col gap-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E7E2D0]">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-[#26231B] tracking-tight">
                      Complete Customer Directory (සියලුම ලියාපදිංචි පාරිභෝගිකයින්)
                    </h2>
                    <p className="text-xs text-[#6F6A5A] mt-0.5">
                      Search and inspect every client account ever registered or booked on Sithumina Transport.
                    </p>
                  </div>

                  <span className="text-xs text-[#6F6A5A] font-bold bg-[#F7F5EE] px-3 py-1.5 rounded-xl border border-[#E7E2D0] self-start sm:self-auto">
                    {filteredCustomers.length} of {customersWithMetrics.length} Clients
                  </span>
                </div>

                {/* Filter & Search Toolbar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#8C877A]">
                      🔍
                    </span>
                    <input
                      type="text"
                      placeholder="Search by client name, phone number, city, or route..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] placeholder-[#8C877A] focus:outline-none focus:border-[#26231B]"
                    />
                    {customerSearch && (
                      <button
                        onClick={() => setCustomerSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8C877A] hover:text-[#26231B]"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Tier Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { key: "all", label: `All (${customersWithMetrics.length})` },
                      { key: "vip", label: `VIP & Gold (${vipGoldClientsCount})` },
                      { key: "repeat", label: `Repeat (${repeatClientsCount})` },
                      { key: "active", label: `Booked Clients (${customersWithMetrics.filter((c) => c.totalBookings > 0).length})` },
                      { key: "registered", label: `New Registered (${registeredOnlyClientsCount})` },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setCustomerTierFilter(tab.key as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          customerTierFilter === tab.key
                            ? "bg-[#26231B] text-white"
                            : "bg-[#F7F5EE] text-[#6F6A5A] hover:bg-[#E7E2D0]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-2 self-start lg:self-auto">
                    <span className="text-xs font-bold text-[#6F6A5A]">Sort:</span>
                    <select
                      value={customerSort}
                      onChange={(e) => setCustomerSort(e.target.value as any)}
                      className="px-3 py-1.5 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-bold text-[#26231B] focus:outline-none"
                    >
                      <option value="bookings">Most Bookings</option>
                      <option value="revenue">Highest Revenue (LTV)</option>
                      <option value="recent">Recently Active</option>
                      <option value="name">Alphabetical (A–Z)</option>
                    </select>
                  </div>
                </div>

                {/* Customer Cards List */}
                {filteredCustomers.length === 0 ? (
                  <div className="py-12 px-4 rounded-2xl bg-[#F7F5EE] border border-dashed border-[#E7E2D0] text-center flex flex-col items-center justify-center">
                    <span className="text-2xl mb-1">🔍</span>
                    <h3 className="text-xs font-bold text-[#26231B]">No customers found matching filter</h3>
                    <p className="text-[11px] text-[#6F6A5A] mt-0.5">
                      Try clearing the search query or changing the tier filter.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredCustomers.map((c) => {
                      const isExpanded = !!expandedCustomers[c.id];
                      const initial = (c.name || "C").trim().charAt(0).toUpperCase();
                      const cleanPhoneDigits = c.phone.replace(/[^0-9]/g, "");
                      const intlPhone = cleanPhoneDigits.startsWith("0")
                        ? `94${cleanPhoneDigits.slice(1)}`
                        : cleanPhoneDigits.startsWith("94")
                        ? cleanPhoneDigits
                        : `94${cleanPhoneDigits}`;

                      return (
                        <div
                          key={c.id}
                          className="rounded-2xl border border-[#E7E2D0] bg-white hover:border-[#26231B]/30 transition-all overflow-hidden shadow-2xs"
                        >
                          <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            {/* Left: Avatar & Identity */}
                            <div className="flex items-center gap-3.5">
                              <div className="w-12 h-12 rounded-2xl bg-[#26231B] text-[#FFC20E] flex items-center justify-center font-black text-lg shrink-0 shadow-2xs">
                                {initial}
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm sm:text-base font-black text-[#26231B]">
                                    {c.name}
                                  </h3>
                                  <span
                                    className={`px-2 py-0.2 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                      c.status === "vip"
                                        ? "bg-amber-100 text-amber-900 border-amber-300"
                                        : c.status === "gold"
                                        ? "bg-yellow-100 text-yellow-900 border-yellow-300"
                                        : c.status === "silver"
                                        ? "bg-slate-100 text-slate-800 border-slate-300"
                                        : c.status === "active"
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                        : "bg-[#F7F5EE] text-[#6F6A5A] border-[#E7E2D0]"
                                    }`}
                                  >
                                    {c.status === "vip"
                                      ? "👑 VIP Platinum"
                                      : c.status === "gold"
                                      ? "🥇 Gold Client"
                                      : c.status === "silver"
                                      ? "🥈 Silver Client"
                                      : c.status === "active"
                                      ? "🥉 Active Prospect"
                                      : "👤 Registered Member"}
                                  </span>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 mt-1 text-xs text-[#6F6A5A]">
                                  <span className="font-mono font-bold text-[#26231B]">
                                    {c.phone || "No phone provided"}
                                  </span>
                                  {c.city && <span>• 📍 {c.city}</span>}
                                  {c.email && <span>• ✉️ {c.email}</span>}
                                </div>
                              </div>
                            </div>

                            {/* Center: Financial & Booking Metrics */}
                            <div className="grid grid-cols-3 gap-3 py-2 px-3 sm:px-4 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] shrink-0 text-center">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#6F6A5A] block">Bookings</span>
                                <span className="text-sm sm:text-base font-black text-[#26231B] font-mono mt-0.5 block">
                                  {c.totalBookings}
                                </span>
                                <span className="text-[10px] text-emerald-700 font-bold block">
                                  {c.completedBookings} Done
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#6F6A5A] block">LTV Revenue</span>
                                <span className="text-sm sm:text-base font-black text-[#26231B] font-mono mt-0.5 block">
                                  Rs. {c.totalRevenue.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-[#6F6A5A] font-semibold block">
                                  Lifetime
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] uppercase font-bold text-[#6F6A5A] block">Average Order</span>
                                <span className="text-sm sm:text-base font-black text-[#26231B] font-mono mt-0.5 block">
                                  Rs. {c.averageBookingValue.toLocaleString()}
                                </span>
                                <span className="text-[10px] text-[#6F6A5A] font-semibold block">
                                  Per Trip
                                </span>
                              </div>
                            </div>

                            {/* Right: Quick Call, WhatsApp & History Toggle */}
                            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center">
                              {c.phone && (
                                <>
                                  <a
                                    href={`tel:${c.phone}`}
                                    className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-colors flex items-center gap-1.5"
                                  >
                                    <span>📞</span>
                                    <span>Call</span>
                                  </a>
                                  <a
                                    href={`https://wa.me/${intlPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5"
                                  >
                                    <span>💬</span>
                                    <span>WhatsApp</span>
                                  </a>
                                </>
                              )}

                              {c.totalBookings > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleCustomerExpanded(c.id)}
                                  className="px-3.5 py-2 rounded-xl bg-[#26231B] hover:bg-[#FFC20E] hover:text-[#26231B] text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                  <span>{isExpanded ? "Hide Orders ▲" : `History (${c.totalBookings}) ▼`}</span>
                                </button>
                              ) : (
                                <span className="px-3 py-1.5 rounded-xl bg-[#F7F5EE] text-[#8C877A] text-xs font-semibold">
                                  No Orders Yet
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expandable Order History for this customer */}
                          {isExpanded && c.bookingsList.length > 0 && (
                            <div className="p-4 sm:p-5 bg-[#F7F5EE]/40 border-t border-[#E7E2D0] flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-[#26231B] uppercase tracking-wider">
                                  Freight Orders Placed by {c.name} ({c.bookingsList.length})
                                </span>
                                <span className="text-[11px] text-[#6F6A5A]">
                                  First Booked: {new Date(c.registeredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {c.bookingsList.map((b) => (
                                  <div
                                    key={b.id}
                                    className="p-3.5 rounded-2xl bg-white border border-[#E7E2D0] shadow-2xs flex flex-col justify-between gap-2"
                                  >
                                    <div className="flex items-center justify-between gap-1.5">
                                      <span className="font-mono font-black text-xs text-[#26231B]">
                                        #{b.id}
                                      </span>
                                      <StatusBadge status={b.status} />
                                    </div>

                                    <div>
                                      <div className="text-xs font-black text-[#26231B]">
                                        📍 {b.pickupCity} → {b.deliveryCity}
                                      </div>
                                      <div className="text-[11px] text-[#6F6A5A] mt-0.5">
                                        🚛 {b.vehicleType}
                                        {b.cargoNature ? ` • ${b.cargoNature}` : ""}
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-[#E7E2D0] text-xs">
                                      <span className="text-[#6F6A5A] text-[11px]">
                                        📅 {b.date || "Date unspecified"}
                                      </span>
                                      <span className="font-mono font-black text-[#26231B]">
                                        {b.quotedAmount !== undefined
                                          ? `Rs. ${b.quotedAmount.toLocaleString()}`
                                          : "Unquoted"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB: REVENUE (INDIVIDUAL + LIVE LORRY)                    */}
          {/* ========================================================= */}
          {activeNav === "revenue" && (
            <div className="flex flex-col gap-5">
              {/* Top 3 Core KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 1. Today's Revenue (Resets at Midnight) */}
                <div className="p-5 rounded-2xl bg-[#26231B] text-white shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                      Today
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-400">
                      {revenueData.todayBookingsCount} paid · 12 AM reset
                    </span>
                  </div>
                  <div className="text-3xl font-black text-[#FFC20E] font-mono mt-2 tracking-tight">
                    Rs. {revenueData.todayRevenue.toLocaleString()}
                  </div>
                </div>

                {/* 2. This Month */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6A5A]">
                      This Month
                    </span>
                    <span className="text-[11px] font-semibold text-[#6F6A5A]">
                      {revenueData.thisMonthBookingsCount} paid
                    </span>
                  </div>
                  <div className="text-3xl font-black text-[#26231B] font-mono mt-2 tracking-tight">
                    Rs. {revenueData.thisMonthRevenue.toLocaleString()}
                  </div>
                </div>

                {/* 3. All-Time Total */}
                <div className="p-5 rounded-2xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F6A5A]">
                      All-Time
                    </span>
                    <span className="text-[11px] font-semibold text-[#6F6A5A]">
                      {revenueData.allTimeCount} paid
                    </span>
                  </div>
                  <div className="text-3xl font-black text-[#26231B] font-mono mt-2 tracking-tight">
                    Rs. {revenueData.allTimeRevenue.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Stream & Payment Summary Strip for Selected Filter */}
              <div className="bg-[#E7E2D0] rounded-2xl border border-[#E7E2D0] shadow-2xs grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden">
                <div className="bg-white p-4">
                  <div className="text-[11px] font-bold text-[#6F6A5A] uppercase">
                    Selected Total ({revenueData.periodBookings.length})
                  </div>
                  <div className="text-lg font-black text-[#26231B] font-mono mt-0.5">
                    Rs. {revenueData.periodTotal.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-[11px] font-bold text-amber-800 uppercase">
                    Individual ({revenueData.periodIndividualCount})
                  </div>
                  <div className="text-lg font-black text-[#26231B] font-mono mt-0.5">
                    Rs. {revenueData.periodIndividualRevenue.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-[11px] font-bold text-emerald-800 uppercase">
                    Live Lorry ({revenueData.periodLiveCount})
                  </div>
                  <div className="text-lg font-black text-[#26231B] font-mono mt-0.5">
                    Rs. {revenueData.periodLiveRevenue.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white p-4">
                  <div className="text-[11px] font-bold text-[#6F6A5A] uppercase">
                    Bank Slip / Cash
                  </div>
                  <div className="text-sm font-black text-[#26231B] font-mono mt-1">
                    Rs. {revenueData.periodBankRevenue.toLocaleString()}{" "}
                    <span className="text-[#6F6A5A] font-normal">/</span> Rs.{" "}
                    {revenueData.periodCashRevenue.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Compact Filter & Search Toolbar */}
              <div className="p-3.5 rounded-2xl bg-white border border-[#E7E2D0] shadow-2xs flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  {/* Time Filters */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        { id: "today", label: "Today" },
                        { id: "yesterday", label: "Yesterday" },
                        { id: "pick_date", label: "Pick Date" },
                        { id: "days_count", label: "By Days" },
                        { id: "this_month", label: "This Month" },
                        { id: "last_month", label: "Last Month" },
                        { id: "custom", label: "Date Range" },
                        { id: "all_time", label: "All Time" },
                      ] as const
                    ).map((f) => {
                      const isActive = revenueFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setRevenueFilter(f.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? "bg-[#26231B] text-[#FFC20E]"
                              : "bg-[#F7F5EE] hover:bg-[#EBE7D8] text-[#26231B]"
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Stream Filters + Search */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#F7F5EE] p-1 rounded-xl border border-[#E7E2D0]">
                      {(
                        [
                          { id: "all", label: "All" },
                          { id: "individual", label: "Individual" },
                          { id: "live_lorry", label: "Live" },
                        ] as const
                      ).map((t) => {
                        const isActive = revenueTypeFilter === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setRevenueTypeFilter(t.id)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              isActive
                                ? "bg-[#FFC20E] text-[#26231B] shadow-2xs"
                                : "text-[#6F6A5A] hover:text-[#26231B]"
                            }`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative min-w-[210px] sm:w-64">
                      <input
                        type="text"
                        placeholder="Search ID, name, plate..."
                        value={revenueSearch}
                        onChange={(e) => setRevenueSearch(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] focus:outline-none focus:border-[#26231B] placeholder-[#A49F8F]"
                      />
                      <svg
                        className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[#A49F8F]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      {revenueSearch && (
                        <button
                          type="button"
                          onClick={() => setRevenueSearch("")}
                          className="absolute right-2 top-1.5 text-[#A49F8F] hover:text-[#26231B] text-xs font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pick Single Date */}
                {revenueFilter === "pick_date" && (
                  <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#E7E2D0]">
                    <span className="text-xs font-bold text-[#6F6A5A]">Date</span>
                    <input
                      type="date"
                      value={revenueSelectedDate}
                      onChange={(e) => setRevenueSelectedDate(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B] focus:outline-none focus:border-[#26231B]"
                    />
                    {revenueSelectedDate !== revenueData.todayDateStr && (
                      <button
                        type="button"
                        onClick={() => setRevenueSelectedDate(revenueData.todayDateStr)}
                        className="px-2.5 py-1 rounded-lg bg-[#F7F5EE] hover:bg-[#EBE7D8] text-xs font-bold text-[#26231B] cursor-pointer"
                      >
                        Today
                      </button>
                    )}
                  </div>
                )}

                {/* Filter by Number of Days */}
                {revenueFilter === "days_count" && (
                  <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#E7E2D0]">
                    <span className="text-xs font-bold text-[#6F6A5A]">Last</span>
                    {[3, 7, 14, 30, 60].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setRevenueDaysCount(d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                          revenueDaysCount === d
                            ? "bg-[#FFC20E] text-[#26231B]"
                            : "bg-[#F7F5EE] hover:bg-[#EBE7D8] text-[#26231B]"
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        value={revenueDaysCount}
                        onChange={(e) => setRevenueDaysCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 px-2.5 py-1 rounded-lg border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B] focus:outline-none focus:border-[#26231B]"
                      />
                      <span className="text-xs font-bold text-[#6F6A5A]">days</span>
                    </div>
                  </div>
                )}

                {/* Custom Date Range Pickers */}
                {revenueFilter === "custom" && (
                  <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-[#E7E2D0]">
                    <span className="text-xs font-bold text-[#6F6A5A]">From</span>
                    <input
                      type="date"
                      value={revenueCustomStart}
                      onChange={(e) => setRevenueCustomStart(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B] focus:outline-none"
                    />
                    <span className="text-xs font-bold text-[#6F6A5A]">To</span>
                    <input
                      type="date"
                      value={revenueCustomEnd}
                      onChange={(e) => setRevenueCustomEnd(e.target.value)}
                      className="px-2.5 py-1 rounded-lg border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B] focus:outline-none"
                    />
                    {revenueData.customRangeDaysCount > 0 && (
                      <span className="px-2 py-0.5 rounded-lg bg-[#26231B] text-[#FFC20E] text-[11px] font-bold font-mono">
                        {revenueData.customRangeDaysCount} {revenueData.customRangeDaysCount === 1 ? "day" : "days"}
                      </span>
                    )}
                    {(revenueCustomStart || revenueCustomEnd) && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevenueCustomStart("");
                          setRevenueCustomEnd("");
                        }}
                        className="px-2 py-1 text-xs text-red-600 hover:underline cursor-pointer font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Booking Payment History Table */}
              <div className="bg-white rounded-2xl border border-[#E7E2D0] shadow-xs overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-[#E7E2D0] flex items-center justify-between bg-[#FCFBF7]">
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#26231B]">
                    Payment History
                  </h3>
                  <span className="text-xs font-mono font-bold text-[#6F6A5A]">
                    {revenueData.periodBookings.length} records · Rs.{" "}
                    {revenueData.periodTotal.toLocaleString()}
                  </span>
                </div>

                {loadingBookings ? (
                  <div className="p-10 text-center text-xs text-[#6F6A5A]">
                    Loading...
                  </div>
                ) : revenueData.periodBookings.length === 0 ? (
                  <div className="p-10 text-center flex flex-col items-center gap-2">
                    <p className="text-xs font-bold text-[#6F6A5A]">
                      No paid bookings found for this filter.
                    </p>
                    {(revenueSearch || revenueFilter !== "all_time" || revenueTypeFilter !== "all") && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevenueSearch("");
                          setRevenueFilter("all_time");
                          setRevenueTypeFilter("all");
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#26231B] text-white text-xs font-bold hover:bg-[#FFC20E] hover:text-[#26231B] transition-colors cursor-pointer"
                      >
                        Show All History
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E7E2D0] bg-[#F7F5EE] text-[11px] font-bold text-[#6F6A5A] uppercase">
                          <th className="py-2.5 px-4">Booking</th>
                          <th className="py-2.5 px-4">Date</th>
                          <th className="py-2.5 px-4">Customer</th>
                          <th className="py-2.5 px-4">Vehicle / Route</th>
                          <th className="py-2.5 px-4">Method</th>
                          <th className="py-2.5 px-4 text-right">Amount</th>
                          <th className="py-2.5 px-4">Status</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E7E2D0] text-xs">
                        {revenueData.periodBookings.map((b) => {
                          const isIndiv = b.bookingType === "individual_vehicle";
                          const payTs = revenueData.getPayTs(b);
                          const dateObj = new Date(payTs + SRI_LANKA_OFFSET_MS);
                          const dateStr = dateObj.toISOString().slice(0, 10);
                          const h24 = dateObj.getUTCHours();
                          const mins = String(dateObj.getUTCMinutes()).padStart(2, "0");
                          const ampm = h24 >= 12 ? "PM" : "AM";
                          const h12 = h24 % 12 || 12;
                          const timeStr = `${String(h12).padStart(2, "0")}:${mins} ${ampm}`;
                          const amount = Number(b.quotedAmount || 0);

                          return (
                            <tr
                              key={b.id}
                              className="hover:bg-[#FCFBF7] transition-colors"
                            >
                              <td className="py-3 px-4">
                                <div className="font-mono font-bold text-[#26231B]">{b.id}</div>
                                <span
                                  className={`inline-block mt-0.5 text-[10px] font-bold ${
                                    isIndiv ? "text-amber-700" : "text-emerald-700"
                                  }`}
                                >
                                  {isIndiv ? "Individual" : "Live Lorry"}
                                </span>
                              </td>

                              <td className="py-3 px-4 font-mono">
                                <div className="font-semibold text-[#26231B]">{dateStr}</div>
                                <div className="text-[11px] text-[#6F6A5A]">{timeStr}</div>
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-bold text-[#26231B]">{b.customerName || "Customer"}</div>
                                <div className="text-[11px] text-[#6F6A5A] font-mono">
                                  {b.customerPhone || "-"}
                                </div>
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-bold text-[#26231B]">
                                  {b.assignedPlate || b.selectedVehiclePlate || b.vehicleType || "Lorry"}
                                </div>
                                <div className="text-[11px] text-[#6F6A5A]">
                                  {b.pickupCity} → {b.deliveryCity}
                                </div>
                              </td>

                              <td className="py-3 px-4 font-semibold">
                                {b.paymentSlipId || b.paymentSlipStatus === "approved" ? (
                                  <span className="text-purple-800">Bank Slip</span>
                                ) : (
                                  <span className="text-blue-800">Direct / Cash</span>
                                )}
                              </td>

                              <td className="py-3 px-4 text-right font-mono font-black text-[#26231B]">
                                Rs. {amount.toLocaleString()}
                              </td>

                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${
                                    b.status === "delivered"
                                      ? "bg-gray-100 text-gray-800"
                                      : b.status === "in_transit"
                                      ? "bg-blue-100 text-blue-800"
                                      : b.status === "goods_collected"
                                      ? "bg-teal-100 text-teal-800"
                                      : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {b.status.replace("_", " ")}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  {(b.paymentSlipId || b.paymentSlipStatus === "approved") && (
                                    <button
                                      type="button"
                                      onClick={() => openSlipReviewModal(b)}
                                      className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-[11px] transition-colors cursor-pointer"
                                    >
                                      Slip
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStatusFilter("all");
                                      if (isIndiv) {
                                        setActiveNav("individual_bookings");
                                        setBookingViewSubTab("list");
                                        setIndividualSearch(b.id);
                                      } else {
                                        setActiveNav("online_bookings");
                                        setOnlineSearch(b.id);
                                        setExpandedOnlineBookings((prev) => ({ ...prev, [b.id]: true }));
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-[#26231B] hover:bg-[#FFC20E] text-white hover:text-[#26231B] font-bold text-[11px] transition-colors cursor-pointer"
                                  >
                                    View →
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#FCFBF7] border-t border-[#E7E2D0] text-xs font-black text-[#26231B]">
                          <td colSpan={5} className="py-3 px-4 text-right text-[#6F6A5A]">
                            Total ({revenueData.periodBookings.length})
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-sm">
                            Rs. {revenueData.periodTotal.toLocaleString()}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
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
