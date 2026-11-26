"use client";

import { normalizePlate } from "@/lib/phone-utils";
import { addDaysToYYYYMMDD, cleanRiderName, findBookingScheduleConflict, formatJourneyScheduleSummary, formatTimeDurationLabel, formatTime12h, getDatesBetween, hasAssignedRider, validateScheduleTimeAndDates } from "@/lib/booking-schedule";
import { todayYmd } from "@/lib/ledger";
import type { Admin } from "../state/useAdminDashboard";
import { formatBookingDateTime } from "../shared";

export default function IndividualBookingList({ admin }: { admin: Admin }) {
  const {
    StatusBadge,
    actionLoading,
    bookings,
    drivers,
    editingQuoteId,
    expandedIndividualBookings,
    filteredIndividualBookings,
    fleetVehicles,
    getOutsideDriverForPlate,
    getScheduleDraft,
    handleApproveSlipPayment,
    handleDeleteBooking,
    handleDeleteSlipFromDb,
    handleOpenManualModal,
    handleSaveBookingSchedule,
    handleSendQuote,
    individualBookings,
    individualSearch,
    individualSearchMatchesAnyStatusCount,
    loadingBookings,
    manualStageDraft,
    openPaymentApprovalModal,
    openSettleBalanceModal,
    openSlipReviewModal,
    quoteInputs,
    setEditingQuoteId,
    setIndividualSearch,
    setQuoteInputs,
    setStatusFilter,
    statusFilter,
    toggleIndividualBookingCard,
    updateBooking,
    updateScheduleDraft,
  } = admin;

  return (
    <>
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
                        className="rounded-lg bg-white border border-gray-300 overflow-hidden"
                      >
                        {/* Dark Booking Header Bar */}
                        <button
                          type="button"
                          onClick={() => toggleIndividualBookingCard(b.id, isExpanded)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? "Minimize booking details" : "Open booking details"
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
                                  Pending Rs. {b.pendingAmount.toLocaleString()}
                                </span>
                              </>
                            ) : typeof b.pendingAmount === "number" && b.pendingAmount > 0 ? (
                              <span className="text-xs font-semibold text-amber-200 bg-amber-950/80 border border-amber-600/70 px-2.5 py-1 rounded-md">
                                Pending Rs. {b.pendingAmount.toLocaleString()}
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
                                        {b.distanceKm} km
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
                                        Multi-Day Booking
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
                                        <span>Distance (KM)</span>
                                        <span className="text-xs text-blue-600 font-mono font-bold">KM</span>
                                      </label>
                                      <input
                                        type="number"
                                        min="1"
                                        step="0.1"
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
                                          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center justify-between">
                                            <span>Assign Rider *</span>
                                            <span className="text-xs font-bold text-amber-700">Assigned Driver</span>
                                          </label>
                                          <div className="w-full px-3 py-2.5 rounded-md border border-amber-300 bg-amber-50/80 text-sm text-amber-950 flex items-center justify-between shadow-2xs">
                                            <div className="flex items-center gap-2 font-bold text-amber-950 truncate">
                                              <span className="truncate">{displayDriverName}</span>
                                              {displayDriverId && (
                                                <span className="px-2 py-0.5 rounded bg-gray-900 text-[#FDB813] font-mono text-xs font-semibold shrink-0">
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
                                    )}
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
                            <div className="px-4 py-3 sm:px-5 bg-gray-50 border-t border-gray-200">
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
    </>
  );
}
