"use client";

import { normalizeVehicleKey } from "@/lib/trip-state";
import { useCallback, useMemo } from "react";
import { StoredBooking } from "@/lib/server-store";
import { normalizePhoneNumber } from "@/lib/phone-utils";
import { paymentEntries, summarise, todayYmd } from "@/lib/ledger";
import type { Stage2 } from "./useBookingActions";
import { CustomerMetric, getBookingLifecycle } from "../shared";

/** Dashboard state and actions, part 3 of 3. */
export function useStage3(previous: Stage2) {
  const {
    bookings,
    clockTick,
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
    deletedCustomerKeysRef,
    drivers,
    fleetVehicles,
    inquiries,
    inquiryFilter,
    inquirySearch,
    isBookingPaymentPending,
    lorrySearch,
    ongoingSearch,
    outsideEmployees,
    outsideFilter,
    outsideSearch,
    pendingPaymentSearch,
    regFilter,
    regSearch,
    registeredUsers,
    registrations,
    revenueData,
    riderSearch,
    showToast,
    topupSearch,
    topupSlips,
    topupStatusFilter,
  } = previous;
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
        if (b.status === "cancelled" || b.status === "delivered" || b.status === "completed") return false;
        if (Boolean(b.rideEndedAt && b.driverTripStatus === "completed")) return false;
        const lifecycle = getBookingLifecycle(b, clockTick);
        const isActivelyOngoing =
          b.status === "in_transit" ||
          b.driverTripStatus === "in_transit" ||
          Boolean(b.rideStartedAt && !b.rideEndedAt) ||
          lifecycle.isOngoing;
        return isActivelyOngoing && !lifecycle.isCompleted;
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
        const isRideFinished = lifecycle.isCompleted || b.status === "delivered" || b.status === "completed" || Boolean(b.rideEndedAt);
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
        const isRideFinished = lifecycle.isCompleted || b.status === "delivered" || b.status === "completed" || Boolean(b.rideEndedAt);
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
      if (completedPaymentMethodFilter !== "all") {
        if (completedPaymentMethodFilter === "cash_manual") {
          const isCash = b.paymentMethod === "cash_manual" || (!b.paymentMethod && !b.paymentBankUsed);
          if (!isCash) return false;
        } else if (completedPaymentMethodFilter === "bank_transfer") {
          const isBank = b.paymentMethod === "bank_transfer" || Boolean(b.paymentBankUsed || b.finalPaymentBankUsed);
          if (!isBank) return false;
        } else if (completedPaymentMethodFilter === "online") {
          const isOnline = (b.paymentMethod as string) === "payhere" || (b.paymentSlipStatus as string) === "online_paid";
          if (!isOnline) return false;
        }
      }
      if (!completedSearch.trim()) return true;
      const q = completedSearch.toLowerCase();
      return (
        b.id.toLowerCase().includes(q) ||
        (b.customerName && b.customerName.toLowerCase().includes(q)) ||
        (b.customerPhone && b.customerPhone.includes(q)) ||
        (b.pickupCity && b.pickupCity.toLowerCase().includes(q)) ||
        (b.deliveryCity && b.deliveryCity.toLowerCase().includes(q)) ||
        (b.assignedPlate && b.assignedPlate.toLowerCase().includes(q)) ||
        (b.assignedDriverName && b.assignedDriverName.toLowerCase().includes(q)) ||
        (b.paymentBankUsed && b.paymentBankUsed.toLowerCase().includes(q)) ||
        (b.finalPaymentBankUsed && b.finalPaymentBankUsed.toLowerCase().includes(q))
      );
    });
  }, [completedBookings, completedSearch, completedDateFrom, completedDateTo, completedPaymentMethodFilter]);
  const completedStats = useMemo(() => {
    const totals = summarise(filteredCompletedBookings);
    const entries = filteredCompletedBookings.flatMap((b) => paymentEntries(b));
    return {
      totalCount: filteredCompletedBookings.length,
      totalKm: totals.km,
      totalRevenue: totals.received,
      cashCount: entries.filter((e) => e.method === "cash").length,
      cashSum: totals.cash,
      bankCount: entries.filter((e) => e.method === "bank").length,
      bankSum: totals.bank,
    };
  }, [filteredCompletedBookings]);
  const exportCompletedBookingsToCSV = useCallback(() => {
    if (filteredCompletedBookings.length === 0) {
      showToast("No completed bookings to export.", "error");
      return;
    }
    const headers = [
      "Booking ID",
      "Completed Date",
      "Completed Time",
      "Customer Name",
      "Customer Phone",
      "Pickup City",
      "Delivery City",
      "Intermediate Towns (Waypoints)",
      "Distance (KM)",
      "Assigned Driver",
      "Driver Phone",
      "Vehicle Plate",
      "Vehicle Type",
      "Total Amount (LKR)",
      "Advance Paid (LKR)",
      "Balance Settled (LKR)",
      "Payment Method",
      "Bank Details",
      "Trip Duration (Hours)",
    ];
    const escapeCSV = (val: unknown): string => {
      const s = String(val ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = filteredCompletedBookings.map((b) => {
      const completedDate = b.rideEndedAt
        ? todayYmd(b.rideEndedAt)
        : b.date || "";
      const completedTime = b.rideEndedAt
        ? new Date(b.rideEndedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : b.endTime || "";
      const distance = b.distanceKm || b.actualDistanceKm || "";
      const paymentMethodStr =
        b.paymentMethod === "bank_transfer"
          ? "Bank Transfer"
          : (b.paymentMethod as string) === "payhere"
            ? "Online Gateway"
            : "Cash";
      const bankDetails =
        b.finalPaymentBankUsed || b.paymentBankUsed || (b.paymentMethod === "cash_manual" ? "Cash Settled" : "");
      let durationHours = "";
      if (b.rideStartedAt && b.rideEndedAt && b.rideEndedAt > b.rideStartedAt) {
        durationHours = ((b.rideEndedAt - b.rideStartedAt) / (1000 * 60 * 60)).toFixed(1);
      }
      return [
        escapeCSV(b.id),
        escapeCSV(completedDate),
        escapeCSV(completedTime),
        escapeCSV(b.customerName),
        escapeCSV(b.customerPhone),
        escapeCSV(b.pickupCity),
        escapeCSV(b.deliveryCity),
        escapeCSV(Array.isArray(b.waypoints) && b.waypoints.length > 0 ? b.waypoints.map((w) => w.name).join(" -> ") : "Direct Route"),
        escapeCSV(distance),
        escapeCSV(b.assignedDriverName || ""),
        escapeCSV(b.assignedDriverPhone || ""),
        escapeCSV(b.assignedPlate || b.selectedVehiclePlate || ""),
        escapeCSV(b.vehicleType || ""),
        escapeCSV(b.quotedAmount || 0),
        escapeCSV(b.advanceAmount || 0),
        escapeCSV(b.pendingAmount || 0),
        escapeCSV(paymentMethodStr),
        escapeCSV(bankDetails),
        escapeCSV(durationHours),
      ].join(",");
    });
    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Sithumina-Completed-Rides-${todayYmd()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Completed bookings exported to CSV successfully.", "success");
  }, [filteredCompletedBookings, showToast]);
  // Chronologically sorted Dispatch Schedule List for Dashboard Overview (earliest departure first)
  const dashboardDispatchList = useMemo(() => {
    return bookings
      .filter((b) => {
        if (b.status === "cancelled") return false;
        const lifecycle = getBookingLifecycle(b, clockTick);
        const isOngoingRide =
          b.status === "in_transit" ||
          b.driverTripStatus === "in_transit" ||
          Boolean(b.rideStartedAt && !b.rideEndedAt) ||
          lifecycle.isOngoing;
        const isCompletedRide =
          b.status === "completed" ||
          b.status === "delivered" ||
          Boolean(b.rideEndedAt && b.driverTripStatus === "completed") ||
          lifecycle.isCompleted;
        // Ongoing or completed rides must NEVER appear in upcoming, today, or all dispatch schedule lists:
        if (dashboardFilterMode === "upcoming" || dashboardFilterMode === "today" || dashboardFilterMode === "all") {
          if (isOngoingRide || isCompletedRide) return false;
        }
        // Filter based on dashboardFilterMode:
        if (dashboardFilterMode === "upcoming") {
          // Upcoming dispatches: must be upcoming and have NOT passed departure start time + 15 mins
          if (!lifecycle.isUpcoming || isOngoingRide || isCompletedRide) return false;
          if (lifecycle.startPlus15 !== null && clockTick >= lifecycle.startPlus15) return false;
        } else if (dashboardFilterMode === "ongoing") {
          if (!isOngoingRide || isCompletedRide) return false;
        } else if (dashboardFilterMode === "completed") {
          if (!isCompletedRide) return false;
        } else if (dashboardFilterMode === "unpaid") {
          const isTargetType = b.bookingType === "individual_vehicle" || b.paymentMethod === "cash_manual" || !b.bookingType;
          if (!isTargetType || !isBookingPaymentPending(b)) return false;
        } else if (dashboardFilterMode === "today") {
          if (isOngoingRide || isCompletedRide) return false;
          const bDate = b.date || (Array.isArray(b.dates) && b.dates[0]) || "";
          const allBDates = Array.isArray(b.dates) && b.dates.length > 0 ? b.dates : bDate ? [bDate] : [];
          if (!allBDates.includes(revenueData.todayDateStr)) return false;
        } else {
          // "all": default general schedule view
          if (isOngoingRide || isCompletedRide) return false;
          const isManual = b.paymentMethod === "cash_manual";
          const isScheduledOrApproved =
            ["accepted", "booked", "assigned"].includes(b.status) ||
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
  // Outside owners and their vehicles are managed only under Outside Employees
  const ownerPlates = new Set(outsideEmployees.map((o) => normalizeVehicleKey(o.plateNumber)));
  const ownerIds = new Set(outsideEmployees.map((o) => o.id));
  const companyVehicles = fleetVehicles.filter(
    (v) => !v.isOutsideLorry && v.ownershipType !== "outside" && !ownerPlates.has(normalizeVehicleKey(v.plate))
  );
  const companyDrivers = drivers.filter((d) => !d.isOutsideDriver && !ownerIds.has(d.driverId));
  const filteredFleet = companyVehicles.filter((v) => {
    if (!lorrySearch.trim()) return true;
    const q = lorrySearch.toLowerCase();
    return (
      v.plate.toLowerCase().includes(q) ||
      (v.vehicleType && v.vehicleType.toLowerCase().includes(q)) ||
      (v.startLocation && v.startLocation.toLowerCase().includes(q)) ||
      (v.driverName && v.driverName.toLowerCase().includes(q))
    );
  });
  const filteredDrivers = companyDrivers.filter((d) => {
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
  return {
    ...previous,
    companyDrivers,
    companyVehicles,
    StatusBadge,
    approvedRegistrationsCount,
    approvedTopupSlipsCount,
    availableOutsideCount,
    bookedCustomersCount,
    completedBookings,
    completedStats,
    customersWithMetrics,
    dashboardDispatchList,
    exportCompletedBookingsToCSV,
    filteredComplaints,
    filteredCompletedBookings,
    filteredCustomers,
    filteredDrivers,
    filteredFleet,
    filteredInquiries,
    filteredOngoingBookings,
    filteredOutsideEmployees,
    filteredPendingPaymentBookings,
    filteredRegistrations,
    filteredTopupSlips,
    lowBalanceOutsideCount,
    ongoingBookings,
    pendingPaymentBookings,
    pendingRegistrationsCount,
    pendingTopupSlipsCount,
    registeredOnlyClientsCount,
    rejectedRegistrationsCount,
    resolvedInquiriesCount,
    totalOutsideCommissionEarned,
    unpaidBookings,
    unreadInquiriesCount,
    upcomingBookings,
  };
}

export type Stage3 = ReturnType<typeof useStage3>;
