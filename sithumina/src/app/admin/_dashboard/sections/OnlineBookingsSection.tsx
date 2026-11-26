"use client";

import { normalizePlate } from "@/lib/phone-utils";
import { cleanRiderName } from "@/lib/booking-schedule";
import type { Admin } from "../state/useAdminDashboard";
import { StatusFilter, formatBookingDateTime } from "../shared";

export default function OnlineBookingsSection({ admin }: { admin: Admin }) {
  const {
    StatusBadge,
    actionLoading,
    activeNav,
    expandedOnlineBookings,
    filteredOnlineBookings,
    fleetVehicles,
    getOutsideDriverForPlate,
    handleApproveSlipPayment,
    handleDeleteBooking,
    loadingBookings,
    onlineBookings,
    onlineSearch,
    onlineSlipReviewCount,
    openAssignModal,
    openPaymentApprovalModal,
    openSettleBalanceModal,
    openSlipReviewModal,
    pendingOnlineCount,
    quoteInputs,
    setExpandedOnlineBookings,
    setOnlineSearch,
    setQuoteInputs,
    setStatusFilter,
    statusFilter,
    toggleOnlineBookingCard,
    updateBooking,
  } = admin;

  return (
    <>
      {activeNav === "online_bookings" && (
            <div className="flex flex-col gap-4">
              {/* Filter & Search Bar */}
              <div className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      Online / Live Bookings ({onlineBookings.length})
                    </h2>
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
                        className={`px-3 py-1.5 rounded-md font-medium cursor-pointer border ${statusFilter === st.key
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
                      className="rounded-lg bg-white border border-gray-300 overflow-hidden"
                    >
                      {/* Dark Booking Header Bar */}
                      <button
                        type="button"
                        onClick={() => toggleOnlineBookingCard(b.id, isExpanded)}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Minimize live booking details" : "Open live booking details"
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
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-xs">
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
                                      {b.distanceKm} km
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
                                        className="px-3.5 py-2 rounded-md bg-green-700 hover:bg-green-800 text-white text-xs font-semibold cursor-pointer transition-all"
                                        title="Settle remaining balance"
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
                          <div className="px-4 py-3 sm:px-5 bg-gray-50 border-t border-gray-200">
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
    </>
  );
}
