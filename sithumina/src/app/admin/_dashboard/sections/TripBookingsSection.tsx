"use client";

import TripDetails from "@/components/TripDetails";
import { groupTrips, isActiveTrip } from "@/lib/trip-state";
import { isTripFinished, outstandingAmount } from "@/lib/ledger";
import TripGroupList from "@/components/admin/TripGroupList";
import type { Admin } from "../state/useAdminDashboard";

export default function TripBookingsSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    allBookingsTab,
    bookings,
    completedBookings,
    completedDateFrom,
    completedDateTo,
    completedPaymentMethodFilter,
    completedSearch,
    completedStats,
    exportCompletedBookingsToCSV,
    filteredCompletedBookings,
    filteredOngoingBookings,
    filteredPendingPaymentBookings,
    loadOlderBookings,
    loadingBookings,
    olderBookings,
    ongoingBookings,
    ongoingSearch,
    pendingPaymentBookings,
    pendingPaymentSearch,
    renderBookingDispatchCard,
    setAllBookingsTab,
    setCompletedDateFrom,
    setCompletedDateTo,
    setCompletedPaymentMethodFilter,
    setCompletedSearch,
    setOngoingSearch,
    setPendingPaymentSearch,
  } = admin;

  return (
    <>
      {activeNav === "all_bookings" && (
            <div className="flex flex-col gap-4">
              {/* 3 Navigation Tabs: Ongoing Rides, Pending Payment, Completed Bookings */}
              <div className="bg-white border border-gray-300 rounded-xl p-1.5 flex flex-wrap items-center gap-2">
                {/* Tab 1: Ongoing Rides */}
                <button
                  type="button"
                  onClick={() => setAllBookingsTab("ongoing")}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${allBookingsTab === "ongoing"
                    ? "bg-emerald-600 text-white"
                    : "text-emerald-900 hover:text-emerald-950 hover:bg-emerald-50"
                    }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Ongoing Rides</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${allBookingsTab === "ongoing" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                    }`}>
                    {ongoingBookings.length}
                  </span>
                </button>
                {/* Tab 2: Pending Payment */}
                <button
                  type="button"
                  onClick={() => setAllBookingsTab("pending_payment")}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${allBookingsTab === "pending_payment"
                    ? "bg-amber-500 text-white"
                    : "text-amber-900 hover:text-amber-950 hover:bg-amber-50"
                    }`}
                >
                  <span>Pending Payment</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${allBookingsTab === "pending_payment" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"
                    }`}>
                    {pendingPaymentBookings.length}
                  </span>
                </button>
                {/* Tab 3: Completed Bookings */}
                <button
                  type="button"
                  onClick={() => setAllBookingsTab("completed")}
                  className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${allBookingsTab === "completed"
                    ? "bg-blue-600 text-white"
                    : "text-blue-900 hover:text-blue-950 hover:bg-blue-50"
                    }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>Completed Bookings</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${allBookingsTab === "completed" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-900"
                    }`}>
                    {completedBookings.length}
                  </span>
                </button>
              </div>
              {/* TAB 1: ONGOING RIDES */}
              {allBookingsTab === "ongoing" && (
                <div className="flex flex-col gap-4">
                  {/* Header & Filter Bar */}
                  <div className="bg-white border border-gray-300 rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <div>
                        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                          <span>Ongoing Rides</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-mono font-bold">
                            {ongoingBookings.length}
                          </span>
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Actively in transit within departure time up to end time (+5m buffer)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search..."
                        value={ongoingSearch}
                        onChange={(e) => setOngoingSearch(e.target.value)}
                        className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-gray-900 w-64 max-w-full"
                      />
                      {ongoingSearch && (
                        <button
                          type="button"
                          onClick={() => setOngoingSearch("")}
                          className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-900 font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  {/* List */}
                  <div className="flex flex-col gap-3">
                    {loadingBookings ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                        Loading ongoing dispatches...
                      </div>
                    ) : filteredOngoingBookings.length === 0 ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                        {ongoingSearch
                          ? "No ongoing rides match your search."
                          : "No active ongoing rides at this moment. Scheduled trips appear here between departure start time and end time (+5m buffer)."}
                      </div>
                    ) : (
                      groupTrips(filteredOngoingBookings, bookings).map((group) => (
                        <div key={group.key} className="flex flex-col gap-2">
                          {group.primary ? (
                            <>
                              {renderBookingDispatchCard(group.primary, "ongoing")}
                              <TripDetails booking={group.primary} />
                            </>
                          ) : (
                            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900">
                              Primary trip {group.key} is no longer on record.
                            </div>
                          )}
                          {group.legs.length > 0 && (
                            <div className="ml-3 sm:ml-8 pl-3 border-l-4 border-sky-500 flex flex-col gap-2">
                              <p className="text-xs font-semibold text-sky-800">
                                Attached return bookings ({group.legs.length})
                              </p>
                              {group.legs.map((leg) => (
                                <div key={leg.id} className="flex flex-col gap-1.5">
                                  <TripDetails booking={leg} />
                                  <details className="text-xs">
                                    <summary className="cursor-pointer font-semibold text-sky-800">
                                      Manage return booking {leg.id}
                                    </summary>
                                    <div className="mt-2">{renderBookingDispatchCard(leg, "ongoing")}</div>
                                  </details>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {/* TAB 2: PENDING PAYMENT */}
              {allBookingsTab === "pending_payment" && (
                <div className="flex flex-col gap-4">
                  {/* Header & Filter Bar */}
                  <div className="bg-white border border-gray-300 rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <div>
                        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                          <span>Pending Payment</span>
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-xs font-mono font-bold">
                            {pendingPaymentBookings.length}
                          </span>
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Physical journey concluded · Lorry &amp; rider time slots released · Settle balance to complete
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Search..."
                        value={pendingPaymentSearch}
                        onChange={(e) => setPendingPaymentSearch(e.target.value)}
                        className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-gray-900 w-64 max-w-full"
                      />
                      {pendingPaymentSearch && (
                        <button
                          type="button"
                          onClick={() => setPendingPaymentSearch("")}
                          className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-900 font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  {/* List */}
                  <div className="flex flex-col gap-3">
                    {loadingBookings ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                        Loading pending payment dispatches...
                      </div>
                    ) : filteredPendingPaymentBookings.length === 0 ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                        {pendingPaymentSearch
                          ? "No bookings match your search."
                          : "No concluded rides with pending payment. All concluded trips are fully settled!"}
                      </div>
                    ) : (
                      <TripGroupList
                        groups={groupTrips(filteredPendingPaymentBookings, bookings)}
                        manage={(b) => renderBookingDispatchCard(b, "pending_payment")}
                        empty="No trips are waiting for payment."
                      />
                    )}
                  </div>
                </div>
              )}
              {/* TAB 3: COMPLETED BOOKINGS */}
              {allBookingsTab === "completed" && (
                <div className="flex flex-col gap-4">
                  {/* Header & Filter Bar */}
                  <div className="bg-white border border-gray-300 rounded-lg p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <span>Completed Bookings</span>
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-xs font-mono font-bold">
                          {completedBookings.length}
                        </span>
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Concluded dispatches · Lorry &amp; rider time slots released and available for new bookings
                      </p>
                    </div>
                    {/* Summary Statistics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-1">
                      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs">
                        <span className="text-xs font-bold text-gray-500 block">Completed Rides</span>
                        <span className="text-lg font-semibold text-gray-900 font-mono">{completedStats.totalCount}</span>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs">
                        <span className="text-xs font-bold text-gray-500 block">Total Distance (KM)</span>
                        <span className="text-lg font-semibold text-emerald-800 font-mono">{completedStats.totalKm.toLocaleString()} km</span>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs">
                        <span className="text-xs font-bold text-gray-500 block">Total Revenue</span>
                        <span className="text-lg font-semibold text-blue-900 font-mono">Rs. {completedStats.totalRevenue.toLocaleString()}</span>
                      </div>
                      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs">
                        <span className="text-xs font-bold text-gray-500 block">Payment Breakdown</span>
                        <span className="text-xs font-bold text-gray-800 font-mono block truncate" title={`Cash: Rs. ${completedStats.cashSum.toLocaleString()} (${completedStats.cashCount}) | Bank: Rs. ${completedStats.bankSum.toLocaleString()} (${completedStats.bankCount})`}>
                          Rs. {completedStats.cashSum.toLocaleString()} · Rs. {completedStats.bankSum.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {/* Toolbar / Filters */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Search */}
                        <input
                          type="text"
                          aria-label="Search completed bookings by ID, customer, phone, driver, plate, or bank"
                          value={completedSearch}
                          onChange={(e) => setCompletedSearch(e.target.value)}
                          className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-xs text-gray-900 focus:outline-none focus:border-gray-900 w-56 max-w-full"
                        />
                        {/* Payment Method filter */}
                        <select
                          aria-label="Filter by payment method"
                          value={completedPaymentMethodFilter}
                          onChange={(e) => setCompletedPaymentMethodFilter(e.target.value)}
                          className="px-2.5 py-1.5 rounded-md border border-gray-300 bg-white text-xs font-semibold text-gray-900 focus:outline-none focus:border-gray-900"
                        >
                          <option value="all">All Payment Methods</option>
                          <option value="cash_manual">Cash Settlements</option>
                          <option value="bank_transfer">Bank Transfers</option>
                          <option value="online">Online Gateway</option>
                        </select>
                        {/* Date range picker */}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="date"
                            aria-label="Completed from date"
                            value={completedDateFrom}
                            onChange={(e) => setCompletedDateFrom(e.target.value)}
                            className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                          />
                          <span className="text-gray-400 font-bold">–</span>
                          <input
                            type="date"
                            aria-label="Completed to date"
                            value={completedDateTo}
                            onChange={(e) => setCompletedDateTo(e.target.value)}
                            className="px-2 py-1 rounded border border-gray-300 bg-white font-mono text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                          />
                          {(completedDateFrom || completedDateTo || completedSearch || completedPaymentMethodFilter !== "all") && (
                            <button
                              type="button"
                              onClick={() => {
                                setCompletedDateFrom("");
                                setCompletedDateTo("");
                                setCompletedSearch("");
                                setCompletedPaymentMethodFilter("all");
                              }}
                              className="px-2 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold cursor-pointer"
                              title="Clear filters"
                            >
                              ✕ Clear
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Export button */}
                      <button
                        type="button"
                        onClick={exportCompletedBookingsToCSV}
                        className="px-3 py-1.5 rounded-lg border border-emerald-600 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                        title="Download Completed Bookings spreadsheet as Excel CSV"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Export CSV / Excel</span>
                      </button>
                    </div>
                  </div>
                  {/* Excel Spreadsheet Table View */}
                  <div className="flex flex-col gap-3">
                    {loadingBookings ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500 font-medium">
                        Loading completed bookings...
                      </div>
                    ) : filteredCompletedBookings.length === 0 ? (
                      <div className="p-8 text-center bg-white border border-gray-300 rounded-lg text-sm text-gray-500">
                        {completedSearch || completedDateFrom || completedDateTo || completedPaymentMethodFilter !== "all"
                          ? "No completed bookings match your filter criteria."
                          : "No completed bookings recorded yet."}
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-gray-300 rounded-lg bg-white shadow-2xs">
                        <TripGroupList
                          groups={groupTrips(filteredCompletedBookings, bookings).filter(
                            // A trip stays under Pending Payment until every leg is paid and finished
                            (g) =>
                              ![g.primary, ...g.legs].some(
                                (t) => t && (isActiveTrip(t) || (isTripFinished(t) && outstandingAmount(t) > 0))
                              )
                          )}
                          empty="No completed trips match these filters."
                        />
                        {olderBookings !== "end" && (
                          <button
                            type="button"
                            disabled={olderBookings === "loading"}
                            onClick={loadOlderBookings}
                            className="mt-3 self-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm disabled:opacity-50 cursor-pointer"
                          >
                            {olderBookings === "loading" ? "Loading..." : "Load older bookings"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
    </>
  );
}
