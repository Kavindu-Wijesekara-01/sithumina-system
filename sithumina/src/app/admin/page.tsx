"use client";

import SignInForm from "@/components/auth/SignInForm";
import { useAdminDashboard } from "./_dashboard/state/useAdminDashboard";
import AssignModal from "./_dashboard/modals/AssignModal";
import DeleteBookingModal from "./_dashboard/modals/DeleteBookingModal";
import DeleteCustomerModal from "./_dashboard/modals/DeleteCustomerModal";
import EditBookingModal from "./_dashboard/modals/EditBookingModal";
import InspectBookingModal from "./_dashboard/modals/InspectBookingModal";
import LorryModal from "./_dashboard/modals/LorryModal";
import WorkspaceView from "./_dashboard/layout/WorkspaceView";
import ManualBookingModal from "./_dashboard/modals/ManualBookingModal";
import SidebarView from "./_dashboard/layout/SidebarView";
import OwnerRegistrationModal from "./_dashboard/modals/OwnerRegistrationModal";
import PaymentApprovalModal from "./_dashboard/modals/PaymentApprovalModal";
import SlipReviewModal from "./_dashboard/modals/SlipReviewModal";
import RiderModal from "./_dashboard/modals/RiderModal";
import SettleBalanceModal from "./_dashboard/modals/SettleBalanceModal";

export default function MasterAdminDashboard() {
  const admin = useAdminDashboard();
  const {
    authed,
    setSidebarOpen,
    setViewingSlipImage,
    sidebarOpen,
    toast,
    viewingSlipImage,
  } = admin;

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <SignInForm role="admin" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex text-[#111827] font-sans select-none">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-4 sm:bottom-auto sm:top-4 z-[99999] max-w-[calc(100vw-2rem)] px-5 py-3 rounded-xl text-xs font-semibold shadow-xl border ${toast.type === "success"
            ? "bg-emerald-50 border-emerald-300 text-emerald-800"
            : "bg-red-50 border-red-300 text-red-800"
            }`}
        >
          {toast.msg}
        </div>
      )}
      {/* ========================================================= */}
      {/* 1. PROFESSIONAL SIDE NAVIGATION (Sidebar)                 */}
      {/* ========================================================= */}
      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <SidebarView admin={admin} />
      {/* ========================================================= */}
      {/* 2. MAIN WORKSPACE AREA (Offset by fixed sidebar on lg+)   */}
      {/* ========================================================= */}
      <WorkspaceView admin={admin} />
      {/* ========================================================= */}
      {/* MODAL 1: ADD / EDIT FLEET LORRY                           */}
      {/* ========================================================= */}
      <OwnerRegistrationModal admin={admin} />
      <LorryModal admin={admin} />
      {/* ========================================================= */}
      {/* MODAL 2: REGISTER NEW RIDER                               */}
      {/* ========================================================= */}
      <RiderModal admin={admin} />
      {/* ========================================================= */}
      {/* MODAL 3: MANUAL BOOKING CREATION                          */}
      {/* ========================================================= */}
      <ManualBookingModal admin={admin} />
      {/* ========================================================= */}
      {/* MODAL 4: ASSIGN DRIVER TO BOOKING                         */}
      {/* ========================================================= */}
      <AssignModal admin={admin} />
      {/* ========================================================= */}
      {/* MODAL 5: PAYMENT SLIP (PDF & IMAGE) REVIEW MODAL          */}
      {/* ========================================================= */}
      <SlipReviewModal admin={admin} />
      {/* ========================================================= */}
      {/* MODAL: DELETE CUSTOMER CONFIRMATION                       */}
      {/* ========================================================= */}
      <DeleteCustomerModal admin={admin} />
      {/* Payment Approval & Setup Modal */}
      <PaymentApprovalModal admin={admin} />
      {/* Settle Remaining Balance Modal */}
      <SettleBalanceModal admin={admin} />
      {/* Edit Booking Modal */}
      <EditBookingModal admin={admin} />
      {/* Booking Deletion with Mandatory Reason Modal */}
      <DeleteBookingModal admin={admin} />
      {/* COMPREHENSIVE COMPLETED BOOKING AUDIT MODAL */}
      <InspectBookingModal admin={admin} />
      {/* FULL-SIZE SLIP IMAGE INSPECTION MODAL */}
      {viewingSlipImage && (
        <div
          className="fixed inset-0 z-[999999] bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setViewingSlipImage(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 bg-[#111827] text-white">
              <span className="text-xs font-bold font-mono">Bank Deposit Slip Document</span>
              <button
                type="button"
                onClick={() => setViewingSlipImage(null)}
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xs font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-[#F9FAFB] max-h-[80vh]">
              <img
                src={viewingSlipImage}
                alt="Bank Slip"
                className="max-h-[75vh] w-auto object-contain rounded-xl border border-[#E5E7EB]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
