"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function OverviewSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    completedBookings,
    dashboardDateFrom,
    dashboardDateTo,
    dashboardDispatchList,
    dashboardFilterMode,
    loadingBookings,
    ongoingBookings,
    renderBookingDispatchCard,
    revenueData,
    setActiveNav,
    setAllBookingsTab,
    setDashboardDateFrom,
    setDashboardDateTo,
    setDashboardFilterMode,
    unpaidBookings,
    upcomingBookings,
  } = admin;

  return (
    <>
      {activeNav === "overview" && (
            <div className="flex flex-col gap-5">
              {/* Top 3 Cards: Today's Revenue, Ongoing Rides, & Unpaid Bookings */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Card 1: Today's Revenue */}
                <div
                  onClick={() => {
                    setDashboardFilterMode((prev) => (prev === "today" ? "upcoming" : "today"));
                  }}
                  className={`bg-white border rounded-lg p-4 sm:p-5 transition-all cursor-pointer ${dashboardFilterMode === "today"
                    ? "border-gray-900 ring-2 ring-gray-900"
                    : "border-gray-300 hover:border-gray-400"
                    }`}
                  title="Filter today's bookings"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900">Today&apos;s Revenue</h2>
                      {dashboardFilterMode === "today" && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-gray-900 text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono font-medium text-gray-500">
                      {revenueData.todayDateStr}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-2xl sm:text-3xl font-semibold text-gray-900 font-mono tracking-tight">
                      Rs. {loadingBookings ? "..." : revenueData.todayRevenue.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 font-medium space-x-2">
                      <span>{loadingBookings ? "..." : revenueData.todayBookingsCount} {revenueData.todayBookingsCount === 1 ? "trip" : "trips"}</span>
                      <span>·</span>
                      <span>Month: <strong className="text-gray-900 font-mono font-semibold">Rs. {loadingBookings ? "..." : revenueData.thisMonthRevenue.toLocaleString()}</strong></span>
                    </div>
                  </div>
                </div>
                {/* Card 2: Ongoing Rides */}
                <div
                  onClick={() => {
                    setActiveNav("all_bookings");
                    setAllBookingsTab("ongoing");
                  }}
                  className={`bg-white border rounded-lg p-4 sm:p-5 transition-all cursor-pointer ${dashboardFilterMode === "ongoing"
                    ? "border-emerald-600 ring-2 ring-emerald-600 bg-emerald-50/20"
                    : "border-gray-300 hover:border-gray-400"
                    }`}
                  title="View active ongoing rides in transit"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900">Ongoing Rides</h2>
                      <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                        Live
                      </span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700">
                      In Transit
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-semibold text-emerald-600 font-mono tracking-tight">
                        {loadingBookings ? "..." : ongoingBookings.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">on the road</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-700 hover:underline">
                      View Ongoing →
                    </span>
                  </div>
                </div>
                {/* Card 3: Unpaid Bookings */}
                <div
                  onClick={() => {
                    setDashboardFilterMode((prev) => (prev === "unpaid" ? "upcoming" : "unpaid"));
                  }}
                  className={`bg-white border rounded-lg p-4 sm:p-5 transition-all cursor-pointer ${dashboardFilterMode === "unpaid"
                    ? "border-orange-500 ring-2 ring-orange-500 bg-orange-50/20"
                    : "border-gray-300 hover:border-gray-400"
                    }`}
                  title="Filter unpaid bookings"
                >
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-gray-900">Unpaid Bookings</h2>
                      {dashboardFilterMode === "unpaid" && (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-orange-600 text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-orange-600">
                      Payment Pending
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl sm:text-3xl font-semibold text-orange-600 font-mono tracking-tight">
                        {loadingBookings ? "..." : unpaidBookings.length}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">pending</span>
                    </div>
                    <span className="text-xs font-bold text-orange-700 hover:underline">
                      {dashboardFilterMode === "unpaid" ? "✕ Show Upcoming" : "Filter Unpaid →"}
                    </span>
                  </div>
                </div>
              </div>
              {/* Schedule Header & Filter Bar */}
              <div className="bg-white border border-gray-300 rounded-lg p-3 sm:p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-gray-900">
                    Dispatch Schedule
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-800 text-xs font-mono font-bold">
                    {dashboardDispatchList.length}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  {/* Filter buttons */}
                  <div className="flex flex-wrap max-w-full items-center rounded-md border border-gray-300 overflow-hidden bg-gray-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("upcoming")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${dashboardFilterMode === "upcoming"
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 hover:text-gray-900"
                        }`}
                    >
                      Upcoming ({upcomingBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("ongoing")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${dashboardFilterMode === "ongoing"
                        ? "bg-emerald-600 text-white"
                        : "text-emerald-800 hover:text-emerald-900"
                        }`}
                    >
                      Ongoing ({ongoingBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("completed")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${dashboardFilterMode === "completed"
                        ? "bg-blue-600 text-white"
                        : "text-blue-800 hover:text-blue-900"
                        }`}
                    >
                      Completed ({completedBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("unpaid")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${dashboardFilterMode === "unpaid"
                        ? "bg-orange-600 text-white"
                        : "text-orange-800 hover:text-orange-900"
                        }`}
                    >
                      Unpaid ({unpaidBookings.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("today")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${dashboardFilterMode === "today"
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 hover:text-gray-900"
                        }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setDashboardFilterMode("all")}
                      className={`px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors ${dashboardFilterMode === "all"
                        ? "bg-gray-900 text-white"
                        : "text-gray-700 hover:text-gray-900"
                        }`}
                    >
                      All
                    </button>
                  </div>
                  {/* Date range picker */}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      aria-label="Filter from date"
                      value={dashboardDateFrom}
                      onChange={(e) => setDashboardDateFrom(e.target.value)}
                      className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                    />
                    <span className="text-gray-400 font-bold">–</span>
                    <input
                      type="date"
                      aria-label="Filter to date"
                      value={dashboardDateTo}
                      onChange={(e) => setDashboardDateTo(e.target.value)}
                      className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                    />
                    {(dashboardDateFrom || dashboardDateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDashboardDateFrom("");
                          setDashboardDateTo("");
                        }}
                        className="px-2 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer"
                        title="Clear date filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {/* Chronological Dispatch Schedule List */}
              <div className="flex flex-col gap-3">
                {loadingBookings ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                    Loading dispatch schedule...
                  </div>
                ) : dashboardDispatchList.length === 0 ? (
                  <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                    {dashboardFilterMode === "unpaid"
                      ? "No unpaid bookings pending payment."
                      : dashboardFilterMode === "today"
                        ? `No bookings scheduled for today (${revenueData.todayDateStr}).`
                        : "No scheduled dispatch bookings found."}
                  </div>
                ) : (
                  dashboardDispatchList.map((b) => renderBookingDispatchCard(b, "dashboard"))
                )}
              </div>
            </div>
          )}
    </>
  );
}
