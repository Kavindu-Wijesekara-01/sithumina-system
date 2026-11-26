"use client";

import React from "react";
import { StoredBooking } from "@/lib/server-store";
import { normalizePlate } from "@/lib/phone-utils";
import { addDaysToYYYYMMDD, cleanRiderName, findBookingScheduleConflict, formatJourneyScheduleSummary, formatTimeDurationLabel, formatTime12h, getDatesBetween, hasAssignedRider, validateScheduleTimeAndDates } from "@/lib/booking-schedule";
import { startRideAction, endRideAction } from "@/actions";
import { todayYmd } from "@/lib/ledger";
import type { Stage3 } from "../state/useDashboardData";
import { formatBookingDateTime, getBookingLifecycle, getRouteDistanceKm } from "../shared";

export function createRenderBookingDispatchCard(admin: Stage3) {
  const {
    StatusBadge,
    actionLoading,
    bankAccounts,
    bookings,
    clockTick,
    drivers,
    editingQuoteId,
    expandedDashboardBookings,
    fleetVehicles,
    getOutsideDriverForPlate,
    getScheduleDraft,
    handleDeleteBooking,
    handleSaveBookingSchedule,
    handleSendQuote,
    isBookingPaymentPending,
    openEditBookingModal,
    openPaymentApprovalModal,
    openSettleBalanceModal,
    openSlipReviewModal,
    quoteInputs,
    setActionLoading,
    setActiveNav,
    setAllBookingsTab,
    setBookings,
    setEditingQuoteId,
    setQuoteInputs,
    showToast,
    toggleDashboardBookingCard,
    updateBooking,
    updateScheduleDraft,
  } = admin;
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
        className="rounded-lg bg-white border border-gray-300 overflow-hidden"
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
                <span className="text-xs font-bold text-white bg-blue-600 px-2 py-0.5 rounded">
                  7. Delivered / Completed
                </span>
              </>
            ) : cardContext === "pending_payment" ? (
              <>
                <span className="text-xs font-bold text-amber-900 bg-amber-400 px-2 py-0.5 rounded">
                  Pending Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()}
                </span>
                <span className="text-xs font-bold text-white bg-amber-600 px-2 py-0.5 rounded">
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
                      Pending Rs. {b.pendingAmount.toLocaleString()}
                    </span>
                  </>
                ) : typeof b.pendingAmount === "number" && b.pendingAmount > 0 ? (
                  <span className="text-xs font-bold text-amber-900 bg-amber-400 px-2 py-0.5 rounded">
                    Pending Rs. {b.pendingAmount.toLocaleString()}
                  </span>
                ) : isPendingPayment ? (
                  <span className="text-xs font-bold text-amber-900 bg-amber-400 px-2 py-0.5 rounded">
                    Pending
                  </span>
                ) : (
                  <span className="text-xs font-bold text-emerald-950 bg-emerald-400 px-2 py-0.5 rounded">
                    ✓ Paid
                  </span>
                )}
                <StatusBadge status={b.status} />
                {lifecycle.isOngoing ? (
                  <span className="text-xs font-bold text-white bg-emerald-600 px-2 py-0.5 rounded flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
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
                openEditBookingModal(b);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/20 bg-white/10 text-xs font-semibold text-white hover:bg-white/20 cursor-pointer"
              title="Edit Booking"
            >
              <span>Edit</span>
            </button>
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
        {/* Start Ride Banner for Scheduled Non-ongoing Bookings */}
        {!lifecycle.isOngoing && !lifecycle.isCompleted && cardContext !== "completed" && cardContext !== "pending_payment" && b.status !== "cancelled" && b.status !== "delivered" && (
          <div className="bg-blue-50 px-3.5 py-2 sm:px-4 border-b border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs text-blue-950 font-medium">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <span className="font-bold">Scheduled Ride:</span>
              <span className="font-mono">{b.date} ({formatTimeDurationLabel(b.startTime, b.endTime)})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={actionLoading === b.id}
                onClick={async (e) => {
                  e.stopPropagation();
                  setActionLoading(b.id);
                  const res = await startRideAction(b.id);
                  setActionLoading(null);
                  if (res.success) {
                    const now = Date.now();
                    setBookings((prev) =>
                      prev.map((item) =>
                        item.id === b.id
                          ? {
                            ...item,
                            status: "in_transit",
                            driverTripStatus: "in_transit",
                            rideStartedAt: (res.data && res.data.rideStartedAt) || now,
                          }
                          : item
                      )
                    );
                    showToast("Ride started successfully. Moved to Ongoing Rides.", "success");
                    setActiveNav("all_bookings");
                    setAllBookingsTab("ongoing");
                  } else {
                    showToast(res.error || "Failed to start ride", "error");
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                title="Admin manual action: Start Ride"
              >
                <span>Start Ride</span>
              </button>
            </div>
          </div>
        )}
        {/* Real-time Trip Lifecycle Banner */}
        {lifecycle.isOngoing && cardContext !== "completed" && cardContext !== "pending_payment" && (
          <div className="bg-emerald-50 px-3.5 py-2 sm:px-4 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950 font-medium">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-bold">Active On Road:</span>
              <span className="font-mono">{formatTimeDurationLabel(b.startTime, b.endTime)}</span>
              {lifecycle.endTimestamp !== null && clockTick >= lifecycle.endTimestamp ? (
                <span className="text-xs font-bold text-amber-900 bg-amber-200 border border-amber-300 px-1.5 py-0.5 rounded">
                  Past Scheduled End ({b.endTime ? formatTime12h(b.endTime) : ""}) · Ride in progress
                </span>
              ) : (
                <span className="text-xs text-emerald-800">
                  (Scheduled to: {b.endTime ? formatTime12h(b.endTime) : "—"})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-800 font-semibold hidden sm:inline">
                Slot locked until Delivered
              </span>
              <button
                type="button"
                disabled={actionLoading === b.id}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!window.confirm("Are you sure you want to end and close this ride?")) return;
                  setActionLoading(b.id);
                  const res = await endRideAction(b.id);
                  setActionLoading(null);
                  if (res.success) {
                    const updated = res.data?.booking;
                    const isPending = res.data?.isPaymentPending;
                    if (updated) {
                      setBookings((prev) =>
                        prev.map((item) => (item.id === b.id ? { ...item, ...updated } : item))
                      );
                    }
                    if (isPending) {
                      showToast("Ride ended. Balance is pending — moved to Pending Payment.", "success");
                      setActiveNav("all_bookings");
                      setAllBookingsTab("pending_payment");
                    } else {
                      showToast("Ride and payment completed successfully! Moved to Completed Bookings.", "success");
                      setActiveNav("all_bookings");
                      setAllBookingsTab("completed");
                    }
                  } else {
                    showToast(res.error || "Failed to end ride", "error");
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                title="Admin manual verification: Close / End Ride"
              >
                <span>Close / End Ride</span>
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
            <div className="text-xs text-amber-800 font-bold flex items-center gap-2">
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
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer text-xs"
              >
                Settle Payment Now →
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
            <div className="text-xs text-blue-700 font-bold flex items-center gap-1.5">
              <span>Locked Completed Record</span>
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
            <div className="text-xs text-blue-700 font-bold">
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
            <div className="text-xs font-semibold text-gray-500">Route</div>
            <div className="font-semibold text-gray-900 mt-0.5 flex flex-wrap items-center gap-1.5">
              <span>{b.pickupCity}</span>
              {Array.isArray(b.waypoints) && b.waypoints.length > 0 ? (
                <>
                  <span className="text-gray-400">→</span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold" title="Rider selected intermediate towns">
                    {b.waypoints.map((w) => w.name).join(" → ")}
                  </span>
                  <span className="text-gray-400">→</span>
                </>
              ) : (
                <span className="text-gray-400">→</span>
              )}
              <span>{b.deliveryCity}</span>
              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-xs">
                {distanceDisplay}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500">Date &amp; Time</div>
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
            <div className="text-xs font-semibold text-gray-500">Lorry &amp; Rider</div>
            <div className="text-gray-900 mt-0.5">
              <span className="font-medium">
                {b.assignedPlate || "No Lorry"}
              </span>
              {(() => {
                const outsideInfo = getOutsideDriverForPlate(b.assignedPlate);
                const resolvedRider =
                  cleanRiderName(b.assignedDriverName) ||
                  outsideInfo?.driverName ||
                  (b.assignedPlate
                    ? fleetVehicles.find((v) => normalizePlate(v.plate) === normalizePlate(b.assignedPlate))?.driverName
                    : "");
                const idTag = outsideInfo?.driverId ? ` (${outsideInfo.driverId})` : "";
                return resolvedRider ? ` · ${resolvedRider}${idTag}` : " · No rider";
              })()}
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span>{b.pickupCity}</span>
                      {Array.isArray(b.waypoints) && b.waypoints.length > 0 ? (
                        b.waypoints.map((wp, idx) => (
                          <React.Fragment key={`${wp.name}-${idx}`}>
                            <span className="text-gray-400">➔</span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-bold">
                              {idx + 1}⃣ {wp.name}
                            </span>
                          </React.Fragment>
                        ))
                      ) : null}
                      <span className="text-gray-400">➔</span>
                      <span>{b.deliveryCity}</span>
                      <span className="ml-2 font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs inline-block">
                        {distanceDisplay}
                      </span>
                    </div>
                  </dd>
                  {Array.isArray(b.waypoints) && b.waypoints.length > 0 && (
                    <>
                      <dt className="text-gray-500">Via Towns</dt>
                      <dd className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                          {b.waypoints.length} Intermediate Towns chosen by Rider (Live Sync)
                        </span>
                      </dd>
                    </>
                  )}
                  <dt className="text-gray-500">KM Tracking</dt>
                  <dd className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 border border-gray-300 px-2 py-0.5 rounded">
                        Booked: {b.distanceKm ? `${b.distanceKm} km` : "—"}
                      </span>
                      <span className="font-mono text-xs font-bold text-emerald-950 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded flex items-center gap-1.5">
                        <span>Actual (Live): {b.actualDistanceKm ? `${b.actualDistanceKm} km` : "Tracking pending"}</span>
                        {b.distanceKm && b.actualDistanceKm ? (
                          <span className={`text-xs px-1 rounded font-bold ${b.actualDistanceKm > b.distanceKm ? "bg-amber-200 text-amber-950" : "bg-emerald-200 text-emerald-950"}`}>
                            ({(b.actualDistanceKm - b.distanceKm) > 0 ? `+${(b.actualDistanceKm - b.distanceKm).toFixed(1)}` : (b.actualDistanceKm - b.distanceKm).toFixed(1)} km)
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {b.waypoints && b.waypoints.length > 0 && (
                      <div className="text-xs text-blue-900 bg-blue-50 border border-blue-200 p-1.5 rounded-lg font-mono">
                        <strong>Waypoints ({b.waypoints.length}/3):</strong> {b.pickupCity} → {b.waypoints.map((w: any) => w.name).join(" → ")} → {b.deliveryCity}
                      </div>
                    )}
                    {b.isEmptyReturnActive && (
                      <div className="text-xs text-purple-900 bg-purple-100 border border-purple-300 px-2 py-1 rounded-lg font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-600" />
                        <span>Returning Empty (Empty Return):</span>
                        <span className="font-mono font-semibold">{b.emptyReturnDistanceKm || 0} KM</span>
                        {b.emptyReturnRoute && <span className="text-xs font-normal">({b.emptyReturnRoute})</span>}
                      </div>
                    )}
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
                  <span className="font-bold text-gray-700">Scheduled Journey:</span>
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
                          const sDate = draft.date || todayYmd();
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
                        Multi-Day Journey
                      </span>
                    </label>
                    {draft.isMultiDate && (
                      <span className="text-xs font-mono font-bold text-blue-900 bg-white border border-blue-300 px-2.5 py-0.5 rounded-full shadow-2xs">
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
                          const matchedV = fleetVehicles.find((v) => normalizePlate(v.plate) === normalizePlate(selPlate));
                          const outsideInfo = getOutsideDriverForPlate(selPlate);
                          const isOut = Boolean(
                            outsideInfo ||
                            (matchedV &&
                              ((matchedV as any).isOutsideLorry || (matchedV as any).ownershipType === "outside"))
                          );
                          updateScheduleDraft(b, {
                            plate: selPlate,
                            lorryId:
                              matchedV?.id ||
                              `lorry-${normalizePlate(selPlate).toLowerCase()}`,
                            ...(isOut ? {
                              driverId: outsideInfo?.driverId || matchedV?.driverId || "",
                              driverName: outsideInfo?.driverName || matchedV?.driverName || "",
                              driverPhone: outsideInfo?.driverPhone || matchedV?.driverPhone || "",
                            } : {}),
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
                    {Boolean(
                      (draft.plate || b.assignedPlate) &&
                      (getOutsideDriverForPlate(draft.plate || b.assignedPlate) ||
                        fleetVehicles.some(
                          (v) =>
                            normalizePlate(v.plate) === normalizePlate(draft.plate || b.assignedPlate) &&
                            ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
                        ))
                    ) ? (() => {
                      const outsideInfo = getOutsideDriverForPlate(draft.plate || b.assignedPlate);
                      const displayDriverName = outsideInfo?.driverName || draft.driverName || "Permanent Driver";
                      const displayDriverId = outsideInfo?.driverId || draft.driverId || "";
                      const displayDriverPhone = outsideInfo?.driverPhone || draft.driverPhone || "";
                      return (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center justify-between">
                            <span>Assign Rider *</span>
                            <span className="text-xs font-bold text-amber-700">Assigned Driver</span>
                          </label>
                          <div className="w-full px-3 py-2 rounded-md border border-amber-300 bg-amber-50/80 text-xs text-amber-950 flex items-center justify-between shadow-2xs">
                            <div className="flex items-center gap-1.5 font-bold text-amber-950 truncate">
                              <span className="truncate">{displayDriverName}</span>
                              {displayDriverId && (
                                <span className="px-1.5 py-0.5 rounded bg-gray-900 text-[#FDB813] font-mono text-xs font-semibold shrink-0">
                                  {displayDriverId}
                                </span>
                              )}
                            </div>
                            <span className="font-mono font-bold text-amber-800 text-xs shrink-0 ml-1">
                              {displayDriverPhone}
                            </span>
                          </div>
                        </div>
                      );
                    })() : (
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
                    )}
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
                    displayLabel: "Bank Transfer",
                    bankName: bankStr,
                  };
                }
                return {
                  isBank: false,
                  displayLabel: "Cash",
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
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
                      <h4 className="font-bold text-sm text-emerald-950">
                        Payment Breakdown &amp; Audit
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-sm text-emerald-950 bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-md">
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
                            1. Advance Payment
                          </span>
                          <span className="font-mono font-bold text-sm text-emerald-800">
                            Rs. {advanceAmount.toLocaleString()}
                          </span>
                        </div>
                        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                          <dt className="text-gray-500">Method:</dt>
                          <dd className="font-semibold text-gray-900 flex flex-wrap items-center gap-1.5">
                            <span>{advMeta.displayLabel}</span>
                            {advMeta.isBank && (
                              <span className="font-bold text-xs text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
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
                            2. Balance Settled
                          </span>
                          <span className="font-mono font-bold text-sm text-emerald-800">
                            Rs. {balanceAmount.toLocaleString()}
                          </span>
                        </div>
                        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
                          <dt className="text-gray-500">Method:</dt>
                          <dd className="font-semibold text-gray-900 flex flex-wrap items-center gap-1.5">
                            <span>{balMeta.displayLabel}</span>
                            {balMeta.isBank && (
                              <span className="font-bold text-xs text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
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
                          Full Payment
                        </span>
                        <span className="font-mono font-bold text-sm text-emerald-800">
                          Rs. {(b.quotedAmount || 0).toLocaleString()}
                        </span>
                      </div>
                      <dl className="grid grid-cols-[130px_1fr] sm:grid-cols-[130px_1fr_130px_1fr] gap-y-1.5 text-xs">
                        <dt className="text-gray-500">Method:</dt>
                        <dd className="font-semibold text-gray-900 flex flex-wrap items-center gap-1.5">
                          <span>{fullMeta.displayLabel}</span>
                          {fullMeta.isBank && (
                            <span className="font-bold text-xs text-blue-900 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
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
                    <div className="text-xs text-emerald-900/80 bg-white/70 px-3 py-1.5 rounded border border-emerald-200/60 font-medium flex items-center gap-1.5">
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
                        className="px-3.5 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-xs font-semibold cursor-pointer"
                      >
                        Settle Balance (Rs. {(b.pendingAmount || b.quotedAmount || 0).toLocaleString()})
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
            {cardContext !== "completed" && (
              <div className="px-4 py-3 sm:px-5 bg-gray-50 flex flex-wrap items-center justify-end gap-2 text-xs border-t border-gray-200">
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
            )}
            {cardContext === "completed" && (
              <div className="px-4 py-3 sm:px-5 bg-gray-50/90 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-gray-600 text-xs">
                  <span className="font-mono text-xs text-gray-400">ID: {b.id}</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-blue-900 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                    ✓ Delivered &amp; Completed
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs text-gray-500 italic">Stage locked</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionLoading === b.id}
                    onClick={() => handleDeleteBooking(b.id)}
                    className="px-3.5 py-1.5 rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-700 text-xs font-semibold cursor-pointer shadow-2xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                    title="Permanently Delete Booking from Database"
                  >
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
  return renderBookingDispatchCard;
}
