"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function HeaderView({ admin }: { admin: Admin }) {
  const {
    activeNav,
    allBookingsTab,
    complaints,
    completedBookings,
    customersWithMetrics,
    handleOpenAddLorry,
    handleOpenAddRider,
    handleOpenManualModal,
    ongoingBookings,
    pendingPaymentBookings,
    revenueData,
    setActiveNav,
    setSidebarOpen,
  } = admin;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-[#111827] font-bold"
              aria-label="Open Navigation"
            >
              ☰
            </button>
            <div>
              <h1 className="text-base font-semibold text-[#111827] tracking-tight">
                {activeNav === "overview" && "Dashboard Overview"}
                {activeNav === "all_bookings" && (
                  allBookingsTab === "ongoing"
                    ? "All Bookings · Ongoing Rides"
                    : allBookingsTab === "pending_payment"
                      ? "All Bookings · Pending Payment"
                      : "All Bookings · Completed Bookings"
                )}
                {activeNav === "individual_bookings" && "Individual Vehicle Bookings"}
                {activeNav === "online_bookings" && "Online / Live Lorry Bookings"}
                {activeNav === "customers" && "Customers"}
                {activeNav === "complaints" && "Complaints & Deletions"}
                {activeNav === "revenue" && "Revenue"}
                {activeNav === "vehicle_registrations" && "Vehicle & Partner Registrations"}
                {activeNav === "outside_employees" && "Outside Employees & Fleet Partners"}
                {activeNav === "topup_slips" && "Employee Top-up Bank Slips"}
                {activeNav === "contact_submissions" && "Contact Inquiries & Support"}
                {activeNav === "fleet" && "Fleet Lorries Management"}
                {activeNav === "riders" && "Riders Registry"}
                {activeNav === "settings" && "System & Payment Settings"}
              </h1>
              <p className="text-xs text-[#4B5563]">
                {activeNav === "all_bookings"
                  ? allBookingsTab === "ongoing"
                    ? "Live active dispatches in transit · Active during scheduled departure window"
                    : allBookingsTab === "pending_payment"
                      ? "Concluded dispatches with payment pending · Lorry & rider slot is already released"
                      : "Concluded & fully settled dispatches · Locked historical records"
                  : activeNav === "customers"
                    ? "Simple list of all registered and booked customers"
                    : activeNav === "complaints"
                      ? "Audit log of cancelled and deleted bookings with mandatory reasons"
                      : activeNav === "revenue"
                        ? "Individual & Live Lorry · Resets daily at 12:00 AM"
                        : activeNav === "vehicle_registrations"
                          ? "Incoming lorry partner applications from /register-vehicle"
                          : activeNav === "outside_employees"
                            ? "Outside partner tracking, wallet balance & 20% commission monitoring"
                            : activeNav === "topup_slips"
                              ? "Top-up bank transfer slips uploaded by outside drivers for balance recharge"
                              : activeNav === "contact_submissions"
                                ? "Direct customer inquiries & rate quotes from /contact"
                                : "Head Office Dispatch Operations"}
              </p>
            </div>
          </div>
          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {activeNav === "all_bookings" && allBookingsTab === "ongoing" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-mono font-bold text-emerald-800 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {ongoingBookings.length} Active On Road
                </span>
              </div>
            )}
            {activeNav === "all_bookings" && allBookingsTab === "pending_payment" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-mono font-bold text-amber-900 whitespace-nowrap shrink-0 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  {pendingPaymentBookings.length} Payment Pending
                </span>
              </div>
            )}
            {activeNav === "all_bookings" && allBookingsTab === "completed" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-mono font-bold text-blue-900 whitespace-nowrap shrink-0">
                  {completedBookings.length} Concluded Trips
                </span>
              </div>
            )}
            {activeNav === "customers" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-mono font-bold text-[#111827] whitespace-nowrap shrink-0">
                  {customersWithMetrics.length} Customers
                </span>
              </div>
            )}
            {activeNav === "complaints" && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-xs font-mono font-bold text-red-900 whitespace-nowrap shrink-0">
                  {complaints.length} Audit Records
                </span>
              </div>
            )}
            {activeNav === "revenue" && (
              <div className="px-3 py-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-mono font-bold text-[#111827] whitespace-nowrap shrink-0">
                {revenueData.todayDateStr}
              </div>
            )}
            {activeNav === "vehicle_registrations" && (
              <a
                href="/register-vehicle"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#111827] text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Open Registration Form ↗</span>
              </a>
            )}
            {activeNav === "contact_submissions" && (
              <a
                href="/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#111827] text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>Open Contact Page ↗</span>
              </a>
            )}
            {activeNav === "fleet" && (
              <button
                onClick={handleOpenAddLorry}
                className="px-3.5 py-2 rounded-xl bg-[#111827] hover:bg-[#3D3A31] text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
              >
                <span>+ Add Lorry</span>
              </button>
            )}
            {activeNav === "riders" && (
              <button
                onClick={handleOpenAddRider}
                className="px-3.5 py-2 rounded-xl bg-[#111827] hover:bg-[#3D3A31] text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
              >
                <span>+ Add Rider</span>
              </button>
            )}
            {activeNav === "individual_bookings" && (
              <button
                onClick={handleOpenManualModal}
                className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#111827] text-xs font-semibold transition-all cursor-pointer"
              >
                + Manual Booking
              </button>
            )}
            {activeNav === "settings" && (
              <button
                onClick={() => setActiveNav("individual_bookings")}
                className="px-3.5 py-2 rounded-xl bg-[#111827] hover:bg-[#3D3A31] text-white text-xs font-semibold transition-all cursor-pointer"
              >
                ← Bookings
              </button>
            )}
          </div>
        </header>
  );
}
