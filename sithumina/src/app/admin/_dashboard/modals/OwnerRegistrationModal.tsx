"use client";

import { PaidIntoSelect } from "@/components/admin/WalletPayments";
import type { Admin } from "../state/useAdminDashboard";

export default function OwnerRegistrationModal({ admin }: { admin: Admin }) {
  const {
    handleRegisterOutsideEmployee,
    outsideForm,
    outsideFormErrors,
    outsideFormServerError,
    setOutsideForm,
    setShowOutsideRegModal,
    showOutsideRegModal,
    submittingOutside,
  } = admin;

  return (
    <>
      {showOutsideRegModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-start justify-center p-4 py-6 backdrop-blur-xs overflow-y-auto"
          onClick={() => !submittingOutside && setShowOutsideRegModal(false)}
        >
          <form
            onSubmit={handleRegisterOutsideEmployee}
            noValidate
            className="w-full max-w-lg bg-white rounded-xl p-6 shadow-2xl border border-[#E5E7EB] my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3 mb-4">
              <h2 className="text-base font-semibold text-[#111827]">Register Outside Employee</h2>
              <button
                type="button"
                disabled={submittingOutside}
                onClick={() => setShowOutsideRegModal(false)}
                className="text-[#4B5563] hover:text-[#111827] font-bold text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">Full Name *</span>
                <input
                  type="text"
                  value={outsideForm.name}
                  placeholder="Owner / driver name"
                  onChange={(e) => setOutsideForm((p) => ({ ...p, name: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827]"
                />
                {outsideFormErrors.name && <span className="text-xs font-bold text-red-600">{outsideFormErrors.name}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">NIC Number *</span>
                <input
                  type="text"
                  value={outsideForm.idNumber}
                  placeholder="912345678V"
                  onChange={(e) => setOutsideForm((p) => ({ ...p, idNumber: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827]"
                />
                {outsideFormErrors.idNumber && <span className="text-xs font-bold text-red-600">{outsideFormErrors.idNumber}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">Phone Number *</span>
                <input
                  type="text"
                  value={outsideForm.phone}
                  placeholder="0771234567"
                  onChange={(e) => setOutsideForm((p) => ({ ...p, phone: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827]"
                />
                {outsideFormErrors.phone && <span className="text-xs font-bold text-red-600">{outsideFormErrors.phone}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">Vehicle Number *</span>
                <input
                  type="text"
                  value={outsideForm.plateNumber}
                  placeholder="WP LK-1234"
                  onChange={(e) => setOutsideForm((p) => ({ ...p, plateNumber: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827]"
                />
                {outsideFormErrors.plateNumber && <span className="text-xs font-bold text-red-600">{outsideFormErrors.plateNumber}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">Vehicle Type</span>
                <input
                  type="text"
                  value={outsideForm.vehicleType}
                  placeholder="14ft Lorry"
                  onChange={(e) => setOutsideForm((p) => ({ ...p, vehicleType: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827]"
                />
                {outsideFormErrors.vehicleType && <span className="text-xs font-bold text-red-600">{outsideFormErrors.vehicleType}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">Base Location</span>
                <input
                  type="text"
                  value={outsideForm.baseCity}
                  placeholder="Colombo"
                  onChange={(e) => setOutsideForm((p) => ({ ...p, baseCity: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827]"
                />
                {outsideFormErrors.baseCity && <span className="text-xs font-bold text-red-600">{outsideFormErrors.baseCity}</span>}
              </label>
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">Opening Wallet Balance (Rs.)</span>
                <input
                  type="text"
                  value={outsideForm.initialBalance}
                  placeholder="0"
                  onChange={(e) => setOutsideForm((p) => ({ ...p, initialBalance: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827]"
                />
                {outsideFormErrors.initialBalance && <span className="text-xs font-bold text-red-600">{outsideFormErrors.initialBalance}</span>}
              </label>
              <div>
                <span className="text-xs font-bold text-[#4B5563] block mb-1">Deposit paid by *</span>
                <PaidIntoSelect
                  label="Choose cash or bank account"
                  value={outsideForm.paidInto}
                  onChange={(v) => setOutsideForm((p) => ({ ...p, paidInto: v }))}
                />
                {outsideFormErrors.paidInto && <span className="block text-xs font-bold text-red-600">{outsideFormErrors.paidInto}</span>}
              </div>
              <label className="block">
                <span className="text-xs font-bold text-[#4B5563]">Status</span>
                <select
                  value={outsideForm.status}
                  onChange={(e) => setOutsideForm((p) => ({ ...p, status: e.target.value as "active" | "inactive" | "suspended" }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 text-xs font-semibold text-[#111827]"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
              <label className="flex items-center gap-2 sm:col-span-2 text-xs font-bold text-[#111827] cursor-pointer">
                <input
                  type="checkbox"
                  checked={outsideForm.isAvailable}
                  onChange={(e) => setOutsideForm((p) => ({ ...p, isAvailable: e.target.checked }))}
                />
                Available for bookings immediately
              </label>
            </div>
            {outsideFormServerError && (
              <div className="mt-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700">
                {outsideFormServerError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={submittingOutside}
                onClick={() => setShowOutsideRegModal(false)}
                className="px-4 py-2 rounded-xl border border-[#E5E7EB] text-xs font-bold text-[#4B5563] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingOutside}
                className="px-5 py-2 rounded-xl bg-[#111827] text-[#FFC20E] text-xs font-semibold disabled:opacity-60 cursor-pointer"
              >
                {submittingOutside ? "Registering..." : "Register"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
