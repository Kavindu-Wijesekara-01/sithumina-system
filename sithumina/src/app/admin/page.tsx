"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StoredBooking,
  StoredComplaint,
  BookingStatusValue,
  PaymentSlipStatus,
  BookingPaymentMethod,
  StoredRegistration,
  StoredInquiry,
  StoredCustomer,
} from "@/lib/server-store";
import { normalizePlate, normalizePhoneNumber, phonesMatch } from "@/lib/phone-utils";
import {
  addDaysToYYYYMMDD,
  cleanRiderName,
  findBookingScheduleConflict,
  formatJourneyScheduleSummary,
  formatTimeDurationLabel,
  formatTime12h,
  getDatesBetween,
  getSriLankaTimestampForDateTime,
  hasAssignedRider,
  parseTimeToMinutes,
  validateScheduleTimeAndDates,
  validateTimeRange,
} from "@/lib/booking-schedule";
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
import {
  createBookingAction,
  updateBookingStatusAction,
  deleteBookingAction,
  getAllComplaintsAction,
  getAllBookingsAction,
  getAllRegistrationsAction,
  updateRegistrationStatusAction,
  approveRegistrationAndAddToFleetAction,
  getAllInquiriesAction,
  updateInquiryStatusAction,
  getCustomersAction,
  registerCustomerAction,
  deleteCustomerAction,
  getAllOutsideEmployeesAction,
  getAllTopupSlipsAction,
  approveTopupSlipAction,
  deleteTopupSlipAction,
  OutsideEmployeeRecord,
  TopupSlipRecord,
  CommissionTransactionRecord,
} from "@/actions";
import { SRI_LANKA_CITIES } from "@/lib/sri-lanka-routes";
import { getDistanceFromLatLonInKm } from "@/lib/geo-utils";

const ADMIN_PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "ST@2024";

type NavSection =
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
type BookingStatus = BookingStatusValue;
type StatusFilter = "all" | "pending" | "awaiting_payment" | "payment_submitted" | "accepted" | "assigned" | "completed";

