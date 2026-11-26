"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function DeleteCustomerModal({ admin }: { admin: Admin }) {
  const {
    deleteCustomerModal,
    deletingCustomerId,
    handleConfirmDeleteCustomer,
    setDeleteCustomerModal,
  } = admin;

  return (
    <>
      {deleteCustomerModal && (
        <div
          className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs overflow-y-auto"
          onClick={() => {
            if (!deletingCustomerId) setDeleteCustomerModal(null);
          }}
        >
          <div
            className="w-full max-w-md bg-white rounded-xl p-6 shadow-2xl border border-[#E5E7EB] flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] pb-3">
              <div>
                <h2 className="text-base font-semibold text-[#111827]">Delete Customer Profile</h2>
                <p className="text-xs text-[#4B5563] mt-0.5">
                  Remove this client from the Customers directory &amp; database.
                </p>
              </div>
              <button
                type="button"
                disabled={Boolean(deletingCustomerId)}
                onClick={() => setDeleteCustomerModal(null)}
                className="text-[#4B5563] hover:text-[#111827] font-bold text-sm p-1 cursor-pointer disabled:opacity-40"
              >
                ✕
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#111827] text-[#FFC20E] flex items-center justify-center font-semibold text-base shrink-0">
                {(deleteCustomerModal.name || "C").trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[#111827] truncate">
                  {deleteCustomerModal.name}
                </div>
                <div className="text-xs font-mono font-bold text-[#4B5563]">
                  {deleteCustomerModal.phone || "No phone number"}
                </div>
                {deleteCustomerModal.totalBookings > 0 && (
                  <div className="text-xs font-bold text-amber-800 mt-1">
                    {deleteCustomerModal.totalBookings} Booking{deleteCustomerModal.totalBookings === 1 ? "" : "s"}
                  </div>
                )}
              </div>
            </div>
            {deleteCustomerModal.totalBookings > 0 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-2">
                <p className="text-xs text-amber-900 leading-relaxed">
                  Booking and revenue records are kept. To remove a booking, delete it individually with a reason.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#4B5563] leading-relaxed">
                This will permanently remove <b className="text-[#111827]">{deleteCustomerModal.name}</b> from Firestore and the Admin Customers list.
              </p>
            )}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5E7EB]">
              <button
                type="button"
                disabled={Boolean(deletingCustomerId)}
                onClick={() => setDeleteCustomerModal(null)}
                className="px-4 py-2 rounded-xl border border-[#E5E7EB] text-xs font-bold text-[#111827] hover:bg-[#F9FAFB] cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingCustomerId)}
                onClick={handleConfirmDeleteCustomer}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                {deletingCustomerId ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
