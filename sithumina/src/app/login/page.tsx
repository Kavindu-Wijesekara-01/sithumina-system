"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { useLiveLorries } from "@/hooks/useLiveLorries";
import { StoredBooking, PaymentSlipStatus } from "@/lib/server-store";
import { phonesMatch, normalizePlate, normalizePhoneNumber } from "@/lib/phone-utils";
import { formatTimeDurationLabel } from "@/lib/booking-schedule";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { subscribeFleetVehicles, subscribeAdminDrivers, AdminDriverRecord } from "@/lib/db-services";
import {
  BankAccountSetting,
  subscribePaymentBankAccounts,
  prepareSlipFilePayload,
  uploadPaymentSlipToDb,
} from "@/lib/payment-settings";
import { Lorry } from "@/lib/mock-lorries";
import EmployeePortal from "@/components/EmployeePortal";

type BookingFilterTab = "all" | "pending" | "approved" | "completed" | "cancelled";

function isRealDriverName(val: unknown): string {
  const s = String(val || "").trim();
  return s && s !== "Driver" && s !== "Unassigned" ? s : "";
}

export default function CustomerPortalPage() {
  const { locale } = useLanguage();
  const { profile, loginWithPhone, logout } = useAuth();
  const { lorries } = useLiveLorries();

  const [fleetVehicles, setFleetVehicles] = useState<Lorry[]>([]);
  const [driversList, setDriversList] = useState<AdminDriverRecord[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountSetting[]>([]);
  const [payOpenBookingId, setPayOpenBookingId] = useState<string | null>(null);
  const [selectedBankLabel, setSelectedBankLabel] = useState<Record<string, string>>({});
  const [selectedSlipFile, setSelectedSlipFile] = useState<Record<string, File | null>>({});
  const [uploadingBookingId, setUploadingBookingId] = useState<string | null>(null);
  const [uploadErrorByBooking, setUploadErrorByBooking] = useState<Record<string, string>>({});
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BookingFilterTab>("all");
  const [accountMode, setAccountMode] = useState<"customer" | "employee">("customer");
  const [showLookupForm, setShowLookupForm] = useState(false);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const urlTab = sp.get("tab") || sp.get("mode") || sp.get("role");
      if (urlTab === "employee") {
        setAccountMode("employee");
      }
      const urlPhone = sp.get("phone");
      if (urlPhone) {
        setPhone(urlPhone);
        if (!profile?.phone) {
          void loginWithPhone(urlPhone, "1234", "customer");
        }
      }
    }

    const unsubFleet = subscribeFleetVehicles((vehicles) => {
      setFleetVehicles(vehicles);
    });
    const unsubDrivers = subscribeAdminDrivers((drivers) => {
      setDriversList(drivers);
    });
    const unsubBanks = subscribePaymentBankAccounts((accs) => {
      setBankAccounts(accs);
    });
    return () => {
      unsubFleet();
      unsubDrivers();
      unsubBanks();
    };
  }, []);

  // Customer bookings state
  const [myBookings, setMyBookings] = useState<StoredBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [loadedPhoneKey, setLoadedPhoneKey] = useState<string | null>(null);
  const [expandedBookings, setExpandedBookings] = useState<Record<string, boolean>>({});

  const toggleBookingCard = (bookingId: string, currentExpanded: boolean) => {
    setExpandedBookings((prev) => ({
      ...prev,
      [bookingId]: !currentExpanded,
    }));
  };

  const unsubRef = useRef<(() => void) | null>(null);
  const fsMapRef = useRef<Map<string, StoredBooking>>(new Map());
  const srvMapRef = useRef<Map<string, StoredBooking>>(new Map());

  const emitMergedBookings = useCallback((phoneKey: string) => {
    const merged = new Map<string, StoredBooking>();
    srvMapRef.current.forEach((b, id) => merged.set(id, b));
    fsMapRef.current.forEach((b, id) => {
      const existing = merged.get(id);
      if (!existing || (b.updatedAt || 0) >= (existing.updatedAt || 0)) {
        merged.set(id, {
          ...b,
          startTime: b.startTime || existing?.startTime || "",
          endTime: b.endTime || existing?.endTime || "",
          assignedDriverId: b.assignedDriverId || existing?.assignedDriverId || "",
          assignedPlate: b.assignedPlate || existing?.assignedPlate || "",
          assignedLorryId: b.assignedLorryId || existing?.assignedLorryId || "",
          assignedDriverName:
            isRealDriverName(b.assignedDriverName) || isRealDriverName(existing?.assignedDriverName) || "",
          assignedDriverPhone: b.assignedDriverPhone || existing?.assignedDriverPhone || "",
          quotedAmount: b.quotedAmount !== undefined ? b.quotedAmount : existing?.quotedAmount,
          quoteNote: b.quoteNote !== undefined ? b.quoteNote : existing?.quoteNote,
          paymentMethod: b.paymentMethod || existing?.paymentMethod,
          paymentSlipId:
            b.paymentSlipStatus === "deleted"
              ? ""
              : b.paymentSlipId !== undefined
                ? b.paymentSlipId
                : existing?.paymentSlipId,
          paymentSlipName:
            b.paymentSlipStatus === "deleted"
              ? ""
              : b.paymentSlipName !== undefined
                ? b.paymentSlipName
                : existing?.paymentSlipName,
          paymentSlipType:
            b.paymentSlipStatus === "deleted"
              ? ""
              : b.paymentSlipType !== undefined
                ? b.paymentSlipType
                : existing?.paymentSlipType,
          paymentSlipStatus: b.paymentSlipStatus || existing?.paymentSlipStatus,
          paymentRejectReason:
            b.paymentRejectReason !== undefined ? b.paymentRejectReason : existing?.paymentRejectReason,
        });
      }
    });
    const list = Array.from(merged.values()).sort(
      (a, b) => (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0)
    );
    setMyBookings(list);
    setLoadingBookings(false);
    setLoadedPhoneKey(phoneKey);
  }, []);

  // Server action fetcher (authoritative merge + manual refresh)
  const fetchFromServerStore = useCallback(
    async (customerPhone: string) => {
      try {
        setLoadingBookings(true);
        const { getCustomerBookingsAction } = await import("@/actions");
        const res = await getCustomerBookingsAction(customerPhone);
        if (res.success && Array.isArray(res.data)) {
          const nextMap = new Map<string, StoredBooking>();
          res.data.forEach((b) => nextMap.set(b.id, b));
          srvMapRef.current = nextMap;
        }
      } catch {
        // silent
      } finally {
        emitMergedBookings(customerPhone);
      }
    },
    [emitMergedBookings]
  );

  // ---- Real-time Firestore + Server Store synchronized subscription for customer bookings ----
  const subscribeCustomerBookings = useCallback(
    (customerPhone: string) => {
      if (!customerPhone) return () => { };
      let active = true;
      fsMapRef.current = new Map();
      srvMapRef.current = new Map();
      setLoadingBookings(true);

      // Fire server-store/authoritative query in parallel so updates arrive immediately even before snapshot settles
      void (async () => {
        try {
          const { getCustomerBookingsAction } = await import("@/actions");
          const res = await getCustomerBookingsAction(customerPhone);
          if (!active) return;
          if (res.success && Array.isArray(res.data)) {
            const nextSrv = new Map<string, StoredBooking>();
            res.data.forEach((b) => nextSrv.set(b.id, b));
            srvMapRef.current = nextSrv;
            emitMergedBookings(customerPhone);
          }
        } catch {
          // non-blocking
        }
      })();

      try {
        const colRef = collection(db, "bookings");
        const unsub = onSnapshot(
          colRef,
          (snap) => {
            if (!active) return;
            const nextFs = new Map<string, StoredBooking>();
            snap.forEach((d) => {
              const data = d.data();
              const rawPhone = String(data.customerPhone || data.phone || "").trim();
              if (!phonesMatch(rawPhone, customerPhone)) return;

              const resolvedId = String(data.id || data.trackingId || d.id);
              const existing = nextFs.get(resolvedId);
              const docUpdatedAt = Number(data.updatedAt) || Number(data.createdAt) || 0;
              if (existing && (existing.updatedAt || 0) > docUpdatedAt) return;

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

              nextFs.set(resolvedId, {
                id: resolvedId,
                customerName: data.customerName || data.name || "Customer",
                customerPhone: rawPhone,
                pickupCity: data.pickupCity || data.pickup || "",
                deliveryCity: data.deliveryCity || data.destination || "",
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
                bookingType:
                  data.bookingType ||
                  (data.assignedPlate || data.selectedVehiclePlate ? "individual_vehicle" : "live_lorry"),
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
                paymentSlipId: data.paymentSlipId ? String(data.paymentSlipId) : "",
                paymentSlipName: data.paymentSlipName ? String(data.paymentSlipName) : "",
                paymentSlipType: data.paymentSlipType ? String(data.paymentSlipType) : "",
                paymentSlipSize: Number(data.paymentSlipSize) || undefined,
                paymentSlipUploadedAt: Number(data.paymentSlipUploadedAt) || undefined,
                paymentSlipStatus: (data.paymentSlipStatus as PaymentSlipStatus) || "none",
                paymentRejectReason: data.paymentRejectReason ? String(data.paymentRejectReason) : "",
                paymentApprovedAt: Number(data.paymentApprovedAt) || undefined,
                paymentSlipDeletedAt: Number(data.paymentSlipDeletedAt) || undefined,
                customerIdNumber: data.customerIdNumber || data.idNumber || "",
                distanceKm: typeof data.distanceKm === "number" ? data.distanceKm : (Number(data.distanceKm) || undefined),
                createdAt: Number(data.createdAt) || 0,
                updatedAt: docUpdatedAt,
              });
            });
            fsMapRef.current = nextFs;
            emitMergedBookings(customerPhone);
          },
          () => {
            if (!active) return;
            void fetchFromServerStore(customerPhone);
          }
        );
        return () => {
          active = false;
          unsub();
        };
      } catch {
        void fetchFromServerStore(customerPhone);
        return () => {
          active = false;
        };
      }
    },
    [emitMergedBookings, fetchFromServerStore]
  );

  const handleSwitchOrLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = lookupInput.trim();
    if (!raw) return;

    setLookupLoading(true);
    setLookupError(null);
    try {
      const upper = raw.toUpperCase();
      if (upper.startsWith("ST-")) {
        const { trackBookingAction } = await import("@/actions");
        const res = await trackBookingAction(upper);
        if (!res.success || !Array.isArray(res.data) || res.data.length === 0) {
          setLookupError(
            locale === "en"
              ? `No booking found matching Tracking ID "${upper}".`
              : `"${upper}" ලුහුබැඳීමේ අංකයට අදාළ වෙන්කිරීමක් හමු නොවීය.`
          );
          return;
        }
        const exact =
          res.data.find((b) => String(b.id || "").toUpperCase() === upper) ||
          res.data[0];
        if (!exact?.customerPhone) {
          setLookupError(
            locale === "en"
              ? "This booking does not have a customer phone number attached."
              : "මෙම වෙන්කිරීමට දුරකථන අංකයක් සම්බන්ධ කර නොමැත."
          );
          return;
        }
        const ok = await loginWithPhone(exact.customerPhone, "1234", "customer", {
          name: exact.customerName || undefined,
        });
        if (ok) {
          setLookupInput("");
          setShowLookupForm(false);
        }
      } else {
        const digits = raw.replace(/[^0-9]/g, "");
        if (digits.length < 8) {
          setLookupError(
            locale === "en"
              ? "Enter a valid phone number (at least 9 digits) or Booking ID (e.g. ST-BK-6602)."
              : "කරුණාකර වලංගු දුරකථන අංකයක් හෝ Booking ID (උදා: ST-BK-6602) ඇතුළත් කරන්න."
          );
          return;
        }
        const normalized = normalizePhoneNumber(raw) || raw;
        const ok = await loginWithPhone(normalized, "1234", "customer");
        if (ok) {
          setLookupInput("");
          setShowLookupForm(false);
        } else {
          setLookupError(
            locale === "en"
              ? "Could not switch account. Please retry."
              : "ගිණුම මාරු කිරීමට නොහැකි විය. නැවත උත්සාහ කරන්න."
          );
        }
      }
    } catch {
      setLookupError(
        locale === "en"
          ? "Error checking booking. Please retry."
          : "පරීක්ෂා කිරීමේ දෝෂයක්. නැවත උත්සාහ කරන්න."
      );
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.phone) {
      unsubRef.current?.();
      unsubRef.current = subscribeCustomerBookings(profile.phone);
    } else {
      unsubRef.current?.();
      unsubRef.current = null;
      setMyBookings([]);
      setLoadingBookings(false);
      setLoadedPhoneKey(null);
      setStatusFilter("all");
    }
    return () => {
      unsubRef.current?.();
    };
  }, [profile?.phone, subscribeCustomerBookings]);

  const isBookingsLoading =
    Boolean(profile?.phone) &&
    (loadingBookings || loadedPhoneKey !== profile?.phone);

  const handleCustomerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setErrorMessage(
        locale === "en"
          ? "Please enter your mobile phone number."
          : "කරුණාකර ඔබගේ ජංගම දුරකථන අංකය ඇතුළත් කරන්න."
      );
      return;
    }

    const cleanIdNumber = idNumber.trim();
    if (!cleanIdNumber) {
      setErrorMessage(
        locale === "en"
          ? "Please enter your National ID Number (NIC)."
          : "කරුණාකර ඔබගේ ජාතික හැඳුනුම්පත් අංකය (NIC) ඇතුළත් කරන්න."
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const cleanName = name.trim();
      const success = await loginWithPhone(phone, "1234", "customer", {
        name: cleanName || undefined,
        idNumber: cleanIdNumber,
      });
      if (!success) {
        setErrorMessage(
          locale === "en"
            ? "Could not sign in. Please verify your connection."
            : "ලොග් වීමට නොහැකි විය. කරුණාකර නැවත උත්සාහ කරන්න."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    unsubRef.current?.();
    unsubRef.current = null;
    setMyBookings([]);
    setLoadedPhoneKey(null);
    setLoadingBookings(false);
    setStatusFilter("all");
    await logout();
  };

  const displayName = useMemo(() => {
    const rawProfileName = (profile?.name || "").trim();
    if (
      rawProfileName &&
      rawProfileName !== "Valued Customer" &&
      rawProfileName !== "Customer"
    ) {
      return rawProfileName;
    }
    const bookingName = myBookings.find(
      (b) =>
        b.customerName &&
        b.customerName !== "Valued Customer" &&
        b.customerName !== "Customer"
    )?.customerName;
    return bookingName || (locale === "en" ? "Customer" : "පාරිභෝගිකයා");
  }, [profile?.name, myBookings, locale]);

  const counts = useMemo(() => {
    let pending = 0;
    let awaitingPay = 0;
    let approved = 0;
    let completed = 0;
    let cancelled = 0;
    myBookings.forEach((b) => {
      if (["pending", "awaiting_payment", "payment_submitted"].includes(b.status)) {
        pending += 1;
        if (b.status === "awaiting_payment") awaitingPay += 1;
      } else if (
        ["accepted", "booked", "confirmed", "assigned", "in_transit"].includes(b.status)
      ) {
        approved += 1;
      } else if (b.status === "delivered") {
        completed += 1;
      } else if (b.status === "cancelled") {
        cancelled += 1;
      }
    });
    return {
      all: myBookings.length,
      pending,
      awaitingPay,
      approved,
      completed,
      cancelled,
    };
  }, [myBookings]);

  const filteredBookings = useMemo(() => {
    if (statusFilter === "all") return myBookings;
    if (statusFilter === "pending") {
      return myBookings.filter((b) =>
        ["pending", "awaiting_payment", "payment_submitted"].includes(b.status)
      );
    }
    if (statusFilter === "approved") {
      return myBookings.filter((b) =>
        ["accepted", "booked", "confirmed", "assigned", "in_transit"].includes(b.status)
      );
    }
    if (statusFilter === "completed") {
      return myBookings.filter((b) => b.status === "delivered");
    }
    return myBookings.filter((b) => b.status === "cancelled");
  }, [myBookings, statusFilter]);

  const handleCopyAccount = async (id: string, accNum: string) => {
    try {
      await navigator.clipboard.writeText(accNum.replace(/\s+/g, ""));
      setCopiedAccountId(id);
      setTimeout(() => setCopiedAccountId(null), 2000);
    } catch {
      setCopiedAccountId(id);
      setTimeout(() => setCopiedAccountId(null), 2000);
    }
  };

  const handleSubmitPaymentSlip = async (booking: StoredBooking) => {
    const file = selectedSlipFile[booking.id];
    if (!file) {
      setUploadErrorByBooking((p) => ({
        ...p,
        [booking.id]:
          locale === "en"
            ? "Please choose a payment slip (PDF or Image) first."
            : "කරුණාකර ගෙවීම් Slip එක (PDF හෝ ඡායාරූපය) තෝරන්න.",
      }));
      return;
    }

    const activeBanks = bankAccounts.filter((a) => a.active);
    const fallbackBank = activeBanks[0] || bankAccounts[0];
    const bankUsed =
      selectedBankLabel[booking.id] ||
      (fallbackBank ? `${fallbackBank.bankName} (${fallbackBank.accountNumber})` : "");

    setUploadingBookingId(booking.id);
    setUploadErrorByBooking((p) => ({ ...p, [booking.id]: "" }));
    try {
      const prepared = await prepareSlipFilePayload(file);
      const { slipId, uploadedAt } = await uploadPaymentSlipToDb({
        bookingId: booking.id,
        customerPhone: booking.customerPhone || profile?.phone || "",
        customerName: booking.customerName || displayName,
        amount: Number(booking.quotedAmount) || 0,
        bankAccountUsed: bankUsed,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        fileSize: prepared.fileSize,
        dataUrl: prepared.dataUrl,
      });

      setMyBookings((prev) =>
        prev.map((item) =>
          item.id === booking.id
            ? {
              ...item,
              status: "payment_submitted",
              paymentSlipId: slipId,
              paymentSlipName: prepared.fileName,
              paymentSlipType: prepared.mimeType,
              paymentSlipSize: prepared.fileSize,
              paymentSlipUploadedAt: uploadedAt,
              paymentSlipStatus: "pending_review",
              paymentBankUsed: bankUsed,
              paymentRejectReason: "",
              updatedAt: uploadedAt,
            }
            : item
        )
      );
      setSelectedSlipFile((p) => ({ ...p, [booking.id]: null }));
      setPayOpenBookingId(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : locale === "en"
            ? "Failed to upload slip. Please try again."
            : "Slip එක upload කිරීමට නොහැකි විය. නැවත උත්සාහ කරන්න.";
      setUploadErrorByBooking((p) => ({ ...p, [booking.id]: msg }));
    } finally {
      setUploadingBookingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "awaiting_payment":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#FFF3CD] text-[#7A5600] border border-[#FFE082]">
            <span className="w-2 h-2 rounded-full bg-[#E6A800] animate-pulse" />
            {locale === "en" ? "Pay & Upload Slip" : "ගෙවා Slip එවන්න"}
          </span>
        );
      case "payment_submitted":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#E8F0FE] text-[#1A73E8] border border-[#D2E3FC]">
            <span className="w-2 h-2 rounded-full bg-[#1A73E8] animate-pulse" />
            {locale === "en" ? "Slip Under Review" : "Slip පරීක්ෂා කරමින්"}
          </span>
        );
      case "accepted":
      case "booked":
      case "confirmed":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
            <span className="w-2 h-2 rounded-full bg-[#137333]" />
            {locale === "en" ? "Approved" : "අනුමත කළා"}
          </span>
        );
      case "assigned":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
            <span className="w-2 h-2 rounded-full bg-[#137333]" />
            {locale === "en" ? "Rider Assigned" : "රයිඩර් වෙන්කර ඇත"}
          </span>
        );
      case "goods_collected":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#E0F2F1] text-[#00695C] border border-[#B2DFDB]">
            <span className="w-2 h-2 rounded-full bg-[#00695C] animate-pulse" />
            {locale === "en" ? "📦 Goods Collected" : "📦 භාණ්ඩ භාරගත්තා"}
          </span>
        );
      case "in_transit":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#E8F0FE] text-[#1A73E8] border border-[#D2E3FC]">
            <span className="w-2 h-2 rounded-full bg-[#1A73E8] animate-pulse" />
            {locale === "en" ? "In Transit" : "ගමනේ යෙදෙමින් පවතී"}
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-[#F1F3F4] text-[#3C4043] border border-[#DADCE0]">
            <span className="w-2 h-2 rounded-full bg-[#3C4043]" />
            {locale === "en" ? "Completed / Delivered" : "සම්පූර්ණයි / භාර දුන්නා"}
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-red-50 text-red-700 border border-red-200">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {locale === "en" ? "Rejected" : "ප්‍රතික්ෂේප"}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {locale === "en" ? "Pending Quote" : "මිල ගණන් අපේක්ෂාවෙන්"}
          </span>
        );
    }
  };

  const renderProgressStepper = (booking: StoredBooking) => {
    const status = booking.status;
    if (status === "cancelled") return null;

    const isPaymentDone = [
      "accepted",
      "booked",
      "confirmed",
      "assigned",
      "in_transit",
      "delivered",
    ].includes(status);
    const isCashManual =
      booking.paymentMethod === "cash_manual" ||
      booking.paymentSlipStatus === "manual_approved";
    const isQuoteReady =
      status === "awaiting_payment" ||
      status === "payment_submitted" ||
      isPaymentDone ||
      (booking.quotedAmount !== undefined && booking.quotedAmount > 0);
    const isGoodsCollected = status === "goods_collected";
    const isDriverAssigned = ["assigned", "goods_collected", "in_transit", "delivered"].includes(status);
    const isInTransit = status === "in_transit";
    const isDelivered = status === "delivered";

    const progressPercent = isDelivered
      ? 100
      : isInTransit
        ? 96
        : isGoodsCollected
          ? 94
          : isDriverAssigned
            ? 92
            : isPaymentDone
              ? 80
              : status === "payment_submitted"
                ? 60
                : status === "awaiting_payment"
                  ? 40
                  : 20;

    const barGradient = isPaymentDone
      ? "bg-gradient-to-r from-[#10B981] to-[#137333]"
      : status === "payment_submitted"
        ? "bg-gradient-to-r from-[#F59E0B] via-[#3B82F6] to-[#1A73E8]"
        : "bg-gradient-to-r from-[#FFC20E] to-[#E6A800]";

    const headline = isDelivered
      ? locale === "en"
        ? "Trip Completed & Delivered"
        : "සේවාව සාර්ථකව අවසන්"
      : isInTransit
        ? locale === "en"
          ? "Trip In Progress"
          : "ප්‍රවාහනය සිදුවෙමින් පවතී"
        : isGoodsCollected
          ? locale === "en"
            ? "📦 Goods Collected by Rider"
            : "📦 භාණ්ඩය රයිඩර් විසින් භාරගෙන ඇත"
          : isDriverAssigned
            ? locale === "en"
              ? "Payment Approved • Rider Assigned"
              : "ගෙවීම අනුමතයි • රයිඩර් වෙන්කළා"
          : isPaymentDone
            ? isCashManual
              ? locale === "en"
                ? "Cash / Direct Payment Approved"
                : "මුදල් ගෙවීම අනුමතයි"
              : locale === "en"
                ? "Payment Approved"
                : "ගෙවීම අනුමතයි"
            : status === "payment_submitted"
              ? locale === "en"
                ? "Payment Slip Under Head Office Review"
                : "ගෙවීම් Slip පරීක්ෂා කරමින් පවතී"
              : status === "awaiting_payment"
                ? locale === "en"
                  ? "Amount Quoted • Pay & Upload Slip"
                  : "මිල ගණන් එවා ඇත • ගෙවා Slip එවන්න"
                : locale === "en"
                  ? "Request Sent • Awaiting Head Office Review"
                  : "ඉල්ලීම යොමු කළා • මිල ගණන් අපේක්ෂාවෙන්";

    const steps = [
      {
        num: "1",
        title: locale === "en" ? "Request" : "ඉල්ලීම",
        sub: locale === "en" ? "Sent" : "යැව්වා",
        done: true,
        active: false,
        tone: "emerald",
      },
      {
        num: "2",
        title: locale === "en" ? "Quoted" : "මිල ගණන්",
        sub:
          booking.quotedAmount !== undefined && booking.quotedAmount > 0
            ? `Rs.${booking.quotedAmount.toLocaleString()}`
            : isCashManual && isPaymentDone
              ? locale === "en"
                ? "Direct"
                : "සෘජු"
              : locale === "en"
                ? "Waiting"
                : "පොරොත්තු",
        done: isQuoteReady || isPaymentDone,
        active: status === "pending",
        tone: "amber",
      },
      {
        num: "3",
        title: locale === "en" ? "Payment" : "ගෙවීම",
        sub: isPaymentDone
          ? isCashManual
            ? locale === "en"
              ? "Cash Paid"
              : "මුදල්"
            : locale === "en"
              ? "Verified"
              : "තහවුරුයි"
          : status === "payment_submitted"
            ? locale === "en"
              ? "Reviewing"
              : "පරීක්ෂාවේ"
            : status === "awaiting_payment"
              ? locale === "en"
                ? "Pay Now"
                : "ගෙවන්න"
              : locale === "en"
                ? "Pending"
                : "ඉතිරියි",
        done: isPaymentDone,
        active: status === "awaiting_payment" || status === "payment_submitted",
        tone: status === "payment_submitted" ? "blue" : "amber",
      },
      {
        num: "4",
        title: locale === "en" ? "Approved" : "අනුමතයි",
        sub: isPaymentDone
          ? locale === "en"
            ? "Approved"
            : "අනුමතයි"
          : locale === "en"
            ? "Pending"
            : "බලාපොරොත්තුවෙන්",
        done: isPaymentDone,
        active: false,
        tone: "emerald",
      },
      {
        num: "5",
        title: isDelivered
          ? locale === "en"
            ? "Done"
            : "අවසන්"
          : isInTransit
            ? locale === "en"
              ? "Transit"
              : "ගමනේ"
            : locale === "en"
              ? "Rider"
              : "රයිඩර්",
        sub: isDelivered
          ? locale === "en"
            ? "Delivered"
            : "භාරදුන්නා"
          : isInTransit
            ? locale === "en"
              ? "On Road"
              : "පාරේ"
            : isDriverAssigned
              ? locale === "en"
                ? "Assigned"
                : "වෙන්කළා"
              : locale === "en"
                ? "Next"
                : "ඊළඟට",
        done: isDriverAssigned,
        active: isPaymentDone && !isDriverAssigned,
        tone: "emerald",
      },
    ];

    return (
      <div className="rounded-2xl bg-[var(--bg)]/90 border border-[var(--line)] p-3.5 sm:p-4 flex flex-col gap-3">
        {/* Progress Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                isPaymentDone
                  ? "bg-[#137333]"
                  : status === "payment_submitted"
                    ? "bg-[#1A73E8] animate-pulse"
                    : "bg-[#E6A800] animate-pulse"
              }`}
            />
            <span className="text-xs font-extrabold text-[var(--ink)] leading-snug">
              {headline}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isPaymentDone && isCashManual && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
                {locale === "en" ? "Cash / Manual" : "මුදල් / සෘජු"}
              </span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-mono font-black border ${
                isPaymentDone
                  ? "bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]"
                  : status === "payment_submitted"
                    ? "bg-[#E8F0FE] text-[#1A73E8] border-[#D2E3FC]"
                    : "bg-[#FFF3CD] text-[#7A5600] border-[#FFE082]"
              }`}
            >
              {progressPercent}%
            </span>
          </div>
        </div>

        {/* Continuous Smooth Progress Bar */}
        <div className="h-2 w-full rounded-full bg-[#E8E2CF] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${barGradient}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 5 Milestone Nodes with Connected Stepper Line */}
        <div className="relative grid grid-cols-5 gap-1 sm:gap-2 pt-1">
          <div
            aria-hidden="true"
            className="absolute top-[15px] sm:top-[17px] left-[10%] right-[10%] h-[2px] bg-[#E5DEC9] rounded-full"
          />
          {steps.map((step, idx) => (
            <div key={idx} className="relative z-10 flex flex-col items-center text-center min-w-0">
              <div
                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] font-black transition-all border ${
                  step.done
                    ? "bg-[#137333] border-[#137333] text-white shadow-xs"
                    : step.active
                      ? step.tone === "blue"
                        ? "bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8] ring-4 ring-[#1A73E8]/15"
                        : "bg-[#FFF3CD] border-[#E6A800] text-[#7A5600] ring-4 ring-[#FFC20E]/25"
                      : "bg-white border-[var(--line)] text-[var(--mut)]"
                }`}
              >
                {step.done ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : step.active ? (
                  <span
                    className={`w-2 h-2 rounded-full animate-pulse ${
                      step.tone === "blue" ? "bg-[#1A73E8]" : "bg-[#E6A800]"
                    }`}
                  />
                ) : (
                  <span>{step.num}</span>
                )}
              </div>
              <span
                className={`mt-1.5 text-[10px] sm:text-[11px] font-extrabold truncate max-w-full ${
                  step.done
                    ? "text-[#137333]"
                    : step.active
                      ? "text-[var(--ink)]"
                      : "text-[var(--mut)]"
                }`}
              >
                {step.title}
              </span>
              <span className="hidden sm:block text-[9.5px] font-semibold text-[var(--mut)] truncate max-w-full">
                {step.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8 pb-24 sm:pb-24 lg:pb-12 flex flex-col gap-5 sm:gap-6 max-w-5xl mx-auto w-full">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--y3)] text-[#5B4300] text-[11px] sm:text-xs font-extrabold w-fit border border-[var(--y2)] shadow-2xs">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          <span>{locale === "en" ? "Customer Account Dashboard" : "පාරිභෝගික ගිණුම් පුවරුව"}</span>
        </div>
        <h1 className="text-xl sm:text-2xl lg:text-[30px] font-black text-[var(--ink)] tracking-tight leading-tight">
          {locale === "en"
            ? "My Vehicle Bookings & Approval Status"
            : "මගේ වාහන වෙන්කිරීම් සහ අනුමැතිය පරීක්ෂාව"}
        </h1>
        <p className="text-xs sm:text-sm text-[var(--mut)] max-w-2xl leading-relaxed">
          {locale === "en"
            ? "View your pending individual vehicle booking requests, live Head Office approval updates, locked booking dates, and assigned driver details."
            : "ඔබ සිදු කළ තනි වාහන වෙන්කිරීම්වල අනුමැති තත්ත්වය (Pending / Approved), වෙන්වූ දින සහ රියදුරු විස්තර සජීවීව බලාගන්න."}
        </p>
      </div>

      {/* 2. ACCOUNT MODE SELECTOR TABS (Customer Login vs Employee Login) */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--card)] border border-[var(--line)] w-fit shadow-xs">
        <button
          type="button"
          onClick={() => setAccountMode("customer")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            accountMode === "customer"
              ? "bg-[var(--y)] text-[#26231B] shadow-xs"
              : "text-[var(--mut)] hover:text-[var(--ink)]"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          <span>{locale === "en" ? "Customer Portal" : "පාරිභෝගික ගිණුම (Customer)"}</span>
        </button>

        <button
          type="button"
          onClick={() => setAccountMode("employee")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
            accountMode === "employee"
              ? "bg-[#26231B] text-[#FFC20E] shadow-xs"
              : "text-[var(--mut)] hover:text-[var(--ink)]"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" /><polygon points="16,8 20,8 23,11 23,16 16,16 16,8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span>{locale === "en" ? "Employee / Lorry Owner Portal" : "සේවක / වාහන හිමිකරු (Employee)"}</span>
        </button>
      </div>

      {accountMode === "employee" ? (
        <EmployeePortal locale={locale} />
      ) : (
        <>
      {/* STATE 1: NOT LOGGED IN */}
      {!mounted || !profile ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 items-start">
          <div className="md:col-span-7 bg-[var(--card)] rounded-2xl border border-[var(--line)] p-5 sm:p-7 shadow-xs">
            <div className="flex items-center gap-3.5 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FFC20E] to-[#E5AA00] flex items-center justify-center shadow-xs flex-shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#26231B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-[var(--ink)]">
                  {locale === "en" ? "Customer Sign In" : "පාරිභෝගික ගිණුමට පිවිසෙන්න"}
                </h2>
                <p className="text-xs text-[var(--mut)] mt-0.5">
                  {locale === "en"
                    ? "Enter the phone number used for your booking"
                    : "වෙන්කිරීම සිදු කළ ඔබගේ දුරකථන අංකය ඇතුළත් කරන්න"}
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 mb-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-bold">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleCustomerLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-extrabold text-[var(--ink)] mb-1.5">
                  {locale === "en" ? "Your Name (Optional)" : "ඔබගේ නම (විකල්ප)"}
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[var(--ink)] mb-1.5">
                  {locale === "en" ? "National ID Number (NIC) *" : "ජාතික හැඳුනුම්පත් අංකය (NIC) *"}
                  <span className="text-red-600 ml-1 font-bold">({locale === "en" ? "Mandatory" : "අනිවාර්යයි"})</span>
                </label>
                <input
                  suppressHydrationWarning
                  type="text"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  required
                  placeholder={locale === "en" ? "e.g. 199012345678 or 901234567V" : "උදා: 199012345678 හෝ 901234567V"}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] font-mono uppercase focus:outline-none focus:border-[var(--ink)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-[var(--ink)] mb-1.5">
                  {locale === "en" ? "Mobile Phone Number *" : "ජංගම දුරකථන අංකය *"}
                </label>
                <input
                  suppressHydrationWarning
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] font-mono focus:outline-none focus:border-[var(--ink)] transition-colors"
                />
                <p className="text-[11px] text-[var(--mut)] mt-1.5">
                  {locale === "en"
                    ? "All pending and approved bookings for this phone number load live."
                    : "මෙම දුරකථන අංකයට අදාළ සියලුම Pending සහ අනුමත කළ වෙන්කිරීම් සජීවීව පෙන්වනු ඇත."}
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 w-full py-3 rounded-xl bg-[var(--y)] hover:bg-[#f0b400] text-[#26231B] text-sm font-black border-0 cursor-pointer active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                {isSubmitting ? (
                  <span>{locale === "en" ? "Signing In..." : "පිවිසෙමින්..."}</span>
                ) : (
                  <span>{locale === "en" ? "Sign In / View My Bookings" : "ඇතුල් වන්න / මගේ වෙන්කිරීම් බලන්න"}</span>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--mut)]">
              <span>{locale === "en" ? "Want to book an individual vehicle?" : "නව වාහනයක් වෙන්කරගැනීමට අවශ්‍යද?"}</span>
              <Link href="/book-vehicle" className="font-extrabold text-[#5B4300] hover:underline no-underline">
                {locale === "en" ? "Book Vehicle →" : "වෙන්කරන්න →"}
              </Link>
            </div>
          </div>

          <div className="md:col-span-5 rounded-2xl bg-gradient-to-br from-[#FFFDF6] to-[#FFF6D6]/60 border border-[var(--line)] p-5 sm:p-6 flex flex-col gap-4 shadow-xs">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#7A5600]">
              {locale === "en" ? "What You Can Manage" : "ගිණුමෙන් සිදු කළ හැකි දේ"}
            </span>
            <div className="flex flex-col gap-3.5 text-xs">
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-lg bg-[#FFC20E]/25 text-[#5B4300] flex items-center justify-center font-black flex-shrink-0">1</span>
                <div>
                  <p className="font-extrabold text-[var(--ink)]">
                    {locale === "en" ? "Live Quotes & Payment Slips" : "මිල ගණන් සහ Slip Upload කිරීම"}
                  </p>
                  <p className="text-[var(--mut)] mt-0.5 leading-relaxed">
                    {locale === "en"
                      ? "Check Head Office transport quotes and submit your bank transfer slip directly."
                      : "ප්‍රධාන කාර්යාලය එවන මිල ගණන් බලා ගෙවීම් slip එක මෙතැනින්ම යොමු කරන්න."}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-lg bg-[#E6F4EA] text-[#137333] flex items-center justify-center font-black flex-shrink-0">2</span>
                <div>
                  <p className="font-extrabold text-[var(--ink)]">
                    {locale === "en" ? "Locked Calendar & Progress" : "දින වෙන්වීම සහ ප්‍රගතිය"}
                  </p>
                  <p className="text-[var(--mut)] mt-0.5 leading-relaxed">
                    {locale === "en"
                      ? "Track approval milestones in real time as your vehicle reservation is confirmed."
                      : "ඔබේ වෙන්කිරීම අනුමත වී දිනය ස්ථිර වන ආකාරය සජීවීව බලාගන්න."}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-lg bg-white border border-[var(--line)] text-[var(--ink)] flex items-center justify-center font-black flex-shrink-0">3</span>
                <div>
                  <p className="font-extrabold text-[var(--ink)]">
                    {locale === "en" ? "Direct Driver Contact" : "රියදුරු දුරකථන අංකය"}
                  </p>
                  <p className="text-[var(--mut)] mt-0.5 leading-relaxed">
                    {locale === "en"
                      ? "View assigned lorry plate and call your driver in one tap once dispatched."
                      : "රියදුරු වෙන් කළ පසු ඔහුගේ අංකයට එක ක්ලික් එකකින් ඇමතීමට හැකිය."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* STATE 2: LOGGED IN ACCOUNT DASHBOARD */
        <div className="flex flex-col gap-5 sm:gap-6">
          {/* PROFILE SUMMARY BAR */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-white via-[#FFFDF7] to-[#FFF7DB]/60 border border-[var(--line)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-br from-[#FFC20E] to-[#E5AB00] flex items-center justify-center shadow-xs">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#26231B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#137333] border-2 border-white"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base sm:text-lg font-black text-[var(--ink)] truncate">
                    {displayName}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-[#E6F4EA] text-[#137333] border border-[#CEEAD6]">
                    {locale === "en" ? "Customer Account" : "පාරිභෝගික ගිණුම"}
                  </span>
                </div>
                <p className="text-xs text-[var(--mut)] font-mono font-semibold mt-0.5">
                  {profile.phone}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Link
                href="/book-vehicle"
                className="flex-1 sm:flex-initial min-h-[42px] px-4 sm:px-5 py-2.5 rounded-xl bg-[var(--y)] hover:bg-[#f0b400] text-[#26231B] text-xs font-black no-underline transition-all flex items-center justify-center gap-1.5 shadow-xs"
              >
                + {locale === "en" ? "Book Individual Vehicle" : "නව වාහන වෙන්කිරීමක්"}
              </Link>
              <button
                onClick={handleSignOut}
                className="min-h-[42px] px-4 py-2.5 rounded-xl border border-[var(--line)] bg-white text-[var(--ink)] text-xs font-bold hover:bg-red-50 hover:border-red-200 hover:text-red-700 cursor-pointer transition-colors flex-shrink-0"
              >
                {locale === "en" ? "Sign Out" : "ඉවත් වන්න"}
              </button>
            </div>
          </div>

          {/* ACCOUNT BOOKING METRICS SUMMARY */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--line)] hover:border-[#D5CCB4] hover:-translate-y-0.5 text-left cursor-pointer transition-all shadow-xs hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[var(--mut)] uppercase tracking-wide">
                  {locale === "en" ? "Total Bookings" : "මුළු වෙන්කිරීම්"}
                </span>
                <span className="w-7 h-7 rounded-lg bg-[var(--y3)] border border-[var(--y2)] flex items-center justify-center text-[#5B4300] flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
              </div>
              <span className="text-2xl sm:text-[26px] font-black text-[var(--ink)] mt-2 block font-mono tabular-nums">
                {isBookingsLoading ? "..." : counts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === "pending" ? "all" : "pending"))}
              className={`p-4 rounded-2xl bg-[var(--card)] border hover:-translate-y-0.5 text-left cursor-pointer transition-all shadow-xs hover:shadow-sm ${
                statusFilter === "pending"
                  ? "border-amber-500 ring-2 ring-amber-400/25"
                  : "border-amber-200/90 hover:border-amber-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">
                  {locale === "en" ? "Pending & Payment" : "පරීක්ෂාවට / ගෙවීමට"}
                </span>
                <span className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-2xl sm:text-[26px] font-black text-amber-800 font-mono tabular-nums">
                  {isBookingsLoading ? "..." : counts.pending}
                </span>
                {!isBookingsLoading && counts.awaitingPay > 0 && (
                  <span className="text-[10.5px] font-extrabold px-2 py-0.5 rounded-full bg-[#FFF3CD] text-[#7A5600] border border-[#FFE082]">
                    {counts.awaitingPay} {locale === "en" ? "Pay Now" : "ගෙවන්න"}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === "approved" ? "all" : "approved"))}
              className={`p-4 rounded-2xl bg-[var(--card)] border hover:-translate-y-0.5 text-left cursor-pointer transition-all shadow-xs hover:shadow-sm ${
                statusFilter === "approved"
                  ? "border-[#137333] ring-2 ring-[#137333]/20"
                  : "border-emerald-200 hover:border-emerald-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[#137333] uppercase tracking-wide">
                  {locale === "en" ? "Approved & Active" : "අනුමත / සක්‍රීය"}
                </span>
                <span className="w-7 h-7 rounded-lg bg-[#E6F4EA] border border-[#CEEAD6] flex items-center justify-center text-[#137333] flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </div>
              <span className="text-2xl sm:text-[26px] font-black text-[#137333] mt-2 block font-mono tabular-nums">
                {isBookingsLoading ? "..." : counts.approved}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter((prev) =>
                  prev === "completed" || prev === "cancelled"
                    ? "all"
                    : counts.completed === 0 && counts.cancelled > 0
                      ? "cancelled"
                      : "completed"
                )
              }
              className={`p-4 rounded-2xl bg-[var(--card)] border hover:-translate-y-0.5 text-left cursor-pointer transition-all shadow-xs hover:shadow-sm ${
                statusFilter === "completed" || statusFilter === "cancelled"
                  ? "border-[#26231B] ring-2 ring-[#26231B]/15"
                  : "border-[var(--line)] hover:border-[#D5CCB4]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-[var(--mut)] uppercase tracking-wide">
                  {locale === "en" ? "Completed / Cancelled" : "අවසන් / අවලංගු"}
                </span>
                <span className="w-7 h-7 rounded-lg bg-[var(--bg)] border border-[var(--line)] flex items-center justify-center text-[var(--mut)] flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
              </div>
              <span className="text-2xl sm:text-[26px] font-black text-[var(--ink)] mt-2 block font-mono tabular-nums">
                {isBookingsLoading ? "..." : counts.completed + counts.cancelled}
              </span>
            </button>
          </div>

          {/* MY BOOKINGS LIST */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-[var(--ink)] tracking-tight">
                    {locale === "en" ? "My Bookings & Approval Timeline" : "මගේ වෙන්කිරීම් සහ අනුමැතිය"}
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-md bg-[var(--card)] border border-[var(--line)] text-[11px] font-mono font-bold text-[var(--ink)]">
                    {profile.phone}
                  </span>
                </div>
                <p className="text-xs text-[var(--mut)] mt-0.5">
                  {locale === "en"
                    ? "Updates automatically in real time as Head Office reviews or approves your booking."
                    : "ප්‍රධාන කාර්යාලය වෙන්කිරීම් අනුමත කළ සැණින් ස්වයංක්‍රීයව මෙහි යාවත්කාලීන වේ."}
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setLookupError(null);
                    setShowLookupForm((v) => !v);
                  }}
                  className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--line)] bg-[var(--card)] text-xs font-bold text-[var(--ink)] hover:bg-[var(--y3)] cursor-pointer transition-colors"
                >
                  {locale === "en" ? "Switch Phone / ID" : "වෙනත් අංකයක් / ID"}
                </button>
                <button
                  type="button"
                  onClick={() => fetchFromServerStore(profile.phone)}
                  disabled={isBookingsLoading}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl border border-[var(--line)] bg-[var(--card)] text-xs font-bold text-[var(--ink)] hover:bg-[var(--y3)] cursor-pointer flex items-center justify-center gap-1.5 transition-colors flex-shrink-0"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23,4 23,10 17,10" /><polyline points="1,20 1,14 7,14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  {isBookingsLoading ? "..." : (locale === "en" ? "Refresh" : "යාවත්කාලීන")}
                </button>
              </div>
            </div>

            {/* Expandable Inline Phone / Booking ID Switcher */}
            {showLookupForm && (
              <form
                onSubmit={handleSwitchOrLookup}
                className="p-4 sm:p-5 rounded-2xl bg-[var(--card)] border border-[var(--y2)] flex flex-col gap-3 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[var(--ink)]">
                    {locale === "en"
                      ? "Check another Phone Number or Booking Tracking ID"
                      : "වෙනත් දුරකථන අංකයක් හෝ Booking ID අංකයක් පරීක්ෂා කරන්න"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLookupForm(false)}
                    className="text-xs font-bold text-[var(--mut)] hover:text-[var(--ink)] cursor-pointer border-0 bg-transparent px-2 py-1"
                  >
                    {locale === "en" ? "Close" : "වසන්න"}
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder={
                      locale === "en"
                        ? "e.g. 0771234567 or ST-BK-XXXX"
                        : "උදා: 0771234567 හෝ ST-BK-XXXX"
                    }
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
                  />
                  <button
                    type="submit"
                    disabled={lookupLoading || !lookupInput.trim()}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-[#26231B] text-[#FFC20E] text-xs font-black border-0 cursor-pointer hover:opacity-90 disabled:opacity-50"
                  >
                    {lookupLoading
                      ? "..."
                      : locale === "en"
                        ? "Load Bookings"
                        : "වෙන්කිරීම් බලන්න"}
                  </button>
                </div>
                {lookupError && (
                  <p className="text-xs font-bold text-red-600">{lookupError}</p>
                )}
              </form>
            )}

            {/* Filter Pills */}
            {!isBookingsLoading && myBookings.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {(
                  [
                    { key: "all", labelEn: `All (${counts.all})`, labelSi: `සියල්ල (${counts.all})` },
                    { key: "pending", labelEn: `Pending Approval (${counts.pending})`, labelSi: `අනුමැතියට (${counts.pending})` },
                    { key: "approved", labelEn: `Approved (${counts.approved})`, labelSi: `අනුමත (${counts.approved})` },
                    { key: "completed", labelEn: `Completed (${counts.completed})`, labelSi: `අවසන් (${counts.completed})` },
                    { key: "cancelled", labelEn: `Cancelled (${counts.cancelled})`, labelSi: `අවලංගු (${counts.cancelled})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                      statusFilter === tab.key
                        ? "bg-[#26231B] text-[#FFC20E] border-[#26231B] shadow-xs"
                        : "bg-[var(--card)] text-[var(--mut)] border-[var(--line)] hover:text-[var(--ink)] hover:bg-[var(--y3)]"
                    }`}
                  >
                    {locale === "en" ? tab.labelEn : tab.labelSi}
                  </button>
                ))}
              </div>
            )}

            {isBookingsLoading ? (
              <div className="flex flex-col gap-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-[var(--card)] border border-[var(--line)] animate-pulse" />
                ))}
              </div>
            ) : myBookings.length === 0 ? (
              <div className="p-8 sm:p-10 text-center bg-[var(--card)] rounded-2xl border border-[var(--line)] flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <p className="text-sm font-bold text-[var(--ink)]">
                  {locale === "en"
                    ? `No bookings found for ${profile.phone} yet.`
                    : `${profile.phone} දුරකථන අංකයට අදාළව තවමත් වෙන්කිරීම් නොමැත.`}
                </p>
                <p className="text-xs text-[var(--mut)] max-w-md">
                  {locale === "en"
                    ? "Booked with another phone number or have a Tracking ID (e.g. ST-BK-XXXX)? Enter it below or create a new booking."
                    : "වෙනත් දුරකථන අංකයකින් වෙන්කළා නම් හෝ Booking ID (උදා: ST-BK-XXXX) ඇත්නම් පහතින් ඇතුළත් කර පරීක්ෂා කරන්න."}
                </p>

                <form
                  onSubmit={handleSwitchOrLookup}
                  className="w-full max-w-md mt-1 flex flex-col sm:flex-row gap-2"
                >
                  <input
                    type="text"
                    placeholder={
                      locale === "en"
                        ? "Phone (07XXXXXXXX) or ST-BK-XXXX"
                        : "දුරකථන අංකය හෝ ST-BK-XXXX"
                    }
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs font-mono text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
                  />
                  <button
                    type="submit"
                    disabled={lookupLoading || !lookupInput.trim()}
                    className="px-4 py-2 rounded-xl bg-[#26231B] text-[#FFC20E] text-xs font-black border-0 cursor-pointer hover:opacity-90 disabled:opacity-50"
                  >
                    {lookupLoading
                      ? "..."
                      : locale === "en"
                        ? "Find My Bookings"
                        : "වෙන්කිරීම් සොයන්න"}
                  </button>
                </form>
                {lookupError && (
                  <p className="text-xs font-bold text-red-600 max-w-md">{lookupError}</p>
                )}

                <Link
                  href="/book-vehicle"
                  className="mt-2 px-5 py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black no-underline hover:opacity-90"
                >
                  {locale === "en" ? "Book Individual Vehicle Now" : "දැන්ම වාහනයක් වෙන්කරන්න"}
                </Link>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="p-8 text-center bg-[var(--card)] rounded-2xl border border-[var(--line)] flex flex-col items-center gap-2.5">
                <p className="text-sm font-bold text-[var(--ink)]">
                  {locale === "en"
                    ? "No bookings match the selected filter."
                    : "තෝරාගත් තත්ත්වය යටතේ වෙන්කිරීම් නොමැත."}
                </p>
                <button
                  type="button"
                  onClick={() => setStatusFilter("all")}
                  className="px-4 py-2 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black border-0 cursor-pointer"
                >
                  {locale === "en" ? "Show All Bookings" : "සියලුම වෙන්කිරීම් පෙන්වන්න"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredBookings.map((b, idx) => {
                  const plateNorm = normalizePlate(b.assignedPlate);
                  const idLower = (b.assignedLorryId || "").trim().toLowerCase();

                  const matchedFleetVehicle = fleetVehicles.find(
                    (v) =>
                      (idLower && (v.id || "").toLowerCase() === idLower) ||
                      (plateNorm && normalizePlate(v.plate) === plateNorm)
                  );
                  const assignedLiveLorry = lorries.find(
                    (l) =>
                      (idLower && (l.id || "").toLowerCase() === idLower) ||
                      (plateNorm && normalizePlate(l.plate) === plateNorm)
                  );
                  const matchedDriver = driversList.find(
                    (d) =>
                      (matchedFleetVehicle?.driverId && d.driverId === matchedFleetVehicle.driverId) ||
                      (plateNorm && normalizePlate(d.plate) === plateNorm) ||
                      (matchedFleetVehicle?.driverName && d.name === matchedFleetVehicle.driverName)
                  );

                  const isApprovedStage = ["accepted", "booked", "confirmed"].includes(b.status);
                  const isAssignedOrTransit = ["assigned", "goods_collected", "in_transit"].includes(b.status);
                  const isCashManual =
                    b.paymentMethod === "cash_manual" || b.paymentSlipStatus === "manual_approved";
                  const isSlipSubmittedOrApproved = Boolean(
                    b.paymentSlipId ||
                    b.paymentSlipStatus === "pending_review" ||
                    b.paymentSlipStatus === "approved" ||
                    b.paymentSlipStatus === "manual_approved" ||
                    b.paymentMethod === "cash_manual"
                  );
                  const isDriverVisible =
                    isSlipSubmittedOrApproved &&
                    (["assigned", "goods_collected", "in_transit", "delivered", "accepted", "booked"].includes(b.status) ||
                      Boolean(b.assignedDriverPhone && String(b.assignedDriverPhone).trim()));
                  const resolvedDates =
                    Array.isArray(b.dates) && b.dates.length > 0
                      ? b.dates
                      : b.date
                        ? [b.date]
                        : [];
                  const dayCount = resolvedDates.length || Number(b.daysNeeded) || 1;
                  const cleanRealDriver = (n?: string) => {
                    const t = String(n || "").trim();
                    return t && t !== "Driver" && t !== "Unassigned" ? t : "";
                  };
                  const resolvedPlate =
                    b.assignedPlate || matchedFleetVehicle?.plate || assignedLiveLorry?.plate || "";
                  const resolvedDriverName = isDriverVisible
                    ? cleanRealDriver(b.assignedDriverName) ||
                    cleanRealDriver(assignedLiveLorry?.driverName) ||
                    cleanRealDriver(matchedFleetVehicle?.driverName) ||
                    cleanRealDriver(matchedDriver?.name) ||
                    ""
                    : "";
                  const resolvedDriverPhone = isDriverVisible
                    ? String(b.assignedDriverPhone || "").trim() ||
                    String(assignedLiveLorry?.driverPhone || "").trim() ||
                    String(matchedFleetVehicle?.driverPhone || "").trim() ||
                    String(matchedDriver?.phone || "").trim() ||
                    ""
                    : "";
                  const activePayBanks =
                    bankAccounts.filter((acc) => acc.active).length > 0
                      ? bankAccounts.filter((acc) => acc.active)
                      : bankAccounts;
                  const isPayPanelOpen = payOpenBookingId === b.id;
                  const vehicleThumb =
                    (matchedFleetVehicle as any)?.imageUrl ||
                    (Array.isArray((matchedFleetVehicle as any)?.images) &&
                      (matchedFleetVehicle as any).images[0]) ||
                    "";
                  const isExpanded =
                    expandedBookings[b.id] !== undefined
                      ? expandedBookings[b.id]
                      : idx === 0 || b.status === "awaiting_payment";

                  return (
                    <div
                      key={b.id}
                      className={`relative overflow-hidden rounded-2xl bg-[var(--card)] border transition-all duration-200 shadow-xs hover:shadow-md ${
                        b.status === "awaiting_payment"
                          ? "border-[#FFC20E] ring-1 ring-[#FFC20E]/30"
                          : b.status === "cancelled"
                            ? "border-red-200/90"
                            : "border-[var(--line)] hover:border-[#D6CEB8]"
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
                              : ["accepted", "booked", "confirmed", "assigned", "in_transit"].includes(b.status)
                                ? "bg-gradient-to-r from-[#10B981] to-[#137333]"
                                : b.status === "payment_submitted"
                                  ? "bg-gradient-to-r from-[#3B82F6] to-[#1A73E8]"
                                  : "bg-gradient-to-r from-[#FFC20E] to-[#E6A800]"
                        }`}
                      />

                      {/* Card Header - Arrow locked strictly in the top-right corner across all viewports */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleBookingCard(b.id, isExpanded)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleBookingCard(b.id, isExpanded);
                          }
                        }}
                        aria-expanded={isExpanded}
                        aria-label={
                          isExpanded
                            ? locale === "en"
                              ? "Minimize booking details"
                              : "විස්තර හකුළන්න"
                            : locale === "en"
                              ? "Open booking details"
                              : "විස්තර බලන්න"
                        }
                        className="relative w-full text-left border-0 bg-transparent px-4 pt-4 pb-3 sm:px-5 sm:pt-4 sm:pb-3.5 pr-14 sm:pr-16 hover:bg-[var(--bg)]/55 transition-colors cursor-pointer group"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-[#26231B] text-[#FFC20E] shadow-xs tracking-wide">
                              {b.id}
                            </span>
                            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-[var(--ink)]">
                              {locale === "en" ? "Individual Vehicle" : "තනි වාහන වෙන්කිරීම"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            {getStatusBadge(b.status)}
                          </div>
                        </div>

                        {!isExpanded && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-[var(--mut)]">
                            {resolvedPlate && (
                              <span className="font-mono font-extrabold text-[var(--ink)] px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[11px]">
                                {resolvedPlate}
                              </span>
                            )}
                            <span className="font-bold text-[var(--ink)]">
                              {b.pickupCity} → {b.deliveryCity}
                            </span>
                            {resolvedDates.length > 0 && (
                              <span className="font-mono text-[11px] text-[#5B4300] bg-[var(--y3)] px-2 py-0.5 rounded border border-[var(--y2)]">
                                {resolvedDates[0]}
                                {resolvedDates.length > 1 ? ` (+${resolvedDates.length - 1})` : ""}
                                {b.startTime && b.endTime
                                  ? ` · ${formatTimeDurationLabel(b.startTime, b.endTime)}`
                                  : ""}
                              </span>
                            )}
                            {b.distanceKm && (
                              <span className="font-mono text-[11px] text-[#0d47a1] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 font-bold">
                                🛣️ {b.distanceKm} km
                              </span>
                            )}
                          </div>
                        )}

                        {/* Top-Right Corner Minimize / Expand Arrow Button */}
                        <span
                          aria-hidden="true"
                          title={
                            isExpanded
                              ? locale === "en"
                                ? "Minimize Details"
                                : "හකුළන්න"
                              : locale === "en"
                                ? "Open Details"
                                : "විස්තර බලන්න"
                          }
                          className={`absolute top-3.5 right-3.5 sm:top-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 rounded-full border flex items-center justify-center transition-all duration-200 shadow-xs ${
                            isExpanded
                              ? "bg-[var(--y3)] border-[var(--y2)] text-[#5B4300] group-hover:bg-[var(--y2)]/55"
                              : "bg-[var(--bg)] border-[var(--line)] text-[var(--ink)] group-hover:bg-[var(--y3)] group-hover:border-[var(--y2)]"
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
                      </div>

                      {/* Card Body: Always-Visible Stepper + Collapsible Details */}
                      <div className="px-4 pb-4 sm:px-5 sm:pb-5 flex flex-col gap-3.5">
                        {/* Modern Real-time Approval & Trip Progress Bar */}
                        {renderProgressStepper(b)}

                        {/* Collapsible Booking Details Section */}
                        {isExpanded && (
                          <div className="flex flex-col gap-4 pt-3 border-t border-[var(--line)]">
                            {/* Selected Vehicle Info Bar */}
                            <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col md:flex-row md:items-center justify-between gap-3.5">
                              <div className="flex items-center gap-3 min-w-0">
                                {vehicleThumb && !vehicleThumb.startsWith("/img") ? (
                                  <img
                                    src={vehicleThumb}
                                    alt={resolvedPlate || b.vehicleType}
                                    className="w-15 h-11 rounded-lg object-cover border border-[var(--line)] flex-shrink-0"
                                  />
                                ) : (
                                  <div className="w-12 h-11 rounded-xl bg-[var(--y3)] border border-[var(--y2)] flex items-center justify-center flex-shrink-0 text-[#5B4300]">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="1" y="3" width="15" height="13" /><polygon points="16,8 20,8 23,11 23,16 16,16 16,8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                                    </svg>
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {resolvedPlate && (
                                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E]">
                                        {resolvedPlate}
                                      </span>
                                    )}
                                    <span className="text-xs sm:text-sm font-black text-[var(--ink)] truncate">
                                      {b.vehicleType}
                                    </span>
                                  </div>
                                  {(matchedFleetVehicle?.capacity || matchedFleetVehicle?.maxWeight) && (
                                    <p className="text-[11px] text-[var(--mut)] mt-0.5 font-medium">
                                      {[
                                        matchedFleetVehicle?.capacity
                                          ? `${locale === "en" ? "Size:" : "ප්‍රමාණය:"} ${matchedFleetVehicle.capacity}`
                                          : "",
                                        matchedFleetVehicle?.maxWeight
                                          ? `${locale === "en" ? "Max:" : "උපරිම බර:"} ${matchedFleetVehicle.maxWeight}`
                                          : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col items-start md:items-end gap-1.5">
                                <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wide">
                                  {locale === "en" ? "Booked Date(s)" : "වෙන්කළ දිනය(න්)"}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                                  {resolvedDates.map((dStr) => (
                                    <span
                                      key={dStr}
                                      className="font-mono text-[11.5px] font-black text-[var(--ink)] bg-white px-2.5 py-0.5 rounded-md border border-[var(--line)] shadow-2xs"
                                    >
                                      {dStr}
                                    </span>
                                  ))}
                                  {b.startTime && b.endTime && (
                                    <span className="font-mono text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200">
                                      {formatTimeDurationLabel(b.startTime, b.endTime)}
                                    </span>
                                  )}
                                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-[var(--y3)] text-[#5B4300] border border-[var(--y2)]">
                                    {dayCount}{" "}
                                    {locale === "en"
                                      ? dayCount === 1
                                        ? "Day"
                                        : "Days"
                                      : dayCount === 1
                                        ? "දිනයයි"
                                        : "දින"}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Route */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)]/75 flex items-start gap-2.5">
                                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-[#E6A800] mt-1 flex-shrink-0 ring-4 ring-[#FFC20E]/20" />
                                <div className="min-w-0">
                                  <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wide block mb-0.5">
                                    {locale === "en" ? "Pickup Point" : "පැටවුම් ස්ථානය"}
                                  </span>
                                  <p className="font-extrabold text-[var(--ink)] text-sm break-words">{b.pickupCity}</p>
                                </div>
                              </div>
                              <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)]/75 flex items-start gap-2.5">
                                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-[#137333] mt-1 flex-shrink-0 ring-4 ring-[#137333]/15" />
                                <div className="min-w-0">
                                  <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wide block mb-0.5">
                                    {locale === "en" ? "Destination" : "බෙදාහැරුම් ස්ථානය"}
                                  </span>
                                  <p className="font-extrabold text-[var(--ink)] text-sm break-words">{b.deliveryCity}</p>
                                </div>
                              </div>
                            </div>

                            {/* Cargo & Spec Chips */}
                            {(b.cargoNature || b.cargoWeight || Number(b.helpersCount) > 0 || b.packageDetails || b.distanceKm) && (
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--mut)]">
                                {b.distanceKm && (
                                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 font-bold text-blue-900 font-mono">
                                    🛣️ {locale === "en" ? "Distance:" : "දුර:"} {b.distanceKm} km
                                  </span>
                                )}
                                {b.cargoNature && (
                                  <span className="px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--line)] font-semibold text-[var(--ink)]">
                                    {locale === "en" ? "Goods:" : "භාණ්ඩ:"} {b.cargoNature}
                                  </span>
                                )}
                                {b.cargoWeight && (
                                  <span className="px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--line)] font-semibold text-[var(--ink)]">
                                    {locale === "en" ? "Weight:" : "බර:"} {b.cargoWeight}
                                  </span>
                                )}
                                {Number(b.helpersCount) > 0 && (
                                  <span className="px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--line)] font-semibold text-[var(--ink)]">
                                    {locale === "en" ? "Helpers:" : "සහායකයින්:"} {b.helpersCount}
                                  </span>
                                )}
                                {b.packageDetails && (
                                  <span className="px-2.5 py-1 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-[var(--ink)]">
                                    {b.packageDetails}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* STAGE-SPECIFIC LIVE STATUS BOXES */}
                            {b.status === "pending" && (
                              <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-950 font-semibold leading-relaxed">
                                {locale === "en"
                                  ? "Pending Head Office Review — Your individual vehicle request has been received. Head Office will review it and send your quoted transport amount here shortly."
                                  : "ප්‍රධාන කාර්යාලයේ පරීක්ෂාව අපේක්ෂාවෙන් පවතී — ඔබගේ වෙන්කිරීම සඳහා ගාස්තුව (Amount) පරිපාලක විසින් නියම කළ සැණින් මෙහි දිස්වනු ඇත."}
                              </div>
                            )}

                            {b.status === "awaiting_payment" && (
                              <div className="p-4 sm:p-5 rounded-2xl bg-[#FFFDF2] border-2 border-[#FFC20E] flex flex-col gap-3.5 shadow-xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div>
                                    <span className="text-[10.5px] font-black text-[#7A5600] uppercase tracking-wide block">
                                      {locale === "en"
                                        ? "Quoted Transport Amount — Payment Required"
                                        : "ප්‍රවාහන ගාස්තුව නියම කර ඇත — ගෙවීම් සිදු කරන්න"}
                                    </span>
                                    <div className="flex flex-wrap items-baseline gap-2 mt-1">
                                      <span className="text-xl sm:text-2xl font-black font-mono text-[#26231B]">
                                        Rs. {Number(b.quotedAmount || 0).toLocaleString()}
                                      </span>
                                      {b.quoteNote && (
                                        <span className="text-xs text-[#6F6A5A] font-medium">
                                          ({b.quoteNote})
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPayOpenBookingId((prev) => (prev === b.id ? null : b.id))
                                    }
                                    className="w-full sm:w-auto min-h-[42px] px-4 sm:px-5 py-2.5 rounded-xl bg-[#26231B] hover:bg-[#3d392e] text-[#FFC20E] text-xs font-black transition-all cursor-pointer shadow-xs"
                                  >
                                    {isPayPanelOpen
                                      ? locale === "en"
                                        ? "Hide Payment Details"
                                        : "ගෙවීම් විස්තර වසන්න"
                                      : locale === "en"
                                        ? "Pay Now & Upload Slip →"
                                        : "ගෙවන්න / Slip Upload කරන්න →"}
                                  </button>
                                </div>

                                {b.paymentSlipStatus === "rejected" && b.paymentRejectReason && (
                                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 font-semibold">
                                    <b>
                                      {locale === "en"
                                        ? "Previous Slip Declined:"
                                        : "පෙර Slip එක ප්‍රතික්ෂේප විය:"}
                                    </b>{" "}
                                    {b.paymentRejectReason}
                                  </div>
                                )}

                                {isPayPanelOpen && (
                                  <div className="pt-3.5 border-t border-[#E7E2D0] flex flex-col gap-4">
                                    {/* Bank Accounts List */}
                                    <div>
                                      <p className="text-xs font-black text-[#26231B] mb-2.5">
                                        {locale === "en"
                                          ? "1. Transfer the exact amount to one of the company bank accounts:"
                                          : "1. පහත සමාගම් බැංකු ගිණුම් අංකයකට මුදල තැන්පත් / transfer කරන්න:"}
                                      </p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {activePayBanks.map((acc) => {
                                          const accLabel = `${acc.bankName} (${acc.accountNumber})`;
                                          const isSelectedBank =
                                            (selectedBankLabel[b.id] ||
                                              (activePayBanks[0]
                                                ? `${activePayBanks[0].bankName} (${activePayBanks[0].accountNumber})`
                                                : "")) === accLabel;
                                          return (
                                            <div
                                              key={acc.id}
                                              onClick={() =>
                                                setSelectedBankLabel((p) => ({
                                                  ...p,
                                                  [b.id]: accLabel,
                                                }))
                                              }
                                              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                                                isSelectedBank
                                                  ? "bg-white border-[#26231B] ring-1 ring-[#26231B] shadow-2xs"
                                                  : "bg-[#F7F5EE] border-[#E7E2D0] hover:bg-white"
                                              }`}
                                            >
                                              <div className="flex items-start justify-between gap-2">
                                                <div>
                                                  <span className="text-xs font-black text-[#26231B] block">
                                                    {acc.bankName}
                                                  </span>
                                                  {acc.branch && (
                                                    <span className="text-[11px] text-[#6F6A5A] block">
                                                      {acc.branch}
                                                    </span>
                                                  )}
                                                  <span className="text-[11px] text-[#26231B] font-semibold block mt-1">
                                                    {acc.accountName}
                                                  </span>
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    void handleCopyAccount(
                                                      `${b.id}-${acc.id}`,
                                                      acc.accountNumber
                                                    );
                                                  }}
                                                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[#FFC20E]/35 hover:bg-[#FFC20E] text-[#26231B] text-[10.5px] font-black cursor-pointer flex-shrink-0 transition-colors"
                                                >
                                                  {copiedAccountId === `${b.id}-${acc.id}`
                                                    ? locale === "en"
                                                      ? "Copied!"
                                                      : "පිටපත් විය"
                                                    : "Copy"}
                                                </button>
                                              </div>
                                              <div className="mt-2.5 font-mono text-sm font-black text-[#137333] tracking-wide">
                                                {acc.accountNumber}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>

                                    {/* Slip Upload Box (PDF or Image) */}
                                    <div className="p-4 rounded-xl bg-white border border-[#E7E2D0] flex flex-col gap-3">
                                      <label className="block text-xs font-black text-[#26231B]">
                                        {locale === "en"
                                          ? "2. Upload Payment Slip (PDF or Image screenshot)"
                                          : "2. ගෙවීම් කළ Slip එක Upload කරන්න (PDF හෝ Image)"}
                                      </label>
                                      <input
                                        type="file"
                                        accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0] || null;
                                          setSelectedSlipFile((p) => ({ ...p, [b.id]: file }));
                                          setUploadErrorByBooking((p) => ({ ...p, [b.id]: "" }));
                                        }}
                                        className="block w-full text-xs text-[#26231B] file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-black file:bg-[#F7F5EE] file:text-[#26231B] hover:file:bg-[#FFC20E] cursor-pointer"
                                      />
                                      {selectedSlipFile[b.id] && (
                                        <div className="text-[11px] font-bold text-[#137333] bg-[#E6F4EA] px-3 py-2 rounded-lg flex items-center justify-between">
                                          <span className="truncate">
                                            Selected: {selectedSlipFile[b.id]?.name}
                                          </span>
                                          <span className="font-mono ml-2 flex-shrink-0">
                                            {Math.max(
                                              1,
                                              Math.round((selectedSlipFile[b.id]?.size || 0) / 1024)
                                            )}{" "}
                                            KB
                                          </span>
                                        </div>
                                      )}
                                      {uploadErrorByBooking[b.id] && (
                                        <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
                                          {uploadErrorByBooking[b.id]}
                                        </div>
                                      )}
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          disabled={uploadingBookingId === b.id}
                                          onClick={() => handleSubmitPaymentSlip(b)}
                                          className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] text-xs font-black transition-all cursor-pointer shadow-xs disabled:opacity-50"
                                        >
                                          {uploadingBookingId === b.id
                                            ? locale === "en"
                                              ? "Saving Slip to Database..."
                                              : "Slip එක Database වෙත යවමින්..."
                                            : locale === "en"
                                              ? "Submit Payment Slip for Approval"
                                              : "Slip එක අනුමැතිය සඳහා යොමු කරන්න"}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {b.status === "payment_submitted" && (
                              <div className="p-4 rounded-xl bg-[#E8F0FE] border border-[#D2E3FC] flex flex-col gap-1.5 text-xs text-[#174EA6]">
                                <span className="text-[10.5px] font-black uppercase tracking-wide">
                                  {locale === "en"
                                    ? "Payment Slip Submitted — Under Admin Review"
                                    : "ගෙවීම් Slip එක ලැබී ඇත — පරිපාලක පරීක්ෂා කරමින් පවතී"}
                                </span>
                                <p className="font-semibold">
                                  {b.quotedAmount !== undefined && (
                                    <span>
                                      Amount: <b className="font-mono">Rs. {Number(b.quotedAmount).toLocaleString()}</b>
                                      {b.paymentSlipName ? " · " : ""}
                                    </span>
                                  )}
                                  {b.paymentSlipName && (
                                    <span>
                                      File: <b className="font-mono">{b.paymentSlipName}</b>
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] opacity-90">
                                  {locale === "en"
                                    ? "Once Head Office reviews and approves your slip, the booking date will lock permanently."
                                    : "ප්‍රධාන කාර්යාලය ඔබේ slip එක පරීක්ෂා කර අනුමත කළ සැණින් දිනය ස්ථිරව වෙන්වේ."}
                                </p>
                              </div>
                            )}

                            {isApprovedStage && (
                              <div className="p-4 rounded-xl bg-[#E6F4EA] border border-[#CEEAD6] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <span className="text-[10px] font-black text-[#137333] uppercase tracking-wide">
                                    {isCashManual
                                      ? locale === "en"
                                        ? "Cash / Direct Payment Approved"
                                        : "මුදල් ගෙවීම අනුමත කළා"
                                      : locale === "en"
                                        ? "Booking Approved"
                                        : "වෙන්කිරීම අනුමත කළා"}
                                  </span>
                                  <p className="text-xs font-bold text-green-950 leading-relaxed">
                                    {b.quotedAmount !== undefined && (
                                      <span className="mr-2 font-mono">
                                        Rs. {Number(b.quotedAmount).toLocaleString()}{" "}
                                        {isCashManual
                                          ? locale === "en"
                                            ? "(Cash / Direct)"
                                            : "(මුදල්)"
                                          : "Verified"}{" "}
                                        ·
                                      </span>
                                    )}
                                    {resolvedDriverName
                                      ? `${locale === "en" ? "Rider:" : "රයිඩර්:"} ${resolvedDriverName}${resolvedPlate ? ` (${resolvedPlate})` : ""}`
                                      : locale === "en"
                                        ? `Vehicle ${resolvedPlate || b.vehicleType} schedule is confirmed. Rider contact will appear here once assigned.`
                                        : `${resolvedPlate || b.vehicleType} වාහනය සඳහා වෙන්කිරීම තහවුරුයි. රයිඩර් වෙන් කළ පසු දුරකථන අංකය මෙහි පෙන්වනු ඇත.`}
                                  </p>
                                </div>
                                {resolvedDriverPhone && (
                                  <a
                                    href={`tel:${resolvedDriverPhone.replace(/\s+/g, "")}`}
                                    className="w-full sm:w-auto min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#137333] text-white text-xs font-bold no-underline hover:opacity-90 flex-shrink-0 shadow-xs"
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                    </svg>
                                    {locale === "en" ? "Call Rider" : "රයිඩර් අමතන්න"}: {resolvedDriverPhone}
                                  </a>
                                )}
                              </div>
                            )}

                            {isAssignedOrTransit && (resolvedPlate || resolvedDriverName || resolvedDriverPhone) && (
                              <div className="p-4 rounded-xl bg-[#ECFDF5] border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wide">
                                      {locale === "en" ? "Assigned Rider & Contact Number" : "වෙන්කළ රයිඩර් සහ දුරකථන අංකය"}
                                    </span>
                                    {isCashManual && (
                                      <span className="px-2 py-0.5 rounded-full bg-white border border-emerald-300 text-emerald-800 text-[10px] font-black">
                                        {locale === "en" ? "Cash / Direct Approved" : "මුදල් ගෙවීම අනුමතයි"}
                                      </span>
                                    )}
                                  </div>
                                  <p className="font-extrabold text-emerald-950 text-sm">
                                    {resolvedDriverName || (locale === "en" ? "Rider Assigned" : "රයිඩර් සූදානම්")}{" "}
                                    {resolvedPlate && (
                                      <span className="font-mono text-xs text-emerald-800">
                                        ({resolvedPlate})
                                      </span>
                                    )}
                                  </p>
                                  {resolvedDriverPhone ? (
                                    <p className="mt-1 text-xs font-mono font-bold text-emerald-900">
                                      {locale === "en" ? "Rider Phone:" : "රයිඩර් අංකය:"} {resolvedDriverPhone}
                                    </p>
                                  ) : (
                                    <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-[#856A15] bg-[#FDFBEF] px-2.5 py-1 rounded-lg border border-[#E2D9BC]">
                                      <span>🔒</span>
                                      <span className="font-semibold">
                                        {locale === "en"
                                          ? "Rider phone unlocks once payment slip is submitted"
                                          : "ගෙවීම් රිසිට්පත (Slip) upload කළ පසු රයිඩර්ගේ අංකය දිස්වේ"}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto flex-shrink-0">
                                  {resolvedDriverPhone && (
                                    <a
                                      href={`tel:${resolvedDriverPhone.replace(/\s+/g, "")}`}
                                      className="flex-1 sm:flex-initial min-h-[40px] inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#137333] hover:bg-[#0f5c28] text-white text-xs font-bold no-underline transition-all shadow-xs"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.37 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                      </svg>
                                      {locale === "en" ? "Call Rider" : "රයිඩර්ට ඇමතීම"}
                                    </a>
                                  )}

                                  {b.bookingType !== "individual_vehicle" && assignedLiveLorry && (
                                    <Link
                                      href="/#live-map"
                                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black no-underline hover:opacity-90 flex items-center justify-center gap-1.5 shadow-xs flex-shrink-0"
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" /><polygon points="10,8 16,12 10,16" />
                                      </svg>
                                      {locale === "en" ? "Track Live" : "සිතියමෙන් බලන්න"}
                                    </Link>
                                  )}
                                </div>
                              </div>
                            )}

                            {b.status === "delivered" && (
                              <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="font-semibold text-[var(--ink)]">
                                  {locale === "en"
                                    ? "Trip completed successfully. Thank you for choosing Sithumina Transport."
                                    : "ප්‍රවාහන සේවාව සාර්ථකව අවසන් විය. සිතුමිණ ට්‍රාන්ස්පෝර්ට් තෝරාගත්තාට ස්තූතියි."}
                                </span>
                                <Link
                                  href="/reviews"
                                  className="font-black text-[#5B4300] hover:underline no-underline"
                                >
                                  {locale === "en" ? "Write a Review →" : "අදහසක් එක් කරන්න →"}
                                </Link>
                              </div>
                            )}

                            {b.status === "cancelled" && (
                              <div className="p-3.5 sm:p-4 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-2 text-xs text-red-800">
                                <span className="font-semibold">
                                  {locale === "en"
                                    ? "This booking request was cancelled/declined and the calendar date(s) have been released."
                                    : "මෙම වෙන්කිරීම අවලංගු කර ඇති අතර එම දිනය(න්) නැවත නිදහස් කර ඇත."}
                                </span>
                                <Link
                                  href="/book-vehicle"
                                  className="font-black text-red-700 hover:underline no-underline"
                                >
                                  {locale === "en" ? "Book Another Date →" : "වෙනත් දිනයක් වෙන්කරන්න →"}
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}
    </main>
  );
}
