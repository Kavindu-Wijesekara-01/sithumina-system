"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function RiderModal({ admin }: { admin: Admin }) {
  const {
    fleetVehicles,
    handleSaveRider,
    riderForm,
    riderSubmitting,
    setRiderForm,
    setShowRiderModal,
    showRiderModal,
  } = admin;

  return (
    <>
      {showRiderModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-start justify-center p-4 py-6 backdrop-blur-xs overflow-y-auto"
          onClick={() => setShowRiderModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-xl p-6 shadow-2xl border border-[#E5E7EB] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-4">
              <h2 className="text-base font-semibold text-[#111827]">Register New Dispatch Rider</h2>
              <button
                type="button"
                onClick={() => setShowRiderModal(false)}
                className="text-[#4B5563] hover:text-[#111827] font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveRider} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">Rider ID</label>
                <input
                  type="text"
                  readOnly
                  value={riderForm.driverId}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs font-mono font-bold text-[#111827]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={riderForm.name}
                  onChange={(e) => setRiderForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    value={riderForm.phone}
                    onChange={(e) => setRiderForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">NIC Number</label>
                  <input
                    type="text"
                    value={riderForm.nic}
                    onChange={(e) => setRiderForm((p) => ({ ...p, nic: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">Assign Lorry Plate</label>
                <select
                  value={riderForm.plate}
                  onChange={(e) => setRiderForm((p) => ({ ...p, plate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                >
                  <option value="">Unassigned</option>
                  {fleetVehicles.map((v) => (
                    <option key={v.plate} value={v.plate}>{v.plate} ({v.vehicleType})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">Primary Route</label>
                <input
                  type="text"
                  value={riderForm.route}
                  onChange={(e) => setRiderForm((p) => ({ ...p, route: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activeDuty"
                  checked={riderForm.active}
                  onChange={(e) => setRiderForm((p) => ({ ...p, active: e.target.checked }))}
                  className="rounded border-[#E5E7EB] text-[#1E9E5A]"
                />
                <label htmlFor="activeDuty" className="text-xs font-bold text-[#111827] cursor-pointer">
                  Active On Duty Status
                </label>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowRiderModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5E7EB] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={riderSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#111827] text-white hover:bg-[#FFC20E] hover:text-[#111827] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {riderSubmitting ? "Registering..." : "Register Rider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
