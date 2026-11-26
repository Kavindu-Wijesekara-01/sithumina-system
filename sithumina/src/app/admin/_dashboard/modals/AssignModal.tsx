"use client";

import { normalizePlate } from "@/lib/phone-utils";
import { addDaysToYYYYMMDD, findBookingScheduleConflict, formatTimeDurationLabel, formatTime12h, getDatesBetween, validateScheduleTimeAndDates } from "@/lib/booking-schedule";
import { todayYmd } from "@/lib/ledger";
import type { Admin } from "../state/useAdminDashboard";

export default function AssignModal({ admin }: { admin: Admin }) {
  const {
    assignModal,
    bookings,
    confirmAssign,
    drivers,
    fleetVehicles,
    getOutsideDriverForPlate,
    setAssignModal,
  } = admin;

  return (
    <>
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
              className="w-full max-w-lg bg-white rounded-xl p-6 shadow-2xl border border-[#E5E7EB] my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-4">
                <h2 className="text-base font-semibold text-[#111827]">
                  {isIndivModal ? "Assign Rider & Time Schedule" : "Assign Rider & Lorry"}
                </h2>
                <button
                  type="button"
                  onClick={() => setAssignModal(null)}
                  className="text-[#4B5563] hover:text-[#111827] font-bold text-sm p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs bg-[#F9FAFB] p-3.5 rounded-xl border border-[#E5E7EB] mb-4">
                <div>Customer: <b>{assignModal.booking.customerName}</b> ({assignModal.booking.customerPhone || "N/A"})</div>
                <div className="mt-1">Route: <b>{assignModal.booking.pickupCity}</b> → <b>{assignModal.booking.deliveryCity}</b></div>
                <div className="mt-1">Requested Date: <b>{assignModal.booking.date}</b></div>
              </div>
              <div className="flex flex-col gap-3">
                {isIndivModal && (
                  <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                    <div className="flex items-center justify-between">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          aria-label="Toggle modal multi-day booking"
                          checked={Boolean(assignModal.isMultiDate)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const sDate = assignModal.date || todayYmd();
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
                        <span className="text-xs font-bold text-[#111827]">
                          Multi-Day Booking
                        </span>
                      </label>
                      {assignModal.isMultiDate && (
                        <span className="text-xs font-mono font-bold text-blue-900 bg-white border border-blue-300 px-2 py-0.5 rounded-full shadow-2xs">
                          {getDatesBetween(assignModal.date, assignModal.endDate || assignModal.date).length} Days
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
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
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs font-mono font-bold text-[#111827]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          {assignModal.isMultiDate ? "Departure Time *" : "Start Time *"}
                        </label>
                        <input
                          type="time"
                          value={assignModal.startTime}
                          onChange={(e) => setAssignModal((p) => (p ? { ...p, startTime: e.target.value } : null))}
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs font-mono font-bold text-[#111827]"
                        />
                      </div>
                      {assignModal.isMultiDate && (
                        <div>
                          <label className="block text-xs font-bold text-[#111827] mb-1">Delivery Date *</label>
                          <input
                            type="date"
                            min={assignModal.date}
                            value={assignModal.endDate || assignModal.date}
                            onChange={(e) => setAssignModal((p) => (p ? { ...p, endDate: e.target.value } : null))}
                            className="w-full px-2.5 py-2 rounded-xl border border-blue-400 bg-blue-50/40 text-xs font-mono font-bold text-[#111827]"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          {assignModal.isMultiDate ? "Delivery Time *" : "End Time *"}
                        </label>
                        <input
                          type="time"
                          value={assignModal.endTime}
                          onChange={(e) => setAssignModal((p) => (p ? { ...p, endTime: e.target.value } : null))}
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs font-mono font-bold text-[#111827]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1 flex items-center justify-between">
                          <span>Distance</span>
                          <span className="font-mono text-blue-600">KM</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          step="0.1"
                          value={assignModal.distanceKm || ""}
                          onChange={(e) => setAssignModal((p) => (p ? { ...p, distanceKm: e.target.value } : null))}
                          className="w-full px-2.5 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs font-mono font-bold text-[#111827]"
                        />
                      </div>
                    </div>
                  </div>
                )}
                {/* Assigned Vehicle Plate */}
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">Assigned Vehicle Plate *</label>
                  <select
                    value={assignModal.plate}
                    onChange={(e) => {
                      const selPlate = e.target.value;
                      const matchedV = fleetVehicles.find((v) => normalizePlate(v.plate) === normalizePlate(selPlate));
                      const outsideInfo = getOutsideDriverForPlate(selPlate);
                      const isOut = Boolean(
                        outsideInfo ||
                        (matchedV &&
                          ((matchedV as any).isOutsideLorry || (matchedV as any).ownershipType === "outside"))
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
                                driverId: matchedV.driverId || (matchedV as any).ownerIdNumber || "D-10",
                              }
                              : {}),
                          }
                          : null
                      );
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs font-mono font-bold text-[#111827]"
                  >
                    <option value="">Select Lorry</option>
                    {fleetVehicles.map((v) => {
                      const isOut = (v as any).isOutsideLorry || (v as any).ownershipType === "outside";
                      return (
                        <option key={v.id || v.plate} value={v.plate}>
                          {v.plate} — {v.vehicleType} {isOut ? "(Outside Partner)" : "(Company)"}
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
                  (getOutsideDriverForPlate(assignModal.plate) ||
                    fleetVehicles.some(
                      (v) =>
                        normalizePlate(v.plate) === normalizePlate(assignModal.plate) &&
                        ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
                    ))
                ) ? (() => {
                  const outsideInfo = getOutsideDriverForPlate(assignModal.plate);
                  const displayDriverName = outsideInfo?.driverName || assignModal.driverName || "Registered Owner";
                  const displayDriverId = outsideInfo?.driverId || assignModal.driverId || "Assigned";
                  const displayDriverPhone = outsideInfo?.driverPhone || assignModal.driverPhone || "—";
                  return (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <span>Assigned Driver / Permanent Driver (Locked)</span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-md bg-[#111827] text-[#FFC20E] font-mono text-xs font-semibold">
                          {displayDriverId}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>
                          <span className="text-xs font-bold text-amber-800/80 block">Driver Name</span>
                          <span className="font-bold text-[#111827]">{displayDriverName}</span>
                        </div>
                        <div>
                          <span className="text-xs font-bold text-amber-800/80 block">Contact</span>
                          <span className="font-bold font-mono text-[#111827]">{displayDriverPhone}</span>
                        </div>
                      </div>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Outside lorries have a fixed assigned driver registered directly.
                      </p>
                    </div>
                  );
                })() : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-[#111827] mb-1">
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
                        className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                      >
                        <option value="">Select Rider</option>
                        {drivers.map((d) => (
                          <option key={d.driverId} value={d.name}>{d.name} ({d.driverId}) - {d.phone}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#111827] mb-1">
                        Rider Mobile Number (Shown to Customer)
                      </label>
                      <input
                        type="tel"
                        value={assignModal.driverPhone}
                        onChange={(e) => setAssignModal((p) => (p ? { ...p, driverPhone: e.target.value } : null))}
                        className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs font-mono font-bold text-[#111827]"
                      />
                    </div>
                  </>
                )}
                {modalConflict?.hasConflict && (
                  <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-300 text-xs font-bold text-red-700">
                    {modalConflict.message}
                  </div>
                )}
                {isIndivModal && modalTimeCheck && !modalTimeCheck.valid && (
                  <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-800">
                    {modalTimeCheck.error}
                  </div>
                )}
                {isIndivModal && modalTimeCheck && modalTimeCheck.valid && (
                  <div className="px-3 py-2 rounded-xl bg-green-50 border border-green-300 text-xs font-bold text-green-800">
                    Slot Available: {modalTimeCheck.isMultiDate
                      ? `${modalTimeCheck.startDate} ${formatTime12h(modalTimeCheck.startTime)} → ${modalTimeCheck.endDate} ${formatTime12h(modalTimeCheck.endTime)} (${modalTimeCheck.daysCount} Days)`
                      : `${modalTimeCheck.startDate} · ${formatTimeDurationLabel(modalTimeCheck.startTime, modalTimeCheck.endTime)}`}
                  </div>
                )}
                {assignModal.booking.bookingType === "individual_vehicle" && (
                  <p className="text-xs text-[#111827] bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 font-semibold">
                    Dispatched directly to the assigned Rider mobile app with live audio chime notification.
                  </p>
                )}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5E7EB] mt-2">
                  <button
                    type="button"
                    onClick={() => setAssignModal(null)}
                    className="px-4 py-2 rounded-xl border border-[#E5E7EB] text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(modalConflict?.hasConflict)}
                    onClick={confirmAssign}
                    className="px-5 py-2 rounded-xl bg-[#111827] text-white hover:bg-[#FFC20E] hover:text-[#111827] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Confirm Assignment
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
