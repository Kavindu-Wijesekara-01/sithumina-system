"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { StoredBooking, StoredRegistration } from "@/lib/server-store";
import { normalizePlate, normalizePhoneNumber, phonesMatch } from "@/lib/phone-utils";
import { cleanRiderName, findBookingScheduleConflict, formatJourneyScheduleSummary, getDatesBetween, hasAssignedRider, validateScheduleTimeAndDates } from "@/lib/booking-schedule";
import { PaymentSlipRecord, savePaymentBankAccounts, fetchPaymentSlipFromDb, deletePaymentSlipFromDb, dataUrlToBlobUrl } from "@/lib/payment-settings";
import { db } from "@/lib/firebase";
import { doc, deleteDoc } from "firebase/firestore";
import { saveAdminFleetVehicle, deleteAdminFleetVehicle, saveAdminRider, deleteAdminRider, toggleAdminRiderStatus } from "@/lib/db-services";
import { Lorry } from "@/lib/mock-lorries";
import { createBookingAction, updateBookingStatusAction, updateRegistrationStatusAction, approveRegistrationAndAddToFleetAction, updateInquiryStatusAction, registerCustomerAction, deleteCustomerAction, getAllOutsideEmployeesAction, getAllTopupSlipsAction, approveTopupSlipAction, deleteTopupSlipAction, TopupSlipRecord } from "@/actions";
import { periodRange, revenueLines, summarise, todayYmd, withExternalOwners } from "@/lib/ledger";
import { useLedger } from "@/components/admin/useLedger";
import { useBookingQuery } from "@/components/admin/useBookingQuery";
import { fetchBookingsForPeriod } from "@/lib/booking-feed";
import type { Stage1 } from "./useBookingState";
import { BOOKING_STAGES, BookingStatus, CARGO_NATURE_OPTIONS, VEHICLE_TYPE_OPTIONS, formatBookingDateTime, getSriLankaDateStr } from "../shared";

