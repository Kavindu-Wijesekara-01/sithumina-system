"use client";

import { formatRs } from "@/lib/commission";
import PerformancePanel from "@/components/admin/PerformancePanel";
import type { Admin } from "../state/useAdminDashboard";

export default function ExternalOwnersSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    availableOutsideCount,
    bookings,
    drivers,
    emptyOutsideForm,
    filteredOutsideEmployees,
    fleetVehicles,
    formatInquiryDate,
    loadingOutsideEmployees,
    lowBalanceOutsideCount,
    outsideEmployees,
    outsideFilter,
    outsideSearch,
    setOutsideFilter,
    setOutsideForm,
    setOutsideFormErrors,
    setOutsideFormServerError,
    setOutsideSearch,
    setShowOutsideRegModal,
    totalOutsideCommissionEarned,
  } = admin;

  return (
    <>
      {activeNav === "outside_employees" && (
            <div className="flex flex-col gap-5">
              <PerformancePanel
                mode="external"
                bookings={bookings}
                drivers={drivers}
                vehicles={fleetVehicles}
                owners={outsideEmployees}
              />
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] flex flex-col justify-between">
                  <span className="text-xs font-bold text-[#4B5563]">Total Partners</span>
                  <div className="text-2xl font-semibold text-[#111827] mt-1">{outsideEmployees.length}</div>
                  <span className="text-xs text-[#4B5563] mt-0.5">Approved Outside Lorries</span>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] flex flex-col justify-between">
                  <span className="text-xs font-bold text-emerald-800">Available on Duty</span>
                  <div className="text-2xl font-semibold text-emerald-700 mt-1">{availableOutsideCount}</div>
                  <span className="text-xs text-emerald-800 mt-0.5">Ready for Bookings</span>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] flex flex-col justify-between">
                  <span className="text-xs font-bold text-amber-800">Low Balance Warning</span>
                  <div className="text-2xl font-semibold text-amber-700 mt-1">{lowBalanceOutsideCount}</div>
                  <span className="text-xs text-amber-800 mt-0.5">&lt; Rs. 2,000 in Wallet</span>
                </div>
                <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] flex flex-col justify-between">
                  <span className="text-xs font-bold text-[#5B4300]">Total Commission</span>
                  <div className="text-xl sm:text-2xl font-semibold text-[#5B4300] mt-1 font-mono">
                    Rs. {totalOutsideCommissionEarned.toLocaleString()}
                  </div>
                  <span className="text-xs text-[#5B4300] mt-0.5">Earned from Outside Hires</span>
                </div>
              </div>
              {/* Filter & Search Bar */}
              <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E5E7EB] flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">Outside Lorry Fleet Partners</h2>
                    <button
                      type="button"
                      onClick={() => { setOutsideForm(emptyOutsideForm); setOutsideFormErrors({}); setOutsideFormServerError(""); setShowOutsideRegModal(true); }}
                      className="mt-2 px-4 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ae00] text-[#111827] text-xs font-semibold cursor-pointer"
                    >
                      + Register Outside Employee
                    </button>
                    <p className="text-xs text-[#4B5563] mt-0.5">
                      Independent lorry owners: Rs. 5,000 prepaid wallet, 20% commission per completed hire.
                    </p>
                  </div>
                  {/* Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${outsideFilter === "all" ? "bg-[#111827] text-[#FFC20E]" : "text-[#4B5563] hover:text-[#111827]"
                        }`}
                    >
                      All ({outsideEmployees.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("available")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${outsideFilter === "available" ? "bg-emerald-600 text-white" : "text-[#4B5563] hover:text-emerald-700"
                        }`}
                    >
                      Available ({availableOutsideCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("unavailable")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${outsideFilter === "unavailable" ? "bg-neutral-700 text-white" : "text-[#4B5563] hover:text-[#111827]"
                        }`}
                    >
                      Unavailable ({outsideEmployees.length - availableOutsideCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOutsideFilter("low_balance")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${outsideFilter === "low_balance" ? "bg-amber-500 text-[#111827]" : "text-[#4B5563] hover:text-amber-800"
                        }`}
                    >
                      Low Balance ({lowBalanceOutsideCount})
                    </button>
                  </div>
                </div>
                {/* Search Bar */}
                <div className="pt-3 border-t border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4B5563] pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={outsideSearch}
                      onChange={(e) => setOutsideSearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827] placeholder:text-[#6B7280]"
                    />
                    {outsideSearch && (
                      <button
                        type="button"
                        onClick={() => setOutsideSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E5E7EB]/70 text-[#111827] flex items-center justify-center text-xs font-semibold cursor-pointer hover:bg-[#FFC20E]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-bold text-[#4B5563] shrink-0">
                    Showing <b className="text-[#111827]">{filteredOutsideEmployees.length}</b> of <b className="text-[#111827]">{outsideEmployees.length}</b>
                  </span>
                </div>
              </div>
              {/* Partners Grid */}
              {loadingOutsideEmployees ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#4B5563]">Syncing outside partners...</p>
                </div>
              ) : filteredOutsideEmployees.length === 0 ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center flex flex-col items-center justify-center">
                  <h3 className="text-sm font-semibold text-[#111827]">No Outside Partners Found</h3>
                  <p className="text-xs text-[#4B5563] mt-1 max-w-sm">
                    {outsideSearch.trim() || outsideFilter !== "all"
                      ? "No outside employees match your current filter or search criteria."
                      : "Approved outside lorries from /register-vehicle will automatically appear here as registered partners."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredOutsideEmployees.map((emp) => {
                    const isLowBalance = (emp.balance || 0) < 2000;
                    return (
                      <div
                        key={emp.id}
                        className="p-5 sm:p-6 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#FFC20E] transition-all flex flex-col justify-between gap-4"
                      >
                        <div>
                          {/* Top Badges */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB]/60 pb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-3 py-1 rounded-xl bg-[#111827] text-[#FFC20E] font-semibold font-mono text-xs">
                                {emp.id}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-mono font-bold text-amber-900">
                                {emp.plateNumber}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-bold text-[#111827]">
                                {emp.vehicleType}
                              </span>
                            </div>
                            {/* Duty Status Badge */}
                            <div>
                              {emp.isAvailable ? (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Available
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-300 text-xs font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                                  Unavailable
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Owner Details */}
                          <div className="mt-3.5">
                            <span className="text-xs font-bold text-[#4B5563]">Partner / Vehicle Owner</span>
                            <h3 className="text-base font-semibold text-[#111827]">{emp.name}</h3>
                          </div>
                          {/* Info Grid */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Phone Number</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-mono font-bold text-[#111827]">{emp.phone}</span>
                                <a
                                  href={`tel:${emp.phone}`}
                                  className="px-2 py-0.5 rounded-lg bg-white border border-[#E5E7EB] hover:bg-[#FFC20E] text-xs font-bold text-[#111827]"
                                >
                                  Call
                                </a>
                              </div>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">National ID (NIC)</span>
                              <span className="text-xs font-mono font-bold text-[#111827] mt-0.5 block">
                                {emp.idNumber || "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Base Location</span>
                              <span className="text-xs font-bold text-[#111827] mt-0.5 block">
                                {emp.baseCity || "Registered Base"}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Hires Completed</span>
                              <span className="text-xs font-mono font-bold text-[#111827] mt-0.5 block">
                                {emp.totalHiresCompleted || 0} Hires
                              </span>
                            </div>
                          </div>
                          {/* Wallet Balance & Commission Section */}
                          <div className={`mt-3 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${isLowBalance
                            ? "bg-rose-50/70 border-rose-200"
                            : "bg-emerald-50/70 border-emerald-200"
                            }`}>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">
                                Security Deposit / Wallet Balance
                              </span>
                              <div className="flex items-baseline gap-2 mt-0.5">
                                <span className={`text-lg font-semibold font-mono ${isLowBalance ? "text-rose-700" : "text-emerald-700"
                                  }`}>
                                  {formatRs(emp.balance || 0)}
                                </span>
                                {isLowBalance ? (
                                  <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.2 rounded-full border border-rose-300">
                                    Low Balance (&lt; Rs. 2,000)
                                  </span>
                                ) : (
                                  <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.2 rounded-full border border-emerald-300">
                                    Ready for Hires
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="sm:text-right">
                              <span className="text-xs font-bold text-[#4B5563] block">
                                Commission Deducted
                              </span>
                              <span className="text-xs font-mono font-bold text-[#5B4300] mt-0.5 block">
                                Rs. {Number(emp.totalCommissionDeducted || 0).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        {/* Footer */}
                        <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between text-xs text-[#4B5563]">
                          <span>Partner Since: {formatInquiryDate(emp.createdAt)}</span>
                          <span className="font-mono text-xs">ID: {emp.id}</span>
                        </div>
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