interface AssignModalState {
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

interface ScheduleDraft {
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

interface ManualBookingForm {
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

const BOOKING_STAGES: { key: BookingStatus; label: string }[] = [
  { key: "pending", label: "1. Pending Review" },
  { key: "awaiting_payment", label: "2. Awaiting Payment" },
  { key: "payment_submitted", label: "3. Slip Submitted" },
  { key: "accepted", label: "4. Payment Approved" },
  { key: "assigned", label: "5. Rider & Time Assigned" },
  { key: "in_transit", label: "6. In Transit" },
  { key: "delivered", label: "7. Delivered / Completed" },
  { key: "cancelled", label: "8. Cancelled" },
];

const PROGRESS_KEYS: BookingStatus[] = [
  "pending",
  "awaiting_payment",
  "payment_submitted",
  "accepted",
  "assigned",
  "in_transit",
  "delivered",
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

function getRouteDistanceKm(pickup?: string, delivery?: string, recordedKm?: number | string): string {
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

function addMinutesToHHMM(hhmm?: string | null, minsToAdd: number = 5): string {
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
  if (b.status === "delivered") {
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
  // - Explicitly marked in_transit or goods_collected
  // - OR scheduled departure time has arrived (now >= startTimestamp)
  // CRITICAL REQUIREMENT: A ride is NEVER automatically completed or freed by clock expiration!
  // It remains ONGOING until the Admin or Driver manually verifies/marks it as "Delivered / Completed".
  const isManuallyOngoing = b.status === "in_transit" || b.status === "goods_collected";
  const isTimeOngoing = startTimestamp !== null && nowMs >= startTimestamp;

  if (isManuallyOngoing || isTimeOngoing) {
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, ScheduleDraft>>({});

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
  const [customerTierFilter, setCustomerTierFilter] = useState<"all" | "active" | "registered">("all");
  const [customerSort, setCustomerSort] = useState<"recent" | "name" | "bookings">("recent");
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

  // ---- Outside Employees State ----
  const [outsideEmployees, setOutsideEmployees] = useState<OutsideEmployeeRecord[]>([]);
  const [loadingOutsideEmployees, setLoadingOutsideEmployees] = useState(true);
  const [outsideSearch, setOutsideSearch] = useState("");
  const [outsideFilter, setOutsideFilter] = useState<"all" | "available" | "unavailable" | "low_balance">("all");

  // ---- Top-up Slips State ----
  const [topupSlips, setTopupSlips] = useState<TopupSlipRecord[]>([]);
  const [loadingTopupSlips, setLoadingTopupSlips] = useState(true);
  const [topupSearch, setTopupSearch] = useState("");
  const [topupStatusFilter, setTopupStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [topupActionId, setTopupActionId] = useState<string | null>(null);
  const [viewingSlipImage, setViewingSlipImage] = useState<string | null>(null);

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

  // ---- Dashboard Overview States ----
  const [dashboardFilterMode, setDashboardFilterMode] = useState<
    "upcoming" | "ongoing" | "completed" | "unpaid" | "all" | "today"
  >("upcoming");
  const [dashboardDateFrom, setDashboardDateFrom] = useState<string>("");
  const [dashboardDateTo, setDashboardDateTo] = useState<string>("");
  const [expandedDashboardBookings, setExpandedDashboardBookings] = useState<Record<string, boolean>>({});

  // ---- Dedicated Ongoing, Pending Payment & Completed Sections States ----
  const [allBookingsTab, setAllBookingsTab] = useState<"ongoing" | "pending_payment" | "completed">("ongoing");
  const [ongoingSearch, setOngoingSearch] = useState<string>("");
  const [pendingPaymentSearch, setPendingPaymentSearch] = useState<string>("");
  const [completedSearch, setCompletedSearch] = useState<string>("");
  const [completedDateFrom, setCompletedDateFrom] = useState<string>("");
  const [completedDateTo, setCompletedDateTo] = useState<string>("");

  const toggleDashboardBookingCard = (bookingId: string, currentExpanded: boolean) => {
    setExpandedDashboardBookings((prev) => ({
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
    baseCity: "",
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
    driverId: "",
    driverName: "",
    driverPhone: "",
    customerName: "",
    customerPhone: "",
    customerIdNumber: "",
    pickupCity: "",
    deliveryCity: "",
    distanceKm: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "08:00",
    endTime: "12:00",
    quotedAmount: "",
    paymentStatusMode: "pending",
    advanceAmount: "",
    paymentMethod: "cash_manual",
    paymentBankUsed: "",
    paymentNote: "",
    cargoNature: CARGO_NATURE_OPTIONS[0],
    cargoWeight: "",
    helpersCount: "0",
    notes: "",
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualRegisteringClient, setManualRegisteringClient] = useState(false);
  const manualAutoFilledNameRef = useRef<string>("");
  const deletedCustomerKeysRef = useRef<Map<string, number>>(new Map());
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);
  const [deleteCustomerModal, setDeleteCustomerModal] = useState<{
    id: string;
    name: string;
    phone: string;
    totalBookings: number;
    totalRevenue: number;
    deleteBookings: boolean;
  } | null>(null);

  // ---- Complaints & Deletion Reason State ----
  const [complaints, setComplaints] = useState<StoredComplaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [complaintSearch, setComplaintSearch] = useState("");

  // ---- Booking Deletion with Reason Modal State ----
  const [deleteBookingModal, setDeleteBookingModal] = useState<{
    booking: StoredBooking;
    reason: string;
    error?: string;
  } | null>(null);
  const [deletingBookingLoading, setDeletingBookingLoading] = useState(false);

  // ---- Payment Approval & Settle Modals State ----
  const [paymentApprovalModal, setPaymentApprovalModal] = useState<{
    booking: StoredBooking;
    totalAmount: string;
    collectionMode: "full_paid" | "partial_advance" | "full_pending";
    advanceAmount: string;
    paymentMethod: "cash_manual" | "bank_transfer";
    bankUsed: string;
    note: string;
  } | null>(null);

  const [settleBalanceModal, setSettleBalanceModal] = useState<{
    booking: StoredBooking;
    pendingAmount: number;
    settleMethod: "cash_manual" | "bank_transfer";
    bankUsed: string;
    note: string;
  } | null>(null);

  const isRealCustomerName = useCallback((raw?: string) => {
    const t = String(raw || "").trim();
    return Boolean(t && t !== "Customer" && t !== "Valued Customer" && !t.startsWith("Customer ("));
  }, []);

  const mergeRegisteredCustomerList = useCallback(
    (incoming: StoredCustomer[], prev: StoredCustomer[] = []): StoredCustomer[] => {
      const byKey = new Map<string, StoredCustomer>();
      const push = (item: StoredCustomer) => {
        const norm = normalizePhoneNumber(item.phone) || item.phone.trim();
        const key = norm || item.id;
        if (!key) return;
        const deletedAt =
          deletedCustomerKeysRef.current.get(key) ??
          (item.id ? deletedCustomerKeysRef.current.get(item.id) : undefined);
        if (deletedAt !== undefined) {
          const itemTs = Math.max(item.lastLoginAt || 0, item.createdAt || 0);
          if (itemTs <= deletedAt) return;
          deletedCustomerKeysRef.current.delete(key);
          if (item.id) deletedCustomerKeysRef.current.delete(item.id);
        }
        const old = byKey.get(key);
        if (!old) {
          byKey.set(key, item);
          return;
        }
        const resolvedName = isRealCustomerName(item.name)
          ? item.name.trim()
          : isRealCustomerName(old.name)
          ? old.name.trim()
          : item.name || old.name;
        byKey.set(key, {
          ...old,
          ...item,
          name: resolvedName,
          phone: old.phone || item.phone,
          email: item.email || old.email || "",
          city: item.city || old.city || "",
          createdAt:
            old.createdAt && item.createdAt
              ? Math.min(old.createdAt, item.createdAt)
              : old.createdAt || item.createdAt,
          lastLoginAt: Math.max(old.lastLoginAt || 0, item.lastLoginAt || 0),
        });
      };
      prev.forEach(push);
      incoming.forEach(push);
      return Array.from(byKey.values()).sort(
        (a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0)
      );
    },
    [isRealCustomerName]
  );

  const handleOpenManualModal = () => {
    const defaultVehicle = fleetVehicles[0] || null;
    const defaultPlate = defaultVehicle?.plate || "";
    const defaultDriver =
      drivers.find(
        (d) =>
          (defaultPlate && normalizePlate(d.plate) === normalizePlate(defaultPlate)) ||
          (defaultVehicle?.driverId && d.driverId === defaultVehicle.driverId)
      ) ||
      drivers[0] ||
      null;
    manualAutoFilledNameRef.current = "";
    setManualForm({
      plate: defaultPlate,
      vehicleType: defaultVehicle?.vehicleType || "Lorry",
      driverId: defaultDriver?.driverId || "",
      driverName: defaultDriver?.name || "",
      driverPhone: defaultDriver?.phone || "",
      customerName: "",
      customerPhone: "",
      customerIdNumber: "",
      pickupCity: "",
      deliveryCity: "",
      distanceKm: "",
      date: new Date().toISOString().split("T")[0],
      startTime: "08:00",
      endTime: "12:00",
      quotedAmount: "",
      paymentStatusMode: "pending",
      advanceAmount: "",
      paymentMethod: "cash_manual",
      paymentBankUsed: "",
      paymentNote: "",
      cargoNature: CARGO_NATURE_OPTIONS[0],
      cargoWeight: "",
      helpersCount: "0",
      notes: "",
    });
    setShowManualModal(true);
  };

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
    setOutsideEmployees([]);
    setTopupSlips([]);
    setInquiries([]);
    setRegisteredUsers([]);
    setLoadingBookings(true);
    setLoadingFleet(true);
    setLoadingDrivers(true);
    setLoadingRegistrations(true);
    setLoadingOutsideEmployees(true);
    setLoadingTopupSlips(true);
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
      setOutsideEmployees([]);
      setTopupSlips([]);
      setInquiries([]);
      setRegisteredUsers([]);
      setLoadingFleet(true);
      setLoadingDrivers(true);
      setLoadingRegistrations(true);
      setLoadingOutsideEmployees(true);
      setLoadingTopupSlips(true);
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
        setRegisteredUsers((prev) => mergeRegisteredCustomerList(res.data || [], prev));
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
          setRegisteredUsers((prev) => mergeRegisteredCustomerList(list, prev));
        }
        setLoadingUsers(false);
      },
      () => {
        setLoadingUsers(false);
      }
    );

    const unsubFleet = subscribeFleetVehicles((vehicles) => {
      setFleetVehicles(vehicles);
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
            idNumber: data.idNumber ? String(data.idNumber) : undefined,
            plateNumber: String(data.plateNumber || data.vehicleNumber || ""),
            vehicleNumber: String(data.vehicleNumber || data.plateNumber || ""),
            vehicleType: String(data.vehicleType || "Lorry"),
            baseCity: String(data.baseCity || ""),
            capacity: String(data.capacity || ""),
            maxWeight: data.maxWeight ? String(data.maxWeight) : undefined,
            dimensions: data.dimensions ? String(data.dimensions) : undefined,
            images: Array.isArray(data.images) ? data.images : (data.imageUrl ? [data.imageUrl] : []),
            depositSlipUrl: data.depositSlipUrl ? String(data.depositSlipUrl) : undefined,
            initialDepositAmount: Number(data.initialDepositAmount) || 5000,
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

    const unsubComplaints = onSnapshot(
      collection(db, "complaints"),
      (snap) => {
        const list: StoredComplaint[] = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: String(data.id || d.id),
            bookingId: String(data.bookingId || ""),
            customerName: String(data.customerName || ""),
            customerPhone: String(data.customerPhone || ""),
            customerIdNumber: data.customerIdNumber ? String(data.customerIdNumber) : undefined,
            pickupCity: String(data.pickupCity || ""),
            deliveryCity: String(data.deliveryCity || ""),
            date: String(data.date || data.bookingDate || ""),
            vehicleType: String(data.vehicleType || "Lorry"),
            quotedAmount: typeof data.quotedAmount === "number" ? data.quotedAmount : (Number(data.quotedAmount || data.amount) || undefined),
            distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : (Number(data.distanceKm) || undefined),
            reason: String(data.reason || "Booking deleted by admin"),
            deletedAt: Number(data.deletedAt) || (data.deletedAt ? new Date(data.deletedAt).getTime() : Date.now()),
            deletedBy: data.deletedBy ? String(data.deletedBy) : undefined,
          });
        });
        list.sort((a, b) => (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0));
        setComplaints(list);
        setLoadingComplaints(false);
      },
      async (err) => {
        console.warn("Firestore complaints subscription notice:", err);
        const res = await getAllComplaintsAction();
        if (res.success && res.data) {
          setComplaints(res.data);
        }
        setLoadingComplaints(false);
      }
    );

    const unsubOutsideEmployees = onSnapshot(
      collection(db, "outside_employees"),
      (snap) => {
        const list: OutsideEmployeeRecord[] = [];
        snap.forEach((d) => {
          list.push(d.data() as OutsideEmployeeRecord);
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setOutsideEmployees(list);
        setLoadingOutsideEmployees(false);
      },
      async (err) => {
        console.warn("Firestore outside_employees subscription notice:", err);
        const res = await getAllOutsideEmployeesAction();
        if (res.success && res.data) {
          setOutsideEmployees(res.data);
        }
        setLoadingOutsideEmployees(false);
      }
    );

    const unsubTopupSlips = onSnapshot(
      collection(db, "outside_topup_slips"),
      (snap) => {
        const list: TopupSlipRecord[] = [];
        snap.forEach((d) => {
          list.push(d.data() as TopupSlipRecord);
        });
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setTopupSlips(list);
        setLoadingTopupSlips(false);
      },
      async (err) => {
        console.warn("Firestore outside_topup_slips subscription notice:", err);
        const res = await getAllTopupSlipsAction();
        if (res.success && res.data) {
          setTopupSlips(res.data);
        }
        setLoadingTopupSlips(false);
      }
    );

    return () => {
      unsubFleet();
      unsubDrivers();
      unsubBankAccounts();
      unsubSlipsMeta();
      unsubRegistrations();
      unsubOutsideEmployees();
      unsubTopupSlips();
      unsubInquiries();
      unsubComplaints();
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
            customerIdNumber: data.customerIdNumber || data.idNumber || "",
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
            bookingType: (data.bookingType as "individual_vehicle" | "live_lorry") || "live_lorry",
            cargoNature: data.cargoNature || "",
            daysNeeded: data.daysNeeded || resolvedDates.length || "1",
            cargoWeight: data.cargoWeight || "",
            helpersCount: data.helpersCount || "0",
            packageDetails: data.packageDetails || data.notes || "",
            status: (data.status as BookingStatus) || "pending",
            assignedLorryId: data.assignedLorryId || "",
            assignedDriverId: data.assignedDriverId ? String(data.assignedDriverId).trim() : "",
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
            paymentSlipId: data.paymentSlipId ? String(data.paymentSlipId) : "",
            paymentSlipName: data.paymentSlipName ? String(data.paymentSlipName) : "",
            paymentSlipType: data.paymentSlipType ? String(data.paymentSlipType) : "",
            paymentSlipSize: Number(data.paymentSlipSize) || undefined,
            paymentSlipUploadedAt: Number(data.paymentSlipUploadedAt) || undefined,
            paymentSlipStatus: (data.paymentSlipStatus as PaymentSlipStatus) || "none",
            paymentRejectReason: data.paymentRejectReason ? String(data.paymentRejectReason) : "",
            paymentApprovedAt: Number(data.paymentApprovedAt) || undefined,
            paymentSlipDeletedAt: Number(data.paymentSlipDeletedAt) || undefined,
            customerArchived: Boolean(data.customerArchived),
            distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : (Number(data.distanceKm) || undefined),
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

  // ---- Schedule Draft & Conflict Validation Helper ----
  const getScheduleDraft = useCallback(
    (b: StoredBooking): ScheduleDraft => {
      if (scheduleDrafts[b.id]) return scheduleDrafts[b.id];
      const bPlateNorm = normalizePlate(b.assignedPlate);
      const bLorryId = (b.assignedLorryId || "").trim().toLowerCase();
      const matchedVehicle =
        fleetVehicles.find(
          (v) =>
            (bPlateNorm && normalizePlate(v.plate) === bPlateNorm) ||
            (bLorryId && (v.id || "").toLowerCase() === bLorryId)
        ) || null;
      const existingDriverName = cleanRiderName(b.assignedDriverName);
      const matchedDriver =
        drivers.find(
          (d) =>
            (b.assignedDriverId && d.driverId === b.assignedDriverId) ||
            (b.assignedDriverPhone && phonesMatch(d.phone, b.assignedDriverPhone)) ||
            (existingDriverName && d.name.toLowerCase() === existingDriverName.toLowerCase())
        ) || null;
      const bDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : (b.date ? [b.date] : []);
      const startDate = b.date || bDates[0] || new Date().toISOString().split("T")[0];
      const endDate = bDates.length > 1 ? bDates[bDates.length - 1] : startDate;
      const isMultiDate = bDates.length > 1 || (b.daysNeeded !== undefined && Number(b.daysNeeded) > 1);
      return {
        date: startDate,
        endDate: endDate,
        isMultiDate: isMultiDate,
        dates: bDates.length > 0 ? bDates : [startDate],
        startTime: b.startTime || "",
        endTime: b.endTime || "",
        plate: b.assignedPlate || matchedVehicle?.plate || "",
        lorryId: b.assignedLorryId || matchedVehicle?.id || "",
        driverId: b.assignedDriverId || matchedDriver?.driverId || "",
        driverName: existingDriverName || matchedDriver?.name || "",
        driverPhone: b.assignedDriverPhone || matchedDriver?.phone || "",
        distanceKm: b.distanceKm ? String(b.distanceKm) : "",
      };
    },
    [scheduleDrafts, fleetVehicles, drivers]
  );

  const updateScheduleDraft = useCallback(
    (booking: StoredBooking, patch: Partial<ScheduleDraft>) => {
      setScheduleDrafts((prev) => {
        const base = prev[booking.id] || getScheduleDraft(booking);
        return {
          ...prev,
          [booking.id]: {
            ...base,
            ...patch,
          },
        };
      });
    },
    [getScheduleDraft]
  );

  const validateIndividualScheduleOrToast = useCallback(
    (
      bookingId: string,
      draft: ScheduleDraft
    ): { valid: true; assignment: NonNullable<Parameters<typeof updateBookingStatusAction>[2]> } | { valid: false } => {
      if (!draft.date || !draft.date.trim()) {
        showToast("Please select a Trip Departure Date before allocating a schedule.", "error");
        return { valid: false };
      }
      const resolvedEndDate = draft.isMultiDate && draft.endDate ? draft.endDate.trim() : draft.date.trim();
      const scheduleCheck = validateScheduleTimeAndDates(
        draft.date.trim(),
        draft.startTime,
        resolvedEndDate,
        draft.endTime,
        draft.dates
      );
      if (!scheduleCheck.valid) {
        showToast(scheduleCheck.error, "error");
        return { valid: false };
      }
      if (!draft.plate.trim()) {
        showToast("Please select a fleet lorry for this booking.", "error");
        return { valid: false };
      }
      if (
        !hasAssignedRider({
          assignedDriverId: draft.driverId,
          assignedDriverName: draft.driverName,
          assignedDriverPhone: draft.driverPhone,
        })
      ) {
        showToast("Assigning a Rider is mandatory for every booking.", "error");
        return { valid: false };
      }

      const conflict = findBookingScheduleConflict(
        {
          excludeBookingId: bookingId,
          date: scheduleCheck.startDate,
          dates: scheduleCheck.dates,
          startTime: scheduleCheck.startTime,
          endTime: scheduleCheck.endTime,
          assignedPlate: draft.plate.trim(),
          assignedLorryId: draft.lorryId.trim() || `lorry-${normalizePlate(draft.plate).toLowerCase()}`,
          assignedDriverId: draft.driverId.trim(),
          assignedDriverName: draft.driverName.trim(),
          assignedDriverPhone: draft.driverPhone.trim(),
          bookingType: "individual_vehicle",
        },
        bookings
      );
      if (conflict.hasConflict) {
        showToast(conflict.message || "Schedule overlap detected for lorry or rider.", "error");
        return { valid: false };
      }

      return {
        valid: true,
        assignment: {
          date: scheduleCheck.startDate,
          dates: scheduleCheck.dates,
          endDate: scheduleCheck.endDate,
          daysNeeded: scheduleCheck.daysCount,
          startTime: scheduleCheck.startTime,
          endTime: scheduleCheck.endTime,
          assignedPlate: draft.plate.trim(),
          assignedLorryId: draft.lorryId.trim() || `lorry-${normalizePlate(draft.plate).toLowerCase()}`,
          assignedDriverId: draft.driverId.trim() || undefined,
          assignedDriverName: draft.driverName.trim(),
          assignedDriverPhone: draft.driverPhone.trim() || undefined,
          distanceKm: draft.distanceKm ? Number(draft.distanceKm) : undefined,
        },
      };
    },
    [bookings]
  );

  // ---- Update Booking Status ----
  const updateBooking = useCallback(
    async (
      id: string,
      status: BookingStatus,
      assignment?: {
        assignedLorryId?: string;
        assignedDriverId?: string;
        assignedDriverName?: string;
        assignedDriverPhone?: string;
        assignedPlate?: string;
        date?: string;
        dates?: string[];
        startTime?: string;
        endTime?: string;
        distanceKm?: number;
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
        paymentSlipStatus?: PaymentSlipStatus;
        paymentRejectReason?: string;
        paymentApprovedAt?: number;
        paymentSlipDeletedAt?: number;
      }
    ): Promise<boolean> => {
      setActionLoading(id);
      try {
        const existingBooking = bookings.find((b) => b.id === id);
        let effectiveAssignment = assignment;

        // Enrich missing lorry/driver metadata only for live_lorry bookings when assignment wasn't explicitly passed
        if (
          !effectiveAssignment &&
          existingBooking &&
          existingBooking.bookingType === "live_lorry" &&
          (status === "assigned" || status === "accepted")
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
          const resolvedDriverName =
            cleanRiderName(existingBooking.assignedDriverName) ||
            cleanRiderName(matchedFleet?.driverName) ||
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
              assignedDriverId: existingBooking.assignedDriverId || matchedDriver?.driverId || "",
              assignedDriverName: resolvedDriverName,
              assignedDriverPhone: resolvedDriverPhone,
            };
          }
        }

        const actionRes = await updateBookingStatusAction(id, status, effectiveAssignment, paymentMeta);

        if (!actionRes.success) {
          showToast(actionRes.error || "Failed to update booking schedule.", "error");
          return false;
        }

        const updatedFromServer = actionRes.data;
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

        setManualStageDraft((prev) => {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });

        showToast(
          status === "awaiting_payment"
            ? "Amount quote sent to customer."
            : status === "accepted"
            ? "Payment approved and schedule slot allocated."
            : status === "assigned"
            ? "Schedule duration & Rider assigned successfully."
            : status === "in_transit"
            ? "Booking marked In Transit."
            : status === "delivered"
            ? "Booking marked Delivered."
            : status === "cancelled"
            ? "Booking cancelled and time slot released."
            : "Booking updated successfully."
        );
        return true;
      } catch {
        showToast("Failed to update booking. Please retry.", "error");
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [bookings, fleetVehicles, drivers]
  );

  const handleSaveBookingSchedule = async (booking: StoredBooking) => {
    const draft = getScheduleDraft(booking);
    const check = validateIndividualScheduleOrToast(booking.id, draft);
    if (!check.valid) return;
    const nextStatus: BookingStatus =
      booking.status === "accepted" || booking.status === "booked" ? "assigned" : booking.status;
    await updateBooking(booking.id, nextStatus, check.assignment);
  };

  const promptDeleteBooking = (target: StoredBooking | string) => {
    const booking = typeof target === "string" ? bookings.find((b) => b.id === target) : target;
    if (!booking) return;
    setDeleteBookingModal({
      booking,
      reason: "",
      error: "",
    });
  };

  const handleDeleteBooking = promptDeleteBooking;

  const handleConfirmDeleteBookingWithReason = async () => {
    if (!deleteBookingModal) return;
    const { booking, reason } = deleteBookingModal;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setDeleteBookingModal((p) => (p ? { ...p, error: "Booking එක delete කිරීම සඳහා හේතුවක් (Reason) ඇතුළත් කිරීම අනිවාර්ය වේ." } : null));
      return;
    }
    setDeletingBookingLoading(true);
    try {
      const res = await deleteBookingAction(booking.id, cleanReason, booking.customerPhone, "Admin");
      if (res.success) {
        setBookings((prev) => prev.filter((b) => b.id !== booking.id));
        const newComplaint: StoredComplaint = {
          id: `complaint-${Date.now()}`,
          bookingId: booking.id,
          customerName: booking.customerName || "Customer",
          customerPhone: booking.customerPhone || "",
          customerIdNumber: booking.customerIdNumber || undefined,
          pickupCity: booking.pickupCity || "",
          deliveryCity: booking.deliveryCity || "",
          date: booking.date || (Array.isArray(booking.dates) ? booking.dates[0] : "") || "Date unspecified",
          vehicleType: booking.vehicleType || "Lorry",
          quotedAmount: typeof booking.quotedAmount === "number" ? booking.quotedAmount : undefined,
          distanceKm: booking.distanceKm,
          reason: cleanReason,
          deletedAt: Date.now(),
          deletedBy: "Admin",
        };
        setComplaints((prev) => [newComplaint, ...prev.filter((c) => c.id !== newComplaint.id)]);
        showToast(`Booking #${booking.id} deleted. Reason recorded in Complaints.`);
        setDeleteBookingModal(null);
      } else {
        setDeleteBookingModal((p) => (p ? { ...p, error: res.error || "Failed to delete booking." } : null));
      }
    } catch (e: any) {
      setDeleteBookingModal((p) => (p ? { ...p, error: e?.message || "Error deleting booking." } : null));
    } finally {
      setDeletingBookingLoading(false);
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

    const draft = scheduleDrafts[booking.id];
    const distanceVal = draft?.distanceKm ? Number(draft.distanceKm) : booking.distanceKm;

    await updateBooking(
      booking.id,
      "awaiting_payment",
      distanceVal !== undefined ? { distanceKm: distanceVal } : undefined,
      {
        quotedAmount: numericAmount,
        quotedAt: Date.now(),
        quoteNote: entry.note.trim(),
      }
    );
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
    let scheduleAssignment: Parameters<typeof updateBookingStatusAction>[2] | undefined;
    if (booking.bookingType !== "live_lorry") {
      const draft = getScheduleDraft(booking);
      const check = validateIndividualScheduleOrToast(booking.id, draft);
      if (!check.valid) return;
      scheduleAssignment = check.assignment;
    }
    const targetStatus: BookingStatus =
      booking.bookingType !== "live_lorry" ? "assigned" : "accepted";
    const ok = await updateBooking(booking.id, targetStatus, scheduleAssignment, {
      paymentMethod: "bank_slip",
      paymentSlipStatus: "approved",
      paymentApprovedAt: Date.now(),
      paymentRejectReason: "",
    });
    if (ok) {
      setManualStageDraft((prev) => ({ ...prev, [booking.id]: targetStatus }));
      closeReviewModal();
    }
  };

  const openPaymentApprovalModal = (booking: StoredBooking) => {
    const entry = quoteInputs[booking.id];
    const defaultAmount =
      entry?.amount || (booking.quotedAmount ? String(booking.quotedAmount) : "");
    const defaultNote =
      entry?.note || booking.quoteNote || "";

    const activeBank = bankAccounts.find((a) => a.active);
    const defaultBankLabel = activeBank
      ? `${activeBank.bankName} - ${activeBank.accountNumber} (${activeBank.accountName})`
      : bankAccounts.length > 0
      ? `${bankAccounts[0].bankName} - ${bankAccounts[0].accountNumber}`
      : "Commercial Bank - 100029384920";

    const isPartial =
      typeof booking.pendingAmount === "number" &&
      booking.pendingAmount > 0 &&
      typeof booking.advanceAmount === "number" &&
      booking.advanceAmount > 0;

    const isFullPending =
      booking.paymentSlipStatus === "cash_pending" ||
      (typeof booking.pendingAmount === "number" && booking.pendingAmount > 0 && (!booking.advanceAmount || booking.advanceAmount <= 0));

    const initialMode: "full_paid" | "partial_advance" | "full_pending" = isPartial
      ? "partial_advance"
      : isFullPending
      ? "full_pending"
      : "full_paid";

    setPaymentApprovalModal({
      booking,
      totalAmount: defaultAmount,
      collectionMode: initialMode,
      advanceAmount: booking.advanceAmount ? String(booking.advanceAmount) : "",
      paymentMethod: (booking.paymentMethod === "bank_transfer" ? "bank_transfer" : "cash_manual"),
      bankUsed: booking.paymentBankUsed || defaultBankLabel,
      note: defaultNote,
    });
  };

  const openCashApprovalModal = openPaymentApprovalModal;

  const openSettleBalanceModal = (booking: StoredBooking) => {
    const activeBank = bankAccounts.find((a) => a.active);
    const defaultBankLabel = activeBank
      ? `${activeBank.bankName} - ${activeBank.accountNumber} (${activeBank.accountName})`
      : bankAccounts.length > 0
      ? `${bankAccounts[0].bankName} - ${bankAccounts[0].accountNumber}`
      : "Commercial Bank - 100029384920";

    const pending =
      typeof booking.pendingAmount === "number" && booking.pendingAmount > 0
        ? booking.pendingAmount
        : Math.max(0, (booking.quotedAmount || 0) - (booking.advanceAmount || 0));

    setSettleBalanceModal({
      booking,
      pendingAmount: pending || (booking.quotedAmount || 0),
      settleMethod: "cash_manual",
      bankUsed: defaultBankLabel,
      note: "",
    });
  };

  const handleConfirmPaymentApproval = async () => {
    if (!paymentApprovalModal) return;
    const { booking, totalAmount, collectionMode, advanceAmount, paymentMethod, bankUsed, note } = paymentApprovalModal;
    const numTotal = Number(String(totalAmount || "").replace(/[^0-9.]/g, ""));
    if (!numTotal || numTotal <= 0) {
      showToast("Please enter a valid Amount (LKR) greater than 0.", "error");
      return;
    }

    let numAdvance = 0;
    let numPending = 0;

    if (collectionMode === "full_paid") {
      numAdvance = numTotal;
      numPending = 0;
    } else if (collectionMode === "partial_advance") {
      numAdvance = Number(String(advanceAmount || "").replace(/[^0-9.]/g, ""));
      if (!numAdvance || numAdvance <= 0) {
        showToast("Please enter a valid Advance Amount greater than 0.", "error");
        return;
      }
      if (numAdvance >= numTotal) {
        showToast("Advance Amount must be less than Total Amount. Select Full Paid if entire amount is paid.", "error");
        return;
      }
      numPending = numTotal - numAdvance;
    } else {
      // full_pending
      numAdvance = 0;
      numPending = numTotal;
    }

    let scheduleAssignment: Parameters<typeof updateBookingStatusAction>[2] | undefined;
    let targetStatus: BookingStatus = "accepted";
    if (booking.bookingType !== "live_lorry") {
      const draft = getScheduleDraft(booking);
      const hasFullSchedule = Boolean(
        draft.date &&
        draft.startTime &&
        draft.endTime &&
        draft.plate &&
        hasAssignedRider({
          assignedDriverId: draft.driverId,
          assignedDriverName: draft.driverName,
          assignedDriverPhone: draft.driverPhone,
        })
      );
      if (hasFullSchedule) {
        const check = validateIndividualScheduleOrToast(booking.id, draft);
        if (!check.valid) return;
        scheduleAssignment = check.assignment;
        targetStatus = "assigned";
      } else {
        targetStatus = "accepted";
      }
    } else {
      targetStatus = "accepted";
    }

    const isFullySettled = numPending === 0;

    const ok = await updateBooking(booking.id, targetStatus, scheduleAssignment, {
      quotedAmount: numTotal,
      quotedAt: booking.quotedAt || Date.now(),
      quoteNote: note.trim() || undefined,
      advanceAmount: numAdvance,
      pendingAmount: numPending,
      paymentMethod: collectionMode === "full_pending" ? "cash_manual" : paymentMethod,
      paymentBankUsed: collectionMode !== "full_pending" && paymentMethod === "bank_transfer" ? bankUsed : undefined,
      paymentSlipStatus: isFullySettled ? "manual_approved" : "cash_pending",
      paymentApprovedAt: numAdvance > 0 ? Date.now() : 0,
      paymentRejectReason: "",
    });

    if (ok) {
      setEditingQuoteId(null);
      setManualStageDraft((prev) => ({ ...prev, [booking.id]: targetStatus }));
      setPaymentApprovalModal(null);
      showToast(
        collectionMode === "full_paid"
          ? `Payment of Rs. ${numTotal.toLocaleString()} approved as Full Paid (${paymentMethod === "bank_transfer" ? `Bank: ${bankUsed}` : "Cash"}).`
          : collectionMode === "partial_advance"
          ? `Advance Rs. ${numAdvance.toLocaleString()} approved. Pending balance Rs. ${numPending.toLocaleString()} set.`
          : `Booking approved as Pending (Rs. ${numTotal.toLocaleString()}).`,
        "success"
      );
    }
  };

  const handleConfirmSettleBalance = async () => {
    if (!settleBalanceModal) return;
    const { booking, pendingAmount, settleMethod, bankUsed, note } = settleBalanceModal;
    const totalAmount = booking.quotedAmount || pendingAmount;
    const noteClean = note.trim();
    const finalNote = noteClean
      ? `${booking.quoteNote ? `${booking.quoteNote} · ` : ""}Settled balance: ${noteClean}`
      : booking.quoteNote || "Balance settled";

    const originalAdvance =
      typeof booking.advanceAmount === "number" && booking.advanceAmount > 0 && booking.advanceAmount < totalAmount
        ? booking.advanceAmount
        : totalAmount - pendingAmount > 0
        ? totalAmount - pendingAmount
        : undefined;

    const ok = await updateBooking(booking.id, booking.status, undefined, {
      quotedAmount: totalAmount,
      advanceAmount: originalAdvance ?? totalAmount,
      pendingAmount: 0,
      finalPaymentMethod: settleMethod,
      finalPaymentBankUsed: settleMethod === "bank_transfer" ? bankUsed : undefined,
      finalPaymentAt: Date.now(),
      paymentSlipStatus: "manual_approved",
      paymentApprovedAt: booking.paymentApprovedAt || Date.now(),
      quoteNote: finalNote,
    });

    if (ok) {
      setSettleBalanceModal(null);
      showToast(
        `Balance of Rs. ${pendingAmount.toLocaleString()} settled successfully via ${
          settleMethod === "bank_transfer" ? `Bank (${bankUsed})` : "Cash"
        }! Marked as Full Paid.`,
        "success"
      );
    }
  };

  const handleMarkCashAsPaid = async (booking: StoredBooking) => {
    const amt = booking.quotedAmount || 0;
    const ok = await updateBooking(booking.id, booking.status, undefined, {
      quotedAmount: amt,
      advanceAmount: amt,
      pendingAmount: 0,
      finalPaymentMethod: "cash_manual",
      finalPaymentAt: Date.now(),
      paymentMethod: booking.paymentMethod || "cash_manual",
      paymentSlipStatus: "manual_approved",
      paymentApprovedAt: booking.paymentApprovedAt || Date.now(),
    });
    if (ok) {
      showToast(`Payment of Rs. ${amt.toLocaleString()} marked as Success! Added to Revenue.`, "success");
    }
  };

  const handleMarkCashAsPending = async (booking: StoredBooking) => {
    const ok = await updateBooking(booking.id, booking.status, undefined, {
      paymentMethod: "cash_manual",
      paymentSlipStatus: "cash_pending",
      paymentApprovedAt: 0,
    });
    if (ok) {
      showToast(`Payment status reverted to Cash Pending. Removed from Revenue.`, "success");
    }
  };

  const handleManualApprovePayment = async (booking: StoredBooking) => {
    openCashApprovalModal(booking);
  };

  const handleStageClickboxSelect = async (booking: StoredBooking, targetStatus: BookingStatus) => {
    const currentStatus = booking.status === "booked" ? "accepted" : booking.status;
    if (targetStatus === currentStatus) {
      return;
    }

    if (targetStatus === "accepted") {
      if (!booking.paymentApprovedAt && booking.paymentSlipStatus !== "manual_approved" && booking.paymentSlipStatus !== "cash_pending") {
        openCashApprovalModal(booking);
        return;
      }
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
      const ok = await updateBooking(booking.id, "awaiting_payment", undefined, {
        quotedAmount: validAmount,
        quotedAt: Date.now(),
        quoteNote: (entry?.note ?? booking.quoteNote ?? "").trim(),
      });
      if (ok) {
        setEditingQuoteId(null);
        setManualStageDraft((prev) => ({ ...prev, [booking.id]: "awaiting_payment" }));
        showToast("Stage updated to: 2. Awaiting Payment", "success");
      }
      return;
    }

    if (targetStatus === "assigned") {
      if (booking.bookingType !== "live_lorry") {
        const draft = getScheduleDraft(booking);
        const check = validateIndividualScheduleOrToast(booking.id, draft);
        if (!check.valid) return;
        const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
        const shouldAutoApprove = !booking.paymentApprovedAt && booking.paymentSlipStatus !== "cash_pending";
        const ok = await updateBooking(
          booking.id,
          "assigned",
          check.assignment,
          shouldAutoApprove
            ? {
                paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
                paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
                paymentApprovedAt: Date.now(),
              }
            : undefined
        );
        if (ok) {
          setManualStageDraft((prev) => ({ ...prev, [booking.id]: "assigned" }));
          showToast("Stage updated to: 5. Rider & Time Assigned", "success");
        }
        return;
      }
      const hasRealDriver =
        Boolean(cleanRiderName(booking.assignedDriverName)) &&
        Boolean(booking.assignedDriverPhone);
      if (!hasRealDriver) {
        openAssignModal(booking);
        return;
      }
      const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
      const shouldAutoApprove = !booking.paymentApprovedAt && booking.paymentSlipStatus !== "cash_pending";
      const ok = await updateBooking(
        booking.id,
        "assigned",
        {
          assignedLorryId: booking.assignedLorryId,
          assignedDriverName: booking.assignedDriverName,
          assignedDriverPhone: booking.assignedDriverPhone,
          assignedPlate: booking.assignedPlate,
        },
        shouldAutoApprove
          ? {
              paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
              paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
              paymentApprovedAt: Date.now(),
            }
          : undefined
      );
      if (ok) {
        setManualStageDraft((prev) => ({ ...prev, [booking.id]: "assigned" }));
        showToast("Stage updated to: 5. Rider & Time Assigned", "success");
      }
      return;
    }

    if (targetStatus === "in_transit" || targetStatus === "delivered") {
      let scheduleAssignment: Parameters<typeof updateBookingStatusAction>[2] | undefined;
      if (booking.bookingType !== "live_lorry" && targetStatus === "in_transit") {
        const draft = getScheduleDraft(booking);
        const check = validateIndividualScheduleOrToast(booking.id, draft);
        if (!check.valid) return;
        scheduleAssignment = check.assignment;
      }
      const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
      const shouldAutoApprove = !booking.paymentApprovedAt && booking.paymentSlipStatus !== "cash_pending";
      const ok = await updateBooking(
        booking.id,
        targetStatus,
        scheduleAssignment,
        shouldAutoApprove
          ? {
              paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
              paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
              paymentApprovedAt: Date.now(),
            }
          : undefined
      );
      if (ok) {
        setManualStageDraft((prev) => ({ ...prev, [booking.id]: targetStatus }));
        const lbl = BOOKING_STAGES.find((s) => s.key === targetStatus)?.label || targetStatus;
        if (targetStatus === "delivered") {
          const isPending = isBookingPaymentPending(booking);
          if (isPending) {
            showToast("Trip marked Delivered! Balance pending — moved to 'Pending Payment' tab & slot released.", "success");
          } else {
            showToast("Trip marked Delivered & Completed! Moved to 'Completed Bookings' tab & slot released.", "success");
          }
        } else {
          showToast(`Stage updated to: ${lbl}`, "success");
        }
      }
      return;
    }

    if (targetStatus === "cancelled") {
      if (!window.confirm("Are you sure you want to cancel this booking and release its time slot?")) {
        return;
      }
      const ok = await updateBooking(booking.id, "cancelled");
      if (ok) {
        setManualStageDraft((prev) => ({ ...prev, [booking.id]: "cancelled" }));
        showToast("Booking cancelled and time slot released.", "success");
      }
      return;
    }

    if (targetStatus === "pending") {
      const hasSlip = Boolean(booking.paymentSlipId && booking.paymentSlipStatus !== "deleted");
      const ok = await updateBooking(
        booking.id,
        "pending",
        undefined,
        !hasSlip
          ? { paymentApprovedAt: 0, paymentSlipStatus: "none" }
          : { paymentApprovedAt: 0 }
      );
      if (ok) {
        setManualStageDraft((prev) => ({ ...prev, [booking.id]: "pending" }));
        showToast("Stage reset to: 1. Pending Review", "success");
      }
      return;
    }

    const ok = await updateBooking(booking.id, targetStatus);
    if (ok) {
      setManualStageDraft((prev) => ({ ...prev, [booking.id]: targetStatus }));
      const lbl = BOOKING_STAGES.find((s) => s.key === targetStatus)?.label || targetStatus;
      showToast(`Stage updated to: ${lbl}`, "success");
    }
  };

  const handleManualProgressUpdate = async (booking: StoredBooking) => {
    const targetStatus = manualStageDraft[booking.id] || booking.status;
    await handleStageClickboxSelect(booking, targetStatus);
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
    const draft = getScheduleDraft(booking);
    const bPlateNorm = normalizePlate(draft.plate || booking.assignedPlate);
    const bLorryId = (draft.lorryId || booking.assignedLorryId || "").trim().toLowerCase();
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
        (draft.driverId && d.driverId === draft.driverId) ||
        (draft.driverName && d.name === draft.driverName) ||
        (targetLorry?.driverId && d.driverId === targetLorry.driverId) ||
        (targetLorry?.plate && normalizePlate(d.plate) === normalizePlate(targetLorry.plate))
    );
    const resolvedDriverId = draft.driverId || matchedDriver?.driverId || "";
    const resolvedDriverName = draft.driverName || matchedDriver?.name || "";
    const resolvedDriverPhone = draft.driverPhone || matchedDriver?.phone || "";
    const bDates = Array.isArray(booking.dates) && booking.dates.length > 0 ? booking.dates : (booking.date ? [booking.date] : []);
    const bStartDate = draft.date || booking.date || bDates[0] || new Date().toISOString().split("T")[0];
    const bEndDate = draft.endDate || (bDates.length > 1 ? bDates[bDates.length - 1] : bStartDate);
    const isMultiDate = draft.isMultiDate !== undefined ? draft.isMultiDate : (bDates.length > 1);

    setAssignModal({
      booking,
      lorryId: targetLorry?.id || draft.lorryId || booking.assignedLorryId || "",
      driverId: resolvedDriverId,
      driverName: resolvedDriverName,
      driverPhone: resolvedDriverPhone,
      plate: targetLorry?.plate || draft.plate || booking.assignedPlate || "",
      date: bStartDate,
      endDate: bEndDate,
      isMultiDate: isMultiDate,
      startTime: draft.startTime || booking.startTime || "08:00",
      endTime: draft.endTime || booking.endTime || "12:00",
      distanceKm: draft.distanceKm || (booking.distanceKm ? String(booking.distanceKm) : ""),
    });
  };

  const confirmAssign = async () => {
    if (!assignModal) return;
    const b = assignModal.booking;
    if (b.bookingType !== "live_lorry") {
      const check = validateIndividualScheduleOrToast(b.id, {
        date: assignModal.date,
        endDate: assignModal.endDate,
        isMultiDate: assignModal.isMultiDate,
        dates: assignModal.isMultiDate && assignModal.endDate ? getDatesBetween(assignModal.date, assignModal.endDate) : [assignModal.date],
        startTime: assignModal.startTime,
        endTime: assignModal.endTime,
        plate: assignModal.plate,
        lorryId: assignModal.lorryId,
        driverId: assignModal.driverId,
        driverName: assignModal.driverName,
        driverPhone: assignModal.driverPhone,
        distanceKm: assignModal.distanceKm,
      });
      if (!check.valid) return;

      const hasSlip = Boolean(b.paymentSlipId && b.paymentSlipStatus !== "deleted");
      const shouldAutoApprove = !b.paymentApprovedAt && b.paymentSlipStatus !== "cash_pending";
      const ok = await updateBooking(
        b.id,
        "assigned",
        check.assignment,
        shouldAutoApprove
          ? {
              paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
              paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
              paymentApprovedAt: Date.now(),
            }
          : undefined
      );
      if (ok) {
        setScheduleDrafts((prev) => ({
          ...prev,
          [b.id]: {
            date: check.assignment.date || assignModal.date,
            endDate: (check.assignment as any).endDate || assignModal.endDate,
            isMultiDate: Boolean(assignModal.isMultiDate),
            dates: check.assignment.dates,
            startTime: check.assignment.startTime || assignModal.startTime,
            endTime: check.assignment.endTime || assignModal.endTime,
            plate: assignModal.plate,
            lorryId: assignModal.lorryId,
            driverId: assignModal.driverId,
            driverName: assignModal.driverName,
            driverPhone: assignModal.driverPhone,
          },
        }));
        setManualStageDraft((prev) => ({ ...prev, [b.id]: "assigned" }));
        setAssignModal(null);
      }
      return;
    }

    const hasSlip = Boolean(b.paymentSlipId && b.paymentSlipStatus !== "deleted");
    const shouldAutoApprove = !b.paymentApprovedAt && b.paymentSlipStatus !== "cash_pending";
    const ok = await updateBooking(
      b.id,
      "assigned",
      {
        assignedLorryId: assignModal.lorryId,
        assignedDriverId: assignModal.driverId,
        assignedDriverName: assignModal.driverName,
        assignedDriverPhone: assignModal.driverPhone,
        assignedPlate: assignModal.plate,
        distanceKm: assignModal.distanceKm ? Number(assignModal.distanceKm) : undefined,
      },
      shouldAutoApprove
        ? {
            paymentMethod: hasSlip ? "bank_slip" : "cash_manual",
            paymentSlipStatus: hasSlip ? "approved" : "manual_approved",
            paymentApprovedAt: Date.now(),
          }
        : undefined
    );
    if (ok) {
      setManualStageDraft((prev) => ({ ...prev, [b.id]: "assigned" }));
      setAssignModal(null);
    }
  };

  // ---- Manual Booking Client Lookup & Registration ----
  const lookupManualClientByPhone = useCallback(
    (rawPhone: string) => {
      const digits = String(rawPhone || "").replace(/[^0-9]/g, "");
      if (digits.length < 9) return null;

      const regMatch = registeredUsers.find((u) => phonesMatch(u.phone, rawPhone));
      const matchedBookings = bookings.filter(
        (b) => !b.customerArchived && phonesMatch(b.customerPhone, rawPhone)
      );
      const bookingWithRealName = matchedBookings.find((b) => isRealCustomerName(b.customerName));
      const bookingWithIdNumber = matchedBookings.find((b) => b.customerIdNumber);

      const resolvedName =
        regMatch && isRealCustomerName(regMatch.name)
          ? regMatch.name.trim()
          : bookingWithRealName
          ? bookingWithRealName.customerName.trim()
          : "";

      const resolvedIdNumber = regMatch?.idNumber || bookingWithIdNumber?.customerIdNumber || "";

      if (!regMatch && matchedBookings.length === 0) {
        return null;
      }

      return {
        id: regMatch?.id || `CUST-${normalizePhoneNumber(rawPhone) || digits}`,
        name: resolvedName,
        phone: regMatch?.phone || matchedBookings[0]?.customerPhone || rawPhone,
        idNumber: resolvedIdNumber,
        city: regMatch?.city || bookingWithRealName?.pickupCity || "",
        bookingsCount: matchedBookings.length,
        isRegisteredInUsers: Boolean(regMatch && isRealCustomerName(regMatch.name)),
      };
    },
    [registeredUsers, bookings, isRealCustomerName]
  );

  const handleManualPhoneChange = (rawPhone: string) => {
    const matched = lookupManualClientByPhone(rawPhone);
    if (matched && matched.name) {
      manualAutoFilledNameRef.current = matched.name;
      setManualForm((p) => ({
        ...p,
        customerPhone: rawPhone,
        customerName: matched.name,
        customerIdNumber: matched.idNumber || p.customerIdNumber,
      }));
      return;
    }

    const prevAutoName = manualAutoFilledNameRef.current;
    manualAutoFilledNameRef.current = "";
    setManualForm((p) => {
      const shouldClearOldAuto = Boolean(prevAutoName) && p.customerName === prevAutoName;
      return {
        ...p,
        customerPhone: rawPhone,
        ...(shouldClearOldAuto ? { customerName: "" } : {}),
      };
    });
  };

  const handleManualRegisterClient = async () => {
    const phoneClean = String(manualForm.customerPhone || "").replace(/[^0-9]/g, "");
    if (phoneClean.length < 9) {
      showToast("Please enter a valid customer mobile number first.", "error");
      return;
    }
    const cleanName = manualForm.customerName.trim();
    if (cleanName.length < 2) {
      showToast("Please enter the customer's full name to register this number.", "error");
      return;
    }
    const cleanIdNumber = manualForm.customerIdNumber.trim();
    if (!cleanIdNumber) {
      showToast("Customer Register කිරීම සඳහා හැඳුනුම්පත් අංකය (ID / NIC Number) අනිවාර්ය වේ.", "error");
      return;
    }

    setManualRegisteringClient(true);
    try {
      const regRes = await registerCustomerAction({
        phone: manualForm.customerPhone.trim(),
        name: cleanName,
        idNumber: cleanIdNumber,
        city: manualForm.pickupCity.trim() || undefined,
      });
      if (regRes.success) {
        if (regRes.data) {
          const normKey = normalizePhoneNumber(regRes.data.phone) || regRes.data.phone.trim();
          if (normKey) deletedCustomerKeysRef.current.delete(normKey);
          if (regRes.data.id) deletedCustomerKeysRef.current.delete(regRes.data.id);
          setRegisteredUsers((prev) => mergeRegisteredCustomerList([regRes.data!], prev));
          manualAutoFilledNameRef.current = regRes.data.name;
          setManualForm((p) => ({
            ...p,
            customerPhone: regRes.data!.phone || p.customerPhone,
            customerName: regRes.data!.name || p.customerName,
          }));
          showToast(`Client "${regRes.data.name}" registered and added to Customers list.`);
        }
      } else {
        showToast(regRes.error || "Failed to register new client.", "error");
      }
    } catch {
      showToast("Error registering client.", "error");
    } finally {
      setManualRegisteringClient(false);
    }
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!deleteCustomerModal) return;
    const target = deleteCustomerModal;
    const normKey = normalizePhoneNumber(target.phone) || target.phone.trim();
    setDeletingCustomerId(target.id);
    try {
      const res = await deleteCustomerAction({
        customerId: target.id,
        phone: target.phone,
        deleteBookings: target.deleteBookings,
      });
      if (!res.success) {
        showToast(res.error || "Failed to delete customer.", "error");
        return;
      }

      const nowDeletedAt = Date.now();
      if (normKey) deletedCustomerKeysRef.current.set(normKey, nowDeletedAt);
      if (target.id) deletedCustomerKeysRef.current.set(target.id, nowDeletedAt);

      setRegisteredUsers((prev) =>
        prev.filter((u) => {
          const idMatch = u.id === target.id;
          const phoneMatch = Boolean(target.phone && u.phone && phonesMatch(u.phone, target.phone));
          return !idMatch && !phoneMatch;
        })
      );

      if (target.phone) {
        setBookings((prev) =>
          target.deleteBookings
            ? prev.filter((b) => !phonesMatch(b.customerPhone, target.phone))
            : prev.map((b) =>
                phonesMatch(b.customerPhone, target.phone)
                  ? { ...b, customerArchived: true }
                  : b
              )
        );
      }

      setExpandedCustomers((prev) => {
        if (!(target.id in prev)) return prev;
        const next = { ...prev };
        delete next[target.id];
        return next;
      });

      setDeleteCustomerModal(null);
      showToast(
        target.deleteBookings && target.totalBookings > 0
          ? `Customer "${target.name}" and ${target.totalBookings} booking(s) deleted permanently.`
          : `Customer "${target.name}" deleted from Customers directory.`
      );
    } catch {
      showToast("Error deleting customer. Please retry.", "error");
    } finally {
      setDeletingCustomerId(null);
    }
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
    if (!manualForm.date.trim()) {
      showToast("Please select a booking date.", "error");
      return;
    }

    const resolvedPlate = manualForm.plate || fleetVehicles[0]?.plate || "";
    const matchedVehicle = fleetVehicles.find((v) => v.plate === resolvedPlate);
    const resolvedType = matchedVehicle?.vehicleType || manualForm.vehicleType || "Lorry";
    const resolvedLorryId =
      matchedVehicle?.id || `lorry-${String(resolvedPlate || "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;

    if (!resolvedPlate) {
      showToast("Please select a fleet lorry.", "error");
      return;
    }

    const resolvedEndDate =
      manualForm.isMultiDate && manualForm.endDate ? manualForm.endDate.trim() : manualForm.date.trim();
    const rawDates =
      manualForm.isMultiDate && manualForm.endDate
        ? getDatesBetween(manualForm.date.trim(), manualForm.endDate.trim())
        : [manualForm.date.trim()];

    const scheduleCheck = validateScheduleTimeAndDates(
      manualForm.date.trim(),
      manualForm.startTime,
      resolvedEndDate,
      manualForm.endTime,
      rawDates
    );
    if (!scheduleCheck.valid) {
      showToast(scheduleCheck.error, "error");
      return;
    }

    if (
      !hasAssignedRider({
        assignedDriverId: manualForm.driverId,
        assignedDriverName: manualForm.driverName,
        assignedDriverPhone: manualForm.driverPhone,
      })
    ) {
      showToast("Assigning a Rider is mandatory for manual bookings.", "error");
      return;
    }

    const conflict = findBookingScheduleConflict(
      {
        date: scheduleCheck.startDate,
        dates: scheduleCheck.dates,
        startTime: scheduleCheck.startTime,
        endTime: scheduleCheck.endTime,
        assignedPlate: resolvedPlate,
        assignedLorryId: resolvedLorryId,
        assignedDriverId: manualForm.driverId.trim(),
        assignedDriverName: manualForm.driverName.trim(),
        assignedDriverPhone: manualForm.driverPhone.trim(),
        bookingType: "individual_vehicle",
      },
      bookings
    );
    if (conflict.hasConflict) {
      showToast(conflict.message || "Schedule overlap detected for this lorry or rider.", "error");
      return;
    }

    const parsedAmount = Number(String(manualForm.quotedAmount || "").replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast("Please enter a valid booking amount (LKR).", "error");
      return;
    }

    const isPaymentSuccess = manualForm.paymentStatusMode === "success";
    const isPaymentPartial = manualForm.paymentStatusMode === "partial";
    const parsedAdvance = isPaymentPartial
      ? Number(String(manualForm.advanceAmount || "").replace(/[^0-9.]/g, ""))
      : isPaymentSuccess
      ? parsedAmount
      : 0;

    if (isPaymentPartial) {
      if (!parsedAdvance || parsedAdvance <= 0) {
        showToast("Please enter an advance amount greater than 0.", "error");
        return;
      }
      if (parsedAdvance >= parsedAmount) {
        showToast("Advance amount must be less than total amount. Select Payment Success for full payment.", "error");
        return;
      }
    }

    const calculatedPending = isPaymentPartial
      ? parsedAmount - parsedAdvance
      : isPaymentSuccess
      ? 0
      : parsedAmount;

    const paymentNoteClean = manualForm.paymentNote.trim();
    const parsedDistance = manualForm.distanceKm.trim() ? Number(manualForm.distanceKm.trim()) : undefined;

    setManualSubmitting(true);
    try {
      const res = await createBookingAction({
        customerName: manualForm.customerName.trim(),
        phone: manualForm.customerPhone.trim(),
        customerIdNumber: manualForm.customerIdNumber.trim() || undefined,
        pickup: manualForm.pickupCity.trim(),
        destination: manualForm.deliveryCity.trim(),
        distanceKm: parsedDistance,
        date: scheduleCheck.startDate,
        dates: scheduleCheck.dates,
        endDate: scheduleCheck.endDate,
        startTime: scheduleCheck.startTime,
        endTime: scheduleCheck.endTime,
        vehicleType: resolvedType,
        assignedPlate: resolvedPlate,
        assignedLorryId: resolvedLorryId,
        assignedDriverId: manualForm.driverId.trim() || undefined,
        assignedDriverName: manualForm.driverName.trim(),
        assignedDriverPhone: manualForm.driverPhone.trim() || undefined,
        bookingType: "individual_vehicle",
        cargoNature: manualForm.cargoNature,
        daysNeeded: scheduleCheck.daysCount,
        cargoWeight: manualForm.cargoWeight.trim() || undefined,
        helpersCount: Number(manualForm.helpersCount) || 0,
        status: isPaymentSuccess || isPaymentPartial ? "assigned" : "awaiting_payment",
        quotedAmount: parsedAmount,
        advanceAmount: parsedAdvance,
        pendingAmount: calculatedPending,
        paymentMethod: manualForm.paymentMethod || "cash_manual",
        paymentBankUsed:
          manualForm.paymentMethod === "bank_transfer"
            ? (manualForm.paymentBankUsed.trim() ||
                (bankAccounts.find((a) => a.active)?.bankName
                  ? `${bankAccounts.find((a) => a.active)!.bankName} - ${bankAccounts.find((a) => a.active)!.accountNumber}`
                  : "Commercial Bank - 100029384920"))
            : undefined,
        quoteNote:
          paymentNoteClean ||
          (isPaymentSuccess
            ? `Paid in full (${manualForm.paymentMethod === "bank_transfer" ? "Bank Transfer" : "Cash"})`
            : isPaymentPartial
            ? `Advance Rs. ${parsedAdvance.toLocaleString()} paid. Balance Rs. ${calculatedPending.toLocaleString()} pending.`
            : undefined),
        ...(isPaymentSuccess
          ? {
              paymentSlipStatus: "manual_approved" as const,
              paymentApprovedAt: Date.now(),
            }
          : isPaymentPartial
          ? {
              paymentSlipStatus: "cash_pending" as const,
              paymentApprovedAt: Date.now(),
            }
          : {
              paymentSlipStatus: "cash_pending" as const,
              paymentApprovedAt: 0,
            }),
        notes: manualForm.notes.trim() || undefined,
      });

      if (res.success) {
        // Ensure customer profile is registered & immediately reflected in Customers list
        const regRes = await registerCustomerAction({
          phone: manualForm.customerPhone.trim(),
          name: manualForm.customerName.trim(),
          idNumber: manualForm.customerIdNumber.trim() || undefined,
          city: manualForm.pickupCity.trim() || undefined,
        }).catch(() => null);
        if (regRes?.success && regRes.data) {
          const normKey = normalizePhoneNumber(regRes.data.phone) || regRes.data.phone.trim();
          if (normKey) deletedCustomerKeysRef.current.delete(normKey);
          if (regRes.data.id) deletedCustomerKeysRef.current.delete(regRes.data.id);
          setRegisteredUsers((prev) => mergeRegisteredCustomerList([regRes.data!], prev));
        }

        if (res.data?.booking) {
          const createdB = res.data.booking;
          setBookings((prev) => [createdB, ...prev.filter((b) => b.id !== createdB.id)]);
        }
        showToast(
          `Manual booking created (Rs. ${parsedAmount.toLocaleString()} · ${
            isPaymentSuccess ? "Payment Success" : "Payment Pending"
          }) for ${formatJourneyScheduleSummary(
            scheduleCheck.startDate,
            scheduleCheck.startTime,
            scheduleCheck.endDate,
            scheduleCheck.endTime,
            scheduleCheck.dates
          )} with ${manualForm.driverName}.`
        );
        setShowManualModal(false);
        manualAutoFilledNameRef.current = "";
        const todayStr = new Date().toISOString().split("T")[0];
        setManualForm({
          plate: resolvedPlate,
          vehicleType: resolvedType,
          driverId: manualForm.driverId,
          driverName: manualForm.driverName,
          driverPhone: manualForm.driverPhone,
          customerName: "",
          customerPhone: "",
          customerIdNumber: "",
          pickupCity: "",
          deliveryCity: "",
          distanceKm: "",
          date: todayStr,
          endDate: todayStr,
          isMultiDate: false,
          startTime: "08:00",
          endTime: "12:00",
          quotedAmount: "",
          paymentStatusMode: "pending",
          advanceAmount: "",
          paymentMethod: "cash_manual",
          paymentBankUsed: "",
          paymentNote: "",
          cargoNature: CARGO_NATURE_OPTIONS[0],
          cargoWeight: "",
          helpersCount: "0",
          notes: "",
        });
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
      baseCity: "",
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
      baseCity: v.startLocation || (v as any).baseCity || "",
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

    const matchedOutVehicle = fleetVehicles.find(
      (v) =>
        v.plate.toUpperCase() === cleanPlate &&
        ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
    );
    const matchedDriverObj = drivers.find((d) => d.name === lorryForm.rider);
    const resolvedRider = matchedOutVehicle?.driverName || lorryForm.rider;
    const resolvedDriverId = matchedOutVehicle?.driverId || matchedDriverObj?.driverId || "";
    const resolvedDriverPhone = matchedOutVehicle?.driverPhone || matchedDriverObj?.phone || "";

    setLorrySubmitting(true);
    try {
      await saveAdminFleetVehicle({
        plate: cleanPlate,
        vehicleType: lorryForm.vehicleType,
        capacity: lorryForm.capacity,
        maxWeight: lorryForm.maxWeight,
        baseCity: lorryForm.baseCity,
        description: lorryForm.description,
        rider: resolvedRider,
        driverId: resolvedDriverId,
        driverPhone: resolvedDriverPhone,
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
    } catch {
      showToast("Failed to delete vehicle.", "error");
    }
  };

  // ---- Rider Registration & Management ----
  const handleOpenAddRider = () => {
    let maxRiderNum = 9;
    drivers.forEach((d) => {
      const m = String(d.driverId || "").match(/^R-(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxRiderNum) maxRiderNum = num;
      }
    });
    setRiderForm({
      driverId: `R-${maxRiderNum + 1}`,
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

  // ---- Top-up Slip Handlers ----
  const handleApproveTopupSlip = async (slip: TopupSlipRecord) => {
    setTopupActionId(slip.id);
    try {
      const res = await approveTopupSlipAction(slip.id);
      if (res.success) {
        showToast(`Top-up approved! Rs. ${Number(slip.amount || 0).toLocaleString()} credited to partner wallet.`, "success");
        const slipsRes = await getAllTopupSlipsAction();
        if (slipsRes.success && slipsRes.data) setTopupSlips(slipsRes.data);
        const empRes = await getAllOutsideEmployeesAction();
        if (empRes.success && empRes.data) setOutsideEmployees(empRes.data);
      } else {
        showToast(res.error || "Failed to approve slip.", "error");
      }
    } catch {
      showToast("An error occurred while approving top-up slip.", "error");
    } finally {
      setTopupActionId(null);
    }
  };

  const handleDeleteTopupSlip = async (slipId: string) => {
    if (!confirm("Are you sure you want to permanently delete this top-up slip?")) return;
    setTopupActionId(slipId);
    try {
      const res = await deleteTopupSlipAction(slipId);
      if (res.success) {
        showToast("Top-up slip deleted.", "success");
        setTopupSlips((prev) => prev.filter((s) => s.id !== slipId));
      } else {
        showToast(res.error || "Failed to delete slip.", "error");
      }
    } catch {
      showToast("An error occurred while deleting slip.", "error");
    } finally {
      setTopupActionId(null);
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
    const timer = setInterval(() => setClockTick(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const revenueData = useMemo(() => {
    const isPaid = (b: StoredBooking): boolean => {
      if (b.status === "cancelled") return false;
      const amt = Number(b.quotedAmount || 0);
      if (amt <= 0) return false;
      if (typeof b.advanceAmount === "number" && b.advanceAmount > 0) return true;
      if (b.paymentSlipStatus === "cash_pending" && (!b.advanceAmount || b.advanceAmount <= 0)) return false;
      if (b.paymentMethod === "cash_manual" && (!b.paymentApprovedAt || b.paymentApprovedAt <= 0) && (!b.advanceAmount || b.advanceAmount <= 0)) return false;
      if (b.paymentApprovedAt && b.paymentApprovedAt > 0) return true;
      if (b.paymentSlipStatus === "approved" || (b.paymentSlipStatus as string) === "manual_approved") return true;
      if (["accepted", "booked", "assigned", "goods_collected", "in_transit", "delivered"].includes(b.status)) {
        return true;
      }
      return false;
    };

    const getBookingPaidAmount = (b: StoredBooking): number => {
      if (typeof b.pendingAmount === "number" && b.pendingAmount > 0) {
        return Number(b.advanceAmount || 0);
      }
      return Number(b.quotedAmount || 0);
    };

    const getPayTs = (b: StoredBooking): number => {
      if (b.finalPaymentAt && b.finalPaymentAt > 0) return b.finalPaymentAt;
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

    const computeBookingRevenueForRange = (b: StoredBooking, start: number, end: number): number => {
      let revenue = 0;
      const initialPaidTs = b.paymentApprovedAt || b.paymentSlipUploadedAt || b.updatedAt || b.createdAt;
      const finalPaidTs = b.finalPaymentAt;
      const totalQuoted = Number(b.quotedAmount || 0);
      const adv = typeof b.advanceAmount === "number" ? b.advanceAmount : (b.pendingAmount === 0 ? totalQuoted : 0);
      const rem = Math.max(0, totalQuoted - adv);

      if (adv > 0 && initialPaidTs && initialPaidTs >= start && initialPaidTs < end) {
        revenue += adv;
      }
      if (rem > 0 && finalPaidTs && finalPaidTs >= start && finalPaidTs < end) {
        revenue += rem;
      }
      if (revenue === 0 && (!b.pendingAmount || b.pendingAmount <= 0)) {
        const payTs = getPayTs(b);
        if (payTs >= start && payTs < end) {
          revenue = totalQuoted;
        }
      }
      return revenue;
    };

    const todayBookings = allPaid.filter((b) => computeBookingRevenueForRange(b, todayStart, todayEnd) > 0);
    const todayRevenue = allPaid.reduce((sum, b) => sum + computeBookingRevenueForRange(b, todayStart, todayEnd), 0);

    const thisMonthBookings = allPaid.filter((b) => computeBookingRevenueForRange(b, thisMonthStart, thisMonthEnd) > 0);
    const thisMonthRevenue = allPaid.reduce((sum, b) => sum + computeBookingRevenueForRange(b, thisMonthStart, thisMonthEnd), 0);

    const allTimeRevenue = allPaid.reduce((sum, b) => sum + getBookingPaidAmount(b), 0);

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

    const periodTotal = periodBookings.reduce((sum, b) => sum + computeBookingRevenueForRange(b, rangeStart, rangeEnd), 0);
    const periodIndividual = periodBookings.filter((b) => b.bookingType === "individual_vehicle");
    const periodLive = periodBookings.filter((b) => b.bookingType !== "individual_vehicle");
    const periodIndividualRevenue = periodIndividual.reduce((sum, b) => sum + computeBookingRevenueForRange(b, rangeStart, rangeEnd), 0);
    const periodLiveRevenue = periodLive.reduce((sum, b) => sum + computeBookingRevenueForRange(b, rangeStart, rangeEnd), 0);

    const periodBankSlip = periodBookings.filter(
      (b) => b.paymentMethod !== "cash_manual"
    );
    const periodCash = periodBookings.filter((b) => !periodBankSlip.includes(b));
    const periodBankRevenue = periodBankSlip.reduce((sum, b) => sum + computeBookingRevenueForRange(b, rangeStart, rangeEnd), 0);
    const periodCashRevenue = periodCash.reduce((sum, b) => sum + computeBookingRevenueForRange(b, rangeStart, rangeEnd), 0);

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

  // Helper to determine if a booking has pending payment
  const isBookingPaymentPending = useCallback((b: StoredBooking): boolean => {
    if (b.status === "cancelled") return false;
    if (typeof b.pendingAmount === "number" && b.pendingAmount > 0) return true;
    if ((b.paymentSlipStatus as string) === "cash_pending") return true;
    if (b.paymentMethod === "cash_manual" && (!b.paymentApprovedAt || b.paymentApprovedAt <= 0)) return true;
    if (
      b.paymentSlipStatus === "pending_review" ||
      b.status === "payment_submitted" ||
      b.status === "awaiting_payment" ||
      b.status === "pending"
    ) return true;
    if (!b.paymentApprovedAt && b.paymentSlipStatus !== "approved" && (b.paymentSlipStatus as string) !== "manual_approved") return true;
    return false;
  }, []);

  // Unpaid Bookings list for Dashboard Overview Card & Filter
  const unpaidBookings = useMemo(() => {
    return bookings.filter((b) => {
      const isTargetType = b.bookingType === "individual_vehicle" || b.paymentMethod === "cash_manual" || !b.bookingType;
      if (!isTargetType) return false;
      return isBookingPaymentPending(b);
    });
  }, [bookings, isBookingPaymentPending]);

  // All Ongoing Rides (actively on the road within departure window and trip not finished)
  const ongoingBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === "cancelled" || b.status === "delivered") return false;
        const lifecycle = getBookingLifecycle(b, clockTick);
        return lifecycle.isOngoing && !lifecycle.isCompleted;
      })
      .sort((a, b) => {
        const timeA = a.startTime || "00:00";
        const timeB = b.startTime || "00:00";
        return timeA.localeCompare(timeB);
      });
  }, [bookings, clockTick]);

  // All Pending Payment Bookings (physical journey concluded/delivered, but payment pending; time slot is freed!)
  const pendingPaymentBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === "cancelled") return false;
        const lifecycle = getBookingLifecycle(b, clockTick);
        const isRideFinished = lifecycle.isCompleted || b.status === "delivered";
        return isRideFinished && isBookingPaymentPending(b);
      })
      .sort((a, b) => {
        const dateA = a.date || (Array.isArray(a.dates) && a.dates[0]) || "0000-00-00";
        const dateB = b.date || (Array.isArray(b.dates) && b.dates[0]) || "0000-00-00";
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const timeA = a.endTime || a.startTime || "00:00";
        const timeB = b.endTime || b.startTime || "00:00";
        return timeB.localeCompare(timeA);
      });
  }, [bookings, clockTick, isBookingPaymentPending]);

  // All Completed Bookings (concluded/delivered AND 100% fully paid; locked read-only historical record)
  const completedBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === "cancelled") return false;
        const lifecycle = getBookingLifecycle(b, clockTick);
        const isRideFinished = lifecycle.isCompleted || b.status === "delivered";
        return isRideFinished && !isBookingPaymentPending(b);
      })
      .sort((a, b) => {
        const dateA = a.date || (Array.isArray(a.dates) && a.dates[0]) || "0000-00-00";
        const dateB = b.date || (Array.isArray(b.dates) && b.dates[0]) || "0000-00-00";
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        const timeA = a.endTime || a.startTime || "00:00";
        const timeB = b.endTime || b.startTime || "00:00";
        return timeB.localeCompare(timeA);
      });
  }, [bookings, clockTick, isBookingPaymentPending]);

  // All Upcoming Scheduled Bookings (prior to departure + 15 min cutoff)
  const upcomingBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === "cancelled") return false;
        const lifecycle = getBookingLifecycle(b, clockTick);
        if (!lifecycle.isUpcoming) return false;
        if (lifecycle.startPlus15 !== null && clockTick >= lifecycle.startPlus15) return false;
        return true;
      })
      .sort((a, b) => {
        const dateA = a.date || (Array.isArray(a.dates) && a.dates[0]) || "9999-99-99";
        const dateB = b.date || (Array.isArray(b.dates) && b.dates[0]) || "9999-99-99";
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        const timeA = a.startTime || "99:99";
        const timeB = b.startTime || "99:99";
        return timeA.localeCompare(timeB);
      });
  }, [bookings, clockTick]);

  // Filtered lists for dedicated Ongoing and Completed sections
  const filteredOngoingBookings = useMemo(() => {
    return ongoingBookings.filter((b) => {
      if (!ongoingSearch.trim()) return true;
      const q = ongoingSearch.toLowerCase();
      return (
        b.id.toLowerCase().includes(q) ||
        (b.customerName && b.customerName.toLowerCase().includes(q)) ||
        (b.customerPhone && b.customerPhone.includes(q)) ||
        (b.pickupCity && b.pickupCity.toLowerCase().includes(q)) ||
        (b.deliveryCity && b.deliveryCity.toLowerCase().includes(q)) ||
        (b.assignedPlate && b.assignedPlate.toLowerCase().includes(q)) ||
        (b.assignedDriverName && b.assignedDriverName.toLowerCase().includes(q))
      );
    });
  }, [ongoingBookings, ongoingSearch]);

  const filteredPendingPaymentBookings = useMemo(() => {
    return pendingPaymentBookings.filter((b) => {
      if (!pendingPaymentSearch.trim()) return true;
      const q = pendingPaymentSearch.toLowerCase();
      return (
        b.id.toLowerCase().includes(q) ||
        (b.customerName && b.customerName.toLowerCase().includes(q)) ||
        (b.customerPhone && b.customerPhone.includes(q)) ||
        (b.pickupCity && b.pickupCity.toLowerCase().includes(q)) ||
        (b.deliveryCity && b.deliveryCity.toLowerCase().includes(q)) ||
        (b.assignedPlate && b.assignedPlate.toLowerCase().includes(q)) ||
        (b.assignedDriverName && b.assignedDriverName.toLowerCase().includes(q))
      );
    });
  }, [pendingPaymentBookings, pendingPaymentSearch]);

  const filteredCompletedBookings = useMemo(() => {
    return completedBookings.filter((b) => {
      const bDate = b.date || (Array.isArray(b.dates) && b.dates[0]) || "";
      if (completedDateFrom && bDate < completedDateFrom) return false;
      if (completedDateTo && bDate > completedDateTo) return false;
      if (!completedSearch.trim()) return true;
      const q = completedSearch.toLowerCase();
      return (
        b.id.toLowerCase().includes(q) ||
        (b.customerName && b.customerName.toLowerCase().includes(q)) ||
        (b.customerPhone && b.customerPhone.includes(q)) ||
        (b.pickupCity && b.pickupCity.toLowerCase().includes(q)) ||
        (b.deliveryCity && b.deliveryCity.toLowerCase().includes(q)) ||
        (b.assignedPlate && b.assignedPlate.toLowerCase().includes(q)) ||
        (b.assignedDriverName && b.assignedDriverName.toLowerCase().includes(q))
      );
    });
  }, [completedBookings, completedSearch, completedDateFrom, completedDateTo]);

  // Chronologically sorted Dispatch Schedule List for Dashboard Overview (earliest departure first)
  const dashboardDispatchList = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === "cancelled") return false;
        const lifecycle = getBookingLifecycle(b, clockTick);

        // Filter based on dashboardFilterMode:
        if (dashboardFilterMode === "upcoming") {
          // Upcoming dispatches: must be upcoming and have NOT passed departure start time + 15 mins
          if (!lifecycle.isUpcoming) return false;
          if (lifecycle.startPlus15 !== null && clockTick >= lifecycle.startPlus15) return false;
        } else if (dashboardFilterMode === "ongoing") {
          if (!lifecycle.isOngoing) return false;
        } else if (dashboardFilterMode === "completed") {
          if (!lifecycle.isCompleted) return false;
        } else if (dashboardFilterMode === "unpaid") {
          const isTargetType = b.bookingType === "individual_vehicle" || b.paymentMethod === "cash_manual" || !b.bookingType;
          if (!isTargetType || !isBookingPaymentPending(b)) return false;
        } else if (dashboardFilterMode === "today") {
          const bDate = b.date || (Array.isArray(b.dates) && b.dates[0]) || "";
          const allBDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : bDate ? [bDate] : [];
          if (!allBDates.includes(revenueData.todayDateStr)) return false;
        } else {
          // "all": default general schedule view
          const isManual = b.paymentMethod === "cash_manual";
          const isScheduledOrApproved =
            ["accepted", "booked", "assigned", "goods_collected", "in_transit", "delivered"].includes(b.status) ||
            Boolean(b.startTime || b.assignedPlate || b.assignedDriverId || (b.quotedAmount && b.quotedAmount > 0));
          if (!isManual && !isScheduledOrApproved) return false;
        }

        // Filter by Date
        const bDate = b.date || (Array.isArray(b.dates) && b.dates[0]) || "";
        const allBDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : bDate ? [bDate] : [];

        if (dashboardDateFrom) {
          const hasDateOnOrAfter = allBDates.some((d) => d >= dashboardDateFrom);
          if (!hasDateOnOrAfter && bDate < dashboardDateFrom) return false;
        }

        if (dashboardDateTo) {
          const hasDateOnOrBefore = allBDates.some((d) => d <= dashboardDateTo);
          if (!hasDateOnOrBefore && bDate > dashboardDateTo) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = a.date || (Array.isArray(a.dates) && a.dates[0]) || "9999-99-99";
        const dateB = b.date || (Array.isArray(b.dates) && b.dates[0]) || "9999-99-99";
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        const timeA = a.startTime || "99:99";
        const timeB = b.startTime || "99:99";
        return timeA.localeCompare(timeB);
      });
  }, [
    bookings,
    dashboardFilterMode,
    dashboardDateFrom,
    dashboardDateTo,
    revenueData.todayDateStr,
    isBookingPaymentPending,
    clockTick,
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
        (r.idNumber && r.idNumber.toLowerCase().includes(q)) ||
        plate.includes(q) ||
        (r.baseCity && r.baseCity.toLowerCase().includes(q)) ||
        (r.vehicleType && r.vehicleType.toLowerCase().includes(q)) ||
        (r.province && r.province.toLowerCase().includes(q))
      );
    });
  }, [registrations, regFilter, regSearch]);

  // ---- Outside Employees Memos & Filtering ----
  const availableOutsideCount = useMemo(
    () => outsideEmployees.filter((e) => e.isAvailable).length,
    [outsideEmployees]
  );
  const lowBalanceOutsideCount = useMemo(
    () => outsideEmployees.filter((e) => (e.balance || 0) < 2000).length,
    [outsideEmployees]
  );
  const totalOutsideCommissionEarned = useMemo(
    () => outsideEmployees.reduce((sum, e) => sum + (e.totalCommissionDeducted || 0), 0),
    [outsideEmployees]
  );

  const filteredOutsideEmployees = useMemo(() => {
    return outsideEmployees.filter((emp) => {
      if (outsideFilter === "available" && !emp.isAvailable) return false;
      if (outsideFilter === "unavailable" && emp.isAvailable) return false;
      if (outsideFilter === "low_balance" && (emp.balance || 0) >= 2000) return false;

      if (!outsideSearch.trim()) return true;
      const q = outsideSearch.toLowerCase();
      return (
        (emp.name && emp.name.toLowerCase().includes(q)) ||
        (emp.phone && emp.phone.toLowerCase().includes(q)) ||
        (emp.idNumber && emp.idNumber.toLowerCase().includes(q)) ||
        (emp.plateNumber && emp.plateNumber.toLowerCase().includes(q)) ||
        (emp.baseCity && emp.baseCity.toLowerCase().includes(q)) ||
        (emp.id && emp.id.toLowerCase().includes(q))
      );
    });
  }, [outsideEmployees, outsideFilter, outsideSearch]);

  // ---- Top-up Slips Memos & Filtering ----
  const pendingTopupSlipsCount = useMemo(
    () => topupSlips.filter((s) => s.status === "pending").length,
    [topupSlips]
  );
  const approvedTopupSlipsCount = useMemo(
    () => topupSlips.filter((s) => s.status === "approved").length,
    [topupSlips]
  );

  const filteredTopupSlips = useMemo(() => {
    return topupSlips.filter((s) => {
      if (topupStatusFilter !== "all" && s.status !== topupStatusFilter) return false;
      if (!topupSearch.trim()) return true;
      const q = topupSearch.toLowerCase();
      return (
        (s.employeeName && s.employeeName.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.idNumber && s.idNumber.toLowerCase().includes(q)) ||
        (s.plateNumber && s.plateNumber.toLowerCase().includes(q)) ||
        (s.bankUsed && s.bankUsed.toLowerCase().includes(q)) ||
        (s.employeeId && s.employeeId.toLowerCase().includes(q))
      );
    });
  }, [topupSlips, topupStatusFilter, topupSearch]);

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
        idNumber?: string;
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
        idNumber: u.idNumber || "",
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
        if (!existing.idNumber && b.customerIdNumber) {
          existing.idNumber = b.customerIdNumber;
        }
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
        if (b.customerArchived) return;
        const deletedAt =
          deletedCustomerKeysRef.current.get(key) ??
          (phoneNorm ? deletedCustomerKeysRef.current.get(phoneNorm) : undefined);
        if (deletedAt !== undefined) {
          const bTs = Math.max(bUpdatedAt, bCreatedAt);
          if (bTs <= deletedAt) return;
          deletedCustomerKeysRef.current.delete(key);
          if (phoneNorm) deletedCustomerKeysRef.current.delete(phoneNorm);
        }
        custMap.set(key, {
          id: `CUST-${phoneNorm || b.id}`,
          name: isRealName ? bName : (phoneNorm ? `Customer (${phoneNorm.slice(-4)})` : "Valued Customer"),
          phone: bPhone,
          idNumber: b.customerIdNumber || "",
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
          b.paymentSlipStatus !== "cash_pending" &&
          !(b.paymentMethod === "cash_manual" && (!b.paymentApprovedAt || b.paymentApprovedAt <= 0)) &&
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
        idNumber: c.idNumber,
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

    return list.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }, [registeredUsers, bookings]);

  // Filtered & sorted customers for the Customer List
  const filteredCustomers = useMemo(() => {
    return customersWithMetrics
      .filter((c) => {
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
          (c.idNumber && c.idNumber.toLowerCase().includes(q)) ||
          (c.city && c.city.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (customerSort === "bookings") {
          return b.totalBookings - a.totalBookings || b.lastActiveAt - a.lastActiveAt;
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

  const bookedCustomersCount = useMemo(
    () => customersWithMetrics.filter((c) => c.totalBookings > 0).length,
    [customersWithMetrics]
  );
  const registeredOnlyClientsCount = useMemo(
    () => customersWithMetrics.filter((c) => c.totalBookings === 0).length,
    [customersWithMetrics]
  );

  // Filtered complaints for Complaints Audit Section
  const filteredComplaints = useMemo(() => {
    if (!complaintSearch.trim()) return complaints;
    const q = complaintSearch.toLowerCase();
    return complaints.filter(
      (c) =>
        c.bookingId.toLowerCase().includes(q) ||
        c.customerName.toLowerCase().includes(q) ||
        c.customerPhone.toLowerCase().includes(q) ||
        (c.customerIdNumber && c.customerIdNumber.toLowerCase().includes(q)) ||
        c.pickupCity.toLowerCase().includes(q) ||
        c.deliveryCity.toLowerCase().includes(q) ||
        c.reason.toLowerCase().includes(q)
    );
  }, [complaints, complaintSearch]);

  // ---- Status Badge Component ----
  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { cls: string; label: string }> = {
      pending: {
        cls: "bg-amber-50 text-amber-900 border-amber-300",
        label: "Pending Quote",
      },
      awaiting_payment: {
        cls: "bg-gray-100 text-gray-800 border-gray-300",
        label: "Awaiting Payment",
      },
      payment_submitted: {
        cls: "bg-blue-50 text-blue-900 border-blue-300",
        label: "Slip Review",
      },
      accepted: {
        cls: "bg-green-50 text-green-800 border-green-300",
        label: "Approved",
      },
      booked: {
        cls: "bg-green-50 text-green-800 border-green-300",
        label: "Booked",
      },
      assigned: {
        cls: "bg-green-50 text-green-800 border-green-300",
        label: "Rider Assigned",
      },
      goods_collected: {
        cls: "bg-gray-100 text-gray-900 border-gray-300",
        label: "Goods Collected",
      },
      in_transit: {
        cls: "bg-gray-100 text-gray-900 border-gray-300",
        label: "In Transit",
      },
      delivered: {
        cls: "bg-gray-100 text-gray-700 border-gray-300",
        label: "Delivered",
      },
      cancelled: {
        cls: "bg-red-50 text-red-800 border-red-300",
        label: "Cancelled",
      },
    };
    const s = map[status] || map.pending;
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap ${s.cls}`}>
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

  // ---- Reusable Booking Dispatch Card for Dashboard Overview, Ongoing, and Completed Sections ----
  const renderBookingDispatchCard = (
    b: StoredBooking,
    cardContext: "dashboard" | "ongoing" | "pending_payment" | "completed" = "dashboard"
  ) => {
                    const isExpanded = Boolean(expandedDashboardBookings[b.id]);
    const lifecycle = getBookingLifecycle(b, clockTick);
                    const isPendingPayment = isBookingPaymentPending(b);
                    const isCashManual = b.paymentMethod === "cash_manual";
                    const isCashPending = (b.paymentSlipStatus as string) === "cash_pending";
                    const isCashPaid = b.paymentSlipStatus === "approved" || (b.paymentSlipStatus as string) === "manual_approved";
                    const isPaymentLocked =
                      b.paymentSlipStatus === "approved" ||
                      (b.paymentSlipStatus as string) === "manual_approved" ||
                      (b.paymentSlipStatus as string) === "cash_pending" ||
                      b.status === "accepted" ||
                      b.status === "booked" ||
                      Boolean(b.paymentApprovedAt && b.paymentApprovedAt > 0);
                    const hasStoredSlip = Boolean(b.paymentSlipId && b.paymentSlipStatus !== "deleted");
                    const isPdfSlip = Boolean(
                      b.paymentSlipType?.includes("pdf") ||
                      b.paymentSlipName?.toLowerCase().endsWith(".pdf")
                    );
                    const quoteDraft = quoteInputs[b.id] || {
                      amount: b.quotedAmount ? String(b.quotedAmount) : "",
                      note: b.quoteNote || "",
                    };
                    const resolvedBookedDates =
                      Array.isArray(b.dates) && b.dates.length > 0
                        ? b.dates
                        : b.date
                        ? [b.date]
                        : [];
                    const bookedDatesDisplay =
                      resolvedBookedDates.length > 0
                        ? resolvedBookedDates.join(", ")
                        : "Date Not Set";
                    const requestTiming = formatBookingDateTime(b.createdAt);
                    const quotedTiming = formatBookingDateTime(b.quotedAt);
                    const slipTiming = formatBookingDateTime(b.paymentSlipUploadedAt);
                    const approvedTiming = formatBookingDateTime(b.paymentApprovedAt);
                    const distanceDisplay = getRouteDistanceKm(b.pickupCity, b.deliveryCity, b.distanceKm);

                    return (
                      <div
                        key={b.id}
                        className="rounded-lg bg-white border border-gray-300 overflow-hidden shadow-xs"
                      >
                        {/* Header Bar */}
                        <div
                          onClick={() => toggleDashboardBookingCard(b.id, isExpanded)}
                          className="w-full text-left bg-gray-900 text-white px-3.5 py-2.5 sm:px-4 hover:bg-gray-800 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white/10 text-white">
                              {b.id}
                            </span>
                            <span className="text-sm font-bold text-white">
                              {b.customerName}
                            </span>
                            {b.customerPhone && (
                              <span className="text-xs font-mono text-gray-400">
                                ({b.customerPhone})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {b.quotedAmount !== undefined && (
                              <span className="text-xs sm:text-sm font-mono font-bold text-amber-400">
                                Rs. {b.quotedAmount.toLocaleString()}
                              </span>
                            )}
                            {cardContext === "completed" ? (
                              <>
                                <span className="text-xs font-bold text-emerald-950 bg-emerald-400 px-2 py-0.5 rounded">
                                  ✓ Paid
                                </span>
                                <span className="text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded shadow-xs">
                                  7. Delivered / Completed
                                </span>
                              </>
                            ) : cardContext === "pending_payment" ? (
                              <>
                                <span className="text-xs font-bold text-amber-900 bg-amber-400 px-2 py-0.5 rounded">
                                  ⌛ Pending Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()}
                                </span>
                                <span className="text-xs font-bold text-white bg-amber-600 px-2 py-0.5 rounded shadow-xs">
                                  Awaiting Payment
                                </span>
                              </>
                            ) : (
                              <>
                                {typeof b.pendingAmount === "number" && b.pendingAmount > 0 && typeof b.advanceAmount === "number" && b.advanceAmount > 0 ? (
                                  <>
                                    <span className="text-xs font-bold text-emerald-950 bg-emerald-400 px-2 py-0.5 rounded">
                                      Paid Rs. {b.advanceAmount.toLocaleString()}
                                    </span>
                                    <span className="text-xs font-bold text-amber-900 bg-amber-400 px-2 py-0.5 rounded">
                                      ⌛ Pending Rs. {b.pendingAmount.toLocaleString()}
                                    </span>
                                  </>
                                ) : typeof b.pendingAmount === "number" && b.pendingAmount > 0 ? (
                                  <span className="text-xs font-bold text-amber-900 bg-amber-400 px-2 py-0.5 rounded">
                                    ⌛ Pending Rs. {b.pendingAmount.toLocaleString()}
                                  </span>
                                ) : isPendingPayment ? (
                                  <span className="text-xs font-bold text-amber-900 bg-amber-400 px-2 py-0.5 rounded">
                                    ⌛ Pending
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold text-emerald-950 bg-emerald-400 px-2 py-0.5 rounded">
                                    ✓ Paid
                                  </span>
                                )}
                                <StatusBadge status={b.status} />
                                {lifecycle.isOngoing ? (
                                  <span className="text-xs font-bold text-white bg-emerald-600 px-2 py-0.5 rounded flex items-center gap-1 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                    Ongoing
                                  </span>
                                ) : lifecycle.isCompleted ? (
                                  <span className="text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded">
                                    ✓ Completed
                                  </span>
                                ) : lifecycle.isUpcoming && lifecycle.startPlus15 !== null ? (
                                  <span className="text-xs font-bold text-gray-300 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                                    Upcoming
                                  </span>
                                ) : null}
                              </>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDashboardBookingCard(b.id, isExpanded);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/20 bg-white/10 text-xs font-semibold text-white hover:bg-white/20 cursor-pointer"
                            >
                              {isExpanded ? "Hide ▴" : "Details ▾"}
                            </button>
                          </div>
                        </div>

                        {/* Real-time Trip Lifecycle Banner */}
                        {lifecycle.isOngoing && cardContext !== "completed" && cardContext !== "pending_payment" && (
                          <div className="bg-emerald-50 px-3.5 py-2 sm:px-4 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950 font-medium">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span className="font-bold">Active On Road:</span>
                              <span className="font-mono">{formatTimeDurationLabel(b.startTime, b.endTime)}</span>
                              {lifecycle.endTimestamp !== null && clockTick >= lifecycle.endTimestamp ? (
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-200 border border-amber-300 px-1.5 py-0.5 rounded">
                                  Past Scheduled End ({b.endTime ? formatTime12h(b.endTime) : ""}) · Ride in progress
                                </span>
                              ) : (
                                <span className="text-[11px] text-emerald-800">
                                  (Scheduled to: {b.endTime ? formatTime12h(b.endTime) : "—"})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-emerald-800 font-semibold hidden sm:inline">
                                🔒 Slot locked until Delivered
                              </span>
                              <button
                                type="button"
                                disabled={actionLoading === b.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStageClickboxSelect(b, "delivered");
                                }}
                                className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer shadow-xs text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                                title="Admin manual verification: Mark ride as Delivered / Completed to release schedule slot"
                              >
                                <span>✓</span>
                                <span>Mark as Delivered</span>
                              </button>
                            </div>
                          </div>
                        )}
                        {cardContext === "pending_payment" && (
                          <div className="bg-amber-50 px-3.5 py-2 sm:px-4 border-b border-amber-300 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <span className="font-bold text-amber-900">Trip Concluded · Payment Pending:</span>
                              <span className="font-mono font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                Due Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-[11px] text-amber-800 font-bold flex items-center gap-2">
                              <span className="text-emerald-800">✓ Lorry &amp; Rider Slot Released</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (typeof b.pendingAmount === "number" && b.pendingAmount > 0) {
                                    openSettleBalanceModal(b);
                                  } else {
                                    openPaymentApprovalModal(b);
                                  }
                                }}
                                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer shadow-xs text-[11px]"
                              >
                                💳 Settle Payment Now →
                              </button>
                            </div>
                          </div>
                        )}
                        {cardContext === "completed" && (
                          <div className="bg-blue-50 px-3.5 py-1.5 sm:px-4 border-b border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-950 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-blue-900">✓ Delivered &amp; Completed:</span>
                              <span>{bookedDatesDisplay} · {formatTimeDurationLabel(b.startTime, b.endTime)}</span>
                            </div>
                            <div className="text-[11px] text-blue-700 font-bold flex items-center gap-1.5">
                              <span>🔒 Locked Completed Record</span>
                              <span className="text-blue-400">·</span>
                              <span>Lorry &amp; Rider Slot Available</span>
                            </div>
                          </div>
                        )}
                        {cardContext === "dashboard" && lifecycle.isCompleted && (
                          <div className="bg-blue-50 px-3.5 py-1.5 sm:px-4 border-b border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-950 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-blue-900">✓ Concluded Dispatch:</span>
                              <span>{bookedDatesDisplay} · {formatTimeDurationLabel(b.startTime, b.endTime)}</span>
                            </div>
                            <div className="text-[11px] text-blue-700 font-bold">
                              Lorry &amp; Rider time slot released &amp; available for new bookings
                            </div>
                          </div>
                        )}

                        {/* Scannable Row: 3 clean columns, no payment status repetition */}
                        <div
                          onClick={() => toggleDashboardBookingCard(b.id, isExpanded)}
                          className="bg-gray-50/70 px-3.5 py-2.5 sm:px-4 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs sm:text-sm cursor-pointer hover:bg-gray-100/60 transition-colors"
                        >
                          <div>
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Route</div>
                            <div className="font-semibold text-gray-900 mt-0.5 flex items-center gap-2">
                              <span>{b.pickupCity} → {b.deliveryCity}</span>
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[10px]">
                                {distanceDisplay}
                              </span>
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date &amp; Time</div>
                            <div className="text-gray-900 mt-0.5">
                              <span className="font-medium">{bookedDatesDisplay}</span>
                              {" · "}
                              {b.startTime && b.endTime ? (
                                <span className="font-bold text-gray-900">
                                  {formatTimeDurationLabel(b.startTime, b.endTime)}
                                </span>
                              ) : (
                                <span className="text-amber-800 font-medium">Time not set</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Lorry &amp; Rider</div>
                            <div className="text-gray-900 mt-0.5">
                              <span className="font-medium">
                                {b.assignedPlate || "No Lorry"}
                              </span>
                              {b.assignedDriverName ? ` · ${b.assignedDriverName}` : " · No rider"}
                            </div>
                          </div>
                        </div>

                        {/* Collapsible Full View & Edit Controls */}
                        {isExpanded && (
                          <div className="divide-y divide-gray-200">
                            {/* Customer & Cargo Details */}
                            <div className="px-4 py-4 sm:px-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                              <div>
                                <h4 className="text-sm font-bold text-gray-900 mb-2.5">
                                  Customer Details
                                </h4>
                                <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3">
                                  <dt className="text-gray-500">Name</dt>
                                  <dd className="font-semibold text-gray-900">{b.customerName}</dd>

                                  <dt className="text-gray-500">Phone</dt>
                                  <dd>
                                    {b.customerPhone ? (
                                      <a
                                        href={`tel:${String(b.customerPhone || "").replace(/\s+/g, "")}`}
                                        className="font-mono font-semibold text-gray-900 underline"
                                      >
                                        {b.customerPhone}
                                      </a>
                                    ) : (
                                      <span className="text-gray-500">Not provided</span>
                                    )}
                                  </dd>

                                  <dt className="text-gray-500">Requested</dt>
                                  <dd className="text-gray-900">
                                    {requestTiming ? `${requestTiming.date} at ${requestTiming.time}` : "Not recorded"}
                                  </dd>

                                  {b.packageDetails && (
                                    <>
                                      <dt className="text-gray-500">Notes</dt>
                                      <dd className="text-gray-900">{b.packageDetails}</dd>
                                    </>
                                  )}
                                </dl>
                              </div>

                              <div>
                                <h4 className="text-sm font-bold text-gray-900 mb-2.5">
                                  Trip &amp; Cargo Details
                                </h4>
                                <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3">
                                  <dt className="text-gray-500">Route</dt>
                                  <dd className="font-semibold text-gray-900">
                                    {b.pickupCity} → {b.deliveryCity}
                                    <span className="ml-2 font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs inline-block">
                                      🛣️ {distanceDisplay}
                                    </span>
                                  </dd>

                                  <dt className="text-gray-500">Trip Date(s)</dt>
                                  <dd className="font-medium text-gray-900">{bookedDatesDisplay}</dd>

                                  <dt className="text-gray-500">Lorry</dt>
                                  <dd className="text-gray-900">
                                    {b.assignedPlate || "Not assigned"} ({b.vehicleType || "Lorry"})
                                  </dd>

                                  {b.cargoNature && (
                                    <>
                                      <dt className="text-gray-500">Goods</dt>
                                      <dd className="text-gray-900">{b.cargoNature}</dd>
                                    </>
                                  )}

                                  {(b.cargoWeight || b.helpersCount !== undefined) && (
                                    <>
                                      <dt className="text-gray-500">Weight / Helpers</dt>
                                      <dd className="text-gray-900">
                                        {b.cargoWeight || "—"}
                                        {b.helpersCount !== undefined ? ` · Helpers: ${b.helpersCount}` : ""}
                                      </dd>
                                    </>
                                  )}

                                  {b.assignedDriverName && (
                                    <>
                                      <dt className="text-gray-500">Assigned Rider</dt>
                                      <dd className="font-semibold text-green-800">
                                        {b.assignedDriverName}
                                        {b.assignedDriverPhone && (
                                          <a
                                            href={`tel:${String(b.assignedDriverPhone).replace(/\s+/g, "")}`}
                                            className="ml-2 font-mono underline"
                                          >
                                            {b.assignedDriverPhone}
                                          </a>
                                        )}
                                      </dd>
                                    </>
                                  )}
                                </dl>
                              </div>
                            </div>

                            {/* Step 1: Assign Time Duration & Mandatory Rider */}
                            {cardContext === "completed" ? (
                              <div className="px-4 py-3 sm:px-5 bg-gray-50 border-b border-gray-200 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-bold text-gray-700 uppercase tracking-wider">Scheduled Journey:</span>
                                  <span className="font-mono font-bold text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                                    {bookedDatesDisplay} · {formatTimeDurationLabel(b.startTime, b.endTime) || "Completed"}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-4 text-gray-700">
                                  <span>Lorry: <strong className="text-gray-900 font-semibold">{b.assignedPlate || "Assigned"}</strong></span>
                                  <span>Rider: <strong className="text-gray-900 font-semibold">{b.assignedDriverName || "Assigned"}</strong></span>
                                </div>
                              </div>
                            ) : (() => {
                              const draft = getScheduleDraft(b);
                              const draftDates =
                                draft.isMultiDate && draft.endDate
                                  ? getDatesBetween(draft.date, draft.endDate)
                                  : [draft.date];
                              const draftTimeCheck = validateScheduleTimeAndDates(
                                draft.date,
                                draft.startTime,
                                draft.isMultiDate && draft.endDate ? draft.endDate : draft.date,
                                draft.endTime,
                                draftDates
                              );
                              const draftConflict =
                                draftTimeCheck.valid && draft.date
                                  ? findBookingScheduleConflict(
                                      {
                                        excludeBookingId: b.id,
                                        date: draftTimeCheck.startDate,
                                        dates: draftTimeCheck.dates,
                                        startTime: draftTimeCheck.startTime,
                                        endTime: draftTimeCheck.endTime,
                                        assignedPlate: draft.plate,
                                        assignedLorryId: draft.lorryId,
                                        assignedDriverId: draft.driverId,
                                        assignedDriverName: draft.driverName,
                                        assignedDriverPhone: draft.driverPhone,
                                        bookingType: b.bookingType || "individual_vehicle",
                                      },
                                      bookings
                                    )
                                  : null;
                              const riderSelected = hasAssignedRider({
                                assignedDriverId: draft.driverId,
                                assignedDriverName: draft.driverName,
                                assignedDriverPhone: draft.driverPhone,
                              });

                              return (
                                <div className="px-4 py-4 sm:px-5 flex flex-col gap-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <h4 className="text-sm font-bold text-gray-900">
                                        Step 1: Assign Time Duration &amp; Rider
                                      </h4>
                                    </div>
                                    {b.startTime && b.endTime && (
                                      <span className="text-xs font-mono font-semibold text-green-800 bg-green-50 border border-green-300 px-2.5 py-1 rounded-md">
                                        Allocated: {formatJourneyScheduleSummary(b.date, b.startTime, (b.dates && b.dates.length > 1 ? b.dates[b.dates.length - 1] : b.date), b.endTime, b.dates)}
                                      </span>
                                    )}
                                  </div>

                                  {/* Multi-Day Booking Toggle */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md bg-blue-50/70 border border-blue-200">
                                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        aria-label={`Toggle multi-day booking for ${b.id}`}
                                        checked={Boolean(draft.isMultiDate)}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          const sDate = draft.date || new Date().toISOString().split("T")[0];
                                          const defaultEndDate = checked
                                            ? (draft.endDate && draft.endDate > sDate ? draft.endDate : addDaysToYYYYMMDD(sDate, 1))
                                            : sDate;
                                          updateScheduleDraft(b, {
                                            isMultiDate: checked,
                                            endDate: defaultEndDate,
                                            dates: checked ? getDatesBetween(sDate, defaultEndDate) : [sDate],
                                          });
                                        }}
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                      />
                                      <span className="text-xs font-bold text-gray-900">
                                        Multi-Day Journey (දින කිහිපයක ගමනක්)
                                      </span>
                                    </label>
                                    {draft.isMultiDate && (
                                      <span className="text-[11px] font-mono font-bold text-blue-900 bg-white border border-blue-300 px-2.5 py-0.5 rounded-full shadow-2xs">
                                        {getDatesBetween(draft.date, draft.endDate || draft.date).length} Days Journey
                                      </span>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        {draft.isMultiDate ? "Departure Date *" : "Trip Date *"}
                                      </label>
                                      <input
                                        type="date"
                                        aria-label={`Dashboard schedule date for ${b.id}`}
                                        value={draft.date}
                                        onChange={(e) => {
                                          const newStartDate = e.target.value;
                                          const newEndDate = draft.isMultiDate
                                            ? (draft.endDate && draft.endDate >= newStartDate ? draft.endDate : addDaysToYYYYMMDD(newStartDate, 1))
                                            : newStartDate;
                                          updateScheduleDraft(b, {
                                            date: newStartDate,
                                            endDate: newEndDate,
                                            dates: draft.isMultiDate ? getDatesBetween(newStartDate, newEndDate) : [newStartDate],
                                          });
                                        }}
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        {draft.isMultiDate ? "Departure Time *" : "Start Time *"}
                                      </label>
                                      <input
                                        type="time"
                                        aria-label={`Dashboard start time for ${b.id}`}
                                        value={draft.startTime}
                                        onChange={(e) => updateScheduleDraft(b, { startTime: e.target.value })}
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                      />
                                    </div>
                                    {draft.isMultiDate && (
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                          Delivery Date *
                                        </label>
                                        <input
                                          type="date"
                                          min={draft.date}
                                          aria-label={`Dashboard delivery end date for ${b.id}`}
                                          value={draft.endDate || draft.date}
                                          onChange={(e) => {
                                            const newEndDate = e.target.value;
                                            updateScheduleDraft(b, {
                                              endDate: newEndDate,
                                              dates: getDatesBetween(draft.date, newEndDate),
                                            });
                                          }}
                                          className="w-full px-3 py-2 rounded-md border border-blue-400 bg-blue-50/30 text-xs font-mono font-bold text-gray-900 focus:border-blue-700 focus:outline-none"
                                        />
                                      </div>
                                    )}
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        {draft.isMultiDate ? "Delivery Time *" : "End Time *"}
                                      </label>
                                      <input
                                        type="time"
                                        aria-label={`Dashboard end time for ${b.id}`}
                                        value={draft.endTime}
                                        onChange={(e) => updateScheduleDraft(b, { endTime: e.target.value })}
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Lorry (Vehicle) *
                                      </label>
                                      <select
                                        aria-label={`Dashboard schedule vehicle for ${b.id}`}
                                        value={draft.plate}
                                        onChange={(e) => {
                                          const selPlate = e.target.value;
                                          const matchedV = fleetVehicles.find((v) => v.plate === selPlate);
                                          updateScheduleDraft(b, {
                                            plate: selPlate,
                                            lorryId:
                                              matchedV?.id ||
                                              `lorry-${normalizePlate(selPlate).toLowerCase()}`,
                                          });
                                        }}
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                                      >
                                        <option value="">Select Lorry</option>
                                        {fleetVehicles.map((v) => (
                                          <option key={v.id || v.plate} value={v.plate}>
                                            {v.plate} ({v.vehicleType})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Assign Rider *
                                      </label>
                                      <select
                                        aria-label={`Dashboard schedule rider for ${b.id}`}
                                        value={draft.driverName}
                                        onChange={(e) => {
                                          const drv = drivers.find((d) => d.name === e.target.value);
                                          updateScheduleDraft(b, {
                                            driverId: drv?.driverId || "",
                                            driverName: drv?.name || e.target.value,
                                            driverPhone: drv?.phone || "",
                                          });
                                        }}
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                                      >
                                        <option value="">Select Rider</option>
                                        {drivers.map((d) => (
                                          <option key={d.driverId} value={d.name}>
                                            {d.name} ({d.driverId}) - {d.phone}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  {draftConflict?.hasConflict ? (
                                    <div className="px-3.5 py-2 rounded-md bg-red-50 border border-red-300 text-xs font-semibold text-red-800">
                                      {draftConflict.message}
                                    </div>
                                  ) : draft.startTime || draft.endTime ? (
                                    !draftTimeCheck.valid ? (
                                      <div className="px-3.5 py-2 rounded-md bg-amber-50 border border-amber-300 text-xs font-medium text-amber-900">
                                        {draftTimeCheck.error}
                                      </div>
                                    ) : !riderSelected ? (
                                      <div className="px-3.5 py-2 rounded-md bg-amber-50 border border-amber-300 text-xs font-medium text-amber-900">
                                        Select a Rider to complete schedule allocation.
                                      </div>
                                    ) : (
                                      <div className="px-3.5 py-2 rounded-md bg-green-50 border border-green-300 text-xs font-medium text-green-800">
                                        Slot Available: {draftTimeCheck.isMultiDate
                                          ? `${draftTimeCheck.startDate} ${formatTime12h(draftTimeCheck.startTime)} → ${draftTimeCheck.endDate} ${formatTime12h(draftTimeCheck.endTime)} (${draftTimeCheck.daysCount} Days)`
                                          : `${draftTimeCheck.startDate} · ${formatTimeDurationLabel(draftTimeCheck.startTime, draftTimeCheck.endTime)}`} · {draft.plate} · Rider: {draft.driverName}
                                      </div>
                                    )
                                  ) : null}

                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id || Boolean(draftConflict?.hasConflict)}
                                      onClick={() => handleSaveBookingSchedule(b)}
                                      className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      {actionLoading === b.id ? "Saving..." : "Save Time & Rider"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Step 2: Payment Breakdown & Settlement Audit */}
                            {cardContext === "completed" ? (() => {
                              // Extract advance info from advanceAmount, or quoteNote regex fallback
                              let parsedAdvance: number | undefined = undefined;
                              if (typeof b.advanceAmount === "number" && b.advanceAmount > 0 && b.quotedAmount && b.advanceAmount < b.quotedAmount) {
                                parsedAdvance = b.advanceAmount;
                              } else if (b.quoteNote) {
                                const m = b.quoteNote.match(/Advance\s*(?:Rs\.?|LKR)?\s*([\d,]+)/i);
                                if (m && m[1]) {
                                  const n = Number(m[1].replace(/,/g, ""));
                                  if (Number.isFinite(n) && n > 0 && (!b.quotedAmount || n < b.quotedAmount)) {
                                    parsedAdvance = n;
                                  }
                                }
                              }
                              const hasAdvance = parsedAdvance !== undefined && parsedAdvance > 0;
                              const advanceAmount = parsedAdvance || 0;
                              const balanceAmount = hasAdvance && b.quotedAmount ? Math.max(0, b.quotedAmount - advanceAmount) : 0;

                              const resolveBankDetailsString = (bankField?: string, noteText?: string) => {
                                if (bankField && bankField.trim()) return bankField.trim();
                                if (noteText) {
                                  const m = noteText.match(/(?:Bank|Account|via)\s*:\s*([^·,()\n]+)/i);
                                  if (m && m[1] && m[1].trim()) return m[1].trim();
                                }
                                const activeBank = bankAccounts.find((a) => a.active) || bankAccounts[0];
                                if (activeBank) {
                                  const acc = activeBank.accountNumber ? ` - ${activeBank.accountNumber}` : "";
                                  return `${activeBank.bankName}${acc}`;
                                }
                                return "Commercial Bank - 100029384920";
                              };

                              const resolvePaymentMethodMeta = (method?: string, bankField?: string, noteText?: string) => {
                                const isBank =
                                  method === "bank_transfer" ||
                                  method === "bank_slip" ||
                                  Boolean(bankField && bankField.trim());
                                if (isBank) {
                                  const bankStr = resolveBankDetailsString(bankField, noteText);
                                  return {
                                    isBank: true,
                                    displayLabel: "Bank Transfer (බැංකු තැන්පතු)",
                                    bankName: bankStr,
                                  };
                                }
                                return {
                                  isBank: false,
                                  displayLabel: "Cash (අතපිට මුදල්)",
                                  bankName: "",
                                };
                              };

                              const advMeta = resolvePaymentMethodMeta(b.paymentMethod, b.paymentBankUsed, b.quoteNote);
                              const balMeta = resolvePaymentMethodMeta(
                                b.finalPaymentMethod || (b.paymentMethod === "bank_transfer" ? "bank_transfer" : "cash_manual"),
                                b.finalPaymentBankUsed || b.paymentBankUsed,
                                b.quoteNote
                              );
                              const fullMeta = resolvePaymentMethodMeta(
                                b.finalPaymentMethod || b.paymentMethod,
                                b.finalPaymentBankUsed || b.paymentBankUsed,
                                b.quoteNote
                              );

                              const advanceTiming = formatBookingDateTime(b.paymentApprovedAt || b.quotedAt || b.createdAt);
                              const balanceTiming = formatBookingDateTime(b.finalPaymentAt || b.paymentApprovedAt || b.createdAt);
                              const fullTiming = formatBookingDateTime(b.paymentApprovedAt || b.finalPaymentAt || b.createdAt);

                              return (
                                <div className="px-4 py-4 sm:px-5 bg-emerald-50/40 border-b border-emerald-200 flex flex-col gap-3 text-xs text-gray-900">
                                  {/* Title & Total Status */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-emerald-200">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shadow-xs"></span>
                                      <h4 className="font-bold text-sm text-emerald-950 uppercase tracking-wide">
                                        Payment Breakdown &amp; Audit (ගෙවීම් තොරතුරු)
                                      </h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-extrabold text-sm text-emerald-950 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md">
                                        Total Paid: Rs. {(b.quotedAmount || 0).toLocaleString()}
                                      </span>
                                      <span className="text-xs font-bold text-emerald-900 bg-emerald-200/80 px-2 py-1 rounded-md">
                                        ✓ Fully Settled
                                      </span>
                                    </div>
                                  </div>

                                  {/* Payment Audit Cards */}
                                  {hasAdvance ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                      {/* Card 1: Advance Details */}
                                      <div className="bg-white p-3.5 rounded-lg border border-emerald-200 shadow-2xs flex flex-col gap-2">
                                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                          <span className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                            1. Advance Payment (අත්තිකාරම්)
                                          </span>
                                          <span className="font-mono font-bold text-sm text-emerald-800">
                                            Rs. {advanceAmount.toLocaleString()}
                                          </span>
                                        </div>
                                        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                                          <dt className="text-gray-500">Method (ක්‍රමය):</dt>
                                          <dd className="font-semibold text-gray-900 flex flex-wrap items-center gap-1.5">
                                            <span>{advMeta.displayLabel}</span>
                                            {advMeta.isBank && (
                                              <span className="font-bold text-[11px] text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
                                                <span>🏛</span>
                                                <span>{advMeta.bankName}</span>
                                              </span>
                                            )}
                                          </dd>

                                          <dt className="text-gray-500">Date &amp; Time:</dt>
                                          <dd className="font-mono text-gray-900">
                                            {advanceTiming ? `${advanceTiming.date} at ${advanceTiming.time}` : "Recorded on booking"}
                                          </dd>

                                          <dt className="text-gray-500">Status:</dt>
                                          <dd className="text-emerald-800 font-bold">✓ Approved &amp; Verified</dd>
                                        </dl>
                                      </div>

                                      {/* Card 2: Balance Details */}
                                      <div className="bg-white p-3.5 rounded-lg border border-emerald-200 shadow-2xs flex flex-col gap-2">
                                        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                          <span className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                            2. Balance Settled (ඉතිරි මුදල)
                                          </span>
                                          <span className="font-mono font-bold text-sm text-emerald-800">
                                            Rs. {balanceAmount.toLocaleString()}
                                          </span>
                                        </div>
                                        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                                          <dt className="text-gray-500">Method (ක්‍රමය):</dt>
                                          <dd className="font-semibold text-gray-900 flex flex-wrap items-center gap-1.5">
                                            <span>{balMeta.displayLabel}</span>
                                            {balMeta.isBank && (
                                              <span className="font-bold text-[11px] text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
                                                <span>🏛</span>
                                                <span>{balMeta.bankName}</span>
                                              </span>
                                            )}
                                          </dd>

                                          <dt className="text-gray-500">Date &amp; Time:</dt>
                                          <dd className="font-mono text-gray-900">
                                            {balanceTiming ? `${balanceTiming.date} at ${balanceTiming.time}` : advanceTiming ? `${advanceTiming.date} at ${advanceTiming.time}` : "Settled on completion"}
                                          </dd>

                                          <dt className="text-gray-500">Status:</dt>
                                          <dd className="text-emerald-800 font-bold">✓ Settled &amp; Counted</dd>
                                        </dl>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Single Full Payment */
                                    <div className="bg-white p-3.5 rounded-lg border border-emerald-200 shadow-2xs flex flex-col gap-2">
                                      <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                                        <span className="font-bold text-emerald-900 flex items-center gap-1.5 text-xs">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                          Full Payment (සම්පූර්ණ ගෙවීම — අත්තිකාරම් රහිතව)
                                        </span>
                                        <span className="font-mono font-bold text-sm text-emerald-800">
                                          Rs. {(b.quotedAmount || 0).toLocaleString()}
                                        </span>
                                      </div>
                                      <dl className="grid grid-cols-[130px_1fr] sm:grid-cols-[130px_1fr_130px_1fr] gap-y-1.5 text-xs">
                                        <dt className="text-gray-500">Method (ක්‍රමය):</dt>
                                        <dd className="font-semibold text-gray-900 flex flex-wrap items-center gap-1.5">
                                          <span>{fullMeta.displayLabel}</span>
                                          {fullMeta.isBank && (
                                            <span className="font-bold text-[11px] text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
                                              <span>🏛</span>
                                              <span>{fullMeta.bankName}</span>
                                            </span>
                                          )}
                                        </dd>

                                        <dt className="text-gray-500">Approved Date &amp; Time:</dt>
                                        <dd className="font-mono text-gray-900">
                                          {fullTiming ? `${fullTiming.date} at ${fullTiming.time}` : "Recorded"}
                                        </dd>

                                        <dt className="text-gray-500">Advance Status:</dt>
                                        <dd className="text-gray-700 font-medium">None (Full amount paid at once)</dd>

                                        <dt className="text-gray-500">Settlement Status:</dt>
                                        <dd className="text-emerald-800 font-bold">✓ 100% Settled</dd>
                                      </dl>
                                    </div>
                                  )}

                                  {/* Note if any */}
                                  {b.quoteNote && (
                                    <div className="text-[11px] text-emerald-900/80 bg-white/70 px-3 py-1.5 rounded border border-emerald-200/60 font-medium flex items-center gap-1.5">
                                      <span className="font-bold">Payment Note:</span>
                                      <span>{b.quoteNote}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })() : (
                            <div className="px-4 py-4 sm:px-5 flex flex-col gap-3">
                              <h4 className="text-sm font-bold text-gray-900">
                                Step 2: Amount &amp; Payment
                              </h4>

                              {(b.status === "pending" || editingQuoteId === b.id) && (
                                <div className="flex flex-col gap-3">
                                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                    <div className="sm:col-span-4">
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Amount (LKR) *
                                      </label>
                                      <input
                                        type="number"
                                        min="1"
                                        value={quoteDraft.amount}
                                        onChange={(e) =>
                                          setQuoteInputs((prev) => ({
                                            ...prev,
                                            [b.id]: { ...quoteDraft, amount: e.target.value },
                                          }))
                                        }
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                      />
                                    </div>
                                    <div className="sm:col-span-8">
                                      <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Payment Note (Optional)
                                      </label>
                                      <input
                                        type="text"
                                        value={quoteDraft.note}
                                        onChange={(e) =>
                                          setQuoteInputs((prev) => ({
                                            ...prev,
                                            [b.id]: { ...quoteDraft, note: e.target.value },
                                          }))
                                        }
                                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => handleSendQuote(b)}
                                      className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      {actionLoading === b.id ? "Sending..." : "Send Amount & Request Pay"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => openPaymentApprovalModal(b)}
                                      className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Approve Payment
                                    </button>
                                  </div>
                                </div>
                              )}

                              {(isCashPending || (typeof b.pendingAmount === "number" && b.pendingAmount > 0)) && (
                                <div className="px-4 py-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <span className="font-bold flex items-center gap-1.5 text-amber-900">
                                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>
                                      Payment Pending: Balance Due Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()}
                                    </span>
                                    <p className="text-xs text-amber-800 mt-0.5">
                                      Total: <strong className="font-bold">Rs. {(b.quotedAmount || 0).toLocaleString()}</strong>
                                      {typeof b.advanceAmount === "number" && b.advanceAmount > 0 ? (
                                        <>
                                          {" · "}Advance Paid: <strong className="font-bold text-green-800">Rs. {b.advanceAmount.toLocaleString()}</strong> ({b.paymentMethod === "bank_transfer" ? `Bank: ${b.paymentBankUsed || "Bank"}` : "Cash"})
                                        </>
                                      ) : (
                                        " · Full balance pending"
                                      )}
                                      {b.quoteNote && ` · ${b.quoteNote}`}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => openSettleBalanceModal(b)}
                                      className="px-3.5 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-xs font-semibold cursor-pointer shadow-xs"
                                    >
                                      💳 Settle Balance (Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()})
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => openPaymentApprovalModal(b)}
                                      className="px-3 py-2 rounded-md border border-amber-300 bg-white hover:bg-amber-100 text-amber-950 text-xs font-medium cursor-pointer"
                                    >
                                      Update Payment
                                    </button>
                                  </div>
                                </div>
                              )}

                              {isCashPaid && (!b.pendingAmount || b.pendingAmount === 0) && (
                                <div className="px-4 py-2.5 rounded-md bg-green-50 border border-green-300 text-xs text-green-900 flex items-center justify-between">
                                  <span>
                                    ✓ Fully Paid &amp; Counted into Revenue: <strong>Rs. {(b.quotedAmount || 0).toLocaleString()}</strong>
                                    {typeof b.advanceAmount === "number" && b.advanceAmount > 0 && b.finalPaymentMethod ? (
                                      <span className="text-gray-600 ml-1">
                                        (Advance: Rs. {b.advanceAmount.toLocaleString()} via {b.paymentMethod === "bank_transfer" ? b.paymentBankUsed || "Bank" : "Cash"} + Balance via {b.finalPaymentMethod === "bank_transfer" ? b.finalPaymentBankUsed || "Bank" : "Cash"})
                                      </span>
                                    ) : b.paymentBankUsed ? (
                                      <span className="text-gray-600 ml-1">({b.paymentBankUsed})</span>
                                    ) : b.paymentMethod === "cash_manual" ? (
                                      <span className="text-gray-600 ml-1">(Cash)</span>
                                    ) : null}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={actionLoading === b.id}
                                    onClick={() => openPaymentApprovalModal(b)}
                                    className="text-xs text-green-950 underline font-medium cursor-pointer"
                                  >
                                    Edit Payment
                                  </button>
                                </div>
                              )}

                              {b.status === "awaiting_payment" && editingQuoteId !== b.id && (
                                <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-gray-50 border border-gray-200 rounded-md px-4 py-3">
                                  <span>
                                    Waiting for customer payment slip — Quoted Rs. {(b.quotedAmount || 0).toLocaleString()}
                                  </span>
                                  <div className="flex items-center gap-2">
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
                                      className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-900 text-xs font-medium hover:bg-gray-50 cursor-pointer"
                                    >
                                      Edit Amount
                                    </button>
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => openPaymentApprovalModal(b)}
                                      className="px-3 py-1.5 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Approve Payment
                                    </button>
                                  </div>
                                </div>
                              )}

                              {hasStoredSlip && (
                                <div className="px-4 py-2.5 rounded-md bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <span className="font-semibold text-gray-900">
                                    Payment Slip: {b.paymentSlipName || "Uploaded"} {b.paymentBankUsed ? `(Paid to: ${b.paymentBankUsed})` : ""}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openSlipReviewModal(b)}
                                    className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 cursor-pointer"
                                  >
                                    Review Slip
                                  </button>
                                </div>
                              )}
                            </div>
                            )}

                            {/* Stage Selection (8-Stage Clickbox Progress Stepper) */}
                            {cardContext === "completed" ? (
                              <div className="px-4 py-3 sm:px-5 bg-gray-50 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-700 uppercase tracking-wider">Progress Stage:</span>
                                  <span className="px-2.5 py-1 rounded-md bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs">
                                    <span>✓</span>
                                    <span>7. Delivered / Completed</span>
                                  </span>
                                </div>
                                <span className="text-[11px] text-gray-500 font-medium">
                                  🔒 Ride delivered and balance 100% settled. Stage locked.
                                </span>
                              </div>
                            ) : (
                            <div className="px-4 py-4 sm:px-5 bg-gray-50 flex flex-col gap-3 text-sm">
                              {(() => {
                                const currentStatus = (b.status === "booked" ? "accepted" : b.status) as BookingStatus;
                                const currentProgressIdx = PROGRESS_KEYS.indexOf(currentStatus);
                                const isBookingCancelled = currentStatus === "cancelled";
                                const isPaymentApproved =
                                  !isCashPending &&
                                  (b.paymentSlipStatus === "manual_approved" ||
                                   b.paymentSlipStatus === "approved" ||
                                   Boolean(b.paymentApprovedAt && b.paymentApprovedAt > 0));
                                const isPaymentPending = isCashPending || !isPaymentApproved;
                                const isPaymentPendingWarning = isPaymentPending && (currentProgressIdx >= 3 || isCashPending);

                                return (
                                  <div className="w-full">
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Progress Stage:
                                      </span>
                                      <div className="flex items-center gap-2">
                                        {isPaymentPendingWarning && (
                                          <span className="text-[11px] font-semibold text-orange-800 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-md">
                                            Payment Pending
                                          </span>
                                        )}
                                        <span className="text-xs text-gray-500 font-medium">
                                          Current: <strong className="text-gray-900">{BOOKING_STAGES.find((s) => s.key === currentStatus)?.label || b.status}</strong>
                                        </span>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                                      {BOOKING_STAGES.map((st) => {
                                        const isCancelledStage = st.key === "cancelled";
                                        const stageProgressIdx = PROGRESS_KEYS.indexOf(st.key);
                                        const isCurrent = currentStatus === st.key;
                                        const isReached =
                                          !isBookingCancelled &&
                                          stageProgressIdx !== -1 &&
                                          currentProgressIdx !== -1 &&
                                          stageProgressIdx <= currentProgressIdx;

                                        const isPaymentStage = st.key === "accepted";
                                        const isOrangePending =
                                          isPaymentStage &&
                                          isPaymentPending &&
                                          (isReached || isCashPending);

                                        let btnClass = "bg-white text-gray-700 border-gray-300 hover:border-gray-900 hover:bg-gray-50";
                                        let checkClass = "border-gray-400 bg-white text-transparent";
                                        let checkContent = "✓";

                                        if (isCancelledStage) {
                                          if (isBookingCancelled) {
                                            btnClass = "bg-red-600 text-white border-red-600 shadow-sm ring-1 ring-red-600";
                                            checkClass = "bg-white text-red-600 border-white";
                                            checkContent = "✓";
                                          } else {
                                            btnClass = "bg-white text-gray-700 border-gray-300 hover:border-red-600 hover:bg-red-50/50";
                                            checkClass = "border-gray-400 bg-white text-transparent";
                                            checkContent = "✓";
                                          }
                                        } else if (isOrangePending) {
                                          btnClass = `bg-orange-500 text-white border-orange-600 shadow-sm ring-1 ring-orange-500 hover:bg-orange-600 ${
                                            isCurrent ? "ring-2 ring-offset-1 ring-orange-600 font-bold" : ""
                                          }`;
                                          checkClass = "bg-white text-orange-600 border-white";
                                          checkContent = "!";
                                        } else if (isReached) {
                                          btnClass = `bg-gray-900 text-white border-gray-900 shadow-sm ring-1 ring-gray-900 hover:bg-gray-800 ${
                                            isCurrent ? "ring-2 ring-offset-1 ring-[#FFC20E] font-bold" : ""
                                          }`;
                                          checkClass = "bg-white text-gray-900 border-white";
                                          checkContent = "✓";
                                        }

                                        return (
                                          <button
                                            key={st.key}
                                            type="button"
                                            disabled={actionLoading === b.id}
                                            onClick={() => handleStageClickboxSelect(b, st.key)}
                                            className={`flex items-start gap-1.5 p-2 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${btnClass}`}
                                            title={
                                              isOrangePending
                                                ? "Payment is pending! Click to review or approve payment."
                                                : isReached
                                                ? `Completed stage: ${st.label}`
                                                : `Click to set stage to ${st.label}`
                                            }
                                          >
                                            <span
                                              className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold border ${checkClass}`}
                                            >
                                              {checkContent}
                                            </span>
                                            <span className="leading-tight">
                                              {st.label}
                                              {isOrangePending && (
                                                <span className="block text-[10px] font-bold text-amber-100 uppercase tracking-wider mt-0.5">
                                                  Pending
                                                </span>
                                              )}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Footer Action Buttons */}
                              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-200">
                                {b.status !== "cancelled" && b.status !== "delivered" && (
                                  <button
                                    type="button"
                                    disabled={actionLoading === b.id}
                                    onClick={() => {
                                      if (confirm("Are you sure you want to cancel this booking and free its scheduled time slot?")) {
                                        updateBooking(b.id, "cancelled");
                                      }
                                    }}
                                    className="px-3.5 py-2 rounded-md border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 text-xs font-medium cursor-pointer"
                                  >
                                    Reject / Cancel
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={actionLoading === b.id}
                                  onClick={() => handleDeleteBooking(b.id)}
                                  className="px-3.5 py-2 rounded-md border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-medium cursor-pointer"
                                  title="Permanently Delete Booking from Database"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            )}

                            {cardContext === "completed" && (
                              <div className="px-4 py-3 sm:px-5 bg-gray-50/90 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2 text-gray-600 text-xs">
                                  <span className="font-mono text-[11px] text-gray-400">ID: {b.id}</span>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-[11px] text-blue-900 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                                    ✓ Delivered &amp; Completed
                                  </span>
                                  <span className="text-gray-300">·</span>
                                  <span className="text-[11px] text-gray-500 italic">Stage locked</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={actionLoading === b.id}
                                    onClick={() => handleDeleteBooking(b.id)}
                                    className="px-3.5 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold cursor-pointer shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                    title="Permanently Delete Booking from Database"
                                  >
                                    <span>🗑</span>
                                    <span>Delete Booking</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
  };

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
                className="w-10 h-10 rounded-xl bg-[#FFC20E] p-1 object-contain shadow-sm shrink-0"
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
                  activeNav === "overview" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B]"
                }`}>
                  {totalPendingCount}
                </span>
              )}
            </button>

            {/* All Bookings (Ongoing Rides & Completed Bookings) */}
            <button
              onClick={() => {
                setActiveNav("all_bookings");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "all_bookings"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>All Bookings</span>
              </div>
              <div className="flex items-center gap-1.5">
                {ongoingBookings.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold flex items-center gap-1 ${
                      activeNav === "all_bookings"
                        ? "bg-[#26231B] text-emerald-400"
                        : "bg-emerald-500 text-white"
                    }`}
                    title={`${ongoingBookings.length} Ongoing Rides`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {ongoingBookings.length}
                  </span>
                )}
                {pendingPaymentBookings.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      activeNav === "all_bookings"
                        ? "bg-[#26231B] text-amber-400"
                        : "bg-amber-500 text-white"
                    }`}
                    title={`${pendingPaymentBookings.length} Pending Payments`}
                  >
                    ⌛ {pendingPaymentBookings.length}
                  </span>
                )}
                {!loadingBookings && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    activeNav === "all_bookings" ? "bg-[#26231B] text-[#FFC20E]" : "bg-white/15 text-white/70"
                  }`}>
                    {ongoingBookings.length + pendingPaymentBookings.length + completedBookings.length}
                  </span>
                )}
              </div>
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
                  activeNav === "individual_bookings" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B]"
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

            {/* Customers */}
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
                <span>Customers</span>
              </div>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeNav === "customers" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
              }`}>
                {loadingUsers ? "..." : customersWithMetrics.length}
              </span>
            </button>

            {/* Complaints & Deletions */}
            <button
              onClick={() => {
                setActiveNav("complaints");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "complaints"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span>Complaints &amp; Deletions</span>
              </div>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeNav === "complaints" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
              }`}>
                {loadingComplaints ? "..." : complaints.length}
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
                  activeNav === "vehicle_registrations" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B]"
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

            {/* Outside Employees / Partners */}
            <button
              onClick={() => {
                setActiveNav("outside_employees");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "outside_employees"
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
                <span>Outside Employees</span>
              </div>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeNav === "outside_employees" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
              }`}>
                {loadingOutsideEmployees ? "..." : outsideEmployees.length}
              </span>
            </button>

            {/* Top-up Slips */}
            <button
              onClick={() => {
                setActiveNav("topup_slips");
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left flex items-center justify-between cursor-pointer ${
                activeNav === "topup_slips"
                  ? "bg-[#FFC20E] text-[#26231B]"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span>Top-up Slips</span>
              </div>
              {!loadingTopupSlips && pendingTopupSlipsCount > 0 ? (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                  activeNav === "topup_slips" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B]"
                }`}>
                  {pendingTopupSlipsCount}
                </span>
              ) : (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeNav === "topup_slips" ? "bg-[#26231B] text-white" : "bg-white/15 text-white/80"
                }`}>
                  {loadingTopupSlips ? "..." : topupSlips.length}
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
                  activeNav === "contact_submissions" ? "bg-[#26231B] text-[#FFC20E]" : "bg-amber-400 text-[#26231B]"
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
                <span>Riders</span>
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
                {activeNav === "overview" && "Dashboard Overview"}
                {activeNav === "all_bookings" && (
                  allBookingsTab === "ongoing"
                    ? "All Bookings · Ongoing Rides (ක්‍රියාත්මක ගමන්වාර)"
                    : allBookingsTab === "pending_payment"
                    ? "All Bookings · Pending Payment (ගමන්වාරය අවසන් වූ · මුදල් අයවිය යුතු)"
                    : "All Bookings · Completed Bookings (සම්පූර්ණ වූ ගමන්වාර)"
                )}
                {activeNav === "individual_bookings" && "Individual Vehicle Bookings"}
                {activeNav === "online_bookings" && "Online / Live Lorry Bookings"}
                {activeNav === "customers" && "Customers"}
                {activeNav === "complaints" && "Complaints & Deletions"}
                {activeNav === "revenue" && "Revenue"}
                {activeNav === "vehicle_registrations" && "Vehicle & Partner Registrations"}
                {activeNav === "outside_employees" && "Outside Employees & Fleet Partners"}
                {activeNav === "topup_slips" && "Employee Top-up Bank Slips"}
                {activeNav === "contact_submissions" && "Contact Inquiries & Support"}
                {activeNav === "fleet" && "Fleet Lorries Management"}
                {activeNav === "riders" && "Riders Registry"}
                {activeNav === "settings" && "System & Payment Settings"}
              </h1>
              <p className="text-[11px] text-[#6F6A5A]">
                {activeNav === "all_bookings"
                  ? allBookingsTab === "ongoing"
                    ? "Live active dispatches in transit · Active during scheduled departure window"
                    : allBookingsTab === "pending_payment"
                    ? "Concluded dispatches with payment pending · Lorry & rider slot is already released"
                    : "Concluded & fully settled dispatches · Locked historical records"
                  : activeNav === "customers"
                  ? "Simple list of all registered and booked customers"
                  : activeNav === "complaints"
                  ? "Audit log of cancelled and deleted bookings with mandatory reasons"
                  : activeNav === "revenue"
                  ? "Individual & Live Lorry · Resets daily at 12:00 AM"
                  : activeNav === "vehicle_registrations"
                  ? "Incoming lorry partner applications from /register-vehicle"
                  : activeNav === "outside_employees"
                  ? "Outside partner tracking, wallet balance & 20% commission monitoring"
                  : activeNav === "topup_slips"
                  ? "Top-up bank transfer slips uploaded by outside drivers for balance recharge"
                  : activeNav === "contact_submissions"
                  ? "Direct customer inquiries & rate quotes from /contact"
                  : "Head Office Dispatch Operations"}
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {activeNav === "all_bookings" && allBookingsTab === "ongoing" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-mono font-bold text-emerald-800 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {ongoingBookings.length} Active On Road
                </span>
              </div>
            )}
            {activeNav === "all_bookings" && allBookingsTab === "pending_payment" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-mono font-bold text-amber-900 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  {pendingPaymentBookings.length} Payment Pending
                </span>
              </div>
            )}
            {activeNav === "all_bookings" && allBookingsTab === "completed" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-mono font-bold text-blue-900 whitespace-nowrap shrink-0">
                  {completedBookings.length} Concluded Trips
                </span>
              </div>
            )}
            {activeNav === "customers" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-xs font-mono font-bold text-[#26231B] whitespace-nowrap shrink-0">
                  {customersWithMetrics.length} Customers
                </span>
              </div>
            )}
            {activeNav === "complaints" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-mono font-bold text-red-900 whitespace-nowrap shrink-0">
                  {complaints.length} Audit Records
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
            <div className="px-4 py-3.5 rounded-lg bg-white border border-gray-300 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Action Required ({totalPendingCount} Pending)
                </h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  Allocate trip time, assign a rider, send a quote, or check payment slips.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {slipReviewCount > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("individual_bookings");
                      setStatusFilter("payment_submitted");
                    }}
                    className="px-3.5 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 cursor-pointer"
                  >
                    Review Payment Slips ({slipReviewCount})
                  </button>
                )}
                {individualBookings.filter((b) => b.status === "pending").length > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("individual_bookings");
                      setStatusFilter("pending");
                    }}
                    className="px-3.5 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-semibold hover:bg-gray-50 cursor-pointer"
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
                    className="px-3.5 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-semibold hover:bg-gray-50 cursor-pointer"
                  >
                    View Live Bookings ({pendingOnlineCount})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 1: DASHBOARD OVERVIEW                                 */}
          {/* ========================================================= */}
          {activeNav === "overview" && (
            <div className="flex flex-col gap-5">
              {/* Top 3 Cards: Today's Revenue, Ongoing Rides, & Unpaid Bookings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Card 1: Today's Revenue */}
                <div
                  onClick={() => {
                    setDashboardFilterMode((prev) => (prev === "today" ? "upcoming" : "today"));
                  }}
                  className={`bg-white border rounded-lg p-4 sm:p-5 transition-all cursor-pointer ${
                    dashboardFilterMode === "today"
                      ? "border-gray-900 ring-2 ring-gray-900 shadow-xs"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  title="Filter today's bookings"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900">Today&apos;s Revenue</h2>
                      {dashboardFilterMode === "today" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-900 text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-medium text-gray-500">
                      {revenueData.todayDateStr}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 font-mono tracking-tight">
                      Rs. {loadingBookings ? "..." : revenueData.todayRevenue.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 font-medium space-x-2">
                      <span>{loadingBookings ? "..." : revenueData.todayBookingsCount} {revenueData.todayBookingsCount === 1 ? "trip" : "trips"}</span>
                      <span>·</span>
                      <span>Month: <strong className="text-gray-900 font-mono font-semibold">Rs. {loadingBookings ? "..." : revenueData.thisMonthRevenue.toLocaleString()}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Ongoing Rides */}
                <div
                  onClick={() => {
                    setActiveNav("all_bookings");
                    setAllBookingsTab("ongoing");
                  }}
                  className={`bg-white border rounded-lg p-4 sm:p-5 transition-all cursor-pointer ${
                    dashboardFilterMode === "ongoing"
                      ? "border-emerald-600 ring-2 ring-emerald-600 shadow-xs bg-emerald-50/20"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  title="View active ongoing rides in transit"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900">Ongoing Rides</h2>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                        Live
                      </span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700">
                      In Transit
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 font-mono tracking-tight">
                        {loadingBookings ? "..." : ongoingBookings.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">on the road</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700 hover:underline">
                      View Ongoing →
                    </span>
                  </div>
                </div>

                {/* Card 3: Unpaid Bookings */}
                <div
                  onClick={() => {
                    setDashboardFilterMode((prev) => (prev === "unpaid" ? "upcoming" : "unpaid"));
                  }}
                  className={`bg-white border rounded-lg p-4 sm:p-5 transition-all cursor-pointer ${
                    dashboardFilterMode === "unpaid"
                      ? "border-orange-500 ring-2 ring-orange-500 shadow-xs bg-orange-50/20"
                      : "border-gray-300 hover:border-gray-400"
                  }`}
                  title="Filter unpaid bookings"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900">Unpaid Bookings</h2>
                      {dashboardFilterMode === "unpaid" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-600 text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-orange-600">
                      Payment Pending
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-extrabold text-orange-600 font-mono tracking-tight">
                        {loadingBookings ? "..." : unpaidBookings.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">pending</span>
                    </div>
                    <span className="text-xs font-bold text-orange-700 hover:underline">
                      {dashboardFilterMode === "unpaid" ? "✕ Show Upcoming" : "Filter Unpaid →"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Schedule Header & Filter Bar */}
              <div className="bg-white border border-gray-300 rounded-lg p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-gray-900">
                    Dispatch Schedule
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs font-mono font-bold">
                    {dashboardDispatchList.length}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  {/* Filter buttons */}
                  <div className="flex items-center rounded-md border border-gray-300 overflow-hidden bg-gray-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("upcoming")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                        dashboardFilterMode === "upcoming"
                          ? "bg-gray-900 text-white"
                          : "text-gray-700 hover:text-gray-900"
                      }`}
                    >
                      Upcoming ({upcomingBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("ongoing")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                        dashboardFilterMode === "ongoing"
                          ? "bg-emerald-600 text-white"
                          : "text-emerald-800 hover:text-emerald-900"
                      }`}
                    >
                      Ongoing ({ongoingBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("completed")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                        dashboardFilterMode === "completed"
                          ? "bg-blue-600 text-white"
                          : "text-blue-800 hover:text-blue-900"
                      }`}
                    >
                      Completed ({completedBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("unpaid")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                        dashboardFilterMode === "unpaid"
                          ? "bg-orange-600 text-white"
                          : "text-orange-800 hover:text-orange-900"
                      }`}
                    >
                      Unpaid ({unpaidBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("today")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                        dashboardFilterMode === "today"
                          ? "bg-gray-900 text-white"
                          : "text-gray-700 hover:text-gray-900"
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("all")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${
                        dashboardFilterMode === "all"
                          ? "bg-gray-900 text-white"
                          : "text-gray-700 hover:text-gray-900"
                      }`}
                    >
                      All
                    </button>
                  </div>

                  {/* Date range picker */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      aria-label="Filter from date"
                      value={dashboardDateFrom}
                      onChange={(e) => setDashboardDateFrom(e.target.value)}
                      className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                    />
                    <span className="text-gray-400 font-bold">–</span>
                    <input
                      type="date"
                      aria-label="Filter to date"
                      value={dashboardDateTo}
                      onChange={(e) => setDashboardDateTo(e.target.value)}
                      className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                    />
                    {(dashboardDateFrom || dashboardDateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDashboardDateFrom("");
                          setDashboardDateTo("");
                        }}
                        className="px-2 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer"
                        title="Clear date filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Chronological Dispatch Schedule List */}
              <div className="flex flex-col gap-3">
                {loadingBookings ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                    Loading dispatch schedule...
                  </div>
                ) : dashboardDispatchList.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                    {dashboardFilterMode === "unpaid"
                      ? "No unpaid bookings pending payment."
                      : dashboardFilterMode === "today"
                      ? `No bookings scheduled for today (${revenueData.todayDateStr}).`
                      : "No scheduled dispatch bookings found."}
                  </div>
                ) : (
                  dashboardDispatchList.map((b) => renderBookingDispatchCard(b, "dashboard"))
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB: ALL BOOKINGS (ONGOING, PENDING PAYMENT & COMPLETED)  */}
          {/* ========================================================= */}
          {activeNav === "all_bookings" && (
            <div className="flex flex-col gap-4">
              {/* 3 Navigation Tabs: Ongoing Rides, Pending Payment, Completed Bookings */}
              <div className="bg-white border border-gray-300 rounded-xl p-1.5 flex flex-wrap items-center gap-2 shadow-xs">
                {/* Tab 1: Ongoing Rides */}
                <button
                  type="button"
                  onClick={() => setAllBookingsTab("ongoing")}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    allBookingsTab === "ongoing"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-emerald-900 hover:text-emerald-950 hover:bg-emerald-50"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Ongoing Rides (ක්‍රියාත්මක)</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    allBookingsTab === "ongoing" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {ongoingBookings.length}
                  </span>
                </button>

                {/* Tab 2: Pending Payment */}
                <button
                  type="button"
                  onClick={() => setAllBookingsTab("pending_payment")}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    allBookingsTab === "pending_payment"
                      ? "bg-amber-500 text-white shadow-xs"
                      : "text-amber-900 hover:text-amber-950 hover:bg-amber-50"
                  }`}
                >
                  <span>⌛</span>
                  <span>Pending Payment (මුදල් අයවිය යුතු)</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    allBookingsTab === "pending_payment" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"
                  }`}>
                    {pendingPaymentBookings.length}
                  </span>
                </button>

                {/* Tab 3: Completed Bookings */}
                <button
                  type="button"
                  onClick={() => setAllBookingsTab("completed")}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    allBookingsTab === "completed"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-blue-900 hover:text-blue-950 hover:bg-blue-50"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <span>Completed Bookings (සම්පූර්ණ වූ)</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    allBookingsTab === "completed" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-900"
                  }`}>
                    {completedBookings.length}
                  </span>
                </button>
              </div>

              {/* TAB 1: ONGOING RIDES */}
              {allBookingsTab === "ongoing" && (
                <div className="flex flex-col gap-4">
              {/* Header & Filter Bar */}
              <div className="bg-white border border-gray-300 rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                  <div>
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <span>Ongoing Rides (ක්‍රියාත්මක ගමන්වාර)</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-mono font-bold">
                        {ongoingBookings.length}
                      </span>
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Actively in transit within departure time up to end time (+5m buffer)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search by ID, customer, lorry, rider, route..."
                    value={ongoingSearch}
                    onChange={(e) => setOngoingSearch(e.target.value)}
                    className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-gray-900 w-64 max-w-full"
                  />
                  {ongoingSearch && (
                    <button
                      type="button"
                      onClick={() => setOngoingSearch("")}
                      className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-900 font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="flex flex-col gap-3">
                {loadingBookings ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                    Loading ongoing dispatches...
                  </div>
                ) : filteredOngoingBookings.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                    {ongoingSearch
                      ? "No ongoing rides match your search."
                      : "No active ongoing rides at this moment. Scheduled trips appear here between departure start time and end time (+5m buffer)."}
                  </div>
                ) : (
                  filteredOngoingBookings.map((b) => renderBookingDispatchCard(b, "ongoing"))
                )}
              </div>
                </div>
              )}

              {/* TAB 2: PENDING PAYMENT */}
              {allBookingsTab === "pending_payment" && (
                <div className="flex flex-col gap-4">
                  {/* Header & Filter Bar */}
                  <div className="bg-white border border-gray-300 rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <div>
                        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                          <span>Pending Payment (ගමන්වාරය අවසන් වූ · මුදල් අයවිය යුතු)</span>
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-xs font-mono font-bold">
                            {pendingPaymentBookings.length}
                          </span>
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Physical journey concluded · Lorry &amp; rider time slots released · Settle balance to complete
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search by ID, customer, lorry, rider, route..."
                        value={pendingPaymentSearch}
                        onChange={(e) => setPendingPaymentSearch(e.target.value)}
                        className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-gray-900 w-64 max-w-full"
                      />
                      {pendingPaymentSearch && (
                        <button
                          type="button"
                          onClick={() => setPendingPaymentSearch("")}
                          className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-900 font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* List */}
                  <div className="flex flex-col gap-3">
                    {loadingBookings ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                        Loading pending payment dispatches...
                      </div>
                    ) : filteredPendingPaymentBookings.length === 0 ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                        {pendingPaymentSearch
                          ? "No bookings match your search."
                          : "No concluded rides with pending payment. All concluded trips are fully settled!"}
                      </div>
                    ) : (
                      filteredPendingPaymentBookings.map((b) => renderBookingDispatchCard(b, "pending_payment"))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: COMPLETED BOOKINGS */}
              {allBookingsTab === "completed" && (
                <div className="flex flex-col gap-4">
              {/* Header & Filter Bar */}
              <div className="bg-white border border-gray-300 rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <span>Completed Bookings (සම්පූර්ණ වූ ගමන්වාර)</span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-mono font-bold">
                      {completedBookings.length}
                    </span>
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Concluded dispatches · Lorry &amp; rider time slots released and available for new bookings
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Search by ID, customer, lorry, rider, route..."
                    value={completedSearch}
                    onChange={(e) => setCompletedSearch(e.target.value)}
                    className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-gray-900 w-56 max-w-full"
                  />

                  {/* Date range picker */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      aria-label="Completed from date"
                      value={completedDateFrom}
                      onChange={(e) => setCompletedDateFrom(e.target.value)}
                      className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                    />
                    <span className="text-gray-400 font-bold">–</span>
                    <input
                      type="date"
                      aria-label="Completed to date"
                      value={completedDateTo}
                      onChange={(e) => setCompletedDateTo(e.target.value)}
                      className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                    />
                    {(completedDateFrom || completedDateTo || completedSearch) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompletedDateFrom("");
                          setCompletedDateTo("");
                          setCompletedSearch("");
                        }}
                        className="px-2 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer"
                        title="Clear filters"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* List */}
              <div className="flex flex-col gap-3">
                {loadingBookings ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                    Loading completed bookings...
                  </div>
                ) : filteredCompletedBookings.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                    {completedSearch || completedDateFrom || completedDateTo
                      ? "No completed bookings match your filter criteria."
                      : "No completed bookings recorded yet."}
                  </div>
                ) : (
                  filteredCompletedBookings.map((b) => renderBookingDispatchCard(b, "completed"))
                )}
              </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: INDIVIDUAL VEHICLE BOOKINGS                        */}
          {/* ========================================================= */}
          {activeNav === "individual_bookings" && (
            <div className="flex flex-col gap-4">
              {/* Filter & Search Bar */}
              <div className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      Individual Bookings ({individualBookings.length})
                    </h2>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Review customer requests, assign a trip time slot and rider, and approve payment.
                    </p>
                  </div>

                  {/* Status Filter */}
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
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
                        className={`px-3 py-1.5 rounded-md font-medium cursor-pointer border ${
                          statusFilter === st.key
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {st.label}
                        {st.key === "payment_submitted" && slipReviewCount > 0 ? ` (${slipReviewCount})` : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Box + Accordion Toolbar */}
                <div className="pt-3.5 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <label htmlFor="individual-booking-search" className="text-sm font-medium text-gray-700 shrink-0">
                      Search:
                    </label>
                    <div className="relative flex-1 min-w-0 max-w-lg">
                      <input
                        id="individual-booking-search"
                        type="text"
                        aria-label="Search individual bookings by name, phone, booking ID, lorry plate, or city"
                        value={individualSearch}
                        onChange={(e) => setIndividualSearch(e.target.value)}
                        className="w-full px-3 py-2 pr-8 rounded-md border border-gray-300 bg-white focus:border-gray-900 focus:outline-none text-sm text-gray-900"
                      />
                      {individualSearch.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIndividualSearch("")}
                          aria-label="Clear booking search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 text-sm font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="text-sm text-gray-600">
                      Showing <strong className="text-gray-900">{filteredIndividualBookings.length}</strong> of{" "}
                      <strong className="text-gray-900">{individualBookings.length}</strong>
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
                          className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-sm font-medium cursor-pointer"
                        >
                          {allExpanded ? "Collapse All" : "Expand All"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* LIST VIEW OF INDIVIDUAL BOOKINGS */}
              <div className="flex flex-col gap-4">
                  {loadingBookings ? (
                    <div className="p-10 text-center rounded-lg bg-white border border-gray-300">
                      <p className="text-sm font-medium text-gray-600">Loading bookings...</p>
                    </div>
                  ) : filteredIndividualBookings.length === 0 ? (
                    <div className="p-10 text-center rounded-lg bg-white border border-gray-300 flex flex-col items-center gap-3">
                      {individualSearch.trim() && statusFilter !== "all" && individualSearchMatchesAnyStatusCount > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-gray-900">
                            No bookings match &ldquo;{individualSearch.trim()}&rdquo; in this tab, but{" "}
                            {individualSearchMatchesAnyStatusCount} match(es) exist across all statuses.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => setStatusFilter("all")}
                              className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold cursor-pointer"
                            >
                              Show All {individualSearchMatchesAnyStatusCount} Matches
                            </button>
                            <button
                              type="button"
                              onClick={() => setIndividualSearch("")}
                              className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-medium cursor-pointer hover:bg-gray-50"
                            >
                              Clear Search
                            </button>
                          </div>
                        </>
                      ) : individualSearch.trim() ? (
                        <>
                          <p className="text-sm text-gray-600">
                            No individual bookings matched &ldquo;{individualSearch.trim()}&rdquo;.
                          </p>
                          <button
                            type="button"
                            onClick={() => setIndividualSearch("")}
                            className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold cursor-pointer"
                          >
                            Clear Search
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-gray-600">
                            No individual bookings match this filter.
                          </p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {statusFilter !== "all" && individualBookings.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setStatusFilter("all")}
                                className="px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-medium cursor-pointer hover:bg-gray-50"
                              >
                                Show All ({individualBookings.length})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleOpenManualModal}
                              className="px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold cursor-pointer"
                            >
                              + Manual Booking
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
                        b.paymentMethod === "cash_manual" ||
                        b.paymentSlipStatus === "manual_approved" ||
                        b.paymentSlipStatus === "cash_pending";
                      const isCashPending = b.paymentSlipStatus === "cash_pending";
                      const isCashPaid =
                        b.paymentSlipStatus === "manual_approved" ||
                        (b.paymentMethod === "cash_manual" && Boolean(b.paymentApprovedAt && b.paymentApprovedAt > 0));
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
                          className="rounded-lg bg-white border border-gray-300 overflow-hidden shadow-xs"
                        >
                          {/* Dark Booking Header Bar */}
                          <button
                            type="button"
                            onClick={() => toggleIndividualBookingCard(b.id, isExpanded)}
                            aria-expanded={isExpanded}
                            aria-label={`${
                              isExpanded ? "Minimize booking details" : "Open booking details"
                            } for ${b.id}`}
                            className="w-full text-left border-0 bg-gray-900 text-white px-4 py-3 sm:px-5 hover:bg-gray-800 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="font-mono text-sm font-bold px-2.5 py-0.5 rounded bg-white/10 border border-white/20 text-white">
                                {b.id}
                              </span>
                              <span className="text-base font-bold text-white">
                                {b.customerName}
                              </span>
                              {b.customerPhone && (
                                <span className="text-sm font-mono text-gray-300">
                                  ({b.customerPhone})
                                </span>
                              )}
                              {b.customerIdNumber && (
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 text-amber-300 border border-amber-300/30">
                                  NIC: {b.customerIdNumber}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                              {b.quotedAmount !== undefined && (
                                <span className="text-sm font-mono font-bold text-amber-400">
                                  Rs. {b.quotedAmount.toLocaleString()}
                                </span>
                              )}
                              {typeof b.pendingAmount === "number" && b.pendingAmount > 0 && typeof b.advanceAmount === "number" && b.advanceAmount > 0 ? (
                                <>
                                  <span className="text-xs font-semibold text-emerald-200 bg-emerald-950/80 border border-emerald-600/70 px-2.5 py-1 rounded-md">
                                    Paid Rs. {b.advanceAmount.toLocaleString()}
                                  </span>
                                  <span className="text-xs font-semibold text-amber-200 bg-amber-950/80 border border-amber-600/70 px-2.5 py-1 rounded-md">
                                    ⌛ Pending Rs. {b.pendingAmount.toLocaleString()}
                                  </span>
                                </>
                              ) : typeof b.pendingAmount === "number" && b.pendingAmount > 0 ? (
                                <span className="text-xs font-semibold text-amber-200 bg-amber-950/80 border border-amber-600/70 px-2.5 py-1 rounded-md">
                                  ⌛ Pending Rs. {b.pendingAmount.toLocaleString()}
                                </span>
                              ) : isCashManual ? (
                                isCashPending ? (
                                  <span className="text-xs font-semibold text-amber-200 bg-amber-950/80 border border-amber-600/70 px-2.5 py-1 rounded-md">
                                    Pending
                                  </span>
                                ) : isCashPaid ? (
                                  <span className="text-xs font-semibold text-emerald-200 bg-emerald-950/80 border border-emerald-600/70 px-2.5 py-1 rounded-md">
                                    ✓ Paid
                                  </span>
                                ) : null
                              ) : null}
                              <StatusBadge status={b.status} />
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/20 bg-white/10 text-xs font-semibold text-white hover:bg-white/20 transition-colors">
                                {isExpanded ? "Hide" : "Show Details"}
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className={isExpanded ? "rotate-180" : "rotate-0"}
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </span>
                            </div>
                          </button>

                          {/* Clean 4-column Scannable Summary Row */}
                          <div
                            onClick={() => toggleIndividualBookingCard(b.id, isExpanded)}
                            className="bg-gray-50/80 px-4 py-3 sm:px-5 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm cursor-pointer hover:bg-gray-100/60 transition-colors"
                          >
                            <div>
                              <div className="text-xs font-medium text-gray-500 flex items-center justify-between">
                                <span>Route</span>
                                {b.distanceKm ? (
                                  <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[10px]">
                                    {b.distanceKm} km
                                  </span>
                                ) : null}
                              </div>
                              <div className="font-semibold text-gray-900 mt-0.5">
                                {b.pickupCity} → {b.deliveryCity}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-500">Trip Date &amp; Time</div>
                              <div className="text-gray-900 mt-0.5">
                                <span className="font-medium">{bookedDatesDisplay}</span>
                                {" · "}
                                {b.startTime && b.endTime ? (
                                  <span className="font-semibold text-gray-900">
                                    {formatTimeDurationLabel(b.startTime, b.endTime)}
                                  </span>
                                ) : (
                                  <span className="text-amber-800 font-medium">Time not set</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-500">Lorry &amp; Rider</div>
                              <div className="text-gray-900 mt-0.5">
                                <span className="font-medium">
                                  {b.assignedPlate || "No Lorry"} ({b.vehicleType})
                                </span>
                                {b.assignedDriverName ? ` · ${b.assignedDriverName}` : " · No rider"}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-500">Requested On</div>
                              <div className="text-gray-900 mt-0.5">
                                {requestTiming ? requestTiming.display : "Not recorded"}
                              </div>
                            </div>
                          </div>

                          {/* Collapsible Bottom Booking Details & Actions */}
                          {isExpanded && (
                            <div className="divide-y divide-gray-200">
                              {/* Customer & Trip Summary Table Layout */}
                              <div className="px-4 py-4 sm:px-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 mb-2.5">
                                    Customer Details
                                  </h4>
                                  <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3">
                                    <dt className="text-gray-500">Name</dt>
                                    <dd className="font-semibold text-gray-900">{b.customerName}</dd>

                                    <dt className="text-gray-500">Phone</dt>
                                    <dd>
                                      {b.customerPhone ? (
                                        <a
                                          href={`tel:${String(b.customerPhone || "").replace(/\s+/g, "")}`}
                                          className="font-mono font-semibold text-gray-900 underline"
                                        >
                                          {b.customerPhone}
                                        </a>
                                      ) : (
                                        <span className="text-gray-500">Not provided</span>
                                      )}
                                    </dd>

                                    <dt className="text-gray-500">Requested</dt>
                                    <dd className="text-gray-900">
                                      {requestTiming ? `${requestTiming.date} at ${requestTiming.time}` : "Not recorded"}
                                    </dd>

                                    {quotedTiming && (
                                      <>
                                        <dt className="text-gray-500">Quoted</dt>
                                        <dd className="text-gray-900">{quotedTiming.display}</dd>
                                      </>
                                    )}
                                    {slipTiming && (
                                      <>
                                        <dt className="text-gray-500">Slip Uploaded</dt>
                                        <dd className="text-gray-900">{slipTiming.display}</dd>
                                      </>
                                    )}
                                    {approvedTiming && (
                                      <>
                                        <dt className="text-gray-500">Approved</dt>
                                        <dd className="text-gray-900">{approvedTiming.display}</dd>
                                      </>
                                    )}

                                    {b.packageDetails && (
                                      <>
                                        <dt className="text-gray-500">Notes</dt>
                                        <dd className="text-gray-900">{b.packageDetails}</dd>
                                      </>
                                    )}
                                  </dl>
                                </div>

                                <div>
                                  <h4 className="text-sm font-bold text-gray-900 mb-2.5">
                                    Trip &amp; Cargo Details
                                  </h4>
                                  <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3">
                                    <dt className="text-gray-500">Route</dt>
                                    <dd className="font-semibold text-gray-900">
                                      {b.pickupCity} → {b.deliveryCity}
                                      {b.distanceKm ? (
                                        <span className="ml-2 font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs inline-block">
                                          🛣️ {b.distanceKm} km
                                        </span>
                                      ) : null}
                                    </dd>

                                    <dt className="text-gray-500">Trip Date(s)</dt>
                                    <dd className="font-medium text-gray-900">{bookedDatesDisplay}</dd>

                                    <dt className="text-gray-500">Lorry</dt>
                                    <dd className="text-gray-900">
                                      {b.assignedPlate || "Not assigned"} ({b.vehicleType})
                                    </dd>

                                    {b.cargoNature && (
                                      <>
                                        <dt className="text-gray-500">Goods</dt>
                                        <dd className="text-gray-900">{b.cargoNature}</dd>
                                      </>
                                    )}

                                    {(b.cargoWeight || b.helpersCount !== undefined) && (
                                      <>
                                        <dt className="text-gray-500">Weight / Helpers</dt>
                                        <dd className="text-gray-900">
                                          {b.cargoWeight || "—"}
                                          {b.helpersCount !== undefined ? ` · Helpers: ${b.helpersCount}` : ""}
                                        </dd>
                                      </>
                                    )}

                                    {b.assignedDriverName && (
                                      <>
                                        <dt className="text-gray-500">Assigned Rider</dt>
                                        <dd className="font-semibold text-green-800">
                                          {b.assignedDriverName}
                                          {b.assignedDriverPhone && (
                                            <a
                                              href={`tel:${String(b.assignedDriverPhone).replace(/\s+/g, "")}`}
                                              className="ml-2 font-mono underline"
                                            >
                                              {b.assignedDriverPhone}
                                            </a>
                                          )}
                                        </dd>
                                      </>
                                    )}
                                  </dl>
                                </div>
                              </div>

                              {/* Schedule Time Duration & Mandatory Rider Allocation Panel */}
                              {(() => {
                                const draft = getScheduleDraft(b);
                                const draftDates =
                                  draft.isMultiDate && draft.endDate
                                    ? getDatesBetween(draft.date, draft.endDate)
                                    : [draft.date];
                                const draftTimeCheck = validateScheduleTimeAndDates(
                                  draft.date,
                                  draft.startTime,
                                  draft.isMultiDate && draft.endDate ? draft.endDate : draft.date,
                                  draft.endTime,
                                  draftDates
                                );
                                const draftConflict =
                                  draftTimeCheck.valid && draft.date
                                    ? findBookingScheduleConflict(
                                        {
                                          excludeBookingId: b.id,
                                          date: draftTimeCheck.startDate,
                                          dates: draftTimeCheck.dates,
                                          startTime: draftTimeCheck.startTime,
                                          endTime: draftTimeCheck.endTime,
                                          assignedPlate: draft.plate,
                                          assignedLorryId: draft.lorryId,
                                          assignedDriverId: draft.driverId,
                                          assignedDriverName: draft.driverName,
                                          assignedDriverPhone: draft.driverPhone,
                                          bookingType: "individual_vehicle",
                                        },
                                        bookings
                                      )
                                    : null;
                                const riderSelected = hasAssignedRider({
                                  assignedDriverId: draft.driverId,
                                  assignedDriverName: draft.driverName,
                                  assignedDriverPhone: draft.driverPhone,
                                });

                                return (
                                  <div className="px-4 py-4 sm:px-5 flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <h4 className="text-sm font-bold text-gray-900">
                                          Step 1: Assign Time Duration &amp; Rider
                                        </h4>
                                        <p className="text-sm text-gray-600 mt-0.5">
                                          Set the trip date, start/end time, lorry, and rider. Overlapping schedules are blocked.
                                        </p>
                                      </div>
                                      {b.startTime && b.endTime && (
                                        <span className="text-sm font-mono font-semibold text-green-800 bg-green-50 border border-green-300 px-3 py-1 rounded-md">
                                          Allocated: {formatJourneyScheduleSummary(b.date, b.startTime, (b.dates && b.dates.length > 1 ? b.dates[b.dates.length - 1] : b.date), b.endTime, b.dates)}
                                        </span>
                                      )}
                                    </div>

                                    {/* Multi-Day Booking Toggle */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md bg-blue-50/70 border border-blue-200">
                                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                          type="checkbox"
                                          aria-label={`Toggle individual multi-day booking for ${b.id}`}
                                          checked={Boolean(draft.isMultiDate)}
                                          onChange={(e) => {
                                            const checked = e.target.checked;
                                            const sDate = draft.date || new Date().toISOString().split("T")[0];
                                            const defaultEndDate = checked
                                              ? (draft.endDate && draft.endDate > sDate ? draft.endDate : addDaysToYYYYMMDD(sDate, 1))
                                              : sDate;
                                            updateScheduleDraft(b, {
                                              isMultiDate: checked,
                                              endDate: defaultEndDate,
                                              dates: checked ? getDatesBetween(sDate, defaultEndDate) : [sDate],
                                            });
                                          }}
                                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                        />
                                        <span className="text-xs font-bold text-gray-900">
                                          Multi-Day Booking (දින කිහිපයක ගමනක්)
                                        </span>
                                      </label>
                                      {draft.isMultiDate && (
                                        <span className="text-[11px] font-mono font-bold text-blue-900 bg-white border border-blue-300 px-2.5 py-0.5 rounded-full shadow-2xs">
                                          {getDatesBetween(draft.date, draft.endDate || draft.date).length} Days Journey
                                        </span>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          {draft.isMultiDate ? "Departure Date *" : "Trip Date *"}
                                        </label>
                                        <input
                                          type="date"
                                          aria-label={`Schedule date for ${b.id}`}
                                          value={draft.date}
                                          onChange={(e) => {
                                            const newStartDate = e.target.value;
                                            const newEndDate = draft.isMultiDate
                                              ? (draft.endDate && draft.endDate >= newStartDate ? draft.endDate : addDaysToYYYYMMDD(newStartDate, 1))
                                              : newStartDate;
                                            updateScheduleDraft(b, {
                                              date: newStartDate,
                                              endDate: newEndDate,
                                              dates: draft.isMultiDate ? getDatesBetween(newStartDate, newEndDate) : [newStartDate],
                                            });
                                          }}
                                          className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          {draft.isMultiDate ? "Departure Time *" : "Start Time *"}
                                        </label>
                                        <input
                                          type="time"
                                          aria-label={`Start time for ${b.id}`}
                                          value={draft.startTime}
                                          onChange={(e) => updateScheduleDraft(b, { startTime: e.target.value })}
                                          className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                        />
                                      </div>
                                      {draft.isMultiDate && (
                                        <div>
                                          <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Delivery Date *
                                          </label>
                                          <input
                                            type="date"
                                            min={draft.date}
                                            aria-label={`Schedule delivery end date for ${b.id}`}
                                            value={draft.endDate || draft.date}
                                            onChange={(e) => {
                                              const newEndDate = e.target.value;
                                              updateScheduleDraft(b, {
                                                endDate: newEndDate,
                                                dates: getDatesBetween(draft.date, newEndDate),
                                              });
                                            }}
                                            className="w-full px-3 py-2.5 rounded-md border border-blue-400 bg-blue-50/30 text-sm font-mono font-bold text-gray-900 focus:border-blue-700 focus:outline-none"
                                          />
                                        </div>
                                      )}
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          {draft.isMultiDate ? "Delivery Time *" : "End Time *"}
                                        </label>
                                        <input
                                          type="time"
                                          aria-label={`End time for ${b.id}`}
                                          value={draft.endTime}
                                          onChange={(e) => updateScheduleDraft(b, { endTime: e.target.value })}
                                          className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                                          <span>Distance (කි.මී.)</span>
                                          <span className="text-[11px] text-blue-600 font-mono font-bold">KM</span>
                                        </label>
                                        <input
                                          type="number"
                                          min="1"
                                          step="0.1"
                                          placeholder="e.g. 120"
                                          aria-label={`Distance in km for ${b.id}`}
                                          value={draft.distanceKm || ""}
                                          onChange={(e) => updateScheduleDraft(b, { distanceKm: e.target.value })}
                                          className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Lorry (Vehicle) *
                                        </label>
                                        <select
                                          aria-label={`Schedule vehicle for ${b.id}`}
                                          value={draft.plate}
                                          onChange={(e) => {
                                            const selPlate = e.target.value;
                                            const matchedV = fleetVehicles.find((v) => v.plate === selPlate);
                                            updateScheduleDraft(b, {
                                              plate: selPlate,
                                              lorryId:
                                                matchedV?.id ||
                                                `lorry-${normalizePlate(selPlate).toLowerCase()}`,
                                            });
                                          }}
                                          className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                                        >
                                          <option value="">Select Lorry</option>
                                          {fleetVehicles.map((v) => (
                                            <option key={v.id || v.plate} value={v.plate}>
                                              {v.plate} ({v.vehicleType})
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                          Assign Rider *
                                        </label>
                                        <select
                                          aria-label={`Schedule rider for ${b.id}`}
                                          value={draft.driverName}
                                          onChange={(e) => {
                                            const drv = drivers.find((d) => d.name === e.target.value);
                                            updateScheduleDraft(b, {
                                              driverId: drv?.driverId || "",
                                              driverName: drv?.name || e.target.value,
                                              driverPhone: drv?.phone || "",
                                            });
                                          }}
                                          className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                                        >
                                          <option value="">Select Rider</option>
                                          {drivers.map((d) => (
                                            <option key={d.driverId} value={d.name}>
                                              {d.name} ({d.driverId}) - {d.phone}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>

                                    {draftConflict?.hasConflict ? (
                                      <div className="px-3.5 py-2.5 rounded-md bg-red-50 border border-red-300 text-sm font-semibold text-red-800">
                                        {draftConflict.message}
                                      </div>
                                    ) : draft.startTime || draft.endTime ? (
                                      !draftTimeCheck.valid ? (
                                        <div className="px-3.5 py-2.5 rounded-md bg-amber-50 border border-amber-300 text-sm font-medium text-amber-900">
                                          {draftTimeCheck.error}
                                        </div>
                                      ) : !riderSelected ? (
                                        <div className="px-3.5 py-2.5 rounded-md bg-amber-50 border border-amber-300 text-sm font-medium text-amber-900">
                                          Select a Rider to complete schedule allocation.
                                        </div>
                                      ) : (
                                        <div className="px-3.5 py-2.5 rounded-md bg-green-50 border border-green-300 text-sm font-medium text-green-800">
                                          Slot Available: {draftTimeCheck.isMultiDate
                                            ? `${draftTimeCheck.startDate} ${formatTime12h(draftTimeCheck.startTime)} → ${draftTimeCheck.endDate} ${formatTime12h(draftTimeCheck.endTime)} (${draftTimeCheck.daysCount} Days)`
                                            : `${draftTimeCheck.startDate} · ${formatTimeDurationLabel(draftTimeCheck.startTime, draftTimeCheck.endTime)}`} · {draft.plate} · Rider: {draft.driverName}
                                        </div>
                                      )
                                    ) : null}

                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        disabled={actionLoading === b.id || Boolean(draftConflict?.hasConflict)}
                                        onClick={() => handleSaveBookingSchedule(b)}
                                        className="px-5 py-2.5 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
                                      >
                                        {actionLoading === b.id
                                          ? "Saving..."
                                          : ["accepted", "booked"].includes(b.status)
                                          ? "Save & Assign Rider"
                                          : "Save Time & Rider"}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Pricing & Payment Section */}
                              {(b.status === "pending" ||
                                editingQuoteId === b.id ||
                                b.status === "awaiting_payment" ||
                                (isPaymentLocked && isCashManual && !hasStoredSlip && !b.paymentSlipDeletedAt) ||
                                hasStoredSlip ||
                                (b.paymentSlipDeletedAt && b.paymentSlipStatus === "deleted")) && (
                                <div className="px-4 py-4 sm:px-5 flex flex-col gap-3">
                                  <h4 className="text-sm font-bold text-gray-900">
                                    Step 2: Amount &amp; Payment
                                  </h4>

                                  {(b.status === "pending" || editingQuoteId === b.id) && (
                                    <div className="flex flex-col gap-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm text-gray-600">
                                          Send the quote amount to request customer payment, or approve Cash payment directly.
                                        </p>
                                        {editingQuoteId === b.id && (
                                          <button
                                            type="button"
                                            onClick={() => setEditingQuoteId(null)}
                                            className="text-sm font-semibold text-gray-700 hover:text-gray-900 underline cursor-pointer"
                                          >
                                            Cancel Edit
                                          </button>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                                        <div className="sm:col-span-4">
                                          <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Amount (LKR) *
                                          </label>
                                          <input
                                            type="number"
                                            min="1"
                                            value={quoteDraft.amount}
                                            onChange={(e) =>
                                              setQuoteInputs((prev) => ({
                                                ...prev,
                                                [b.id]: { ...quoteDraft, amount: e.target.value },
                                              }))
                                            }
                                            className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                          />
                                        </div>
                                        <div className="sm:col-span-8">
                                          <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Payment Note (Optional)
                                          </label>
                                          <input
                                            type="text"
                                            value={quoteDraft.note}
                                            onChange={(e) =>
                                              setQuoteInputs((prev) => ({
                                                ...prev,
                                                [b.id]: { ...quoteDraft, note: e.target.value },
                                              }))
                                            }
                                            className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                                          />
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center justify-end gap-2.5">
                                        <button
                                          type="button"
                                          disabled={actionLoading === b.id}
                                          onClick={() => handleSendQuote(b)}
                                          className="px-5 py-2.5 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
                                        >
                                          {actionLoading === b.id ? "Sending..." : "Send Amount & Request Pay"}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actionLoading === b.id}
                                          onClick={() => openPaymentApprovalModal(b)}
                                          className="px-4 py-2.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-sm font-semibold cursor-pointer disabled:opacity-50"
                                        >
                                          Approve Payment
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {b.status === "awaiting_payment" && editingQuoteId !== b.id && (
                                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm bg-gray-50 border border-gray-200 rounded-md px-4 py-3">
                                      <div className="flex flex-col gap-0.5">
                                        <span className="font-semibold text-gray-900">
                                          Waiting for customer payment slip — Quoted Rs. {(b.quotedAmount || 0).toLocaleString()}
                                        </span>
                                        {b.quoteNote && (
                                          <span className="text-sm text-gray-600">Note: {b.quoteNote}</span>
                                        )}
                                        {b.paymentSlipStatus === "rejected" && b.paymentRejectReason && (
                                          <span className="text-sm text-red-700 font-semibold">
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
                                          className="px-3.5 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-medium hover:bg-gray-50 cursor-pointer"
                                        >
                                          Edit Amount
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actionLoading === b.id}
                                          onClick={() => openPaymentApprovalModal(b)}
                                          className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
                                        >
                                          Approve Payment
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {(isCashPending || (typeof b.pendingAmount === "number" && b.pendingAmount > 0)) && !hasStoredSlip && !b.paymentSlipDeletedAt && (
                                    <div className="px-4 py-3.5 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                          <span className="font-bold flex items-center gap-1.5 text-amber-900">
                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                                            Payment Pending: Balance Due Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()}
                                          </span>
                                          <p className="text-xs text-amber-800 mt-0.5">
                                            Total: <span className="font-bold">Rs. {(b.quotedAmount || 0).toLocaleString()}</span>
                                            {typeof b.advanceAmount === "number" && b.advanceAmount > 0 ? (
                                              <>
                                                {" · "}Advance Paid: <span className="font-bold text-green-800">Rs. {b.advanceAmount.toLocaleString()}</span> ({b.paymentMethod === "bank_transfer" ? `Bank: ${b.paymentBankUsed || "Bank"}` : "Cash"})
                                              </>
                                            ) : (
                                              " · Full payment pending"
                                            )}
                                            {b.quoteNote && ` · Note: ${b.quoteNote}`}
                                          </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={actionLoading === b.id}
                                            onClick={() => openSettleBalanceModal(b)}
                                            className="px-3.5 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-xs font-semibold cursor-pointer shadow-sm transition-all"
                                            title="Settle remaining balance"
                                          >
                                            💳 Settle Balance (Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()})
                                          </button>
                                          <button
                                            type="button"
                                            disabled={actionLoading === b.id}
                                            onClick={() => openPaymentApprovalModal(b)}
                                            className="px-3 py-2 rounded-md border border-amber-300 bg-white hover:bg-amber-100 text-amber-950 text-xs font-medium cursor-pointer"
                                          >
                                            Update Payment
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {isCashPaid && (!b.pendingAmount || b.pendingAmount === 0) && !hasStoredSlip && !b.paymentSlipDeletedAt && (
                                    <div className="px-4 py-3 rounded-md bg-green-50 border border-green-300 text-sm text-green-900">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                          <span className="font-semibold block">
                                            ✓ Fully Paid &amp; Counted into Revenue: <strong>Rs. {(b.quotedAmount || 0).toLocaleString()}</strong>
                                          </span>
                                          <span className="text-xs text-green-800 mt-0.5 block">
                                            {typeof b.advanceAmount === "number" && b.advanceAmount > 0 && b.finalPaymentMethod ? (
                                              <span>
                                                Advance: Rs. {b.advanceAmount.toLocaleString()} via {b.paymentMethod === "bank_transfer" ? b.paymentBankUsed || "Bank" : "Cash"} + Balance via {b.finalPaymentMethod === "bank_transfer" ? b.finalPaymentBankUsed || "Bank" : "Cash"}
                                              </span>
                                            ) : b.paymentBankUsed ? (
                                              <span>Paid via {b.paymentBankUsed}</span>
                                            ) : (
                                              <span>Paid in Cash</span>
                                            )}
                                            {b.quoteNote && ` · Note: ${b.quoteNote}`}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            disabled={actionLoading === b.id}
                                            onClick={() => openPaymentApprovalModal(b)}
                                            className="px-3 py-1.5 rounded-md border border-green-300 bg-white hover:bg-green-100 text-green-900 text-xs font-medium cursor-pointer"
                                          >
                                            Edit Payment
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {(hasStoredSlip || (b.paymentSlipDeletedAt && b.paymentSlipStatus === "deleted")) && (
                                    <div className="px-4 py-3 rounded-md bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-3 text-sm">
                                      {hasStoredSlip ? (
                                        <>
                                          <div className="flex flex-col gap-0.5">
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="px-2 py-0.5 rounded bg-gray-900 text-white text-xs font-mono font-bold">
                                                {isPdfSlip ? "PDF" : "IMAGE"}
                                              </span>
                                              <span className="font-semibold text-gray-900">
                                                {b.paymentSlipName || "Payment Slip"}
                                              </span>
                                              {b.paymentSlipSize ? (
                                                <span className="text-xs text-gray-600 font-mono">
                                                  ({Math.max(1, Math.round(b.paymentSlipSize / 1024))} KB)
                                                </span>
                                              ) : null}
                                            </div>
                                            <div className="text-sm text-gray-600">
                                              {b.paymentBankUsed ? `Paid to: ${b.paymentBankUsed}` : "Uploaded by customer"}
                                              {b.status === "payment_submitted" && (
                                                <span className="ml-2 text-gray-900 font-semibold">
                                                  · Pending review
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => openSlipReviewModal(b)}
                                              className="px-3.5 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer"
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
                                              className="px-3.5 py-2 rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-50 text-sm font-medium cursor-pointer"
                                            >
                                              Delete Slip
                                            </button>
                                          </div>
                                        </>
                                      ) : (
                                        <span className="text-sm text-gray-600">
                                          Payment slip reviewed and deleted from database.
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Footer Stage Override & Actions */}
                              <div className="px-4 py-4 sm:px-5 bg-gray-50 flex flex-col gap-3 text-sm">
                                {/* 8-Stage Clickboxes (Progress Stepper) */}
                                {(() => {
                                  const currentStatus = (b.status === "booked" ? "accepted" : b.status) as BookingStatus;
                                  const currentProgressIdx = PROGRESS_KEYS.indexOf(currentStatus);
                                  const isBookingCancelled = currentStatus === "cancelled";

                                  const isCashPending = b.paymentSlipStatus === "cash_pending";
                                  const isPaymentApproved =
                                    !isCashPending &&
                                    (b.paymentSlipStatus === "manual_approved" ||
                                     b.paymentSlipStatus === "approved" ||
                                     Boolean(b.paymentApprovedAt && b.paymentApprovedAt > 0));
                                  const isPaymentPending = isCashPending || !isPaymentApproved;
                                  const isPaymentPendingWarning = isPaymentPending && (currentProgressIdx >= 3 || isCashPending);

                                  return (
                                    <div className="w-full">
                                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                          Stage Selection (ක්ලික් කර වෙනස් කරන්න):
                                        </span>
                                        <div className="flex items-center gap-2">
                                          {isPaymentPendingWarning && (
                                            <span className="text-[11px] font-semibold text-orange-800 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-md">
                                              Payment Pending
                                            </span>
                                          )}
                                          <span className="text-xs text-gray-500 font-medium">
                                            Current: <strong className="text-gray-900">{BOOKING_STAGES.find((s) => s.key === currentStatus)?.label || b.status}</strong>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                                        {BOOKING_STAGES.map((st) => {
                                          const isCancelledStage = st.key === "cancelled";
                                          const stageProgressIdx = PROGRESS_KEYS.indexOf(st.key);
                                          const isCurrent = currentStatus === st.key;

                                          // Reached in progress: all stages at or before the current stage
                                          const isReached =
                                            !isBookingCancelled &&
                                            stageProgressIdx !== -1 &&
                                            currentProgressIdx !== -1 &&
                                            stageProgressIdx <= currentProgressIdx;

                                          // Stage 4 ("Payment Approved") turns orange ONLY if payment is pending
                                          const isPaymentStage = st.key === "accepted";
                                          const isOrangePending =
                                            isPaymentStage &&
                                            isPaymentPending &&
                                            (isReached || isCashPending);

                                          let btnClass = "bg-white text-gray-700 border-gray-300 hover:border-gray-900 hover:bg-gray-50";
                                          let checkClass = "border-gray-400 bg-white text-transparent";
                                          let checkContent = "✓";

                                          if (isCancelledStage) {
                                            if (isBookingCancelled) {
                                              btnClass = "bg-red-600 text-white border-red-600 shadow-sm ring-1 ring-red-600";
                                              checkClass = "bg-white text-red-600 border-white";
                                              checkContent = "✓";
                                            } else {
                                              btnClass = "bg-white text-gray-700 border-gray-300 hover:border-red-600 hover:bg-red-50/50";
                                              checkClass = "border-gray-400 bg-white text-transparent";
                                              checkContent = "✓";
                                            }
                                          } else if (isOrangePending) {
                                            btnClass = `bg-orange-500 text-white border-orange-600 shadow-sm ring-1 ring-orange-500 hover:bg-orange-600 ${
                                              isCurrent ? "ring-2 ring-offset-1 ring-orange-600 font-bold" : ""
                                            }`;
                                            checkClass = "bg-white text-orange-600 border-white";
                                            checkContent = "!";
                                          } else if (isReached) {
                                            btnClass = `bg-gray-900 text-white border-gray-900 shadow-sm ring-1 ring-gray-900 hover:bg-gray-800 ${
                                              isCurrent ? "ring-2 ring-offset-1 ring-[#FFC20E] font-bold" : ""
                                            }`;
                                            checkClass = "bg-white text-gray-900 border-white";
                                            checkContent = "✓";
                                          }

                                          return (
                                            <button
                                              key={st.key}
                                              type="button"
                                              disabled={actionLoading === b.id}
                                              onClick={() => handleStageClickboxSelect(b, st.key)}
                                              className={`flex items-start gap-1.5 p-2 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${btnClass}`}
                                              title={
                                                isOrangePending
                                                  ? "Payment is pending! Click to review or approve payment."
                                                  : isReached
                                                  ? `Completed stage: ${st.label}`
                                                  : `Click to set stage to ${st.label}`
                                              }
                                            >
                                              <span
                                                className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold border ${checkClass}`}
                                              >
                                                {checkContent}
                                              </span>
                                              <span className="leading-tight">
                                                {st.label}
                                                {isOrangePending && (
                                                  <span className="block text-[10px] font-bold text-amber-100 uppercase tracking-wider mt-0.5">
                                                    Pending
                                                  </span>
                                                )}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-gray-200">
                                  {b.status === "payment_submitted" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => handleApproveSlipPayment(b)}
                                      className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
                                    >
                                      Approve Payment &amp; Schedule
                                    </button>
                                  )}

                                  {b.status === "assigned" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => updateBooking(b.id, "in_transit")}
                                      className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer"
                                    >
                                      Mark In Transit
                                    </button>
                                  )}

                                  {b.status === "in_transit" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => updateBooking(b.id, "delivered")}
                                      className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer"
                                    >
                                      Mark Delivered
                                    </button>
                                  )}

                                  {b.status !== "cancelled" && b.status !== "delivered" && (
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => {
                                        if (confirm("Are you sure you want to cancel this booking and free its scheduled time slot?")) {
                                          updateBooking(b.id, "cancelled");
                                        }
                                      }}
                                      className="px-3.5 py-2 rounded-md border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 text-sm font-medium cursor-pointer"
                                    >
                                      Reject / Cancel
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    disabled={actionLoading === b.id}
                                    onClick={() => handleDeleteBooking(b.id)}
                                    className="px-3.5 py-2 rounded-md border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-medium cursor-pointer"
                                    title="Permanently Delete Booking from Database"
                                  >
                                    Delete
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
            </div>
          )}


          {/* ========================================================= */}
          {/* TAB 3: ONLINE / LIVE LORRY BOOKINGS                       */}
          {/* ========================================================= */}
          {activeNav === "online_bookings" && (
            <div className="flex flex-col gap-4">
              {/* Filter & Search Bar */}
              <div className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      Online / Live Bookings ({onlineBookings.length})
                    </h2>
                    <p className="text-sm text-gray-600 mt-0.5">
                      Bookings received from the Find Empty Lorry live broadcast.
                    </p>
                  </div>

                  {/* Status Filter */}
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
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
                        className={`px-3 py-1.5 rounded-md font-medium cursor-pointer border ${
                          statusFilter === st.key
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {st.label}
                        {st.key === "pending" && pendingOnlineCount > 0 ? ` (${pendingOnlineCount})` : ""}
                        {st.key === "payment_submitted" && onlineSlipReviewCount > 0 ? ` (${onlineSlipReviewCount})` : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search + Accordion Controls */}
                <div className="pt-3.5 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <label htmlFor="online-booking-search" className="text-sm font-medium text-gray-700 shrink-0">
                      Search:
                    </label>
                    <div className="relative flex-1 min-w-0 max-w-lg">
                      <input
                        id="online-booking-search"
                        type="text"
                        aria-label="Search live bookings by date, customer name, phone, lorry plate, corridor, or cargo"
                        value={onlineSearch}
                        onChange={(e) => setOnlineSearch(e.target.value)}
                        className="w-full px-3 py-2 pr-8 rounded-md border border-gray-300 bg-white focus:border-gray-900 focus:outline-none text-sm text-gray-900"
                      />
                      {onlineSearch.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOnlineSearch("")}
                          aria-label="Clear live booking search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 text-sm font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="text-sm text-gray-600">
                      Showing <strong className="text-gray-900">{filteredOnlineBookings.length}</strong> of{" "}
                      <strong className="text-gray-900">{onlineBookings.length}</strong>
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
                          className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-sm font-medium cursor-pointer"
                        >
                          {allExpanded ? "Collapse All" : "Expand All"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {loadingBookings ? (
                <div className="p-10 text-center rounded-lg bg-white border border-gray-300">
                  <p className="text-sm font-medium text-gray-600">Loading live bookings...</p>
                </div>
              ) : filteredOnlineBookings.length === 0 ? (
                <div className="p-10 text-center rounded-lg bg-white border border-gray-300">
                  <p className="text-sm text-gray-600">
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
                      className="mt-3 px-4 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold cursor-pointer"
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
                    const isCashManual =
                      b.paymentMethod === "cash_manual" ||
                      b.paymentSlipStatus === "manual_approved" ||
                      b.paymentSlipStatus === "cash_pending";
                    const isCashPending = b.paymentSlipStatus === "cash_pending";
                    const isCashPaid =
                      b.paymentSlipStatus === "manual_approved" ||
                      (b.paymentMethod === "cash_manual" && Boolean(b.paymentApprovedAt && b.paymentApprovedAt > 0));
                  const isExpanded =
                    expandedOnlineBookings[b.id] !== undefined
                      ? expandedOnlineBookings[b.id]
                      : idx === 0 || b.status === "pending" || b.status === "payment_submitted";
                  const requestTiming = formatBookingDateTime(b.createdAt);

                  return (
                    <div
                      key={b.id}
                      className="rounded-lg bg-white border border-gray-300 overflow-hidden shadow-xs"
                    >
                      {/* Dark Booking Header Bar */}
                      <button
                        type="button"
                        onClick={() => toggleOnlineBookingCard(b.id, isExpanded)}
                        aria-expanded={isExpanded}
                        aria-label={`${
                          isExpanded ? "Minimize live booking details" : "Open live booking details"
                        } for #${b.id}`}
                        className="w-full text-left border-0 bg-gray-900 text-white px-4 py-3 sm:px-5 hover:bg-gray-800 transition-colors cursor-pointer flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-sm font-bold px-2.5 py-0.5 rounded bg-white/10 border border-white/20 text-white">
                            #{b.id}
                          </span>
                          <span className="text-base font-bold text-white">
                            {b.customerName}
                          </span>
                          {b.customerPhone && (
                            <span className="text-sm font-mono text-gray-300">
                              ({b.customerPhone})
                            </span>
                          )}
                          {b.customerIdNumber && (
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 text-amber-300 border border-amber-300/30">
                              NIC: {b.customerIdNumber}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                          {isQuoted && (
                            <span className="text-sm font-mono font-bold text-amber-400">
                              Rs. {Number(b.quotedAmount).toLocaleString()}
                            </span>
                          )}
                          <StatusBadge status={b.status} />
                          {isCashManual && (
                            isCashPending ? (
                              <span className="text-xs font-semibold text-amber-200 bg-amber-950/80 border border-amber-600/70 px-2.5 py-1 rounded-md">
                                Cash Pending
                              </span>
                            ) : isCashPaid ? (
                              <span className="text-xs font-semibold text-emerald-200 bg-emerald-950/80 border border-emerald-600/70 px-2.5 py-1 rounded-md">
                                Cash Paid
                              </span>
                            ) : null
                          )}
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/20 bg-white/10 text-xs font-semibold text-white hover:bg-white/20 transition-colors">
                            {isExpanded ? "Hide" : "Show Details"}
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={isExpanded ? "rotate-180" : "rotate-0"}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </div>
                      </button>

                      {/* Clean 4-column Scannable Summary Row */}
                      <div
                        onClick={() => toggleOnlineBookingCard(b.id, isExpanded)}
                        className="bg-gray-50/80 px-4 py-3 sm:px-5 border-b border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm cursor-pointer hover:bg-gray-100/60 transition-colors"
                      >
                        <div>
                          <div className="text-xs font-medium text-gray-500 flex items-center justify-between">
                            <span>Route</span>
                            {b.distanceKm ? (
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[10px]">
                                {b.distanceKm} km
                              </span>
                            ) : null}
                          </div>
                          <div className="font-semibold text-gray-900 mt-0.5">
                            {b.pickupCity} → {b.deliveryCity}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500">Trip Date</div>
                          <div className="font-medium text-gray-900 mt-0.5">
                            {b.date || "Today (Live)"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500">Lorry &amp; Rider</div>
                          <div className="text-gray-900 mt-0.5">
                            <span className="font-medium">
                              {b.assignedPlate || b.selectedVehiclePlate || "Live Lorry"}
                            </span>
                            {b.assignedDriverName ? ` · ${b.assignedDriverName}` : " · No rider"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-500">Requested On</div>
                          <div className="text-gray-900 mt-0.5">
                            {requestTiming ? requestTiming.display : "Not recorded"}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Body */}
                      {isExpanded && (
                        <div className="divide-y divide-gray-200">
                          {/* Section 1: Customer & Trip Summary Table */}
                          <div className="px-4 py-4 sm:px-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                            <div>
                              <h4 className="text-sm font-bold text-gray-900 mb-2.5">
                                Customer Details
                              </h4>
                              <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3">
                                <dt className="text-gray-500">Name</dt>
                                <dd className="font-semibold text-gray-900">{b.customerName}</dd>

                                <dt className="text-gray-500">Mobile</dt>
                                <dd>
                                  {b.customerPhone ? (
                                    <a
                                      href={`tel:${String(b.customerPhone || "").replace(/\s+/g, "")}`}
                                      className="font-mono font-semibold text-gray-900 underline"
                                    >
                                      {b.customerPhone}
                                    </a>
                                  ) : (
                                    <span className="text-gray-500">Not provided</span>
                                  )}
                                </dd>

                                <dt className="text-gray-500">WhatsApp</dt>
                                <dd>
                                  {b.customerWhatsapp || b.customerPhone ? (
                                    <a
                                      href={`https://wa.me/94${String(b.customerWhatsapp || b.customerPhone).replace(/[^0-9]/g, "").replace(/^0/, "")}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-mono font-semibold text-green-800 underline"
                                    >
                                      {b.customerWhatsapp || b.customerPhone}
                                    </a>
                                  ) : (
                                    <span className="text-gray-500">Not provided</span>
                                  )}
                                </dd>

                                {requestTiming && (
                                  <>
                                    <dt className="text-gray-500">Requested</dt>
                                    <dd className="text-gray-900">{requestTiming.display}</dd>
                                  </>
                                )}
                              </dl>
                            </div>

                            <div>
                              <h4 className="text-sm font-bold text-gray-900 mb-2.5">
                                Trip &amp; Cargo Details
                              </h4>
                              <dl className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3">
                                <dt className="text-gray-500">Route</dt>
                                <dd className="font-semibold text-gray-900">
                                  {b.pickupCity} → {b.deliveryCity}
                                  {b.distanceKm ? (
                                    <span className="ml-2 font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs inline-block">
                                      🛣️ {b.distanceKm} km
                                    </span>
                                  ) : null}
                                </dd>

                                <dt className="text-gray-500">Date</dt>
                                <dd className="font-medium text-gray-900">{b.date || "Today"}</dd>

                                <dt className="text-gray-500">Goods</dt>
                                <dd className="text-gray-900">
                                  {b.cargoNature || b.packageDetails || "General Cargo"}
                                </dd>

                                {b.cargoWeight && (
                                  <>
                                    <dt className="text-gray-500">Weight</dt>
                                    <dd className="text-gray-900">{b.cargoWeight}</dd>
                                  </>
                                )}

                                {b.packageDetails && b.packageDetails !== b.cargoNature && (
                                  <>
                                    <dt className="text-gray-500">Notes</dt>
                                    <dd className="text-gray-900">{b.packageDetails}</dd>
                                  </>
                                )}
                              </dl>
                            </div>
                          </div>

                          {/* Section 2: Assigned Lorry & Rider */}
                          <div className="px-4 py-4 sm:px-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                            <div className="flex flex-col gap-0.5">
                              <h4 className="text-sm font-bold text-gray-900">
                                Step 1: Lorry &amp; Rider Assignment
                              </h4>
                              <div className="text-sm text-gray-700 mt-0.5">
                                Lorry:{" "}
                                <strong className="font-mono text-gray-900">
                                  {b.assignedPlate || b.selectedVehiclePlate || "Not selected"}
                                </strong>
                                {" · "}
                                Rider:{" "}
                                <strong className="text-gray-900">
                                  {b.assignedDriverName || "Not assigned"}
                                </strong>
                                {b.assignedDriverPhone && (
                                  <a
                                    href={`tel:${String(b.assignedDriverPhone).replace(/\s+/g, "")}`}
                                    className="ml-2 font-mono text-green-800 underline font-semibold"
                                  >
                                    {b.assignedDriverPhone}
                                  </a>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => openAssignModal(b)}
                              className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-sm font-semibold cursor-pointer"
                            >
                              {b.assignedPlate ? "Change Lorry / Rider" : "Assign Rider"}
                            </button>
                          </div>

                          {/* Section 3: Pricing & Payment */}
                          <div className="px-4 py-4 sm:px-5 flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-sm font-bold text-gray-900">
                                Step 2: Amount &amp; Payment
                              </h4>
                              {isQuoted && (
                                <span className="text-sm font-mono font-semibold text-gray-900">
                                  Quoted: Rs. {Number(b.quotedAmount).toLocaleString()}
                                  {b.quoteNote ? ` (${b.quoteNote})` : ""}
                                </span>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                              <div className="sm:col-span-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Amount (LKR) *
                                </label>
                                <input
                                  type="text"
                                  value={quoteDraft.amount}
                                  onChange={(e) =>
                                    setQuoteInputs((prev) => ({
                                      ...prev,
                                      [b.id]: { ...quoteDraft, amount: e.target.value },
                                    }))
                                  }
                                  className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                                />
                              </div>
                              <div className="sm:col-span-8">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Payment Note (Optional)
                                </label>
                                <input
                                  type="text"
                                  value={quoteDraft.note}
                                  onChange={(e) =>
                                    setQuoteInputs((prev) => ({
                                      ...prev,
                                      [b.id]: { ...quoteDraft, note: e.target.value },
                                    }))
                                  }
                                  className="w-full px-3 py-2.5 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2.5">
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
                                className="px-5 py-2.5 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer"
                              >
                                {isQuoted ? "Update Quote" : "Send Quote (Rs.)"}
                              </button>
                              {["pending", "awaiting_payment", "payment_submitted"].includes(b.status) && (
                                <button
                                  type="button"
                                  disabled={actionLoading === b.id}
                                  onClick={() => openPaymentApprovalModal(b)}
                                  className="px-4 py-2.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-sm font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  Approve Payment
                                </button>
                              )}
                            </div>

                            {/* Payment Status Summary */}
                            {!hasStoredSlip && (
                              (isCashPending || (typeof b.pendingAmount === "number" && b.pendingAmount > 0)) ? (
                                <div className="px-4 py-3.5 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <span className="font-bold flex items-center gap-1.5 text-amber-900">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                                        Payment Pending: Balance Due Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()}
                                      </span>
                                      <p className="text-xs text-amber-800 mt-0.5">
                                        Total: <span className="font-bold">Rs. {(b.quotedAmount || 0).toLocaleString()}</span>
                                        {typeof b.advanceAmount === "number" && b.advanceAmount > 0 ? (
                                          <>
                                            {" · "}Advance Paid: <span className="font-bold text-green-800">Rs. {b.advanceAmount.toLocaleString()}</span> ({b.paymentMethod === "bank_transfer" ? `Bank: ${b.paymentBankUsed || "Bank"}` : "Cash"})
                                          </>
                                        ) : (
                                          " · Full payment pending"
                                        )}
                                        {b.quoteNote && ` · Note: ${b.quoteNote}`}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={actionLoading === b.id}
                                        onClick={() => openSettleBalanceModal(b)}
                                        className="px-3.5 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-xs font-semibold cursor-pointer shadow-sm transition-all"
                                        title="Settle remaining balance"
                                      >
                                        💳 Settle Balance (Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()})
                                      </button>
                                      <button
                                        type="button"
                                        disabled={actionLoading === b.id}
                                        onClick={() => openPaymentApprovalModal(b)}
                                        className="px-3 py-2 rounded-md border border-amber-300 bg-white hover:bg-amber-100 text-amber-950 text-xs font-medium cursor-pointer"
                                      >
                                        Update Payment
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : isCashPaid && (!b.pendingAmount || b.pendingAmount === 0) ? (
                                <div className="px-4 py-3 rounded-md bg-green-50 border border-green-300 text-sm text-green-900">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <span className="font-semibold block">
                                        ✓ Fully Paid &amp; Counted into Revenue: <strong>Rs. {(b.quotedAmount || 0).toLocaleString()}</strong>
                                      </span>
                                      <span className="text-xs text-green-800 mt-0.5 block">
                                        {typeof b.advanceAmount === "number" && b.advanceAmount > 0 && b.finalPaymentMethod ? (
                                          <span>
                                            Advance: Rs. {b.advanceAmount.toLocaleString()} via {b.paymentMethod === "bank_transfer" ? b.paymentBankUsed || "Bank" : "Cash"} + Balance via {b.finalPaymentMethod === "bank_transfer" ? b.finalPaymentBankUsed || "Bank" : "Cash"}
                                          </span>
                                        ) : b.paymentBankUsed ? (
                                          <span>Paid via {b.paymentBankUsed}</span>
                                        ) : (
                                          <span>Paid in Cash</span>
                                        )}
                                        {b.quoteNote && ` · Note: ${b.quoteNote}`}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={actionLoading === b.id}
                                      onClick={() => openPaymentApprovalModal(b)}
                                      className="px-3 py-1.5 rounded-md border border-green-300 bg-white hover:bg-green-100 text-green-900 text-xs font-medium cursor-pointer"
                                    >
                                      Edit Payment
                                    </button>
                                  </div>
                                </div>
                              ) : null
                            )}
                            {/* Bank Payment Slip Review Section */}
                            {hasStoredSlip && (
                              <div className="px-4 py-3 rounded-md bg-gray-50 border border-gray-200 flex flex-wrap items-center justify-between gap-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900">
                                    Payment Slip Uploaded
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-white border border-gray-300 font-mono text-xs font-semibold text-gray-900">
                                    {b.paymentSlipStatus || "pending_review"}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openSlipReviewModal(b)}
                                    className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-sm font-medium cursor-pointer"
                                  >
                                    View Bank Slip
                                  </button>
                                  {b.paymentSlipStatus !== "approved" && (
                                    <button
                                      type="button"
                                      onClick={() => handleApproveSlipPayment(b)}
                                      className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer"
                                    >
                                      Approve Slip
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Footer Actions & Lifecycle Transitions */}
                          <div className="px-4 py-4 sm:px-5 bg-gray-50 flex flex-col gap-3 text-sm">
                            {/* 8-Stage Clickboxes (Progress Stepper) */}
                            {(() => {
                              const currentStatus = (b.status === "booked" ? "accepted" : b.status) as BookingStatus;
                              const currentProgressIdx = PROGRESS_KEYS.indexOf(currentStatus);
                              const isBookingCancelled = currentStatus === "cancelled";

                              const isCashPending = b.paymentSlipStatus === "cash_pending";
                              const isPaymentApproved =
                                !isCashPending &&
                                (b.paymentSlipStatus === "manual_approved" ||
                                 b.paymentSlipStatus === "approved" ||
                                 Boolean(b.paymentApprovedAt && b.paymentApprovedAt > 0));
                              const isPaymentPending = isCashPending || !isPaymentApproved;
                              const isPaymentPendingWarning = isPaymentPending && (currentProgressIdx >= 3 || isCashPending);

                              return (
                                <div className="w-full">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                      Stage Selection (ක්ලික් කර වෙනස් කරන්න):
                                    </span>
                                    <div className="flex items-center gap-2">
                                      {isPaymentPendingWarning && (
                                        <span className="text-[11px] font-semibold text-orange-800 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-md">
                                          Payment Pending
                                        </span>
                                      )}
                                      <span className="text-xs text-gray-500 font-medium">
                                        Current: <strong className="text-gray-900">{BOOKING_STAGES.find((s) => s.key === currentStatus)?.label || b.status}</strong>
                                      </span>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                                    {BOOKING_STAGES.map((st) => {
                                      const isCancelledStage = st.key === "cancelled";
                                      const stageProgressIdx = PROGRESS_KEYS.indexOf(st.key);
                                      const isCurrent = currentStatus === st.key;

                                      // Reached in progress: all stages at or before the current stage
                                      const isReached =
                                        !isBookingCancelled &&
                                        stageProgressIdx !== -1 &&
                                        currentProgressIdx !== -1 &&
                                        stageProgressIdx <= currentProgressIdx;

                                      // Stage 4 ("Payment Approved") turns orange ONLY if payment is pending
                                      const isPaymentStage = st.key === "accepted";
                                      const isOrangePending =
                                        isPaymentStage &&
                                        isPaymentPending &&
                                        (isReached || isCashPending);

                                      let btnClass = "bg-white text-gray-700 border-gray-300 hover:border-gray-900 hover:bg-gray-50";
                                      let checkClass = "border-gray-400 bg-white text-transparent";
                                      let checkContent = "✓";

                                      if (isCancelledStage) {
                                        if (isBookingCancelled) {
                                          btnClass = "bg-red-600 text-white border-red-600 shadow-sm ring-1 ring-red-600";
                                          checkClass = "bg-white text-red-600 border-white";
                                          checkContent = "✓";
                                        } else {
                                          btnClass = "bg-white text-gray-700 border-gray-300 hover:border-red-600 hover:bg-red-50/50";
                                          checkClass = "border-gray-400 bg-white text-transparent";
                                          checkContent = "✓";
                                        }
                                      } else if (isOrangePending) {
                                        btnClass = `bg-orange-500 text-white border-orange-600 shadow-sm ring-1 ring-orange-500 hover:bg-orange-600 ${
                                          isCurrent ? "ring-2 ring-offset-1 ring-orange-600 font-bold" : ""
                                        }`;
                                        checkClass = "bg-white text-orange-600 border-white";
                                        checkContent = "!";
                                      } else if (isReached) {
                                        btnClass = `bg-gray-900 text-white border-gray-900 shadow-sm ring-1 ring-gray-900 hover:bg-gray-800 ${
                                          isCurrent ? "ring-2 ring-offset-1 ring-[#FFC20E] font-bold" : ""
                                        }`;
                                        checkClass = "bg-white text-gray-900 border-white";
                                        checkContent = "✓";
                                      }

                                      return (
                                        <button
                                          key={st.key}
                                          type="button"
                                          disabled={actionLoading === b.id}
                                          onClick={() => handleStageClickboxSelect(b, st.key)}
                                          className={`flex items-start gap-1.5 p-2 rounded-lg border text-xs font-medium text-left transition-all cursor-pointer ${btnClass}`}
                                          title={
                                            isOrangePending
                                              ? "Payment is pending! Click to review or approve payment."
                                              : isReached
                                              ? `Completed stage: ${st.label}`
                                              : `Click to set stage to ${st.label}`
                                          }
                                        >
                                          <span
                                            className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold border ${checkClass}`}
                                          >
                                            {checkContent}
                                          </span>
                                          <span className="leading-tight">
                                            {st.label}
                                            {isOrangePending && (
                                              <span className="block text-[10px] font-bold text-amber-100 uppercase tracking-wider mt-0.5">
                                                Pending
                                              </span>
                                            )}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200">
                            <div className="text-sm text-gray-600">
                              {(b.status === "assigned" || b.status === "accepted") && (
                                <span className="font-medium text-gray-900">
                                  Status: Awaiting rider to collect goods
                                </span>
                              )}
                              {b.status === "goods_collected" && (
                                <span className="font-semibold text-green-800">
                                  Status: Goods collected by rider
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {b.status === "goods_collected" && (
                                <button
                                  type="button"
                                  onClick={() => updateBooking(b.id, "in_transit")}
                                  className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer"
                                >
                                  Mark In Transit
                                </button>
                              )}

                              {["goods_collected", "in_transit"].includes(b.status) && (
                                <button
                                  type="button"
                                  onClick={() => updateBooking(b.id, "delivered")}
                                  className="px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer"
                                >
                                  Mark Delivered
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={actionLoading === b.id}
                                onClick={() => handleDeleteBooking(b.id)}
                                className="px-3.5 py-2 rounded-md border border-red-300 bg-white hover:bg-red-50 text-red-700 text-sm font-medium cursor-pointer"
                                title="Permanently Delete Booking from Database"
                              >
                                Delete
                              </button>
                            </div>
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

          {/* ========================================================= */}
          {/* TAB: SIMPLE CUSTOMER LIST                                 */}
          {/* ========================================================= */}
          {activeNav === "customers" && (
            <div className="bg-white border border-[#E7E2D0] rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
              {/* Simple Header & Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E7E2D0]">
                <div>
                  <h2 className="text-base font-bold text-[#26231B]">
                    Customer List ({filteredCustomers.length})
                  </h2>
                  <p className="text-xs text-[#6F6A5A]">
                    All registered and manually added customers.
                  </p>
                </div>
                <span className="text-xs text-[#6F6A5A] font-semibold">
                  {filteredCustomers.length} of {customersWithMetrics.length} Customers
                </span>
              </div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <label
                    htmlFor="customer-search-input"
                    className="text-xs font-semibold text-[#6F6A5A] shrink-0"
                  >
                    Search:
                  </label>
                  <div className="relative flex-1">
                    <input
                      id="customer-search-input"
                      type="text"
                      aria-label="Search customers"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] focus:outline-none focus:border-[#26231B]"
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8C877A] hover:text-[#26231B] cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { key: "all", label: `All (${customersWithMetrics.length})` },
                    { key: "active", label: `Booked (${bookedCustomersCount})` },
                    { key: "registered", label: `Registered Only (${registeredOnlyClientsCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setCustomerTierFilter(tab.key as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        customerTierFilter === tab.key
                          ? "bg-[#26231B] text-white"
                          : "bg-[#F7F5EE] text-[#6F6A5A] hover:bg-[#E7E2D0]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 self-start lg:self-auto">
                  <span className="text-xs font-semibold text-[#6F6A5A]">Sort:</span>
                  <select
                    value={customerSort}
                    onChange={(e) => setCustomerSort(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-semibold text-[#26231B] focus:outline-none"
                  >
                    <option value="recent">Recently Added / Active</option>
                    <option value="name">Name (A–Z)</option>
                    <option value="bookings">Most Bookings</option>
                  </select>
                </div>
              </div>

              {/* Normal Clean Customer Table / List */}
              {loadingUsers && customersWithMetrics.length === 0 ? (
                <div className="py-10 text-center text-xs font-semibold text-[#6F6A5A]">
                  Loading customers...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="py-10 px-4 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-center">
                  <p className="text-xs font-bold text-[#26231B]">No customers found</p>
                  <p className="text-[11px] text-[#6F6A5A] mt-0.5">
                    Try clearing the search or filter.
                  </p>
                </div>
              ) : (
                <div className="border border-[#E7E2D0] rounded-xl overflow-hidden divide-y divide-[#E7E2D0]">
                  {filteredCustomers.map((c) => {
                    const isExpanded = !!expandedCustomers[c.id];
                    const cleanPhoneDigits = c.phone.replace(/[^0-9]/g, "");
                    const intlPhone = cleanPhoneDigits.startsWith("0")
                      ? `94${cleanPhoneDigits.slice(1)}`
                      : cleanPhoneDigits.startsWith("94")
                      ? cleanPhoneDigits
                      : `94${cleanPhoneDigits}`;

                    return (
                      <div key={c.id} className="bg-white">
                        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FCFBF7] transition-colors">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#26231B] truncate">
                              {c.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[#6F6A5A]">
                              <span className="font-mono font-semibold text-[#26231B]">
                                {c.phone || "No phone"}
                              </span>
                              {c.idNumber ? (
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-[11px] px-2 py-0.5 rounded-md bg-[#F7F5EE] border border-[#E7E2D0] text-[#26231B]">
                                  🪪 NIC: {c.idNumber}
                                </span>
                              ) : (
                                <span className="inline-flex items-center font-mono text-[11px] text-[#8C877A]">
                                  NIC: Not recorded
                                </span>
                              )}
                              {c.city && <span>• {c.city}</span>}
                              {c.email && <span>• {c.email}</span>}
                              <span>
                                • {c.totalBookings} {c.totalBookings === 1 ? "Booking" : "Bookings"}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {c.phone && (
                              <>
                                <a
                                  href={`tel:${c.phone}`}
                                  className="px-2.5 py-1.5 rounded-lg border border-[#E7E2D0] hover:bg-[#F7F5EE] text-[#26231B] text-xs font-semibold transition-colors"
                                >
                                  Call
                                </a>
                                <a
                                  href={`https://wa.me/${intlPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors"
                                >
                                  WhatsApp
                                </a>
                              </>
                            )}

                            {c.totalBookings > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleCustomerExpanded(c.id)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#E7E2D0] hover:bg-[#F7F5EE] text-[#26231B] text-xs font-semibold transition-colors cursor-pointer"
                              >
                                {isExpanded ? "Hide Bookings ▲" : `Bookings (${c.totalBookings}) ▼`}
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={deletingCustomerId === c.id}
                              aria-label={`Delete customer ${c.name}`}
                              onClick={() =>
                                setDeleteCustomerModal({
                                  id: c.id,
                                  name: c.name,
                                  phone: c.phone,
                                  totalBookings: c.totalBookings,
                                  totalRevenue: c.totalRevenue,
                                  deleteBookings: false,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {deletingCustomerId === c.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>

                        {isExpanded && c.bookingsList.length > 0 && (
                          <div className="px-4 py-3 bg-[#F7F5EE] border-t border-[#E7E2D0] flex flex-col gap-2">
                            {c.bookingsList.map((b) => (
                              <div
                                key={b.id}
                                className="px-3 py-2 rounded-lg bg-white border border-[#E7E2D0] flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-[#26231B]">#{b.id}</span>
                                  <span className="text-[#26231B]">
                                    {b.pickupCity} → {b.deliveryCity}
                                  </span>
                                  <span className="text-[#6F6A5A]">
                                    ({b.date || "Date unspecified"})
                                  </span>
                                  {b.distanceKm ? (
                                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-mono font-bold">
                                      🛣️ {b.distanceKm} km
                                    </span>
                                  ) : null}
                                </div>
                                <StatusBadge status={b.status} />
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
          )}

          {/* ========================================================= */}
          {/* TAB: COMPLAINTS & DELETION REASONS AUDIT                  */}
          {/* ========================================================= */}
          {activeNav === "complaints" && (
            <div className="bg-white border border-[#E7E2D0] rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
              {/* Header & Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E7E2D0]">
                <div>
                  <h2 className="text-base font-bold text-[#26231B] flex items-center gap-2">
                    <span>Complaints &amp; Deletions Log ({filteredComplaints.length})</span>
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-mono font-bold">
                      Audit
                    </span>
                  </h2>
                  <p className="text-xs text-[#6F6A5A]">
                    Mandatory reasons recorded whenever a booking is cancelled or permanently deleted.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-xs font-mono font-bold text-[#26231B]">
                    {complaints.length} Total Records
                  </span>
                </div>
              </div>

              {/* Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <label
                    htmlFor="complaint-search-input"
                    className="text-xs font-semibold text-[#6F6A5A] shrink-0"
                  >
                    Search:
                  </label>
                  <div className="relative flex-1">
                    <input
                      id="complaint-search-input"
                      type="text"
                      placeholder="Search by ID, customer name, phone, NIC, route, or reason..."
                      value={complaintSearch}
                      onChange={(e) => setComplaintSearch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B] focus:outline-none focus:border-[#26231B]"
                    />
                    {complaintSearch && (
                      <button
                        type="button"
                        onClick={() => setComplaintSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8C877A] hover:text-[#26231B] cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Content List */}
              {loadingComplaints && complaints.length === 0 ? (
                <div className="py-12 text-center text-xs font-semibold text-[#6F6A5A]">
                  Loading complaints &amp; deletion audit records...
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="py-12 px-4 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-center flex flex-col items-center justify-center gap-2">
                  <span className="text-3xl">📋</span>
                  <p className="text-sm font-bold text-[#26231B]">No complaints or deleted booking records found</p>
                  <p className="text-xs text-[#6F6A5A] max-w-md">
                    {complaintSearch
                      ? "No records matched your search query. Try clearing the search filter."
                      : "When an admin deletes or cancels a booking, the mandatory reason and full trip details are safely logged here."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredComplaints.map((c) => {
                    const cleanPhoneDigits = (c.customerPhone || "").replace(/[^0-9]/g, "");
                    const intlPhone = cleanPhoneDigits.startsWith("0")
                      ? `94${cleanPhoneDigits.slice(1)}`
                      : cleanPhoneDigits.startsWith("94")
                      ? cleanPhoneDigits
                      : `94${cleanPhoneDigits}`;
                    const formattedDate = c.deletedAt
                      ? new Date(c.deletedAt).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "Recently";

                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-red-200 bg-white p-4 sm:p-5 shadow-xs flex flex-col gap-3 hover:border-red-300 transition-colors"
                      >
                        {/* Top Row: Meta info */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#F0ECE1]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md bg-red-100 text-red-900 border border-red-200 text-xs font-mono font-bold">
                              Booking #{c.bookingId}
                            </span>
                            <span className="text-xs text-[#6F6A5A]">
                              Deleted on: <b className="text-[#26231B] font-mono">{formattedDate}</b>
                            </span>
                            {c.deletedBy && (
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">
                                By: {c.deletedBy}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {c.customerPhone && (
                              <>
                                <a
                                  href={`tel:${c.customerPhone}`}
                                  className="px-2.5 py-1 rounded-lg border border-[#E7E2D0] hover:bg-[#F7F5EE] text-[#26231B] text-xs font-semibold transition-colors"
                                >
                                  📞 Call
                                </a>
                                <a
                                  href={`https://wa.me/${intlPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors"
                                >
                                  WhatsApp
                                </a>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Customer & Route Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-[#6F6A5A] font-semibold block">Customer</span>
                            <div className="font-bold text-[#26231B] text-sm mt-0.5">{c.customerName}</div>
                            <div className="font-mono text-[#6F6A5A]">{c.customerPhone || "No phone"}</div>
                            {c.customerIdNumber ? (
                              <div className="font-mono text-[11px] font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">
                                🪪 NIC: {c.customerIdNumber}
                              </div>
                            ) : (
                              <div className="text-[11px] text-[#8C877A] mt-1">NIC: Not recorded</div>
                            )}
                          </div>

                          <div>
                            <span className="text-[#6F6A5A] font-semibold block">Route &amp; Distance</span>
                            <div className="font-bold text-[#26231B] mt-0.5">
                              {c.pickupCity} → {c.deliveryCity}
                            </div>
                            {c.distanceKm ? (
                              <div className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs mt-1 inline-block">
                                🛣️ {c.distanceKm} km
                              </div>
                            ) : (
                              <div className="text-[#8C877A] text-[11px] mt-1">Distance not entered</div>
                            )}
                          </div>

                          <div>
                            <span className="text-[#6F6A5A] font-semibold block">Vehicle &amp; Trip Date</span>
                            <div className="text-[#26231B] font-medium mt-0.5">{c.vehicleType || "Lorry"}</div>
                            <div className="text-[#6F6A5A] font-mono text-[11px]">
                              {c.date || "Date unspecified"}
                            </div>
                          </div>

                          <div>
                            <span className="text-[#6F6A5A] font-semibold block">Quoted Amount</span>
                            <div className="font-mono font-bold text-[#26231B] text-sm mt-0.5">
                              {c.quotedAmount !== undefined ? `Rs. ${Number(c.quotedAmount).toLocaleString()}` : "Not quoted"}
                            </div>
                          </div>
                        </div>

                        {/* Prominent Mandatory Reason Callout */}
                        <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200 flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-red-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-600"></span>
                            Booking Deletion Reason (අවලංගු කිරීමට හේතුව):
                          </span>
                          <p className="text-xs font-semibold text-red-950 leading-relaxed whitespace-pre-wrap pl-3.5 border-l-2 border-red-400">
                            {c.reason}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                            <span>Assigned Rider: </span>
                            <b className="text-[#26231B]">{v.driverName || "Unassigned"}</b>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-3 border-t border-[#E7E2D0]">
                          <button
                            onClick={() => {
                              setStatusFilter("all");
                              setIndividualSearch(v.plate);
                              setActiveNav("individual_bookings");
                            }}
                            className="text-xs font-extrabold text-[#1E9E5A] hover:underline cursor-pointer"
                          >
                            View Bookings
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
                  <p className="text-sm font-bold text-[#6F6A5A]">No riders registered. Click &quot;+ Register New Rider&quot; above.</p>
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
                                <span className="px-2.5 py-1 rounded-full bg-[#FBF8EE] text-[#7A5A00] border border-[#E7DEC0] text-[11px] font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
                                  Pending Review
                                </span>
                              )}
                              {reg.status === "approved" && (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Approved &amp; Active
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
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">National ID (NIC)</span>
                              <span className="text-xs font-mono font-bold text-[#26231B] mt-0.5 block">
                                {reg.idNumber || "—"}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Location / Base</span>
                              <span className="text-xs font-bold text-[#26231B] mt-0.5 block">
                                {reg.baseCity ? `${reg.baseCity}, ` : ""}{reg.province || "Western Province"}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Max Load / Payload</span>
                              <span className="text-xs font-bold text-[#26231B] mt-0.5 block">
                                {reg.maxWeight || "—"}{reg.capacity ? ` (${reg.capacity})` : ""}
                              </span>
                            </div>

                            {reg.dimensions && (
                              <div className="sm:col-span-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Cargo Dimensions (L × W × H)</span>
                                <span className="text-xs font-semibold text-[#26231B] mt-0.5 block">
                                  {reg.dimensions}
                                </span>
                              </div>
                            )}

                            {/* 3 Vehicle Photos */}
                            {Array.isArray(reg.images) && reg.images.length > 0 && (
                              <div className="sm:col-span-2 pt-2 border-t border-[#E7E2D0]/60">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block mb-1.5">
                                  Vehicle Photos ({reg.images.length})
                                </span>
                                <div className="grid grid-cols-3 gap-2">
                                  {reg.images.slice(0, 3).map((img, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => setViewingSlipImage(img)}
                                      className="relative aspect-[16/10] rounded-xl overflow-hidden border border-[#E7E2D0] hover:border-[#FFC20E] transition-all cursor-pointer group/img"
                                    >
                                      <img src={img} alt={`Vehicle ${idx + 1}`} className="w-full h-full object-cover group-hover/img:scale-105 transition-transform" />
                                      <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.2 rounded">
                                        Photo {idx + 1}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Rs. 5,000 Security Deposit Slip */}
                            <div className="sm:col-span-2 pt-2 border-t border-[#E7E2D0]/60">
                              {reg.depositSlipUrl ? (
                                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">💵</span>
                                    <div>
                                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                                        Rs. 5,000 Security Deposit Slip
                                      </span>
                                      <span className="text-xs font-black text-emerald-950">
                                        Bank Transfer Receipt Uploaded
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setViewingSlipImage(reg.depositSlipUrl || null)}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                                  >
                                    Inspect Slip
                                  </button>
                                </div>
                              ) : (
                                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                                  <span>⚠️</span>
                                  <span>No security deposit slip uploaded</span>
                                </div>
                              )}
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
                                      <span>Approve &amp; Add to Live Fleet</span>
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
          {/* TAB: OUTSIDE EMPLOYEES & FLEET PARTNERS                   */}
          {/* ========================================================= */}
          {activeNav === "outside_employees" && (
            <div className="flex flex-col gap-5">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A]">Total Partners</span>
                  <div className="text-2xl font-black text-[#26231B] mt-1">{outsideEmployees.length}</div>
                  <span className="text-[10px] text-[#6F6A5A] mt-0.5">Approved Outside Lorries</span>
                </div>

                <div className="p-4 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Available on Duty</span>
                  <div className="text-2xl font-black text-emerald-700 mt-1">{availableOutsideCount}</div>
                  <span className="text-[10px] text-emerald-800 mt-0.5">Ready for Bookings</span>
                </div>

                <div className="p-4 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Low Balance Warning</span>
                  <div className="text-2xl font-black text-amber-700 mt-1">{lowBalanceOutsideCount}</div>
                  <span className="text-[10px] text-amber-800 mt-0.5">&lt; Rs. 2,000 in Wallet</span>
                </div>

                <div className="p-4 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5B4300]">Total 20% Commission</span>
                  <div className="text-xl sm:text-2xl font-black text-[#5B4300] mt-1 font-mono">
                    Rs. {totalOutsideCommissionEarned.toLocaleString()}
                  </div>
                  <span className="text-[10px] text-[#5B4300] mt-0.5">Earned from Outside Hires</span>
                </div>
              </div>

              {/* Filter & Search Bar */}
              <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-[#26231B]">Outside Lorry Fleet Partners</h2>
                    <p className="text-xs text-[#6F6A5A] mt-0.5">
                      Independent lorry owners operating on the 20% commission model with Rs. 5,000 security deposit.
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        outsideFilter === "all" ? "bg-[#26231B] text-[#FFC20E] shadow-xs" : "text-[#6F6A5A] hover:text-[#26231B]"
                      }`}
                    >
                      All ({outsideEmployees.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("available")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        outsideFilter === "available" ? "bg-emerald-600 text-white shadow-xs" : "text-[#6F6A5A] hover:text-emerald-700"
                      }`}
                    >
                      Available ({availableOutsideCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("unavailable")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        outsideFilter === "unavailable" ? "bg-neutral-700 text-white shadow-xs" : "text-[#6F6A5A] hover:text-[#26231B]"
                      }`}
                    >
                      Unavailable ({outsideEmployees.length - availableOutsideCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("low_balance")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        outsideFilter === "low_balance" ? "bg-amber-500 text-[#26231B] shadow-xs" : "text-[#6F6A5A] hover:text-amber-800"
                      }`}
                    >
                      Low Balance ({lowBalanceOutsideCount})
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="pt-3 border-t border-[#E7E2D0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F6A5A] pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search by partner ID (ST-OUT-...), owner name, NIC, phone, plate, base city..."
                      value={outsideSearch}
                      onChange={(e) => setOutsideSearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#26231B] placeholder:text-[#8A836E]"
                    />
                    {outsideSearch && (
                      <button
                        type="button"
                        onClick={() => setOutsideSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E7E2D0]/70 text-[#26231B] flex items-center justify-center text-xs font-black cursor-pointer hover:bg-[#FFC20E]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-bold text-[#6F6A5A] shrink-0">
                    Showing <b className="text-[#26231B]">{filteredOutsideEmployees.length}</b> of <b className="text-[#26231B]">{outsideEmployees.length}</b>
                  </span>
                </div>
              </div>

              {/* Partners Grid */}
              {loadingOutsideEmployees ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#6F6A5A]">Syncing outside partners...</p>
                </div>
              ) : filteredOutsideEmployees.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center flex flex-col items-center justify-center">
                  <h3 className="text-sm font-black text-[#26231B]">No Outside Partners Found</h3>
                  <p className="text-xs text-[#6F6A5A] mt-1 max-w-sm">
                    {outsideSearch.trim() || outsideFilter !== "all"
                      ? "No outside employees match your current filter or search criteria."
                      : "Approved outside lorries from /register-vehicle will automatically appear here as registered partners."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredOutsideEmployees.map((emp) => {
                    const isLowBalance = (emp.balance || 0) < 2000;
                    return (
                      <div
                        key={emp.id}
                        className="p-5 sm:p-6 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs hover:border-[#FFC20E] transition-all flex flex-col justify-between gap-4"
                      >
                        <div>
                          {/* Top Badges */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E2D0]/60 pb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-3 py-1 rounded-xl bg-[#26231B] text-[#FFC20E] font-black font-mono text-xs tracking-wider shadow-xs">
                                {emp.id}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-mono font-bold text-amber-900">
                                {emp.plateNumber}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-bold text-[#26231B]">
                                {emp.vehicleType}
                              </span>
                            </div>

                            {/* Duty Status Badge */}
                            <div>
                              {emp.isAvailable ? (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                  Available
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-300 text-[11px] font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                  Unavailable
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Owner Details */}
                          <div className="mt-3.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A]">Partner / Vehicle Owner</span>
                            <h3 className="text-base font-black text-[#26231B]">{emp.name}</h3>
                          </div>

                          {/* Info Grid */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Phone Number</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-mono font-bold text-[#26231B]">{emp.phone}</span>
                                <a
                                  href={`tel:${emp.phone}`}
                                  className="px-2 py-0.5 rounded-lg bg-white border border-[#E7E2D0] hover:bg-[#FFC20E] text-[10px] font-bold text-[#26231B]"
                                >
                                  📞 Call
                                </a>
                              </div>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">National ID (NIC)</span>
                              <span className="text-xs font-mono font-bold text-[#26231B] mt-0.5 block">
                                {emp.idNumber || "—"}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Base Location</span>
                              <span className="text-xs font-bold text-[#26231B] mt-0.5 block">
                                📍 {emp.baseCity || "Registered Base"}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Hires Completed</span>
                              <span className="text-xs font-mono font-bold text-[#26231B] mt-0.5 block">
                                {emp.totalHiresCompleted || 0} Hires
                              </span>
                            </div>
                          </div>

                          {/* Wallet Balance & Commission Section */}
                          <div className={`mt-3 p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            isLowBalance
                              ? "bg-rose-50/70 border-rose-200"
                              : "bg-emerald-50/70 border-emerald-200"
                          }`}>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">
                                Security Deposit / Wallet Balance
                              </span>
                              <div className="flex items-baseline gap-2 mt-0.5">
                                <span className={`text-lg font-black font-mono ${
                                  isLowBalance ? "text-rose-700" : "text-emerald-700"
                                }`}>
                                  Rs. {Number(emp.balance || 0).toLocaleString()}
                                </span>
                                {isLowBalance ? (
                                  <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.2 rounded-full border border-rose-300">
                                    ⚠️ Low Balance (&lt; Rs. 2,000)
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full border border-emerald-300">
                                    ✅ Ready for Hires
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="sm:text-right">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">
                                20% Commission Deducted
                              </span>
                              <span className="text-xs font-mono font-bold text-[#5B4300] mt-0.5 block">
                                Rs. {Number(emp.totalCommissionDeducted || 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Footer */}
                        <div className="pt-2 border-t border-[#E7E2D0] flex items-center justify-between text-[11px] text-[#6F6A5A]">
                          <span>Partner Since: {formatInquiryDate(emp.createdAt)}</span>
                          <span className="font-mono text-[10px]">ID: {emp.id}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB: TOP-UP BANK SLIPS                                     */}
          {/* ========================================================= */}
          {activeNav === "topup_slips" && (
            <div className="flex flex-col gap-5">
              {/* Summary Bar */}
              <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-[#26231B] flex items-center gap-2">
                      <span>Employee Top-up Bank Slips</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-mono text-[#6F6A5A]">
                        {topupSlips.length} Total
                      </span>
                    </h2>
                    <p className="text-xs text-[#6F6A5A] mt-0.5">
                      Review and approve bank deposit slips uploaded by outside lorry drivers to recharge their balance.
                    </p>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                    <button
                      type="button"
                      onClick={() => setTopupStatusFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        topupStatusFilter === "all" ? "bg-[#26231B] text-[#FFC20E] shadow-xs" : "text-[#6F6A5A] hover:text-[#26231B]"
                      }`}
                    >
                      All ({topupSlips.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopupStatusFilter("pending")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        topupStatusFilter === "pending" ? "bg-amber-400 text-[#26231B] shadow-xs" : "text-[#6F6A5A] hover:text-amber-800"
                      }`}
                    >
                      <span>Pending</span>
                      {pendingTopupSlipsCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-black bg-[#26231B] text-[#FFC20E]">
                          {pendingTopupSlipsCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopupStatusFilter("approved")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        topupStatusFilter === "approved" ? "bg-emerald-600 text-white shadow-xs" : "text-[#6F6A5A] hover:text-emerald-700"
                      }`}
                    >
                      Approved ({approvedTopupSlipsCount})
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="pt-3 border-t border-[#E7E2D0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6F6A5A] pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search by driver name, phone, plate, NIC, bank..."
                      value={topupSearch}
                      onChange={(e) => setTopupSearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#26231B] placeholder:text-[#8A836E]"
                    />
                    {topupSearch && (
                      <button
                        type="button"
                        onClick={() => setTopupSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E7E2D0]/70 text-[#26231B] flex items-center justify-center text-xs font-black cursor-pointer hover:bg-[#FFC20E]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F7F5EE] border border-[#E7E2D0] text-[11px] font-bold text-[#6F6A5A] shrink-0">
                    Showing <b className="text-[#26231B]">{filteredTopupSlips.length}</b> of <b className="text-[#26231B]">{topupSlips.length}</b>
                  </span>
                </div>
              </div>

              {/* Slips Grid */}
              {loadingTopupSlips ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#6F6A5A]">Syncing top-up slips...</p>
                </div>
              ) : filteredTopupSlips.length === 0 ? (
                <div className="p-12 rounded-3xl bg-white border border-[#E7E2D0] text-center flex flex-col items-center justify-center">
                  <h3 className="text-sm font-black text-[#26231B]">No Top-Up Slips Found</h3>
                  <p className="text-xs text-[#6F6A5A] mt-1 max-w-sm">
                    {topupSearch.trim() || topupStatusFilter !== "all"
                      ? "No slips match your search criteria."
                      : "When outside drivers submit bank slips for wallet recharge via Employee Login, they will appear here for verification."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredTopupSlips.map((slip) => {
                    const isActing = topupActionId === slip.id;
                    return (
                      <div
                        key={slip.id}
                        className="p-5 sm:p-6 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs hover:border-[#FFC20E] transition-all flex flex-col justify-between gap-4"
                      >
                        <div>
                          {/* Header: Amount & Status */}
                          <div className="flex items-center justify-between gap-2 border-b border-[#E7E2D0]/60 pb-3">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Top-up Amount</span>
                              <span className="text-xl font-black font-mono text-[#26231B]">
                                Rs. {Number(slip.amount || 0).toLocaleString()}
                              </span>
                            </div>

                            <div>
                              {slip.status === "pending" && (
                                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                                  Pending Review
                                </span>
                              )}
                              {slip.status === "approved" && (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Approved &amp; Credited
                                </span>
                              )}
                              {slip.status === "rejected" && (
                                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-black flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  Rejected
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Driver & Lorry Info */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Driver / Partner</span>
                              <span className="text-xs font-bold text-[#26231B] mt-0.5 block">{slip.employeeName}</span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Partner ID / Plate</span>
                              <span className="text-xs font-mono font-bold text-[#26231B] mt-0.5 block">
                                {slip.employeeId} · {slip.plateNumber}
                              </span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Phone Number</span>
                              <span className="text-xs font-mono font-bold text-[#26231B] mt-0.5 block">{slip.phone}</span>
                            </div>

                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6F6A5A] block">Bank Account Used</span>
                              <span className="text-xs font-semibold text-[#26231B] mt-0.5 block">{slip.bankUsed || "Bank Transfer"}</span>
                            </div>
                          </div>

                          {/* Slip Image Thumbnail */}
                          {slip.slipUrl && (
                            <div className="mt-3 p-3 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div
                                  onClick={() => setViewingSlipImage(slip.slipUrl)}
                                  className="w-14 h-14 rounded-xl overflow-hidden border border-[#E7E2D0] bg-white cursor-pointer hover:border-[#FFC20E] shrink-0"
                                >
                                  <img src={slip.slipUrl} alt="Bank Slip" className="w-full h-full object-cover" />
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-[#26231B] block">Bank Receipt Document</span>
                                  <span className="text-[10px] text-[#6F6A5A]">Click thumbnail or button to inspect</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setViewingSlipImage(slip.slipUrl)}
                                className="px-3 py-1.5 rounded-xl bg-white border border-[#E7E2D0] hover:bg-[#FFC20E] text-[#26231B] text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
                              >
                                🔍 Inspect Slip
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-3 border-t border-[#E7E2D0] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {slip.status === "pending" && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleApproveTopupSlip(slip)}
                                className="px-4 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {isActing ? (
                                  <span>Crediting...</span>
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Approve &amp; Credit Rs. {Number(slip.amount || 0).toLocaleString()}</span>
                                  </>
                                )}
                              </button>
                            )}

                            {slip.status === "approved" && (
                              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                                <span>✅</span>
                                <span>Credited on {slip.reviewedAt ? formatInquiryDate(slip.reviewedAt) : "Approved"}</span>
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleDeleteTopupSlip(slip.id)}
                            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Top-up Slip"
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
          {/* TAB 8: CONTACT INQUIRIES &amp; SUPPORT                        */}
          {/* ========================================================= */}
          {activeNav === "contact_submissions" && (
            <div className="flex flex-col gap-5">
              {/* Top Summary Bar &amp; Filters */}
              <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E7E2D0] shadow-xs flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-black text-[#26231B] flex items-center gap-2">
                      <span>Contact Inquiries &amp; Freight Quotes</span>
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
                      placeholder="Search by name, phone, subject, or message..."
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
                              <span className="px-2.5 py-1 rounded-full bg-[#FBF8EE] text-[#7A5A00] border border-[#E7DEC0] text-[11px] font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
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
                  <label className="block text-xs font-bold text-[#26231B] mb-1 flex items-center justify-between">
                    <span>Base Terminal / City</span>
                    <span className="text-[10px] font-normal text-[#8C877A]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Peliyagoda / Colombo (Optional)"
                    value={lorryForm.baseCity}
                    onChange={(e) => setLorryForm((p) => ({ ...p, baseCity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">
                    {editingLorryPlate &&
                    fleetVehicles.some(
                      (v) =>
                        v.plate === editingLorryPlate &&
                        ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
                    )
                      ? "🔒 Permanent Driver (Locked)"
                      : "Assign Rider"}
                  </label>
                  {editingLorryPlate &&
                  fleetVehicles.some(
                    (v) =>
                      v.plate === editingLorryPlate &&
                      ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
                  ) ? (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                      <div className="font-bold text-amber-950 flex items-center justify-between">
                        <span>{lorryForm.rider}</span>
                        <span className="px-2 py-0.5 rounded bg-amber-200/80 font-mono text-[10px] text-amber-900">
                          {fleetVehicles.find((v) => v.plate === editingLorryPlate)?.driverId || "Outside Driver"}
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-800 mt-1">
                        පිට ලොරි සඳහා වෙනම රියදුරන් Assign කිරීම ඉවත් කර ඇති අතර ලියාපදිංචි කළ රියදුරු ස්ථිර වේ.
                      </p>
                    </div>
                  ) : (
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
                  )}
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
                <label className="block text-xs font-bold text-[#26231B] mb-1">Rider ID</label>
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
      {showManualModal && (() => {
        const manualDates =
          manualForm.isMultiDate && manualForm.endDate
            ? getDatesBetween(manualForm.date, manualForm.endDate)
            : [manualForm.date];
        const manualTimeCheck = validateScheduleTimeAndDates(
          manualForm.date,
          manualForm.startTime,
          manualForm.isMultiDate && manualForm.endDate ? manualForm.endDate : manualForm.date,
          manualForm.endTime,
          manualDates
        );
        const manualResolvedPlate = manualForm.plate || fleetVehicles[0]?.plate || "";
        const manualMatchedVehicle = fleetVehicles.find((v) => v.plate === manualResolvedPlate);
        const manualConflict =
          manualTimeCheck.valid && manualForm.date
            ? findBookingScheduleConflict(
                {
                  date: manualTimeCheck.startDate,
                  dates: manualTimeCheck.dates,
                  startTime: manualTimeCheck.startTime,
                  endTime: manualTimeCheck.endTime,
                  assignedPlate: manualResolvedPlate,
                  assignedLorryId:
                    manualMatchedVehicle?.id ||
                    `lorry-${normalizePlate(manualResolvedPlate).toLowerCase()}`,
                  assignedDriverId: manualForm.driverId,
                  assignedDriverName: manualForm.driverName,
                  assignedDriverPhone: manualForm.driverPhone,
                  bookingType: "individual_vehicle",
                },
                bookings
              )
            : null;
        const manualRiderValid = hasAssignedRider({
          assignedDriverId: manualForm.driverId,
          assignedDriverName: manualForm.driverName,
          assignedDriverPhone: manualForm.driverPhone,
        });

        return (
          <div
            className="fixed inset-0 z-[99999] bg-black/50 flex items-start justify-center p-4 py-6 overflow-y-auto"
            onClick={() => setShowManualModal(false)}
          >
            <div
              className="w-full max-w-xl bg-white rounded-lg p-5 sm:p-6 shadow-xl border border-gray-300 my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 pb-3.5 mb-4">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Create Manual Booking</h2>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Schedule trip time, assign rider, set amount, and choose payment status.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close manual booking modal"
                  onClick={() => setShowManualModal(false)}
                  className="text-gray-600 hover:text-gray-900 font-bold text-base px-2 py-1 rounded hover:bg-gray-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="flex flex-col gap-4">
                {(() => {
                  const phoneDigits = String(manualForm.customerPhone || "").replace(/[^0-9]/g, "");
                  const matchedClient =
                    phoneDigits.length >= 9 ? lookupManualClientByPhone(manualForm.customerPhone) : null;

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-800 mb-1">Mobile Phone *</label>
                          <input
                            type="tel"
                            required
                            aria-label="Manual booking mobile phone"
                            value={manualForm.customerPhone}
                            onChange={(e) => handleManualPhoneChange(e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono font-semibold text-gray-900 focus:border-gray-900 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-800 mb-1">Customer Name *</label>
                          <input
                            type="text"
                            required
                            aria-label="Manual booking customer name"
                            value={manualForm.customerName}
                            onChange={(e) => setManualForm((p) => ({ ...p, customerName: e.target.value }))}
                            className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-800 mb-1 flex items-center justify-between">
                            <span>ID / NIC Number</span>
                            <span className="text-xs text-amber-700 font-semibold font-mono">Mandatory</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 199512345678 / 951234567V"
                            aria-label="Manual booking customer NIC or ID number"
                            value={manualForm.customerIdNumber}
                            onChange={(e) => setManualForm((p) => ({ ...p, customerIdNumber: e.target.value }))}
                            className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                          />
                        </div>
                      </div>

                      {phoneDigits.length >= 9 && (
                        matchedClient && matchedClient.isRegisteredInUsers ? (
                          <div className="px-3.5 py-2.5 rounded-md bg-green-50 border border-green-300 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div className="flex flex-wrap items-center gap-1.5 text-green-900 font-medium">
                              <span>Saved Client Found:</span>
                              <strong className="font-bold">{matchedClient.name}</strong>
                              {matchedClient.bookingsCount > 0 && (
                                <span className="text-xs text-green-800">
                                  ({matchedClient.bookingsCount} Booking{matchedClient.bookingsCount === 1 ? "" : "s"})
                                </span>
                              )}
                            </div>
                            <span className="px-2 py-0.5 rounded bg-white border border-green-300 text-green-800 text-xs font-semibold">
                              Auto-filled
                            </span>
                          </div>
                        ) : (
                          <div className="px-3.5 py-2.5 rounded-md bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-amber-900">
                                New Number — Not in Customers List
                              </span>
                              <span className="text-xs text-amber-800">
                                Enter Customer Name &amp; click Register Client, or submit to save automatically.
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={manualRegisteringClient}
                              onClick={handleManualRegisterClient}
                              className="px-3 py-1.5 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0"
                            >
                              {manualRegisteringClient ? "Registering..." : "+ Register Client"}
                            </button>
                          </div>
                        )
                      )}
                    </>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Pickup Location *</label>
                    <input
                      type="text"
                      required
                      aria-label="Manual booking pickup location"
                      value={manualForm.pickupCity}
                      onChange={(e) => setManualForm((p) => ({ ...p, pickupCity: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Delivery Destination *</label>
                    <input
                      type="text"
                      required
                      aria-label="Manual booking delivery destination"
                      value={manualForm.deliveryCity}
                      onChange={(e) => setManualForm((p) => ({ ...p, deliveryCity: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1 flex items-center justify-between">
                      <span>Distance (කිලෝමීටර්)</span>
                      <span className="text-xs text-blue-700 font-mono font-bold">KM</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      placeholder="e.g. 85"
                      aria-label="Manual booking distance in km"
                      value={manualForm.distanceKm}
                      onChange={(e) => setManualForm((p) => ({ ...p, distanceKm: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Select Lorry (Fleet) *</label>
                    <select
                      required
                      aria-label="Manual booking lorry"
                      value={manualResolvedPlate}
                      onChange={(e) => {
                        const selPlate = e.target.value;
                        const matched = fleetVehicles.find((v) => v.plate === selPlate);
                        setManualForm((p) => ({
                          ...p,
                          plate: selPlate,
                          vehicleType: matched?.vehicleType || p.vehicleType || "Lorry",
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono font-semibold text-gray-900 focus:border-gray-900 focus:outline-none"
                    >
                      {fleetVehicles.length === 0 ? (
                        <option value="">No fleet vehicles registered</option>
                      ) : (
                        fleetVehicles.map((v) => (
                          <option key={v.id || v.plate} value={v.plate}>
                            {v.plate} — {v.vehicleType}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Assign Rider (Mandatory) *</label>
                    <select
                      required
                      aria-label="Manual booking rider"
                      value={manualForm.driverName}
                      onChange={(e) => {
                        const drv = drivers.find((d) => d.name === e.target.value);
                        setManualForm((p) => ({
                          ...p,
                          driverId: drv?.driverId || "",
                          driverName: drv?.name || e.target.value,
                          driverPhone: drv?.phone || "",
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-900 focus:border-gray-900 focus:outline-none"
                    >
                      <option value="">Select Rider</option>
                      {drivers.map((d) => (
                        <option key={d.driverId} value={d.name}>
                          {d.name} ({d.driverId}) - {d.phone}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Date + Time Duration Allocation */}
                <div className="p-4 rounded-md bg-gray-50 border border-gray-200 flex flex-col gap-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-900">
                      Booking Date &amp; Time Duration *
                    </span>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Overlapping times on the same date are blocked automatically for both the lorry and rider.
                    </p>
                  </div>

                  {/* Multi-Day Booking Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md bg-blue-50/70 border border-blue-200">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        aria-label="Toggle manual multi-day booking"
                        checked={Boolean(manualForm.isMultiDate)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const sDate = manualForm.date || new Date().toISOString().split("T")[0];
                          const defaultEndDate = checked
                            ? (manualForm.endDate && manualForm.endDate > sDate ? manualForm.endDate : addDaysToYYYYMMDD(sDate, 1))
                            : sDate;
                          setManualForm((p) => ({
                            ...p,
                            isMultiDate: checked,
                            endDate: defaultEndDate,
                          }));
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold text-gray-900">
                        Multi-Day Booking (දින කිහිපයක ගමනක්)
                      </span>
                    </label>
                    {manualForm.isMultiDate && (
                      <span className="text-[11px] font-mono font-bold text-blue-900 bg-white border border-blue-300 px-2.5 py-0.5 rounded-full shadow-2xs">
                        {getDatesBetween(manualForm.date, manualForm.endDate || manualForm.date).length} Days Journey
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {manualForm.isMultiDate ? "Departure Date *" : "Trip Date *"}
                      </label>
                      <input
                        type="date"
                        required
                        aria-label="Manual booking trip date"
                        value={manualForm.date}
                        onChange={(e) => {
                          const newStartDate = e.target.value;
                          setManualForm((p) => ({
                            ...p,
                            date: newStartDate,
                            endDate: p.isMultiDate && p.endDate && p.endDate >= newStartDate ? p.endDate : (p.isMultiDate ? addDaysToYYYYMMDD(newStartDate, 1) : newStartDate),
                          }));
                        }}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {manualForm.isMultiDate ? "Departure Time *" : "Start Time *"}
                      </label>
                      <input
                        type="time"
                        required
                        aria-label="Manual booking start time"
                        value={manualForm.startTime}
                        onChange={(e) => setManualForm((p) => ({ ...p, startTime: e.target.value }))}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </div>
                    {manualForm.isMultiDate && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Date *</label>
                        <input
                          type="date"
                          required
                          min={manualForm.date}
                          aria-label="Manual booking delivery end date"
                          value={manualForm.endDate || manualForm.date}
                          onChange={(e) => setManualForm((p) => ({ ...p, endDate: e.target.value }))}
                          className="w-full px-3 py-2 rounded-md border border-blue-400 bg-blue-50/30 text-sm font-mono font-bold text-gray-900 focus:border-blue-700 focus:outline-none"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {manualForm.isMultiDate ? "Delivery Time *" : "End Time *"}
                      </label>
                      <input
                        type="time"
                        required
                        aria-label="Manual booking end time"
                        value={manualForm.endTime}
                        onChange={(e) => setManualForm((p) => ({ ...p, endTime: e.target.value }))}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {manualConflict?.hasConflict ? (
                    <div className="px-3 py-2 rounded-md bg-red-50 border border-red-300 text-sm font-semibold text-red-800">
                      {manualConflict.message}
                    </div>
                  ) : !manualTimeCheck.valid ? (
                    <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-300 text-sm font-medium text-amber-900">
                      {manualTimeCheck.error}
                    </div>
                  ) : !manualRiderValid ? (
                    <div className="px-3 py-2 rounded-md bg-amber-50 border border-amber-300 text-sm font-medium text-amber-900">
                      Please select a Rider (mandatory for every booking).
                    </div>
                  ) : manualForm.date ? (
                    <div className="px-3 py-2 rounded-md bg-green-50 border border-green-300 text-sm font-medium text-green-800">
                      Available Slot: {manualTimeCheck.isMultiDate
                        ? `${manualTimeCheck.startDate} ${formatTime12h(manualTimeCheck.startTime)} → ${manualTimeCheck.endDate} ${formatTime12h(manualTimeCheck.endTime)} (${manualTimeCheck.daysCount} Days)`
                        : `${manualTimeCheck.startDate} · ${formatTimeDurationLabel(manualTimeCheck.startTime, manualTimeCheck.endTime)}`}
                    </div>
                  ) : null}
                </div>

                {/* Amount & Payment Status Section */}
                <div className="p-4 rounded-md bg-gray-50 border border-gray-200 flex flex-col gap-3">
                  <div>
                    <span className="block text-sm font-bold text-gray-900">
                      Amount &amp; Payment Status (Manual) *
                    </span>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Enter the transport fee and choose whether payment is pending or already completed.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Amount (LKR) *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        aria-label="Manual booking amount LKR"
                        value={manualForm.quotedAmount}
                        onChange={(e) => setManualForm((p) => ({ ...p, quotedAmount: e.target.value }))}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-mono font-semibold text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Payment Note (Optional)</label>
                      <input
                        type="text"
                        aria-label="Manual booking payment note"
                        value={manualForm.paymentNote}
                        onChange={(e) => setManualForm((p) => ({ ...p, paymentNote: e.target.value }))}
                        className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="block text-xs font-medium text-gray-700 mb-1.5">
                      Select Payment Status *
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setManualForm((p) => ({ ...p, paymentStatusMode: "pending" }))}
                        className={`text-left px-3.5 py-2.5 rounded-md border cursor-pointer ${
                          manualForm.paymentStatusMode === "pending"
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-xs font-bold">Payment Pending</div>
                        <div
                          className={`text-[11px] mt-0.5 ${
                            manualForm.paymentStatusMode === "pending" ? "text-gray-200" : "text-gray-600"
                          }`}
                        >
                          පසුගෙවීම් (Full Pending)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setManualForm((p) => ({ ...p, paymentStatusMode: "partial" }))}
                        className={`text-left px-3.5 py-2.5 rounded-md border cursor-pointer ${
                          manualForm.paymentStatusMode === "partial"
                            ? "border-amber-600 bg-amber-600 text-white"
                            : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-xs font-bold">Partial Advance</div>
                        <div
                          className={`text-[11px] mt-0.5 ${
                            manualForm.paymentStatusMode === "partial" ? "text-amber-100" : "text-gray-600"
                          }`}
                        >
                          අත්තිකාරම් (Part Paid)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setManualForm((p) => ({ ...p, paymentStatusMode: "success" }))}
                        className={`text-left px-3.5 py-2.5 rounded-md border cursor-pointer ${
                          manualForm.paymentStatusMode === "success"
                            ? "border-green-700 bg-green-700 text-white"
                            : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        <div className="text-xs font-bold">Payment Success</div>
                        <div
                          className={`text-[11px] mt-0.5 ${
                            manualForm.paymentStatusMode === "success" ? "text-green-100" : "text-gray-600"
                          }`}
                        >
                          ගෙවා ඇත (Full Paid)
                        </div>
                      </button>
                    </div>

                    {manualForm.paymentStatusMode === "partial" && (
                      <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-col gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-amber-950 mb-1">
                            Advance Amount Paid Now (LKR) *
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            required
                            placeholder="e.g. 10000"
                            value={manualForm.advanceAmount}
                            onChange={(e) => setManualForm((p) => ({ ...p, advanceAmount: e.target.value }))}
                            className="w-full px-3 py-1.5 rounded-md border border-amber-300 bg-white text-sm font-semibold text-gray-900 focus:border-amber-600 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs text-amber-900 bg-white p-2 rounded border border-amber-200">
                          <span>Pending Balance:</span>
                          <strong className="font-mono font-bold text-amber-950">
                            Rs. {Math.max(0, Number(manualForm.quotedAmount || 0) - Number(manualForm.advanceAmount || 0)).toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    )}

                    {manualForm.paymentStatusMode !== "pending" && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Payment Method *
                          </label>
                          <select
                            value={manualForm.paymentMethod}
                            onChange={(e) => {
                              const val = e.target.value as "cash_manual" | "bank_transfer";
                              const activeBank = bankAccounts.find((a) => a.active) || bankAccounts[0];
                              const defaultBank = activeBank ? `${activeBank.bankName} - ${activeBank.accountNumber} (${activeBank.accountName})` : "";
                              setManualForm((p) => ({
                                ...p,
                                paymentMethod: val,
                                paymentBankUsed: val === "bank_transfer" && !p.paymentBankUsed ? defaultBank : p.paymentBankUsed,
                              }));
                            }}
                            className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                          >
                            <option value="cash_manual">Cash (අත්පිට මුදල්)</option>
                            <option value="bank_transfer">Bank Transfer (බැංකු තැන්පතු)</option>
                          </select>
                        </div>
                        {manualForm.paymentMethod === "bank_transfer" && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Company Bank Account *
                            </label>
                            <select
                              value={manualForm.paymentBankUsed}
                              onChange={(e) => setManualForm((p) => ({ ...p, paymentBankUsed: e.target.value }))}
                              className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:border-gray-900 focus:outline-none"
                            >
                              <option value="">Select Bank</option>
                              {bankAccounts
                                .filter((a) => a.active)
                                .map((acc) => (
                                  <option
                                    key={acc.id}
                                    value={`${acc.bankName} - ${acc.accountNumber} (${acc.accountName})`}
                                  >
                                    {acc.bankName} - {acc.accountNumber} ({acc.accountName})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Nature of Goods *</label>
                    <select
                      aria-label="Manual booking cargo nature"
                      value={manualForm.cargoNature}
                      onChange={(e) => setManualForm((p) => ({ ...p, cargoNature: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                    >
                      {CARGO_NATURE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-800 mb-1">Special Notes</label>
                    <input
                      type="text"
                      aria-label="Manual booking special notes"
                      value={manualForm.notes}
                      onChange={(e) => setManualForm((p) => ({ ...p, notes: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium text-gray-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={manualSubmitting || Boolean(manualConflict?.hasConflict)}
                    className="px-5 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {manualSubmitting
                      ? "Creating..."
                      : manualForm.paymentStatusMode === "success"
                      ? "Create Paid Booking"
                      : manualForm.paymentStatusMode === "partial"
                      ? "Create Booking with Advance"
                      : "Create Pending Booking"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* MODAL 4: ASSIGN DRIVER TO BOOKING                         */}
      {/* ========================================================= */}
      {assignModal && (() => {
        const isIndivModal = assignModal.booking.bookingType !== "live_lorry";
        const modalDates =
          assignModal.isMultiDate && assignModal.endDate
            ? getDatesBetween(assignModal.date, assignModal.endDate)
            : [assignModal.date];
        const modalTimeCheck = isIndivModal
          ? validateScheduleTimeAndDates(
              assignModal.date,
              assignModal.startTime,
              assignModal.isMultiDate && assignModal.endDate ? assignModal.endDate : assignModal.date,
              assignModal.endTime,
              modalDates
            )
          : null;
        const modalConflict =
          isIndivModal && modalTimeCheck?.valid && assignModal.date
            ? findBookingScheduleConflict(
                {
                  excludeBookingId: assignModal.booking.id,
                  date: modalTimeCheck.startDate,
                  dates: modalTimeCheck.dates,
                  startTime: modalTimeCheck.startTime,
                  endTime: modalTimeCheck.endTime,
                  assignedPlate: assignModal.plate,
                  assignedLorryId: assignModal.lorryId,
                  assignedDriverId: assignModal.driverId,
                  assignedDriverName: assignModal.driverName,
                  assignedDriverPhone: assignModal.driverPhone,
                  bookingType: "individual_vehicle",
                },
                bookings
              )
            : null;

        return (
          <div
            className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto"
            onClick={() => setAssignModal(null)}
          >
            <div
              className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-[#E7E2D0] my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#E7E2D0] pb-3 mb-4">
                <h2 className="text-base font-black text-[#26231B]">
                  {isIndivModal ? "Assign Rider & Time Schedule" : "Assign Rider & Lorry"}
                </h2>
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
                <div className="mt-1">Requested Date: <b>{assignModal.booking.date}</b></div>
              </div>

              <div className="flex flex-col gap-3">
                {isIndivModal && (
                  <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0]">
                    <div className="flex items-center justify-between">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          aria-label="Toggle modal multi-day booking"
                          checked={Boolean(assignModal.isMultiDate)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const sDate = assignModal.date || new Date().toISOString().split("T")[0];
                            const defaultEndDate = checked
                              ? (assignModal.endDate && assignModal.endDate > sDate ? assignModal.endDate : addDaysToYYYYMMDD(sDate, 1))
                              : sDate;
                            setAssignModal((p) => (p ? {
                              ...p,
                              isMultiDate: checked,
                              endDate: defaultEndDate,
                            } : null));
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-[#26231B]">
                          Multi-Day Booking (දින කිහිපයක ගමනක්)
                        </span>
                      </label>
                      {assignModal.isMultiDate && (
                        <span className="text-[11px] font-mono font-bold text-blue-900 bg-white border border-blue-300 px-2 py-0.5 rounded-full shadow-2xs">
                          {getDatesBetween(assignModal.date, assignModal.endDate || assignModal.date).length} Days
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                          {assignModal.isMultiDate ? "Departure Date *" : "Trip Date *"}
                        </label>
                        <input
                          type="date"
                          value={assignModal.date}
                          onChange={(e) => {
                            const newStartDate = e.target.value;
                            setAssignModal((p) => (p ? {
                              ...p,
                              date: newStartDate,
                              endDate: p.isMultiDate && p.endDate && p.endDate >= newStartDate ? p.endDate : (p.isMultiDate ? addDaysToYYYYMMDD(newStartDate, 1) : newStartDate),
                            } : null));
                          }}
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs font-mono font-bold text-[#26231B]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                          {assignModal.isMultiDate ? "Departure Time *" : "Start Time *"}
                        </label>
                        <input
                          type="time"
                          value={assignModal.startTime}
                          onChange={(e) => setAssignModal((p) => (p ? { ...p, startTime: e.target.value } : null))}
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs font-mono font-bold text-[#26231B]"
                        />
                      </div>
                      {assignModal.isMultiDate && (
                        <div>
                          <label className="block text-[11px] font-bold text-[#26231B] mb-1">Delivery Date *</label>
                          <input
                            type="date"
                            min={assignModal.date}
                            value={assignModal.endDate || assignModal.date}
                            onChange={(e) => setAssignModal((p) => (p ? { ...p, endDate: e.target.value } : null))}
                            className="w-full px-2.5 py-2 rounded-xl border border-blue-400 bg-blue-50/40 text-xs font-mono font-bold text-[#26231B]"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-bold text-[#26231B] mb-1">
                          {assignModal.isMultiDate ? "Delivery Time *" : "End Time *"}
                        </label>
                        <input
                          type="time"
                          value={assignModal.endTime}
                          onChange={(e) => setAssignModal((p) => (p ? { ...p, endTime: e.target.value } : null))}
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs font-mono font-bold text-[#26231B]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#26231B] mb-1 flex items-center justify-between">
                          <span>Distance</span>
                          <span className="font-mono text-blue-600">KM</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="0.1"
                          placeholder="e.g. 120"
                          value={assignModal.distanceKm || ""}
                          onChange={(e) => setAssignModal((p) => (p ? { ...p, distanceKm: e.target.value } : null))}
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E7E2D0] bg-white text-xs font-mono font-bold text-[#26231B]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Assigned Vehicle Plate */}
                <div>
                  <label className="block text-xs font-bold text-[#26231B] mb-1">Assigned Vehicle Plate *</label>
                  <select
                    value={assignModal.plate}
                    onChange={(e) => {
                      const selPlate = e.target.value;
                      const matchedV = fleetVehicles.find((v) => v.plate === selPlate);
                      const isOut = Boolean(
                        matchedV &&
                        ((matchedV as any).isOutsideLorry || (matchedV as any).ownershipType === "outside")
                      );
                      setAssignModal((p) =>
                        p
                          ? {
                              ...p,
                              plate: selPlate,
                              lorryId: matchedV?.id || `lorry-${normalizePlate(selPlate).toLowerCase()}`,
                              ...(isOut && matchedV?.driverName
                                ? {
                                    driverName: matchedV.driverName,
                                    driverPhone: matchedV.driverPhone || p.driverPhone,
                                    driverId: (matchedV as any).ownerIdNumber || "OUTSIDE-OWNER",
                                  }
                                : {}),
                            }
                          : null
                      );
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B]"
                  >
                    <option value="">Select Lorry</option>
                    {fleetVehicles.map((v) => {
                      const isOut = (v as any).isOutsideLorry || (v as any).ownershipType === "outside";
                      return (
                        <option key={v.id || v.plate} value={v.plate}>
                          {v.plate} — {v.vehicleType} {isOut ? "(🤝 Outside Partner)" : "(🏢 Company)"}
                        </option>
                      );
                    })}
                    {assignModal.plate && !fleetVehicles.some((v) => v.plate === assignModal.plate) && (
                      <option value={assignModal.plate}>{assignModal.plate}</option>
                    )}
                  </select>
                </div>

                {/* Driver Assignment Section: Locked for Outside Lorry vs Selectable for Company Lorry */}
                {Boolean(
                  assignModal.plate &&
                  fleetVehicles.some(
                    (v) =>
                      v.plate === assignModal.plate &&
                      ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
                  )
                ) ? (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <span>🔒 ස්ථිර රියදුරු / Permanent Driver (Locked)</span>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] font-mono text-[11px] font-black">
                        {assignModal.driverId || "Assigned"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-amber-800/80 block">Driver Name</span>
                        <span className="font-bold text-[#26231B]">{assignModal.driverName || "Registered Owner"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-amber-800/80 block">Contact</span>
                        <span className="font-bold font-mono text-[#26231B]">{assignModal.driverPhone || "—"}</span>
                      </div>
                    </div>
                    <p className="text-[10.5px] text-amber-800 mt-0.5">
                      පිට ලොරි සඳහා වෙනම රියදුරන් Assign කිරීම ඉවත් කර ඇති අතර ලියාපදිංචි කළ රියදුරු ස්වයංක්‍රීයව ස්ථිර රියදුරු ලෙස යොදවා ඇත.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#26231B] mb-1">
                        Select Rider *
                      </label>
                      <select
                        value={assignModal.driverName}
                        onChange={(e) => {
                          const drv = drivers.find((d) => d.name === e.target.value);
                          setAssignModal((p) => {
                            if (!p) return null;
                            const preservedPlate = p.plate || drv?.plate || "";
                            const derivedLorryId = preservedPlate
                              ? `lorry-${normalizePlate(preservedPlate).toLowerCase()}`
                              : p.lorryId;
                            return {
                              ...p,
                              driverId: drv?.driverId || "",
                              driverName: drv?.name || e.target.value,
                              driverPhone: drv?.phone || p.driverPhone,
                              plate: preservedPlate,
                              lorryId: derivedLorryId,
                            };
                          });
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs text-[#26231B]"
                      >
                        <option value="">Select Rider</option>
                        {drivers.map((d) => (
                          <option key={d.driverId} value={d.name}>{d.name} ({d.driverId}) - {d.phone}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#26231B] mb-1">
                        Rider Mobile Number (Shown to Customer)
                      </label>
                      <input
                        type="tel"
                        value={assignModal.driverPhone}
                        onChange={(e) => setAssignModal((p) => (p ? { ...p, driverPhone: e.target.value } : null))}
                        className="w-full px-3 py-2 rounded-xl border border-[#E7E2D0] bg-[#F7F5EE] text-xs font-mono font-bold text-[#26231B]"
                      />
                    </div>
                  </>
                )}

                {modalConflict?.hasConflict && (
                  <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-300 text-[11.5px] font-bold text-red-700">
                    {modalConflict.message}
                  </div>
                )}

                {isIndivModal && modalTimeCheck && !modalTimeCheck.valid && (
                  <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-800">
                    {modalTimeCheck.error}
                  </div>
                )}

                {isIndivModal && modalTimeCheck && modalTimeCheck.valid && (
                  <div className="px-3 py-2 rounded-xl bg-green-50 border border-green-300 text-[11px] font-bold text-green-800">
                    Slot Available: {modalTimeCheck.isMultiDate
                      ? `${modalTimeCheck.startDate} ${formatTime12h(modalTimeCheck.startTime)} → ${modalTimeCheck.endDate} ${formatTime12h(modalTimeCheck.endTime)} (${modalTimeCheck.daysCount} Days)`
                      : `${modalTimeCheck.startDate} · ${formatTimeDurationLabel(modalTimeCheck.startTime, modalTimeCheck.endTime)}`}
                  </div>
                )}

                {assignModal.booking.bookingType === "individual_vehicle" && (
                  <p className="text-[11px] text-[#6F6A5A] bg-[#F7F5EE] px-3 py-2 rounded-xl border border-[#E7E2D0]">
                    Individual vehicle booking: schedule &amp; driver contact display on Customer Portal only (not sent to the Rider mobile app).
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
                    disabled={Boolean(modalConflict?.hasConflict)}
                    onClick={confirmAssign}
                    className="px-5 py-2 rounded-xl bg-[#26231B] text-white hover:bg-[#FFC20E] hover:text-[#26231B] text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    Confirm Assignment
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                      Approve Payment &amp; Schedule
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* MODAL: DELETE CUSTOMER CONFIRMATION                       */}
      {/* ========================================================= */}
      {deleteCustomerModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto"
          onClick={() => {
            if (!deletingCustomerId) setDeleteCustomerModal(null);
          }}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-[#E7E2D0] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E7E2D0] pb-3">
              <div>
                <h2 className="text-base font-black text-[#26231B]">Delete Customer Profile</h2>
                <p className="text-xs text-[#6F6A5A] mt-0.5">
                  Remove this client from the Customers directory &amp; database.
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(deletingCustomerId)}
                onClick={() => setDeleteCustomerModal(null)}
                className="text-[#6F6A5A] hover:text-[#26231B] font-bold text-sm p-1 cursor-pointer disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F7F5EE] border border-[#E7E2D0] flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#26231B] text-[#FFC20E] flex items-center justify-center font-black text-base shrink-0">
                {(deleteCustomerModal.name || "C").trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-[#26231B] truncate">
                  {deleteCustomerModal.name}
                </div>
                <div className="text-xs font-mono font-bold text-[#6F6A5A]">
                  {deleteCustomerModal.phone || "No phone number"}
                </div>
                {deleteCustomerModal.totalBookings > 0 && (
                  <div className="text-[11px] font-bold text-amber-800 mt-1">
                    {deleteCustomerModal.totalBookings} Booking{deleteCustomerModal.totalBookings === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </div>

            {deleteCustomerModal.totalBookings > 0 ? (
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col gap-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={deleteCustomerModal.deleteBookings}
                    onChange={(e) =>
                      setDeleteCustomerModal((prev) =>
                        prev ? { ...prev, deleteBookings: e.target.checked } : null
                      )
                    }
                    className="mt-0.5 rounded border-amber-400 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs font-bold text-[#26231B] leading-snug">
                    Also permanently delete all {deleteCustomerModal.totalBookings} booking
                    {deleteCustomerModal.totalBookings === 1 ? "" : "s"} for this customer
                  </span>
                </label>
                <p className="text-[11px] text-amber-900 leading-relaxed pl-6">
                  Leave unchecked to remove the customer from the Customers list while keeping past booking &amp; revenue records intact.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#6F6A5A] leading-relaxed">
                This will permanently remove <b className="text-[#26231B]">{deleteCustomerModal.name}</b> from Firestore and the Admin Customers list.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E2D0]">
              <button
                type="button"
                disabled={Boolean(deletingCustomerId)}
                onClick={() => setDeleteCustomerModal(null)}
                className="px-4 py-2 rounded-xl border border-[#E7E2D0] text-xs font-bold text-[#26231B] hover:bg-[#F7F5EE] cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingCustomerId)}
                onClick={handleConfirmDeleteCustomer}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {deletingCustomerId ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Payment Approval & Setup Modal */}
      {paymentApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                <h3 className="text-base font-bold">Payment Approval &amp; Setup</h3>
              </div>
              <button
                type="button"
                onClick={() => setPaymentApprovalModal(null)}
                className="text-gray-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              {/* Booking Summary Box */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-gray-900">
                    {paymentApprovalModal.booking.id}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {paymentApprovalModal.booking.pickupCity} → {paymentApprovalModal.booking.deliveryCity}
                  </span>
                </div>
                <div className="text-gray-600">
                  Customer: <strong className="text-gray-900">{paymentApprovalModal.booking.customerName}</strong>
                  {paymentApprovalModal.booking.customerPhone && (
                    <span className="font-mono ml-1">({paymentApprovalModal.booking.customerPhone})</span>
                  )}
                </div>
              </div>

              {/* Total Booking Amount (LKR) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Total Booking Amount (LKR) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={paymentApprovalModal.totalAmount}
                  onChange={(e) =>
                    setPaymentApprovalModal((prev) =>
                      prev ? { ...prev, totalAmount: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm font-semibold focus:border-gray-900 focus:outline-none"
                  aria-label="Total booking amount in LKR"
                />
              </div>

              {/* Payment Collection Mode Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                  Payment Collection Mode (ගෙවීමේ ආකාරය) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Option 1: Full Paid */}
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentApprovalModal((prev) =>
                        prev ? { ...prev, collectionMode: "full_paid" } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      paymentApprovalModal.collectionMode === "full_paid"
                        ? "bg-green-50 border-green-600 ring-2 ring-green-500/40"
                        : "bg-white border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-green-900 flex items-center gap-1.5">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] font-bold ${
                            paymentApprovalModal.collectionMode === "full_paid"
                              ? "bg-green-600 text-white border-green-700"
                              : "border-gray-400 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        Full Paid
                      </span>
                    </div>
                    <span className="text-[11px] text-green-800 leading-snug">
                      සම්පූර්ණ මුදල ගෙවා අවසන්
                    </span>
                  </button>

                  {/* Option 2: Partial Advance */}
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentApprovalModal((prev) =>
                        prev ? { ...prev, collectionMode: "partial_advance" } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      paymentApprovalModal.collectionMode === "partial_advance"
                        ? "bg-amber-50 border-amber-600 ring-2 ring-amber-500/40"
                        : "bg-white border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] font-bold ${
                            paymentApprovalModal.collectionMode === "partial_advance"
                              ? "bg-amber-600 text-white border-amber-700"
                              : "border-gray-400 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        Advance Paid
                      </span>
                    </div>
                    <span className="text-[11px] text-amber-800 leading-snug">
                      කොටසක් ගෙවා ඇත (ඉතිරිය පසුගෙවීම්)
                    </span>
                  </button>

                  {/* Option 3: Full Pending */}
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentApprovalModal((prev) =>
                        prev ? { ...prev, collectionMode: "full_pending" } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      paymentApprovalModal.collectionMode === "full_pending"
                        ? "bg-gray-100 border-gray-700 ring-2 ring-gray-700/30"
                        : "bg-white border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[8px] font-bold ${
                            paymentApprovalModal.collectionMode === "full_pending"
                              ? "bg-gray-800 text-white border-gray-900"
                              : "border-gray-400 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        Full Pending
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-700 leading-snug">
                      මුළු මුදලම පසුව ගෙවීම
                    </span>
                  </button>
                </div>
              </div>

              {/* When Partial Advance: Input for Advance Amount & Show Balance */}
              {paymentApprovalModal.collectionMode === "partial_advance" && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-950 uppercase tracking-wider mb-1">
                      Advance Paid Now (LKR) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 10000"
                      value={paymentApprovalModal.advanceAmount}
                      onChange={(e) =>
                        setPaymentApprovalModal((prev) =>
                          prev ? { ...prev, advanceAmount: e.target.value } : null
                        )
                      }
                      className="w-full px-3.5 py-2 rounded-lg border border-amber-300 bg-white text-gray-900 text-sm font-semibold focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-amber-900 bg-white p-2.5 rounded-lg border border-amber-200">
                    <span>Remaining Balance (Pending):</span>
                    <strong className="font-mono text-sm font-bold text-amber-950">
                      Rs. {Math.max(
                        0,
                        Number(paymentApprovalModal.totalAmount || 0) -
                          Number(paymentApprovalModal.advanceAmount || 0)
                      ).toLocaleString()}
                    </strong>
                  </div>
                </div>
              )}

              {/* Payment Method Selector (For Full Paid or Partial Advance) */}
              {paymentApprovalModal.collectionMode !== "full_pending" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Payment Method *
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentApprovalModal((prev) =>
                            prev ? { ...prev, paymentMethod: "cash_manual" } : null
                          )
                        }
                        className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          paymentApprovalModal.paymentMethod === "cash_manual"
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        💵 Cash (අත්පිට මුදල්)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentApprovalModal((prev) =>
                            prev ? { ...prev, paymentMethod: "bank_transfer" } : null
                          )
                        }
                        className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                          paymentApprovalModal.paymentMethod === "bank_transfer"
                            ? "bg-gray-900 text-white border-gray-900"
                            : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        🏦 Bank Transfer (බැංකු තැන්පතු)
                      </button>
                    </div>
                  </div>

                  {paymentApprovalModal.paymentMethod === "bank_transfer" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                        Select Company Bank Account *
                      </label>
                      <select
                        value={paymentApprovalModal.bankUsed}
                        onChange={(e) =>
                          setPaymentApprovalModal((prev) =>
                            prev ? { ...prev, bankUsed: e.target.value } : null
                          )
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-xs font-semibold focus:border-gray-900 focus:outline-none"
                      >
                        {bankAccounts
                          .filter((a) => a.active)
                          .map((acc) => (
                            <option
                              key={acc.id}
                              value={`${acc.bankName} - ${acc.accountNumber} (${acc.accountName})`}
                            >
                              {acc.bankName} - {acc.accountNumber} ({acc.accountName} · {acc.branch})
                            </option>
                          ))}
                        {bankAccounts.filter((a) => a.active).length === 0 && (
                          <option value="Commercial Bank - 100029384920">
                            Commercial Bank - 100029384920
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Note (Optional) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Payment Note (Optional)
                </label>
                <input
                  type="text"
                  value={paymentApprovalModal.note}
                  onChange={(e) =>
                    setPaymentApprovalModal((prev) =>
                      prev ? { ...prev, note: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                  aria-label="Payment note"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentApprovalModal(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentApproval}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-sm ${
                  paymentApprovalModal.collectionMode === "full_paid"
                    ? "bg-green-700 hover:bg-green-800"
                    : paymentApprovalModal.collectionMode === "partial_advance"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-gray-900 hover:bg-gray-800"
                }`}
              >
                {paymentApprovalModal.collectionMode === "full_paid"
                  ? "Confirm Full Payment"
                  : paymentApprovalModal.collectionMode === "partial_advance"
                  ? "Confirm Advance Payment"
                  : "Confirm as Full Pending"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Remaining Balance Modal */}
      {settleBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                <h3 className="text-base font-bold">Settle Remaining Balance</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettleBalanceModal(null)}
                className="text-gray-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col gap-4">
              {/* Summary Box */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono font-bold text-gray-900">
                  <span>{settleBalanceModal.booking.id}</span>
                  <span className="font-sans font-semibold text-gray-800">
                    {settleBalanceModal.booking.pickupCity} → {settleBalanceModal.booking.deliveryCity}
                  </span>
                </div>
                <div className="text-gray-600">
                  Customer: <strong className="text-gray-900">{settleBalanceModal.booking.customerName}</strong>
                  {settleBalanceModal.booking.customerPhone && (
                    <span className="font-mono ml-1">({settleBalanceModal.booking.customerPhone})</span>
                  )}
                </div>
              </div>

              {/* Balance Amount Due Card */}
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-900 uppercase tracking-wider block">
                    Remaining Balance Due
                  </span>
                  <span className="text-[11px] text-amber-800">
                    Total: Rs. {(settleBalanceModal.booking.quotedAmount || settleBalanceModal.pendingAmount).toLocaleString()}
                    {settleBalanceModal.booking.advanceAmount && settleBalanceModal.booking.advanceAmount > 0
                      ? ` · Paid: Rs. ${settleBalanceModal.booking.advanceAmount.toLocaleString()}`
                      : ""}
                  </span>
                </div>
                <span className="font-mono text-xl font-black text-amber-950">
                  Rs. {settleBalanceModal.pendingAmount.toLocaleString()}
                </span>
              </div>

              {/* Settlement Method */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Settlement Method (මුදල් ගෙවූ ආකාරය) *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSettleBalanceModal((prev) =>
                        prev ? { ...prev, settleMethod: "cash_manual" } : null
                      )
                    }
                    className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      settleBalanceModal.settleMethod === "cash_manual"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    💵 Cash (අත්පිට මුදල්)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettleBalanceModal((prev) =>
                        prev ? { ...prev, settleMethod: "bank_transfer" } : null
                      )
                    }
                    className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      settleBalanceModal.settleMethod === "bank_transfer"
                        ? "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    🏦 Bank Transfer (බැංකු තැන්පතු)
                  </button>
                </div>
              </div>

              {settleBalanceModal.settleMethod === "bank_transfer" && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Select Receiving Company Bank *
                  </label>
                  <select
                    value={settleBalanceModal.bankUsed}
                    onChange={(e) =>
                      setSettleBalanceModal((prev) =>
                        prev ? { ...prev, bankUsed: e.target.value } : null
                      )
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-xs font-semibold focus:border-gray-900 focus:outline-none"
                  >
                    {bankAccounts
                      .filter((a) => a.active)
                      .map((acc) => (
                        <option
                          key={acc.id}
                          value={`${acc.bankName} - ${acc.accountNumber} (${acc.accountName})`}
                        >
                          {acc.bankName} - {acc.accountNumber} ({acc.accountName} · {acc.branch})
                        </option>
                      ))}
                    {bankAccounts.filter((a) => a.active).length === 0 && (
                      <option value="Commercial Bank - 100029384920">
                        Commercial Bank - 100029384920
                      </option>
                    )}
                  </select>
                </div>
              )}

              {/* Note (Optional) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Settlement Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid on delivery"
                  value={settleBalanceModal.note}
                  onChange={(e) =>
                    setSettleBalanceModal((prev) =>
                      prev ? { ...prev, note: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSettleBalanceModal(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSettleBalance}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-green-700 hover:bg-green-800 transition-all cursor-pointer shadow-sm"
              >
                Confirm Settlement (Rs. {settleBalanceModal.pendingAmount.toLocaleString()})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Deletion with Mandatory Reason Modal */}
      {deleteBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-red-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-red-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-white animate-pulse"></span>
                <div>
                  <h3 className="text-base font-bold">Delete Booking · හේතුව ඇතුළත් කරන්න</h3>
                  <p className="text-[11px] text-red-100">Deletion reason is mandatory and will be logged in Complaints.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteBookingModal(null)}
                className="text-white/80 hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col gap-4">
              {/* Booking Summary Box */}
              <div className="p-3.5 bg-red-50/60 rounded-xl border border-red-200 text-xs text-gray-800 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-red-900">
                    Booking #{deleteBookingModal.booking.id}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {deleteBookingModal.booking.pickupCity} → {deleteBookingModal.booking.deliveryCity}
                  </span>
                </div>
                <div className="text-gray-700 flex flex-wrap items-center gap-2">
                  <span>Customer: <strong className="text-gray-900">{deleteBookingModal.booking.customerName}</strong></span>
                  {deleteBookingModal.booking.customerPhone && (
                    <span className="font-mono text-gray-600">({deleteBookingModal.booking.customerPhone})</span>
                  )}
                  {deleteBookingModal.booking.customerIdNumber && (
                    <span className="font-mono text-xs px-1.5 py-0.5 bg-white border border-red-200 rounded text-red-800">
                      NIC: {deleteBookingModal.booking.customerIdNumber}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-600 pt-1 border-t border-red-200/60">
                  <span>Date: <b>{deleteBookingModal.booking.date || "Unspecified"}</b></span>
                  {deleteBookingModal.booking.distanceKm && (
                    <span>Distance: <b>{deleteBookingModal.booking.distanceKm} km</b></span>
                  )}
                  {deleteBookingModal.booking.quotedAmount !== undefined && (
                    <span>Amount: <b>Rs. {Number(deleteBookingModal.booking.quotedAmount).toLocaleString()}</b></span>
                  )}
                </div>
              </div>

              {/* Mandatory Reason Input */}
              <div>
                <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-1.5">
                  Booking එක Delete කිරීමට හේතුව (Mandatory Reason) <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={deleteBookingModal.reason}
                  onChange={(e) =>
                    setDeleteBookingModal((p) => (p ? { ...p, reason: e.target.value, error: "" } : null))
                  }
                  placeholder="Booking එක Delete කිරීමට නිශ්චිත හේතුව ඇතුළත් කරන්න (උදා: පාරිභෝගිකයාගේ ඉල්ලීම මත, මිල ගණන් නොගැලපීම, වාහන නොමැතිකම...)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                />
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-gray-500">Quick reasons (කෙටි හේතු):</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Customer cancelled / පාරිභෝගිකයා අවලංගු කළා",
                    "Price disagreement / මිල ගණන් එකඟ නොවීය",
                    "Customer unreachable / දුරකථන සම්බන්ධ කරගත නොහැකි විය",
                    "No vehicle available / වාහන නොමැතිකම",
                    "Duplicate booking / ද්විත්ව ලියාපදිංචියක්",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setDeleteBookingModal((p) => (p ? { ...p, reason: preset, error: "" } : null))
                      }
                      className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-gray-200 text-[11px] font-medium text-gray-700 transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {deleteBookingModal.error && (
                <div className="p-2.5 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs font-semibold">
                  ⚠️ {deleteBookingModal.error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingBookingLoading}
                onClick={() => setDeleteBookingModal(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBookingLoading || !deleteBookingModal.reason.trim()}
                onClick={handleConfirmDeleteBookingWithReason}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all cursor-pointer shadow-sm disabled:opacity-40"
              >
                {deletingBookingLoading ? "Deleting..." : "Confirm & Delete Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SIZE SLIP IMAGE INSPECTION MODAL */}
      {viewingSlipImage && (
        <div
          className="fixed inset-0 z-[999999] bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setViewingSlipImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 bg-[#26231B] text-white">
              <span className="text-xs font-bold font-mono">Bank Deposit Slip Document</span>
              <button
                type="button"
                onClick={() => setViewingSlipImage(null)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-black cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-[#F7F5EE] max-h-[80vh]">
              <img
                src={viewingSlipImage}
                alt="Bank Slip"
                className="max-h-[75vh] w-auto object-contain rounded-xl shadow-md border border-[#E7E2D0]"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
