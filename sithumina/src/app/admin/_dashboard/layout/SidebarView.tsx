"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function SidebarView({ admin }: { admin: Admin }) {
  const {
    activeNav,
    handleOpenManualModal,
    handleSignOut,
    setActiveNav,
    setSidebarOpen,
    sidebarOpen,
  } = admin;

  return (
    <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 h-full max-h-screen bg-[#111827] text-white flex flex-col overflow-hidden transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        {/* Sidebar Header */}
        <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Sithumina Transport Logo"
              className="w-9 h-9 rounded-xl bg-[#FFC20E] p-1 object-contain shrink-0"
            />
            <div>
              <span className="font-semibold text-sm tracking-tight block">Sithumina Admin</span>
              <span className="text-xs text-white/50 block">Command Center</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-white/70 hover:text-white p-1 text-base font-bold"
          >
            ✕
          </button>
        </div>
        {/* Navigation Items (Scrollable) */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 flex flex-col gap-0.5 overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/40">
          {/* Overview */}
          <button
            onClick={() => {
              setActiveNav("overview");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "overview"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              <span>Dashboard Overview</span>
            </div>
          </button>
          {/* All Bookings (Ongoing Rides & Completed Bookings) */}
          <button
            onClick={() => {
              setActiveNav("all_bookings");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "all_bookings"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>All Bookings</span>
            </div>
          </button>
          {/* Individual Bookings */}
          <button
            onClick={() => {
              setActiveNav("individual_bookings");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "individual_bookings"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              <span>Individual Bookings</span>
            </div>
          </button>
          {/* Online / Live Lorry Bookings */}
          <button
            onClick={() => {
              setActiveNav("online_bookings");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "online_bookings"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
                <circle cx="12" cy="12" r="2" />
                <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
                <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
              </svg>
              <span>Online / Live Bookings</span>
            </div>
          </button>
          {/* Customers */}
          <button
            onClick={() => {
              setActiveNav("customers");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "customers"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Customers</span>
            </div>
          </button>
          {/* Revenue & Financials */}
          <button
            onClick={() => {
              setActiveNav("revenue");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "revenue"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span>Revenue &amp; Financials</span>
            </div>
          </button>
          {/* Vehicle Partner Registrations */}
          <button
            onClick={() => {
              setActiveNav("vehicle_registrations");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "vehicle_registrations"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M9 14l2 2 4-4" />
              </svg>
              <span>Vehicle Registrations</span>
            </div>
          </button>
          {/* Outside Employees / Partners */}
          <button
            onClick={() => {
              setActiveNav("outside_employees");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "outside_employees"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Outside Employees</span>
            </div>
          </button>
          {/* Top-up Slips */}
          <button
            onClick={() => {
              setActiveNav("topup_slips");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "topup_slips"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>Top-up Slips</span>
            </div>
          </button>
          {/* Contact Inquiries */}
          <button
            onClick={() => {
              setActiveNav("contact_submissions");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "contact_submissions"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Contact Inquiries</span>
            </div>
          </button>
          {/* Fleet Lorries */}
          <button
            onClick={() => {
              setActiveNav("fleet");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "fleet"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                <path d="M15 18H9" />
                <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
                <circle cx="17" cy="18" r="2" />
                <circle cx="7" cy="18" r="2" />
              </svg>
              <span>Fleet Lorries</span>
            </div>
          </button>
          {/* Riders & Drivers */}
          <button
            onClick={() => {
              setActiveNav("riders");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "riders"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Riders</span>
            </div>
          </button>
          {/* Settings */}
          <button
            onClick={() => {
              setActiveNav("settings");
              setSidebarOpen(false);
            }}
            className={`w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-left flex items-center justify-between cursor-pointer ${activeNav === "settings"
              ? "bg-[#FFC20E] text-[#111827]"
              : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings</span>
            </div>
          </button>
        </nav>
        {/* Sidebar Footer Controls */}
        <div className="shrink-0 p-2.5 border-t border-white/10 flex flex-col gap-1.5 bg-[#111827] mt-auto z-10 shadow-[0_-4px_12px_rgba(0,0,0,0.35)]">
          <button
            onClick={handleOpenManualModal}
            className="w-full py-2 px-3 rounded-lg bg-[#FFC20E] hover:bg-[#e6ad00] text-[#111827] text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>+ Manual Booking</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full py-1.5 px-3 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
  );
}
