"use client";

import { normalizePlate } from "@/lib/phone-utils";
import { addDaysToYYYYMMDD, findBookingScheduleConflict, formatTimeDurationLabel, formatTime12h, getDatesBetween, hasAssignedRider, validateScheduleTimeAndDates } from "@/lib/booking-schedule";
import { todayYmd } from "@/lib/ledger";
import type { Admin } from "../state/useAdminDashboard";
import { CARGO_NATURE_OPTIONS } from "../shared";

export default function ManualBookingModal({ admin }: { admin: Admin }) {
  const {
    bankAccounts,
    bookings,
    drivers,
    fleetVehicles,
    getOutsideDriverForPlate,
    handleManualPhoneChange,
    handleManualRegisterClient,
    handleManualSubmit,
    lookupManualClientByPhone,
    manualForm,
    manualRegisteringClient,
    manualSubmitting,
    setManualForm,
    setShowManualModal,
    showManualModal,
  } = admin;

  return (
    <>
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
                      <span className="font-bold text-gray-900">Distance (KM) *</span>
                      <span className="text-xs bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">KM *</span>
                    </label>
                    <input
                      type="number"
                      required
                      min="0.1"
                      step="0.1"
                      aria-label="Manual booking distance in km"
                      value={manualForm.distanceKm}
                      onChange={(e) => setManualForm((p) => ({ ...p, distanceKm: e.target.value }))}
                      className="w-full px-3 py-2 rounded-md border border-amber-400 bg-white text-sm font-mono text-gray-900 focus:border-gray-900 focus:outline-none"
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
                        const matched = fleetVehicles.find((v) => normalizePlate(v.plate) === normalizePlate(selPlate));
                        const outsideInfo = getOutsideDriverForPlate(selPlate);
                        const isOut = Boolean(
                          outsideInfo ||
                          (matched && ((matched as any).isOutsideLorry || (matched as any).ownershipType === "outside"))
                        );
                        setManualForm((p) => ({
                          ...p,
                          plate: selPlate,
                          vehicleType: matched?.vehicleType || p.vehicleType || "Lorry",
                          ...(isOut && matched ? {
                            driverId: matched.driverId || "",
                            driverName: matched.driverName || "",
                            driverPhone: matched.driverPhone || "",
                          } : {}),
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
                  {Boolean(
                    manualResolvedPlate &&
                    (getOutsideDriverForPlate(manualResolvedPlate) ||
                      fleetVehicles.some(
                        (v) =>
                          normalizePlate(v.plate) === normalizePlate(manualResolvedPlate) &&
                          ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
                      ))
                  ) ? (() => {
                    const outsideInfo = getOutsideDriverForPlate(manualResolvedPlate);
                    const displayDriverName = outsideInfo?.driverName || manualForm.driverName || "Permanent Driver";
                    const displayDriverId = outsideInfo?.driverId || manualForm.driverId || "";
                    const displayDriverPhone = outsideInfo?.driverPhone || manualForm.driverPhone || "";
                    return (
                      <div>
                        <label className="block text-sm font-medium text-gray-800 mb-1 flex items-center justify-between">
                          <span>Assign Rider (Mandatory) *</span>
                          <span className="text-xs font-bold text-amber-700">Assigned Driver</span>
                        </label>
                        <div className="w-full px-3 py-2 rounded-md border border-amber-300 bg-amber-50/80 text-sm text-amber-950 flex items-center justify-between shadow-2xs">
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
                  )}
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
                          const sDate = manualForm.date || todayYmd();
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
                        Multi-Day Booking
                      </span>
                    </label>
                    {manualForm.isMultiDate && (
                      <span className="text-xs font-mono font-bold text-blue-900 bg-white border border-blue-300 px-2.5 py-0.5 rounded-full shadow-2xs">
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
                        className={`text-left px-3.5 py-2.5 rounded-md border cursor-pointer ${manualForm.paymentStatusMode === "pending"
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                          }`}
                      >
                        <div className="text-xs font-bold">Payment Pending</div>
                        <div
                          className={`text-xs mt-0.5 ${manualForm.paymentStatusMode === "pending" ? "text-gray-200" : "text-gray-600"
                            }`}
                        >
                          Full Pending
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualForm((p) => ({ ...p, paymentStatusMode: "partial" }))}
                        className={`text-left px-3.5 py-2.5 rounded-md border cursor-pointer ${manualForm.paymentStatusMode === "partial"
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                          }`}
                      >
                        <div className="text-xs font-bold">Partial Advance</div>
                        <div
                          className={`text-xs mt-0.5 ${manualForm.paymentStatusMode === "partial" ? "text-amber-100" : "text-gray-600"
                            }`}
                        >
                          Part Paid
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualForm((p) => ({ ...p, paymentStatusMode: "success" }))}
                        className={`text-left px-3.5 py-2.5 rounded-md border cursor-pointer ${manualForm.paymentStatusMode === "success"
                          ? "border-green-700 bg-green-700 text-white"
                          : "border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
                          }`}
                      >
                        <div className="text-xs font-bold">Payment Success</div>
                        <div
                          className={`text-xs mt-0.5 ${manualForm.paymentStatusMode === "success" ? "text-green-100" : "text-gray-600"
                            }`}
                        >
                          Full Paid
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
                            <option value="cash_manual">Cash</option>
                            <option value="bank_transfer">Bank Transfer</option>
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
    </>
  );
}