/** Dashboard state and actions, part 2 of 3. */
export function useStage2(previous: Stage1) {
  const {
    assignModal,
    authed,
    bankAccounts,
    bookings,
    deleteCustomerModal,
    deletedCustomerKeysRef,
    drivers,
    editingLorryPlate,
    fleetVehicles,
    getScheduleDraft,
    individualSearch,
    isRealCustomerName,
    lorryForm,
    manualAutoFilledNameRef,
    manualForm,
    manualStageDraft,
    mergeRegisteredCustomerList,
    onlineSearch,
    outsideEmployees,
    paymentApprovalModal,
    quoteInputs,
    registeredUsers,
    riderForm,
    scheduleDrafts,
    setActionLoading,
    setAssignModal,
    setBankAccounts,
    setBookings,
    setDeleteCustomerModal,
    setDeletingCustomerId,
    setEditingLorryPlate,
    setEditingQuoteId,
    setExpandedCustomers,
    setInquiries,
    setInquiryActionId,
    setLorryForm,
    setLorrySubmitting,
    setManualForm,
    setManualRegisteringClient,
    setManualStageDraft,
    setManualSubmitting,
    setOutsideEmployees,
    setPaymentApprovalModal,
    setRegActionId,
    setRegisteredUsers,
    setRegistrations,
    setReviewModal,
    setRiderForm,
    setRiderSubmitting,
    setSavingBankSettings,
    setScheduleDrafts,
    setSettleBalanceModal,
    setShowLorryModal,
    setShowManualModal,
    setShowRiderModal,
    setTopupActionId,
    setTopupSlips,
    settleBalanceModal,
    showToast,
    statusFilter,
    storedBookings,
    updateBooking,
    validateIndividualScheduleOrToast,
  } = previous;
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
    // Paying for a trip that is already scheduled, running or finished only records the money
    const awaitingPayment = ["pending", "awaiting_payment", "payment_submitted"].includes(booking.status);
    const isBalance = Number(booking.advanceAmount) > 0 && Number(booking.pendingAmount) > 0;
    let scheduleAssignment: Parameters<typeof updateBookingStatusAction>[2] | undefined;
    if (awaitingPayment && booking.bookingType !== "live_lorry") {
      const draft = getScheduleDraft(booking);
      const check = validateIndividualScheduleOrToast(booking.id, draft);
      if (!check.valid) return;
      scheduleAssignment = check.assignment;
    }
    const targetStatus = (
      !awaitingPayment ? booking.status : booking.bookingType !== "live_lorry" ? "assigned" : "accepted"
    ) as BookingStatus;
    const ok = await updateBooking(booking.id, targetStatus, scheduleAssignment, {
      ...(isBalance
        ? {
          finalPaymentMethod: "bank_slip" as const,
          finalPaymentBankUsed: booking.finalPaymentBankUsed,
          finalPaymentAt: Date.now(),
          paymentApprovedAt: booking.paymentApprovedAt || Date.now(),
        }
        : { paymentMethod: "bank_slip" as const, paymentApprovedAt: Date.now() }),
      pendingAmount: 0,
      paymentSlipStatus: "approved",
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
        `Balance of Rs. ${pendingAmount.toLocaleString()} settled successfully via ${settleMethod === "bank_transfer" ? `Bank (${bankUsed})` : "Cash"
        }! Marked as Full Paid.`,
        "success"
      );
    }
  };
  const handleMarkCashAsPaid = async (booking: StoredBooking) => {
    const amt = booking.quotedAmount || 0;
    const ok = await updateBooking(booking.id, booking.status, undefined, {
      quotedAmount: amt,
      advanceAmount: Number(booking.advanceAmount) > 0 && Number(booking.advanceAmount) < amt ? booking.advanceAmount : amt,
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
        const shouldAutoApprove = !booking.paymentApprovedAt && booking.paymentSlipStatus !== "cash_pending" && Boolean(booking.paymentSlipId) && booking.paymentSlipStatus !== "deleted";
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
      const shouldAutoApprove = !booking.paymentApprovedAt && booking.paymentSlipStatus !== "cash_pending" && Boolean(booking.paymentSlipId) && booking.paymentSlipStatus !== "deleted";
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
      const shouldAutoApprove = !booking.paymentApprovedAt && booking.paymentSlipStatus !== "cash_pending" && Boolean(booking.paymentSlipId) && booking.paymentSlipStatus !== "deleted";
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
    const bStartDate = draft.date || booking.date || bDates[0] || todayYmd();
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
      const shouldAutoApprove = !b.paymentApprovedAt && b.paymentSlipStatus !== "cash_pending" && Boolean(b.paymentSlipId) && b.paymentSlipStatus !== "deleted";
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
    const shouldAutoApprove = !b.paymentApprovedAt && b.paymentSlipStatus !== "cash_pending" && Boolean(b.paymentSlipId) && b.paymentSlipStatus !== "deleted";
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
      showToast("Customer NIC / ID number is mandatory for registration.", "error");
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
    const parsedDistKm = Number(String(manualForm.distanceKm || "").replace(/[^0-9.]/g, ""));
    if (!parsedDistKm || parsedDistKm <= 0) {
      showToast("Distance in KM is mandatory.", "error");
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
          `Manual booking created (Rs. ${parsedAmount.toLocaleString()} · ${isPaymentSuccess ? "Payment Success" : "Payment Pending"
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
        const todayStr = todayYmd();
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
  const ledger = useLedger();
  const monthRange = periodRange("month");
  const monthQuery = useBookingQuery(
    authed ? `month-${monthRange[0]}` : "",
    () => fetchBookingsForPeriod(...monthRange),
    storedBookings
  );
  const revenueBookings = useMemo(
    () => withExternalOwners(monthQuery.bookings, outsideEmployees),
    [monthQuery.bookings, outsideEmployees]
  );
  const revenueData = useMemo(() => {
    const [start, end] = periodRange("today", "", "", clockTick);
    return {
      todayDateStr: getSriLankaDateStr(clockTick),
      todayRevenue: summarise(revenueBookings, start, end, ledger).received,
      todayBookingsCount: revenueLines(revenueBookings, ledger).filter((l) => l.at >= start && l.at < end).length,
      thisMonthRevenue: summarise(revenueBookings, ...periodRange("month", "", "", clockTick), ledger).received,
    };
  }, [revenueBookings, clockTick, ledger.wallet, ledger.reversals]);
  // Helper to determine if a booking has pending payment
  const isBookingPaymentPending = useCallback((b: StoredBooking): boolean => {
    // External owners collect their own fares
    if (b.externalOwnerId) return false;
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
  return {
    ...previous,
    clockTick,
    closeReviewModal,
    confirmAssign,
    filteredIndividualBookings,
    filteredOnlineBookings,
    formatInquiryDate,
    formatWhatsAppUrl,
    handleApproveRegistration,
    handleApproveSlipPayment,
    handleApproveTopupSlip,
    handleConfirmDeleteCustomer,
    handleConfirmPaymentApproval,
    handleConfirmSettleBalance,
    handleDeleteInquiry,
    handleDeleteLorry,
    handleDeleteRegistration,
    handleDeleteRider,
    handleDeleteSlipFromDb,
    handleDeleteTopupSlip,
    handleLorryImageUpload,
    handleManualApprovePayment,
    handleManualPhoneChange,
    handleManualProgressUpdate,
    handleManualRegisterClient,
    handleManualSubmit,
    handleMarkCashAsPaid,
    handleMarkCashAsPending,
    handleOpenAddLorry,
    handleOpenAddRider,
    handleOpenEditLorry,
    handleRejectSlipRequestReupload,
    handleSaveBankSettings,
    handleSaveLorry,
    handleSaveRider,
    handleSendQuote,
    handleStageClickboxSelect,
    handleToggleRider,
    handleUpdateInquiryStatus,
    handleUpdateRegistrationStatus,
    individualBookings,
    individualSearchMatchesAnyStatusCount,
    isBookingPaymentPending,
    ledger,
    lookupManualClientByPhone,
    matchesIndividualSearchQuery,
    matchesOnlineSearchQuery,
    monthQuery,
    monthRange,
    onlineBookings,
    onlineSearchMatchesAnyStatusCount,
    onlineSlipReviewCount,
    openAssignModal,
    openCashApprovalModal,
    openPaymentApprovalModal,
    openSettleBalanceModal,
    openSlipReviewModal,
    pendingIndividualCount,
    pendingOnlineCount,
    revenueBookings,
    revenueData,
    setClockTick,
    slipReviewCount,
    totalPendingCount,
  };
}

export type Stage2 = ReturnType<typeof useStage2>;
