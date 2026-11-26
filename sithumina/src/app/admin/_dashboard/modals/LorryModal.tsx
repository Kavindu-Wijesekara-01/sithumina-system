"use client";

import type { Admin } from "../state/useAdminDashboard";
import { VEHICLE_TYPE_OPTIONS } from "../shared";

export default function LorryModal({ admin }: { admin: Admin }) {
  const {
    companyDrivers,
    lorryError,
    editingLorryPlate,
    handleLorryImageUpload,
    handleSaveLorry,
    lorryForm,
    lorrySubmitting,
    setLorryForm,
    setShowLorryModal,
    showLorryModal,
  } = admin;

  return (
    <>
      {showLorryModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-start justify-center p-4 py-6 backdrop-blur-xs overflow-y-auto"
          onClick={() => setShowLorryModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-xl p-6 shadow-2xl border border-[#E5E7EB] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-4">
              <h2 className="text-base font-semibold text-[#111827]">
                {editingLorryPlate ? `Edit Lorry (${editingLorryPlate})` : "Register New Fleet Lorry"}
              </h2>
              <button
                type="button"
                onClick={() => setShowLorryModal(false)}
                className="text-[#4B5563] hover:text-[#111827] font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveLorry} className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">Vehicle Plate *</label>
                  <input
                    type="text"
                    required
                    value={lorryForm.plate}
                    onChange={(e) => setLorryForm((p) => ({ ...p, plate: e.target.value }))}
                    disabled={Boolean(editingLorryPlate)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs font-mono font-bold text-[#111827]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">Vehicle Type *</label>
                  <select
                    value={lorryForm.vehicleType}
                    onChange={(e) => setLorryForm((p) => ({ ...p, vehicleType: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                  >
                    {VEHICLE_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">Dimensions</label>
                  <input
                    type="text"
                    value={lorryForm.capacity}
                    onChange={(e) => setLorryForm((p) => ({ ...p, capacity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">Max Payload</label>
                  <input
                    type="text"
                    value={lorryForm.maxWeight}
                    onChange={(e) => setLorryForm((p) => ({ ...p, maxWeight: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1 flex items-center justify-between">
                    <span>Base Terminal / City</span>
                    <span className="text-xs font-normal text-[#6B7280]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={lorryForm.baseCity}
                    onChange={(e) => setLorryForm((p) => ({ ...p, baseCity: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111827] mb-1">Assign Rider</label>
                  <select
                    value={lorryForm.rider}
                    onChange={(e) => setLorryForm((p) => ({ ...p, rider: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827]"
                  >
                    <option value="Unassigned">Unassigned</option>
                    {companyDrivers.map((d) => (
                      <option key={d.driverId} value={d.name}>{d.name} ({d.driverId})</option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Photos Upload Section (3 photos) */}
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">
                  Upload Lorry Photos (Up to 3 Photos)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleLorryImageUpload}
                  className="w-full text-xs text-[#4B5563] file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#FFC20E] file:text-[#111827] cursor-pointer"
                />
                {lorryForm.images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {lorryForm.images.map((img, idx) => (
                      <div key={idx} className="relative aspect-[4/3] rounded-xl overflow-hidden border border-[#E5E7EB]">
                        <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setLorryForm((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }))}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-[#111827] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={lorryForm.description}
                  onChange={(e) => setLorryForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827] focus:outline-none"
                />
              </div>
              {lorryError && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {lorryError}
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
                <button
                  type="button"
                  onClick={() => setShowLorryModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#E5E7EB] text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={lorrySubmitting}
                  className="px-5 py-2 rounded-xl bg-[#111827] text-white hover:bg-[#FFC20E] hover:text-[#111827] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {lorrySubmitting ? "Saving..." : "Save Fleet Lorry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
