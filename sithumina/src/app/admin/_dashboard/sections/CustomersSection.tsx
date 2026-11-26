"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function CustomersSection({ admin }: { admin: Admin }) {
  const {
    StatusBadge,
    activeNav,
    bookedCustomersCount,
    customerSearch,
    customerSort,
    customerTierFilter,
    customersWithMetrics,
    deletingCustomerId,
    expandedCustomers,
    filteredCustomers,
    loadingUsers,
    registeredOnlyClientsCount,
    setCustomerSearch,
    setCustomerSort,
    setCustomerTierFilter,
    setDeleteCustomerModal,
    toggleCustomerExpanded,
  } = admin;

  return (
    <>
      {activeNav === "customers" && (
            <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 sm:p-5 flex flex-col gap-4">
              {/* Simple Header & Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E7EB]">
                <div>
                  <h2 className="text-base font-bold text-[#111827]">
                    Customer List ({filteredCustomers.length})
                  </h2>
                  <p className="text-xs text-[#4B5563]">
                    All registered and manually added customers.
                  </p>
                </div>
                <span className="text-xs text-[#4B5563] font-semibold">
                  {filteredCustomers.length} of {customersWithMetrics.length} Customers
                </span>
              </div>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <label
                    htmlFor="customer-search-input"
                    className="text-xs font-semibold text-[#4B5563] shrink-0"
                  >
                    Search:
                  </label>
                  <div className="relative flex-1">
                    <input
                      id="customer-search-input"
                      type="text"
                      aria-label="Search customers"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827] focus:outline-none focus:border-[#111827]"
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => setCustomerSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280] hover:text-[#111827] cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { key: "all", label: `All (${customersWithMetrics.length})` },
                    { key: "active", label: `Booked (${bookedCustomersCount})` },
                    { key: "registered", label: `Registered Only (${registeredOnlyClientsCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setCustomerTierFilter(tab.key as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${customerTierFilter === tab.key
                        ? "bg-[#111827] text-white"
                        : "bg-[#F9FAFB] text-[#4B5563] hover:bg-[#E5E7EB]"
                        }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 self-start lg:self-auto">
                  <span className="text-xs font-semibold text-[#4B5563]">Sort:</span>
                  <select
                    value={customerSort}
                    onChange={(e) => setCustomerSort(e.target.value as any)}
                    className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] text-xs font-semibold text-[#111827] focus:outline-none"
                  >
                    <option value="recent">Recently Added / Active</option>
                    <option value="name">Name (A–Z)</option>
                    <option value="bookings">Most Bookings</option>
                  </select>
                </div>
              </div>
              {/* Normal Clean Customer Table / List */}
              {loadingUsers && customersWithMetrics.length === 0 ? (
                <div className="py-10 text-center text-xs font-semibold text-[#4B5563]">
                  Loading customers...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="py-10 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-center">
                  <p className="text-xs font-bold text-[#111827]">No customers found</p>
                  <p className="text-xs text-[#4B5563] mt-0.5">
                    Try clearing the search or filter.
                  </p>
                </div>
              ) : (
                <div className="border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#E5E7EB]">
                  {filteredCustomers.map((c) => {
                    const isExpanded = !!expandedCustomers[c.id];
                    const cleanPhoneDigits = c.phone.replace(/[^0-9]/g, "");
                    const intlPhone = cleanPhoneDigits.startsWith("0")
                      ? `94${cleanPhoneDigits.slice(1)}`
                      : cleanPhoneDigits.startsWith("94")
                        ? cleanPhoneDigits
                        : `94${cleanPhoneDigits}`;
                    return (
                      <div key={c.id} className="bg-white">
                        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FCFBF7] transition-colors">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#111827] truncate">
                              {c.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-[#4B5563]">
                              <span className="font-mono font-semibold text-[#111827]">
                                {c.phone || "No phone"}
                              </span>
                              {c.idNumber ? (
                                <span className="inline-flex items-center gap-1 font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-[#F9FAFB] border border-[#E5E7EB] text-[#111827]">
                                  NIC: {c.idNumber}
                                </span>
                              ) : (
                                <span className="inline-flex items-center font-mono text-xs text-[#6B7280]">
                                  NIC: Not recorded
                                </span>
                              )}
                              {c.city && <span>• {c.city}</span>}
                              {c.email && <span>• {c.email}</span>}
                              <span>
                                • {c.totalBookings} {c.totalBookings === 1 ? "Booking" : "Bookings"}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {c.phone && (
                              <>
                                <a
                                  href={`tel:${c.phone}`}
                                  className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#111827] text-xs font-semibold transition-colors"
                                >
                                  Call
                                </a>
                                <a
                                  href={`https://wa.me/${intlPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors"
                                >
                                  WhatsApp
                                </a>
                              </>
                            )}
                            {c.totalBookings > 0 && (
                              <button
                                type="button"
                                onClick={() => toggleCustomerExpanded(c.id)}
                                className="px-2.5 py-1.5 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#111827] text-xs font-semibold transition-colors cursor-pointer"
                              >
                                {isExpanded ? "Hide Bookings ▲" : `Bookings (${c.totalBookings}) ▼`}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={deletingCustomerId === c.id}
                              aria-label={`Delete customer ${c.name}`}
                              onClick={() =>
                                setDeleteCustomerModal({
                                  id: c.id,
                                  name: c.name,
                                  phone: c.phone,
                                  totalBookings: c.totalBookings,
                                  totalRevenue: c.totalRevenue,
                                  deleteBookings: false,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {deletingCustomerId === c.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>
                        {isExpanded && c.bookingsList.length > 0 && (
                          <div className="px-4 py-3 bg-[#F9FAFB] border-t border-[#E5E7EB] flex flex-col gap-2">
                            {c.bookingsList.map((b) => (
                              <div
                                key={b.id}
                                className="px-3 py-2 rounded-lg bg-white border border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-bold text-[#111827]">#{b.id}</span>
                                  <span className="text-[#111827]">
                                    {b.pickupCity} → {b.deliveryCity}
                                  </span>
                                  <span className="text-[#4B5563]">
                                    ({b.date || "Date unspecified"})
                                  </span>
                                  {b.distanceKm ? (
                                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-xs font-mono font-bold">
                                      {b.distanceKm} km
                                    </span>
                                  ) : null}
                                </div>
                                <StatusBadge status={b.status} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
    </>
  );
}
