"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function DeleteBookingModal({ admin }: { admin: Admin }) {
  const {
    deleteBookingModal,
    deletingBookingLoading,
    handleConfirmDeleteBookingWithReason,
    setDeleteBookingModal,
  } = admin;

  return (
    <>
      {deleteBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-red-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-red-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-white"></span>
                <div>
                  <h3 className="text-base font-bold">Delete Booking Record</h3>
                  <p className="text-xs text-red-100">Deletion reason is mandatory and will be logged in Complaints.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteBookingModal(null)}
                className="text-white/80 hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
            {/* Body */}
            <div className="p-6 flex flex-col gap-4">
              {/* Booking Summary Box */}
              <div className="p-3.5 bg-red-50/60 rounded-xl border border-red-200 text-xs text-gray-800 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-red-900">
                    Booking #{deleteBookingModal.booking.id}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {deleteBookingModal.booking.pickupCity} → {deleteBookingModal.booking.deliveryCity}
                  </span>
                </div>
                <div className="text-gray-700 flex flex-wrap items-center gap-2">
                  <span>Customer: <strong className="text-gray-900">{deleteBookingModal.booking.customerName}</strong></span>
                  {deleteBookingModal.booking.customerPhone && (
                    <span className="font-mono text-gray-600">({deleteBookingModal.booking.customerPhone})</span>
                  )}
                  {deleteBookingModal.booking.customerIdNumber && (
                    <span className="font-mono text-xs px-1.5 py-0.5 bg-white border border-red-200 rounded text-red-800">
                      NIC: {deleteBookingModal.booking.customerIdNumber}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 pt-1 border-t border-red-200/60">
                  <span>Date: <b>{deleteBookingModal.booking.date || "Unspecified"}</b></span>
                  {deleteBookingModal.booking.distanceKm && (
                    <span>Distance: <b>{deleteBookingModal.booking.distanceKm} km</b></span>
                  )}
                  {deleteBookingModal.booking.quotedAmount !== undefined && (
                    <span>Amount: <b>Rs. {Number(deleteBookingModal.booking.quotedAmount).toLocaleString()}</b></span>
                  )}
                </div>
              </div>
              {/* Mandatory Reason Input */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-1.5">
                  Reason for Deletion (Mandatory) <span className="text-red-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={deleteBookingModal.reason}
                  onChange={(e) =>
                    setDeleteBookingModal((p) => (p ? { ...p, reason: e.target.value, error: "" } : null))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-xs focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
                />
              </div>
              {/* Quick Preset Buttons */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-500">Quick Reasons:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Customer cancelled",
                    "Price disagreement",
                    "Customer unreachable",
                    "No vehicle available",
                    "Duplicate booking",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setDeleteBookingModal((p) => (p ? { ...p, reason: preset, error: "" } : null))
                      }
                      className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-gray-200 text-xs font-medium text-gray-700 transition-colors cursor-pointer"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              {deleteBookingModal.error && (
                <div className="p-2.5 rounded-lg bg-red-100 border border-red-300 text-red-800 text-xs font-semibold">
                  {deleteBookingModal.error}
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingBookingLoading}
                onClick={() => setDeleteBookingModal(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingBookingLoading || !deleteBookingModal.reason.trim()}
                onClick={handleConfirmDeleteBookingWithReason}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-all cursor-pointer disabled:opacity-40"
              >
                {deletingBookingLoading ? "Deleting..." : "Confirm & Delete Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
