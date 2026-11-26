"use client";

import type { Admin } from "../state/useAdminDashboard";
import { StatusFilter } from "../shared";

export default function BookingFilterBar({ admin }: { admin: Admin }) {
  const {
    editingQuoteId,
    expandedIndividualBookings,
    filteredIndividualBookings,
    individualBookings,
    individualSearch,
    setExpandedIndividualBookings,
    setIndividualSearch,
    setStatusFilter,
    slipReviewCount,
    statusFilter,
  } = admin;

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">
                      Individual Bookings ({individualBookings.length})
                    </h2>
                  </div>
                  {/* Status Filter */}
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    {([
                      { key: "all", label: "All" },
                      { key: "pending", label: "Pending Quote" },
                      { key: "awaiting_payment", label: "Awaiting Pay" },
                      { key: "payment_submitted", label: "Slip Review" },
                      { key: "accepted", label: "Approved" },
                      { key: "assigned", label: "Assigned" },
                      { key: "completed", label: "Completed" },
                    ] as { key: StatusFilter; label: string }[]).map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setStatusFilter(st.key)}
                        className={`px-3 py-1.5 rounded-md font-medium cursor-pointer border ${statusFilter === st.key
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        {st.label}
                        {st.key === "payment_submitted" && slipReviewCount > 0 ? ` (${slipReviewCount})` : ""}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Search Box + Accordion Toolbar */}
                <div className="pt-3.5 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <label htmlFor="individual-booking-search" className="text-sm font-medium text-gray-700 shrink-0">
                      Search:
                    </label>
                    <div className="relative flex-1 min-w-0 max-w-lg">
                      <input
                        id="individual-booking-search"
                        type="text"
                        aria-label="Search individual bookings by name, phone, booking ID, lorry plate, or city"
                        value={individualSearch}
                        onChange={(e) => setIndividualSearch(e.target.value)}
                        className="w-full px-3 py-2 pr-8 rounded-md border border-gray-300 bg-white focus:border-gray-900 focus:outline-none text-sm text-gray-900"
                      />
                      {individualSearch.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIndividualSearch("")}
                          aria-label="Clear booking search"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900 text-sm font-bold cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="text-sm text-gray-600">
                      Showing <strong className="text-gray-900">{filteredIndividualBookings.length}</strong> of{" "}
                      <strong className="text-gray-900">{individualBookings.length}</strong>
                    </span>
                    {filteredIndividualBookings.length > 0 && (() => {
                      const allExpanded = filteredIndividualBookings.every((b, idx) =>
                        expandedIndividualBookings[b.id] !== undefined
                          ? expandedIndividualBookings[b.id]
                          : idx === 0 || b.status === "pending" || b.status === "payment_submitted" || editingQuoteId === b.id
                      );
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const nextState: Record<string, boolean> = { ...expandedIndividualBookings };
                            filteredIndividualBookings.forEach((b) => {
                              nextState[b.id] = !allExpanded;
                            });
                            setExpandedIndividualBookings(nextState);
                          }}
                          className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-900 text-sm font-medium cursor-pointer"
                        >
                          {allExpanded ? "Collapse All" : "Expand All"}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
  );
}
