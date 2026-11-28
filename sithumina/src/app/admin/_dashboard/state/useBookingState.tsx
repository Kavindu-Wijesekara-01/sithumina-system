"use client";

import { useAuth } from "@/context/AuthContext";
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { StoredBooking, StoredComplaint, PaymentSlipStatus, BookingPaymentMethod, StoredRegistration, StoredInquiry, StoredCustomer } from "@/lib/server-store";
import { normalizePlate, normalizePhoneNumber, phonesMatch } from "@/lib/phone-utils";
import { cleanRiderName, findBookingScheduleConflict, getDatesBetween, hasAssignedRider, validateScheduleTimeAndDates } from "@/lib/booking-schedule";
import { BankAccountSetting, PaymentSlipRecord, subscribePaymentBankAccounts, subscribePaymentSlipMetadataList } from "@/lib/payment-settings";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { subscribeFleetVehicles, subscribeAdminDrivers, AdminDriverRecord } from "@/lib/db-services";
import { Lorry } from "@/lib/mock-lorries";
import { updateBookingStatusAction, editBookingAction, deleteBookingAction, getAllComplaintsAction, getAllBookingsAction, getAllRegistrationsAction, getAllInquiriesAction, getCustomersAction, getAllOutsideEmployeesAction, registerOutsideEmployeeManuallyAction, getAllTopupSlipsAction, OutsideEmployeeRecord, TopupSlipRecord } from "@/actions";
import { tripFields } from "@/lib/trip-state";
import { todayYmd, withExternalOwners } from "@/lib/ledger";
import { subscribeBookingFeed, type BookingFeed } from "@/lib/booking-feed";
import { AssignModalState, BookingStatus, CARGO_NATURE_OPTIONS, LorryFormState, ManualBookingForm, NavSection, RevenueTimeFilter, RiderFormState, ScheduleDraft, StatusFilter, VEHICLE_TYPE_OPTIONS, getSriLankaDateStr } from "../shared";

