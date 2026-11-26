"use client";

import { normalizePlate } from "@/lib/phone-utils";
import type { Admin } from "../state/useAdminDashboard";
import { CARGO_NATURE_OPTIONS } from "../shared";

export default function EditBookingModal({ admin }: { admin: Admin }) {
  const {
    drivers,
    editingBookingLoading,
    editingBookingModal,
    fleetVehicles,
    getOutsideDriverForPlate,
    handleSaveEditBooking,
    setEditingBookingModal,
  } = admin;

  return (
    <>
      {editingBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col my-8 max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div>
                  <h3 className="text-base font-bold">Edit Booking Details</h3>
                  <p className="text-xs text-gray-300">
                    Booking ID: <strong className="font-mono text-yellow-400">{editingBookingModal.id}</strong> · Customer: {editingBookingModal.booking.customerName} ({editingBookingModal.booking.customerPhone})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBookingModal(null)}
                className="text-gray-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            {/* Form Body */}
            <form onSubmit={handleSaveEditBooking} className="p-6 overflow-y-auto flex flex-col gap-4 text-sm text-gray-900">
              {/* Pickup & Delivery Cities */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pickup City *</label>
                  <input
                    type="text"
                    required
                    value={editingBookingModal.pickupCity}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, pickupCity: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-medium text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Delivery City *</label>
                  <input
                    type="text"
                    required
                    value={editingBookingModal.deliveryCity}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, deliveryCity: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-medium text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>
              {/* Distance in KM (Required) & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
                    <span className="text-red-700 font-bold">Distance (KM) *</span>
                    <span className="text-xs bg-amber-100 text-amber-900 font-mono px-1 rounded">Required</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="0.1"
                    value={editingBookingModal.distanceKm}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, distanceKm: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-amber-400 bg-white font-mono font-bold text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Trip Date *</label>
                  <input
                    type="date"
                    required
                    value={editingBookingModal.date}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, date: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-medium text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Multi-day Journey?</label>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="editMultiDate"
                      checked={Boolean(editingBookingModal.isMultiDate)}
                      onChange={(e) => setEditingBookingModal((p) => p ? { ...p, isMultiDate: e.target.checked } : null)}
                      className="w-4 h-4 rounded text-gray-900"
                    />
                    <label htmlFor="editMultiDate" className="text-xs font-medium cursor-pointer">
                      Multi-Day Trip
                    </label>
                  </div>
                </div>
              </div>
              {/* Times */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={editingBookingModal.startTime}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, startTime: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-mono font-semibold text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">End Time *</label>
                  <input
                    type="time"
                    required
                    value={editingBookingModal.endTime}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, endTime: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-mono font-semibold text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                </div>
              </div>
              {/* Lorry and Rider Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Assigned Lorry *</label>
                  <select
                    value={editingBookingModal.assignedPlate}
                    onChange={(e) => {
                      const selPlate = e.target.value;
                      const matched = fleetVehicles.find((v) => normalizePlate(v.plate) === normalizePlate(selPlate));
                      const outsideInfo = getOutsideDriverForPlate(selPlate);
                      const isOut = Boolean(
                        outsideInfo ||
                        (matched && ((matched as any).isOutsideLorry || (matched as any).ownershipType === "outside"))
                      );
                      setEditingBookingModal((p) => p ? {
                        ...p,
                        assignedPlate: selPlate,
                        assignedLorryId: matched?.id || p.assignedLorryId,
                        ...(isOut && matched ? {
                          assignedDriverId: matched.driverId || "",
                          assignedDriverName: matched.driverName || "",
                          assignedDriverPhone: matched.driverPhone || "",
                        } : {}),
                      } : null);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-mono font-semibold text-gray-900 focus:outline-none focus:border-gray-900"
                  >
                    {fleetVehicles.map((v) => (
                      <option key={v.id || v.plate} value={v.plate}>
                        {v.plate} — {v.vehicleType}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Rider: Outside vehicle permanently locked */}
                {Boolean(
                  editingBookingModal.assignedPlate &&
                  (getOutsideDriverForPlate(editingBookingModal.assignedPlate) ||
                    fleetVehicles.some(
                      (v) =>
                        normalizePlate(v.plate) === normalizePlate(editingBookingModal.assignedPlate) &&
                        ((v as any).isOutsideLorry || (v as any).ownershipType === "outside")
                    ))
                ) ? (() => {
                  const outsideInfo = getOutsideDriverForPlate(editingBookingModal.assignedPlate);
                  const displayDriverName = outsideInfo?.driverName || editingBookingModal.assignedDriverName || "Permanent Driver";
                  const displayDriverId = outsideInfo?.driverId || editingBookingModal.assignedDriverId || "";
                  const displayDriverPhone = outsideInfo?.driverPhone || editingBookingModal.assignedDriverPhone || "";
                  return (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center justify-between">
                        <span>Assigned Rider *</span>
                        <span className="text-xs font-bold text-amber-700">Assigned Driver</span>
                      </label>
                      <div className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-sm text-amber-950 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold truncate">
                          <span>{displayDriverName}</span>
                          {displayDriverId && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-900 text-yellow-400 font-mono text-xs">
                              {displayDriverId}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-xs text-amber-800">
                          {displayDriverPhone}
                        </span>
                      </div>
                    </div>
                  );
                })() : (
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Assigned Rider *</label>
                    <select
                      value={editingBookingModal.assignedDriverName}
                      onChange={(e) => {
                        const drv = drivers.find((d) => d.name === e.target.value);
                        setEditingBookingModal((p) => p ? {
                          ...p,
                          assignedDriverId: drv?.driverId || "",
                          assignedDriverName: drv?.name || e.target.value,
                          assignedDriverPhone: drv?.phone || "",
                        } : null);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-medium text-gray-900 focus:outline-none focus:border-gray-900"
                    >
                      <option value="">Select Rider</option>
                      {drivers.map((d) => (
                        <option key={d.id || d.driverId} value={d.name}>
                          {d.name} ({d.driverId})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {/* Amounts: Quoted, Advance, Calculated Pending */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Total Amount (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingBookingModal.quotedAmount}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, quotedAmount: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-mono font-bold text-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Advance Paid (LKR)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingBookingModal.advanceAmount}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, advanceAmount: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white font-mono font-bold text-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Due Balance (LKR)</label>
                  <div className="px-3 py-2 rounded-lg bg-gray-200 font-mono font-semibold text-gray-900">
                    Rs. {Math.max(0, Number(editingBookingModal.quotedAmount || 0) - Number(editingBookingModal.advanceAmount || 0)).toLocaleString()}
                  </div>
                </div>
              </div>
              {/* Cargo Nature & Helpers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cargo Nature</label>
                  <select
                    value={editingBookingModal.cargoNature}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, cargoNature: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none"
                  >
                    {CARGO_NATURE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cargo Weight</label>
                  <input
                    type="text"
                    value={editingBookingModal.cargoWeight}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, cargoWeight: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Helpers Count</label>
                  <input
                    type="number"
                    min="0"
                    value={editingBookingModal.helpersCount}
                    onChange={(e) => setEditingBookingModal((p) => p ? { ...p, helpersCount: e.target.value } : null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:outline-none"
                  />
                </div>
              </div>
              {/* Actions */}
              <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingBookingModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingBookingLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gray-900 hover:bg-black cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {editingBookingLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
