"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function TopupSlipsSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    approvedTopupSlipsCount,
    filteredTopupSlips,
    formatInquiryDate,
    handleApproveTopupSlip,
    handleDeleteTopupSlip,
    loadingTopupSlips,
    pendingTopupSlipsCount,
    setTopupSearch,
    setTopupStatusFilter,
    setViewingSlipImage,
    topupActionId,
    topupSearch,
    topupSlips,
    topupStatusFilter,
  } = admin;

  return (
    <>
      {activeNav === "topup_slips" && (
            <div className="flex flex-col gap-5">
              {/* Summary Bar */}
              <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E5E7EB] flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827] flex items-center gap-2">
                      <span>Employee Top-up Bank Slips</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-mono text-[#4B5563]">
                        {topupSlips.length} Total
                      </span>
                    </h2>
                    <p className="text-xs text-[#4B5563] mt-0.5">
                      Review and approve bank deposit slips uploaded by outside lorry drivers to recharge their balance.
                    </p>
                  </div>
                  {/* Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                    <button
                      type="button"
                      onClick={() => setTopupStatusFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${topupStatusFilter === "all" ? "bg-[#111827] text-[#FFC20E]" : "text-[#4B5563] hover:text-[#111827]"
                        }`}
                    >
                      All ({topupSlips.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopupStatusFilter("pending")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${topupStatusFilter === "pending" ? "bg-amber-400 text-[#111827]" : "text-[#4B5563] hover:text-amber-800"
                        }`}
                    >
                      <span>Pending</span>
                      {pendingTopupSlipsCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-xs font-mono font-semibold bg-[#111827] text-[#FFC20E]">
                          {pendingTopupSlipsCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopupStatusFilter("approved")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${topupStatusFilter === "approved" ? "bg-emerald-600 text-white" : "text-[#4B5563] hover:text-emerald-700"
                        }`}
                    >
                      Approved ({approvedTopupSlipsCount})
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
                      value={topupSearch}
                      onChange={(e) => setTopupSearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827] placeholder:text-[#6B7280]"
                    />
                    {topupSearch && (
                      <button
                        type="button"
                        onClick={() => setTopupSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E5E7EB]/70 text-[#111827] flex items-center justify-center text-xs font-semibold cursor-pointer hover:bg-[#FFC20E]"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-bold text-[#4B5563] shrink-0">
                    Showing <b className="text-[#111827]">{filteredTopupSlips.length}</b> of <b className="text-[#111827]">{topupSlips.length}</b>
                  </span>
                </div>
              </div>
              {/* Slips Grid */}
              {loadingTopupSlips ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#4B5563]">Syncing top-up slips...</p>
                </div>
              ) : filteredTopupSlips.length === 0 ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center flex flex-col items-center justify-center">
                  <h3 className="text-sm font-semibold text-[#111827]">No Top-Up Slips Found</h3>
                  <p className="text-xs text-[#4B5563] mt-1 max-w-sm">
                    {topupSearch.trim() || topupStatusFilter !== "all"
                      ? "No slips match your search criteria."
                      : "When outside drivers submit bank slips for wallet recharge via Employee Login, they will appear here for verification."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredTopupSlips.map((slip) => {
                    const isActing = topupActionId === slip.id;
                    return (
                      <div
                        key={slip.id}
                        className="p-5 sm:p-6 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#FFC20E] transition-all flex flex-col justify-between gap-4"
                      >
                        <div>
                          {/* Header: Amount & Status */}
                          <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB]/60 pb-3">
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Top-up Amount</span>
                              <span className="text-xl font-semibold font-mono text-[#111827]">
                                Rs. {Number(slip.amount || 0).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              {slip.status === "pending" && (
                                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
                                  Pending Review
                                </span>
                              )}
                              {slip.status === "approved" && (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Approved &amp; Credited
                                </span>
                              )}
                              {slip.status === "rejected" && (
                                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-semibold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  Rejected
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Driver & Lorry Info */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Driver / Partner</span>
                              <span className="text-xs font-bold text-[#111827] mt-0.5 block">{slip.employeeName}</span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Partner ID / Plate</span>
                              <span className="text-xs font-mono font-bold text-[#111827] mt-0.5 block">
                                {slip.employeeId} · {slip.plateNumber}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Phone Number</span>
                              <span className="text-xs font-mono font-bold text-[#111827] mt-0.5 block">{slip.phone}</span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Bank Account Used</span>
                              <span className="text-xs font-semibold text-[#111827] mt-0.5 block">{slip.bankUsed || "Bank Transfer"}</span>
                            </div>
                          </div>
                          {/* Slip Image Thumbnail */}
                          {slip.slipUrl && (
                            <div className="mt-3 p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div
                                  onClick={() => setViewingSlipImage(slip.slipUrl)}
                                  className="w-14 h-14 rounded-xl overflow-hidden border border-[#E5E7EB] bg-white cursor-pointer hover:border-[#FFC20E] shrink-0"
                                >
                                  <img src={slip.slipUrl} alt="Bank Slip" className="w-full h-full object-cover" />
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-[#111827] block">Bank Receipt Document</span>
                                  <span className="text-xs text-[#4B5563]">Click thumbnail or button to inspect</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setViewingSlipImage(slip.slipUrl)}
                                className="px-3 py-1.5 rounded-xl bg-white border border-[#E5E7EB] hover:bg-[#FFC20E] text-[#111827] text-xs font-bold transition-colors cursor-pointer shrink-0"
                              >
                                Inspect Slip
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Action Buttons */}
                        <div className="pt-3 border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {slip.status === "pending" && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleApproveTopupSlip(slip)}
                                className="px-4 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#111827] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {isActing ? (
                                  <span>Crediting...</span>
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Approve &amp; Credit Rs. {Number(slip.amount || 0).toLocaleString()}</span>
                                  </>
                                )}
                              </button>
                            )}
                            {slip.status === "approved" && (
                              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                                <span>Credited on {slip.reviewedAt ? formatInquiryDate(slip.reviewedAt) : "Approved"}</span>
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleDeleteTopupSlip(slip.id)}
                            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Top-up Slip"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
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
