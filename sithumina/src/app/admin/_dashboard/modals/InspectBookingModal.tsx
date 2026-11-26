"use client";

import { cleanRiderName } from "@/lib/booking-schedule";
import TripDetails from "@/components/TripDetails";
import type { Admin } from "../state/useAdminDashboard";
import { stripSinhalaText } from "../shared";

export default function InspectBookingModal({ admin }: { admin: Admin }) {
  const {
    bookings,
    inspectBookingModal,
    setInspectBookingModal,
  } = admin;

  return (
    <>
      {inspectBookingModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
          onClick={() => setInspectBookingModal(null)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 bg-gray-900 text-white">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-sm">
                  ✓
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white font-mono">
                      Completed Booking #{inspectBookingModal.id}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                      Closed &amp; Settled
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Completed on {inspectBookingModal.rideEndedAt ? new Date(inspectBookingModal.rideEndedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : inspectBookingModal.date}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectBookingModal(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                title="Close modal"
              >
                ✕
              </button>
            </div>
            {/* Modal Content */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-xs text-gray-800">
              <TripDetails booking={inspectBookingModal} />
              {bookings
                .filter((x) => x.tripRole === "return" && x.parentBookingId === inspectBookingModal.id)
                .map((leg) => (
                  <TripDetails key={leg.id} booking={leg} />
                ))}
              {/* Executive Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/70">
                  <span className="text-xs font-bold text-gray-500 block">Total Distance</span>
                  <span className="text-base font-semibold text-gray-900 font-mono mt-0.5 block">
                    {inspectBookingModal.distanceKm || inspectBookingModal.actualDistanceKm ? `${inspectBookingModal.distanceKm || inspectBookingModal.actualDistanceKm} km` : "—"}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/70">
                  <span className="text-xs font-bold text-gray-500 block">Total Quoted</span>
                  <span className="text-base font-semibold text-gray-900 font-mono mt-0.5 block">
                    Rs. {(inspectBookingModal.quotedAmount || 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/70">
                  <span className="text-xs font-bold text-gray-500 block">Payment Mode</span>
                  <span className="text-xs font-bold text-blue-900 mt-1 block truncate">
                    {inspectBookingModal.paymentMethod === "bank_transfer" ? "Bank Transfer" : (inspectBookingModal.paymentMethod as string) === "payhere" ? "Online Gateway" : "Cash Settled"}
                  </span>
                </div>
                <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/70">
                  <span className="text-xs font-bold text-gray-500 block">Driver In Charge</span>
                  <span className="text-xs font-bold text-gray-900 mt-1 block truncate">
                    {cleanRiderName(inspectBookingModal.assignedDriverName) || inspectBookingModal.assignedDriverPhone || "—"}
                  </span>
                </div>
              </div>
              {/* Grid 2-columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Route & Journey Details */}
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 pb-2 border-b border-gray-100">
                    <span>Route &amp; Journey Details</span>
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Pickup City:</span>
                      <span className="font-bold text-gray-900 text-right">{inspectBookingModal.pickupCity || "—"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Delivery City:</span>
                      <span className="font-bold text-gray-900 text-right">{inspectBookingModal.deliveryCity || "—"}</span>
                    </div>
                    {Array.isArray(inspectBookingModal.waypoints) && inspectBookingModal.waypoints.length > 0 && (
                      <div className="flex flex-col gap-1 pt-1.5 border-t border-gray-100">
                        <span className="text-gray-500 font-medium">Intermediate Towns:</span>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          {inspectBookingModal.waypoints.map((wp, idx) => (
                            <span key={`${wp.name}-${idx}`} className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 text-xs font-bold">
                              {idx + 1}⃣ {wp.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Measured Distance:</span>
                      <span className="font-mono font-bold text-emerald-800 text-right">
                        {inspectBookingModal.distanceKm || inspectBookingModal.actualDistanceKm ? `${inspectBookingModal.distanceKm || inspectBookingModal.actualDistanceKm} km` : "—"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Cargo Nature:</span>
                      <span className="font-medium text-gray-800 text-right">{stripSinhalaText(inspectBookingModal.cargoNature) || "General Cargo"}</span>
                    </div>
                    {inspectBookingModal.cargoWeight && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-500 font-medium">Cargo Weight:</span>
                        <span className="font-medium text-gray-800 text-right">{inspectBookingModal.cargoWeight}</span>
                      </div>
                    )}
                    {inspectBookingModal.helpersCount && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-500 font-medium">Helpers Allocated:</span>
                        <span className="font-medium text-gray-800 text-right">{inspectBookingModal.helpersCount}</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Fleet & Crew */}
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 pb-2 border-b border-gray-100">
                    <span>Fleet &amp; Personnel</span>
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Vehicle Plate:</span>
                      <span className="font-mono font-bold text-gray-900 text-right">
                        {inspectBookingModal.assignedPlate || inspectBookingModal.selectedVehiclePlate || "—"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Vehicle Category:</span>
                      <span className="font-medium text-gray-800 text-right">{stripSinhalaText(inspectBookingModal.vehicleType) || "Lorry"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Assigned Driver:</span>
                      <span className="font-bold text-gray-900 text-right">
                        {cleanRiderName(inspectBookingModal.assignedDriverName) || "—"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Driver Phone:</span>
                      <span className="font-mono text-gray-800 text-right">{inspectBookingModal.assignedDriverPhone || "—"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Trip Status:</span>
                      <span className="font-bold text-emerald-800 text-right">Trip Completed</span>
                    </div>
                  </div>
                </div>
                {/* Financial & Banking Settlement */}
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 pb-2 border-b border-gray-100">
                    <span>Financial &amp; Banking Details</span>
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Total Quoted Amount:</span>
                      <span className="font-mono font-bold text-gray-900 text-right">
                        Rs. {(inspectBookingModal.quotedAmount || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Advance Amount Paid:</span>
                      <span className="font-mono text-emerald-800 font-bold text-right">
                        Rs. {(inspectBookingModal.advanceAmount || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Remaining Balance:</span>
                      <span className="font-mono text-gray-800 text-right">
                        Rs. 0 (Fully Settled)
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Payment Method:</span>
                      <span className="font-bold text-gray-900 text-right">
                        {inspectBookingModal.paymentMethod === "bank_transfer" ? "Bank Transfer" : (inspectBookingModal.paymentMethod as string) === "payhere" ? "Online Gateway" : "Cash"}
                      </span>
                    </div>
                    {(inspectBookingModal.finalPaymentBankUsed || inspectBookingModal.paymentBankUsed) && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-500 font-medium">Bank Deposited / Used:</span>
                        <span className="font-bold text-blue-900 text-right">
                          {inspectBookingModal.finalPaymentBankUsed || inspectBookingModal.paymentBankUsed}
                        </span>
                      </div>
                    )}
                    {inspectBookingModal.paymentApprovedAt && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-500 font-medium">Payment Verified At:</span>
                        <span className="text-gray-700 text-right">
                          {new Date(inspectBookingModal.paymentApprovedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>
                    )}
                    {inspectBookingModal.paymentSlipName && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-500 font-medium">Deposit Slip:</span>
                        <span className="font-mono text-xs text-gray-700 text-right truncate max-w-[180px]">
                          {inspectBookingModal.paymentSlipName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Customer & Trip History */}
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 pb-2 border-b border-gray-100">
                    <span>Customer Profile &amp; Timings</span>
                  </h4>
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Customer Name:</span>
                      <span className="font-bold text-gray-900 text-right">{inspectBookingModal.customerName || "—"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Contact Phone:</span>
                      <span className="font-mono font-bold text-gray-900 text-right">{inspectBookingModal.customerPhone || "—"}</span>
                    </div>
                    {inspectBookingModal.customerWhatsapp && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-500 font-medium">WhatsApp:</span>
                        <span className="font-mono text-gray-800 text-right">{inspectBookingModal.customerWhatsapp}</span>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Departure Started:</span>
                      <span className="text-gray-800 text-right">
                        {inspectBookingModal.rideStartedAt ? new Date(inspectBookingModal.rideStartedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-gray-500 font-medium">Trip Completed:</span>
                      <span className="text-gray-800 text-right">
                        {inspectBookingModal.rideEndedAt ? new Date(inspectBookingModal.rideEndedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                      </span>
                    </div>
                    {inspectBookingModal.rideStartedAt && inspectBookingModal.rideEndedAt && (
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-gray-500 font-medium">Total Duration:</span>
                        <span className="font-bold text-gray-900 text-right">
                          {((inspectBookingModal.rideEndedAt - inspectBookingModal.rideStartedAt) / (1000 * 60 * 60)).toFixed(1)} Hours
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {/* Modal Footer */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-t border-gray-200">
              <span className="text-xs text-gray-500 font-mono">
                Booking ID: #{inspectBookingModal.id} · Read-only historical audit record
              </span>
              <button
                type="button"
                onClick={() => setInspectBookingModal(null)}
                className="px-4 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