/** Dashboard state and actions, part 1 of 3. */
export function useStage1() {
  // ---- Auth Gate ----
  const { profile: signedIn, logout: signOutAdmin } = useAuth();
  const authed = signedIn?.role === "admin";
  // Persist admin authentication state during browser tab session
  // ---- Navigation State ----
  const [activeNav, setActiveNav] = useState<NavSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  // ---- Section Data States ----
  const [storedBookings, setBookings] = useState<StoredBooking[]>([]);
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
  const bookings = useMemo(() => withExternalOwners(storedBookings, outsideEmployees), [storedBookings, outsideEmployees]);
  const [loadingOutsideEmployees, setLoadingOutsideEmployees] = useState(true);
  const [outsideSearch, setOutsideSearch] = useState("");
  // ---- Manual Outside Employee Registration ----
  const emptyOutsideForm = {
    name: "", idNumber: "", phone: "", plateNumber: "", vehicleType: "14ft Lorry",
    baseCity: "", initialBalance: "5000", status: "active" as "active" | "inactive" | "suspended",
    isAvailable: true,
    paidInto: "",
  };
  const [showOutsideRegModal, setShowOutsideRegModal] = useState(false);
  const [outsideForm, setOutsideForm] = useState(emptyOutsideForm);
  const [outsideFormErrors, setOutsideFormErrors] = useState<Record<string, string>>({});
  const [outsideFormServerError, setOutsideFormServerError] = useState("");
  const [submittingOutside, setSubmittingOutside] = useState(false);
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
  const [completedPaymentMethodFilter, setCompletedPaymentMethodFilter] = useState<string>("all");
  const [inspectBookingModal, setInspectBookingModal] = useState<StoredBooking | null>(null);
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
  const [lorryError, setLorryError] = useState("");
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
  const [riderError, setRiderError] = useState("");
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
    date: todayYmd(),
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
  // ---- Outside Driver Permanent Association Helper ----
  const getOutsideDriverForPlate = useCallback(
    (targetPlate: string | undefined | null) => {
      if (!targetPlate) return null;
      const norm = normalizePlate(targetPlate);
      if (!norm) return null;
      // 1. Outside employees collection (highest priority)
      const emp = outsideEmployees.find(
        (e) => normalizePlate(e.plateNumber) === norm
      );
      if (emp) {
        return {
          isOutside: true,
          driverId: emp.driverId || emp.id,
          driverName: emp.name,
          driverPhone: emp.phone,
          plate: emp.plateNumber,
        };
      }
      // 2. Drivers roster
      const drv = drivers.find(
        (d) => normalizePlate(d.plate) === norm
      );
      if (drv) {
        return {
          isOutside: true,
          driverId: drv.driverId,
          driverName: drv.name,
          driverPhone: drv.phone,
          plate: drv.plate || targetPlate,
        };
      }
      // 3. Vehicle registrations
      const reg = registrations.find(
        (r) => normalizePlate((r as any).vehicleNumber || (r as any).plateNumber) === norm
      );
      if (reg) {
        return {
          isOutside: true,
          driverId: (reg as any).driverId || (reg as any).id || "",
          driverName: (reg as any).ownerName || (reg as any).driverName || "",
          driverPhone: (reg as any).phone || "",
          plate: (reg as any).vehicleNumber || (reg as any).plateNumber || targetPlate,
        };
      }
      // 4. Fleet lorries flagged as outside
      const flt = fleetVehicles.find(
        (v) =>
          normalizePlate(v.plate) === norm &&
          (Boolean((v as any).isOutsideLorry || (v as any).ownershipType === "outside") ||
            Boolean(v.driverName && v.driverName !== "Unassigned" && v.driverName !== "Driver"))
      );
      if (flt && (flt.isOutsideLorry || flt.ownershipType === "outside")) {
        return {
          isOutside: true,
          driverId: flt.driverId || "",
          driverName: flt.driverName || "",
          driverPhone: flt.driverPhone || "",
          plate: flt.plate,
        };
      }
      return null;
    },
    [outsideEmployees, drivers, registrations, fleetVehicles]
  );
  // ---- Edit Booking Modal State ----
  const [editingBookingModal, setEditingBookingModal] = useState<{
    id: string;
    booking: StoredBooking;
    date: string;
    endDate?: string;
    isMultiDate?: boolean;
    startTime: string;
    endTime: string;
    distanceKm: string;
    pickupCity: string;
    deliveryCity: string;
    quotedAmount: string;
    advanceAmount: string;
    pendingAmount: string;
    cargoNature: string;
    cargoWeight: string;
    helpersCount: string;
    assignedPlate: string;
    assignedLorryId: string;
    assignedDriverId: string;
    assignedDriverName: string;
    assignedDriverPhone: string;
  } | null>(null);
  const [editingBookingLoading, setEditingBookingLoading] = useState(false);
  const openEditBookingModal = (b: StoredBooking) => {
    const isMulti = Boolean(Array.isArray(b.dates) && b.dates.length > 1);
    const resolvedEndDate = isMulti && b.dates ? b.dates[b.dates.length - 1] : "";
    const outsideInfo = getOutsideDriverForPlate(b.assignedPlate);
    setEditingBookingModal({
      id: b.id,
      booking: b,
      date: b.date || (Array.isArray(b.dates) ? b.dates[0] : "") || "",
      endDate: resolvedEndDate,
      isMultiDate: isMulti,
      startTime: b.startTime || "08:00",
      endTime: b.endTime || "17:00",
      distanceKm: b.distanceKm ? String(b.distanceKm) : "",
      pickupCity: b.pickupCity || "",
      deliveryCity: b.deliveryCity || "",
      quotedAmount: b.quotedAmount ? String(b.quotedAmount) : "",
      advanceAmount: b.advanceAmount ? String(b.advanceAmount) : "0",
      pendingAmount: b.pendingAmount ? String(b.pendingAmount) : "",
      cargoNature: b.cargoNature || CARGO_NATURE_OPTIONS[0],
      cargoWeight: b.cargoWeight || "",
      helpersCount: String(b.helpersCount || "0"),
      assignedPlate: b.assignedPlate || "",
      assignedLorryId: b.assignedLorryId || "",
      assignedDriverId: outsideInfo?.driverId || b.assignedDriverId || "",
      assignedDriverName: outsideInfo?.driverName || b.assignedDriverName || "",
      assignedDriverPhone: outsideInfo?.driverPhone || b.assignedDriverPhone || "",
    });
  };
  const handleSaveEditBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBookingModal) return;
    const {
      id,
      date,
      endDate,
      isMultiDate,
      startTime,
      endTime,
      distanceKm,
      pickupCity,
      deliveryCity,
      quotedAmount,
      advanceAmount,
      cargoNature,
      cargoWeight,
      helpersCount,
      assignedPlate,
      assignedLorryId,
      assignedDriverId,
      assignedDriverName,
      assignedDriverPhone,
    } = editingBookingModal;
    if (!pickupCity.trim() || !deliveryCity.trim()) {
      showToast("Pickup and delivery locations are required.", "error");
      return;
    }
    const distNum = Number(String(distanceKm || "").replace(/[^0-9.]/g, ""));
    if (!distNum || distNum <= 0) {
      showToast("Distance in KM is mandatory.", "error");
      return;
    }
    if (!date.trim()) {
      showToast("Please enter a booking date.", "error");
      return;
    }
    const resolvedEndDate = isMultiDate && endDate ? endDate.trim() : date.trim();
    const rawDates = isMultiDate && endDate ? getDatesBetween(date.trim(), endDate.trim()) : [date.trim()];
    const scheduleCheck = validateScheduleTimeAndDates(
      date.trim(),
      startTime,
      resolvedEndDate,
      endTime,
      rawDates
    );
    if (!scheduleCheck.valid) {
      showToast(scheduleCheck.error, "error");
      return;
    }
    const amountNum = Number(String(quotedAmount || "").replace(/[^0-9.]/g, ""));
    const advNum = Number(String(advanceAmount || "").replace(/[^0-9.]/g, ""));
    const calcPending = Math.max(0, amountNum - advNum);
    const outsideInfo = getOutsideDriverForPlate(assignedPlate);
    const resolvedDriverId = outsideInfo ? outsideInfo.driverId : assignedDriverId;
    const resolvedDriverName = outsideInfo ? outsideInfo.driverName : assignedDriverName;
    const resolvedDriverPhone = outsideInfo ? outsideInfo.driverPhone : assignedDriverPhone;
    setEditingBookingLoading(true);
    try {
      const res = await editBookingAction(id, {
        date: scheduleCheck.startDate,
        dates: scheduleCheck.dates,
        startTime: scheduleCheck.startTime,
        endTime: scheduleCheck.endTime,
        distanceKm: distNum,
        pickupCity: pickupCity.trim(),
        deliveryCity: deliveryCity.trim(),
        quotedAmount: amountNum || undefined,
        advanceAmount: advNum || undefined,
        pendingAmount: calcPending,
        cargoNature,
        cargoWeight,
        helpersCount,
        assignedPlate,
        assignedLorryId,
        assignedDriverId: resolvedDriverId,
        assignedDriverName: resolvedDriverName,
        assignedDriverPhone: resolvedDriverPhone,
      });
      if (res.success) {
        showToast("Booking details updated successfully.", "success");
        setEditingBookingModal(null);
      } else {
        showToast(res.error || "Failed to edit booking", "error");
      }
    } catch {
      showToast("Error saving booking details.", "error");
    } finally {
      setEditingBookingLoading(false);
    }
  };
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
      date: todayYmd(),
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
  const handleRegisterOutsideEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = outsideForm;
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = "Full name is required.";
    if (!/^(\d{9}[vVxX]|\d{12})$/.test(f.idNumber.trim())) errs.idNumber = "Valid NIC required (e.g. 912345678V or 199112345678).";
    if (!/^(\+94|0)?7\d{8}$/.test(f.phone.replace(/[\s-]/g, ""))) errs.phone = "Valid mobile number required (e.g. 0771234567).";
    if (f.plateNumber.trim().length < 4) errs.plateNumber = "Vehicle number is required.";
    const bal = Number(f.initialBalance);
    if (!Number.isFinite(bal) || bal < 0) errs.initialBalance = "Must be 0 or more.";
    if (bal > 0 && !f.paidInto) errs.paidInto = "Choose how the deposit was paid.";
    setOutsideFormErrors(errs);
    setOutsideFormServerError("");
    if (Object.keys(errs).length) return;
    setSubmittingOutside(true);
    try {
      const res = await registerOutsideEmployeeManuallyAction({
        name: f.name,
        idNumber: f.idNumber,
        phone: f.phone,
        plateNumber: f.plateNumber,
        vehicleType: f.vehicleType,
        baseCity: f.baseCity,
        initialBalance: bal,
        depositMethod: f.paidInto === "cash" ? "cash" : "bank",
        depositBank: f.paidInto === "cash" ? "" : f.paidInto,
        isAvailable: f.isAvailable,
        status: f.status,
      });
      if (res.success) {
        const created = res.data as unknown as OutsideEmployeeRecord;
        setOutsideEmployees((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
        showToast(res.message || "Outside employee registered.", "success");
        setShowOutsideRegModal(false);
        setOutsideForm(emptyOutsideForm);
      } else {
        setOutsideFormServerError(res.error);
      }
    } catch {
      setOutsideFormServerError("Network error. Please try again.");
    } finally {
      setSubmittingOutside(false);
    }
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
    void signOutAdmin();
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
      query(collection(db, "users"), where("role", "==", "customer"), limit(1000)),
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
      query(collection(db, "vehicle_registrations"), orderBy("createdAt", "desc"), limit(300)),
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
      query(collection(db, "inquiries"), orderBy("createdAt", "desc"), limit(300)),
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
      query(collection(db, "complaints"), orderBy("deletedAt", "desc"), limit(300)),
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
      query(collection(db, "outside_topup_slips"), orderBy("createdAt", "desc"), limit(200)),
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
    } catch { }
    setLoadingBookings(false);
  }, []);
  const bookingFeedRef = useRef<BookingFeed | null>(null);
  const [olderBookings, setOlderBookings] = useState<"more" | "loading" | "end">("more");
  const loadOlderBookings = async () => {
    setOlderBookings("loading");
    try {
      setOlderBookings((await bookingFeedRef.current?.loadOlder()) ? "more" : "end");
    } catch {
      setOlderBookings("more");
      showToast("Could not load older bookings.", "error");
    }
  };
  type BookingDocs = Parameters<Parameters<typeof subscribeBookingFeed>[0]>[0];
  const bookingDocsRef = useRef<BookingDocs | null>(null);
  const showBookingDocs = (docs: BookingDocs) => {
        const snap = docs;
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
            todayYmd(data.createdAt || Date.now());
          const resolvedDates =
            Array.isArray(data.dates) && data.dates.length > 0
              ? data.dates
              : resolvedDate
                ? [resolvedDate]
                : [];
          const rawAssignedPlate = data.assignedPlate || data.selectedVehiclePlate || "";
          const outsideInfo = getOutsideDriverForPlate(rawAssignedPlate);
          const matchedFleet = rawAssignedPlate
            ? fleetVehicles.find((v) => normalizePlate(v.plate) === normalizePlate(rawAssignedPlate))
            : null;
          const isOutside = Boolean(
            outsideInfo ||
            (matchedFleet &&
              ((matchedFleet as any).isOutsideLorry || (matchedFleet as any).ownershipType === "outside"))
          );
          const rawDriverName =
            data.assignedDriverName &&
              data.assignedDriverName !== "Driver" &&
              data.assignedDriverName !== "Unassigned"
              ? String(data.assignedDriverName).trim()
              : "";
          const resolvedDriverName =
            rawDriverName || (outsideInfo ? outsideInfo.driverName : isOutside ? matchedFleet?.driverName || "" : "");
          const resolvedDriverPhone =
            String(data.assignedDriverPhone || "").trim() || (outsideInfo ? outsideInfo.driverPhone : isOutside ? matchedFleet?.driverPhone || "" : "");
          const resolvedDriverId =
            data.assignedDriverId ? String(data.assignedDriverId).trim() : (outsideInfo ? outsideInfo.driverId : isOutside ? matchedFleet?.driverId || "" : "");
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
            assignedLorryId: data.assignedLorryId || (matchedFleet?.id || ""),
            assignedDriverId: resolvedDriverId,
            assignedDriverName: resolvedDriverName,
            assignedDriverPhone: resolvedDriverPhone,
            assignedPlate: rawAssignedPlate,
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
            actualDistanceKm: typeof data.actualDistanceKm === "number" ? data.actualDistanceKm : (Number(data.actualDistanceKm) || undefined),
            waypoints: Array.isArray(data.waypoints) ? data.waypoints : undefined,
            ...tripFields(data),
            isEmptyReturnActive: Boolean(data.isEmptyReturnActive),
            emptyReturnDistanceKm: typeof data.emptyReturnDistanceKm === "number" ? data.emptyReturnDistanceKm : (Number(data.emptyReturnDistanceKm) || undefined),
            emptyReturnRoute: data.emptyReturnRoute,
            emptyReturnStartedAt: Number(data.emptyReturnStartedAt) || undefined,
            createdAt: Number(data.createdAt) || 0,
            updatedAt: Number(data.updatedAt) || Number(data.createdAt) || 0,
          });
        });
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setBookings(items);
        setLoadingBookings(false);
  };
  // Always the latest version, which sees the current fleet and owners
  const showBookingDocsRef = useRef(showBookingDocs);
  useEffect(() => {
    showBookingDocsRef.current = showBookingDocs;
  });
  useEffect(() => {
    if (bookingDocsRef.current) showBookingDocsRef.current(bookingDocsRef.current);
  }, [fleetVehicles, outsideEmployees]);
  const subscribeBookingsRealtime = useCallback(() => {
    setLoadingBookings(true);
    const feed = subscribeBookingFeed(
      (docs) => {
        bookingDocsRef.current = docs;
        showBookingDocsRef.current(docs);
      },
      () => {
        // Offline / Firestore unavailable fallback ONLY
        loadBookingsFromStore();
      }
    );
    bookingFeedRef.current = feed;
    return feed.stop;
  }, [loadBookingsFromStore]);
  useEffect(() => {
    if (!authed) {
      bookingDocsRef.current = null;
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
      const targetPlate = b.assignedPlate || matchedVehicle?.plate || "";
      const outsideInfo = getOutsideDriverForPlate(targetPlate);
      const isOutside = Boolean(
        outsideInfo ||
        (matchedVehicle &&
          ((matchedVehicle as any).isOutsideLorry || (matchedVehicle as any).ownershipType === "outside"))
      );
      const existingDriverName = cleanRiderName(b.assignedDriverName);
      const matchedDriver =
        drivers.find(
          (d) =>
            (b.assignedDriverId && d.driverId === b.assignedDriverId) ||
            (b.assignedDriverPhone && phonesMatch(d.phone, b.assignedDriverPhone)) ||
            (existingDriverName && d.name.toLowerCase() === existingDriverName.toLowerCase())
        ) || null;
      const bDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : (b.date ? [b.date] : []);
      const startDate = b.date || bDates[0] || todayYmd();
      const endDate = bDates.length > 1 ? bDates[bDates.length - 1] : startDate;
      const isMultiDate = bDates.length > 1 || (b.daysNeeded !== undefined && Number(b.daysNeeded) > 1);
      const resolvedDriverName = outsideInfo
        ? outsideInfo.driverName
        : isOutside
          ? (matchedVehicle?.driverName || existingDriverName || matchedDriver?.name || "")
          : (existingDriverName || matchedDriver?.name || "");
      const resolvedDriverPhone = outsideInfo
        ? outsideInfo.driverPhone
        : isOutside
          ? (matchedVehicle?.driverPhone || b.assignedDriverPhone || matchedDriver?.phone || "")
          : (b.assignedDriverPhone || matchedDriver?.phone || "");
      const resolvedDriverId = outsideInfo
        ? outsideInfo.driverId
        : isOutside
          ? (matchedVehicle?.driverId || b.assignedDriverId || matchedDriver?.driverId || "")
          : (b.assignedDriverId || matchedDriver?.driverId || "");
      return {
        date: startDate,
        endDate: endDate,
        isMultiDate: isMultiDate,
        dates: bDates.length > 0 ? bDates : [startDate],
        startTime: b.startTime || "",
        endTime: b.endTime || "",
        plate: b.assignedPlate || matchedVehicle?.plate || "",
        lorryId: b.assignedLorryId || matchedVehicle?.id || "",
        driverId: resolvedDriverId,
        driverName: resolvedDriverName,
        driverPhone: resolvedDriverPhone,
        distanceKm: b.distanceKm ? String(b.distanceKm) : "",
      };
    },
    [scheduleDrafts, fleetVehicles, drivers, getOutsideDriverForPlate]
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
        cancelReason?: string;
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
      if (status === "cancelled") {
        const reason = window.prompt("Reason for cancelling this booking (required). The customer will see it:")?.trim() || "";
        if (reason.length < 3) {
          showToast("The booking was not cancelled. A reason is required.", "error");
          return false;
        }
        assignment = { ...(assignment || {}), cancelReason: reason };
      }
      setActionLoading(id);
      let undo = () => {};
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
        // Always lock and enforce outside driver for outside lorries
        const effectivePlate = effectiveAssignment?.assignedPlate || existingBooking?.assignedPlate;
        const outsideInfo = getOutsideDriverForPlate(effectivePlate);
        if (outsideInfo) {
          effectiveAssignment = {
            ...(effectiveAssignment || {}),
            assignedPlate: outsideInfo.plate,
            assignedDriverId: outsideInfo.driverId,
            assignedDriverName: outsideInfo.driverName,
            assignedDriverPhone: outsideInfo.driverPhone,
          };
        }
        // Show the change at once; the saved record replaces it, or it is undone
        const optimistic = { status, ...(effectiveAssignment || {}), ...(paymentMeta || {}) };
        setBookings((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...optimistic } as StoredBooking) : b)));
        undo = () => {
          if (existingBooking) setBookings((prev) => prev.map((b) => (b.id === id ? existingBooking : b)));
        };
        const actionRes = await updateBookingStatusAction(id, status, effectiveAssignment, paymentMeta);
        if (!actionRes.success) {
          undo();
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
        undo();
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
    const outsideInfo = getOutsideDriverForPlate(draft.plate || booking.assignedPlate);
    if (outsideInfo) {
      draft.driverId = outsideInfo.driverId;
      draft.driverName = outsideInfo.driverName;
      draft.driverPhone = outsideInfo.driverPhone;
    }
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
      setDeleteBookingModal((p) => (p ? { ...p, error: "A valid deletion reason is mandatory." } : null));
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
  return {
    actionLoading,
    activeNav,
    allBookingsTab,
    assignModal,
    authed,
    bankAccounts,
    bookingFeedRef,
    bookings,
    complaintSearch,
    complaints,
    completedDateFrom,
    completedDateTo,
    completedPaymentMethodFilter,
    completedSearch,
    customerSearch,
    customerSort,
    customerTierFilter,
    dashboardDateFrom,
    dashboardDateTo,
    dashboardFilterMode,
    deleteBookingModal,
    deleteCustomerModal,
    deletedCustomerKeysRef,
    deletingBookingLoading,
    deletingCustomerId,
    drivers,
    editingBookingLoading,
    editingBookingModal,
    editingLorryPlate,
    editingQuoteId,
    emptyOutsideForm,
    expandedCustomers,
    expandedDashboardBookings,
    expandedIndividualBookings,
    expandedOnlineBookings,
    fleetVehicles,
    getOutsideDriverForPlate,
    getScheduleDraft,
    handleConfirmDeleteBookingWithReason,
    handleDeleteBooking,
    handleOpenManualModal,
    handleRegisterOutsideEmployee,
    handleSaveBookingSchedule,
    handleSaveEditBooking,
    handleSignOut,
    individualSearch,
    inquiries,
    inquiryActionId,
    inquiryFilter,
    inquirySearch,
    inspectBookingModal,
    isRealCustomerName,
    loadBookingsFromStore,
    loadOlderBookings,
    loadingBookings,
    loadingComplaints,
    loadingDrivers,
    loadingFleet,
    loadingInquiries,
    loadingOutsideEmployees,
    loadingRegistrations,
    loadingTopupSlips,
    loadingUsers,
    lorryForm,
    lorrySearch,
    lorrySubmitting,
    lorryError,
    setLorryError,
    manualAutoFilledNameRef,
    manualForm,
    manualRegisteringClient,
    manualStageDraft,
    manualSubmitting,
    mergeRegisteredCustomerList,
    olderBookings,
    ongoingSearch,
    onlineSearch,
    openEditBookingModal,
    outsideEmployees,
    outsideFilter,
    outsideForm,
    outsideFormErrors,
    outsideFormServerError,
    outsideSearch,
    paymentApprovalModal,
    pendingPaymentSearch,
    promptDeleteBooking,
    quoteInputs,
    regActionId,
    regFilter,
    regSearch,
    registeredUsers,
    registrations,
    revenueCustomEnd,
    revenueCustomStart,
    revenueDaysCount,
    revenueFilter,
    revenueSearch,
    revenueSelectedDate,
    revenueTypeFilter,
    reviewModal,
    riderForm,
    riderSearch,
    riderSubmitting,
    riderError,
    setRiderError,
    savingBankSettings,
    scheduleDrafts,
    setActionLoading,
    setActiveNav,
    setAllBookingsTab,
    setAssignModal,
    setBankAccounts,
    setBookings,
    setComplaintSearch,
    setComplaints,
    setCompletedDateFrom,
    setCompletedDateTo,
    setCompletedPaymentMethodFilter,
    setCompletedSearch,
    setCustomerSearch,
    setCustomerSort,
    setCustomerTierFilter,
    setDashboardDateFrom,
    setDashboardDateTo,
    setDashboardFilterMode,
    setDeleteBookingModal,
    setDeleteCustomerModal,
    setDeletingBookingLoading,
    setDeletingCustomerId,
    setDrivers,
    setEditingBookingLoading,
    setEditingBookingModal,
    setEditingLorryPlate,
    setEditingQuoteId,
    setExpandedCustomers,
    setExpandedDashboardBookings,
    setExpandedIndividualBookings,
    setExpandedOnlineBookings,
    setFleetVehicles,
    setIndividualSearch,
    setInquiries,
    setInquiryActionId,
    setInquiryFilter,
    setInquirySearch,
    setInspectBookingModal,
    setLoadingBookings,
    setLoadingComplaints,
    setLoadingDrivers,
    setLoadingFleet,
    setLoadingInquiries,
    setLoadingOutsideEmployees,
    setLoadingRegistrations,
    setLoadingTopupSlips,
    setLoadingUsers,
    setLorryForm,
    setLorrySearch,
    setLorrySubmitting,
    setManualForm,
    setManualRegisteringClient,
    setManualStageDraft,
    setManualSubmitting,
    setOlderBookings,
    setOngoingSearch,
    setOnlineSearch,
    setOutsideEmployees,
    setOutsideFilter,
    setOutsideForm,
    setOutsideFormErrors,
    setOutsideFormServerError,
    setOutsideSearch,
    setPaymentApprovalModal,
    setPendingPaymentSearch,
    setQuoteInputs,
    setRegActionId,
    setRegFilter,
    setRegSearch,
    setRegisteredUsers,
    setRegistrations,
    setRevenueCustomEnd,
    setRevenueCustomStart,
    setRevenueDaysCount,
    setRevenueFilter,
    setRevenueSearch,
    setRevenueSelectedDate,
    setRevenueTypeFilter,
    setReviewModal,
    setRiderForm,
    setRiderSearch,
    setRiderSubmitting,
    setSavingBankSettings,
    setScheduleDrafts,
    setSettleBalanceModal,
    setShowLorryModal,
    setShowManualModal,
    setShowOutsideRegModal,
    setShowRiderModal,
    setSidebarOpen,
    setStatusFilter,
    setStoredSlips,
    setSubmittingOutside,
    setToast,
    setTopupActionId,
    setTopupSearch,
    setTopupSlips,
    setTopupStatusFilter,
    setViewingSlipImage,
    settleBalanceModal,
    showLorryModal,
    showManualModal,
    showOutsideRegModal,
    showRiderModal,
    showToast,
    sidebarOpen,
    signOutAdmin,
    signedIn,
    statusFilter,
    storedBookings,
    storedSlips,
    submittingOutside,
    subscribeBookingsRealtime,
    toast,
    toggleCustomerExpanded,
    toggleDashboardBookingCard,
    toggleIndividualBookingCard,
    toggleOnlineBookingCard,
    topupActionId,
    topupSearch,
    topupSlips,
    topupStatusFilter,
    unsubBookingsRef,
    updateBooking,
    updateScheduleDraft,
    validateIndividualScheduleOrToast,
    viewingSlipImage,
  };
}

export type Stage1 = ReturnType<typeof useStage1>;
