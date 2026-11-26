"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function RegistrationsSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    approvedRegistrationsCount,
    filteredRegistrations,
    formatInquiryDate,
    formatWhatsAppUrl,
    handleApproveRegistration,
    handleDeleteRegistration,
    handleUpdateRegistrationStatus,
    loadingRegistrations,
    pendingRegistrationsCount,
    regActionId,
    regFilter,
    regSearch,
    registrations,
    rejectedRegistrationsCount,
    setRegFilter,
    setRegSearch,
    setViewingSlipImage,
  } = admin;

  return (
    <>
      {activeNav === "vehicle_registrations" && (
            <div className="flex flex-col gap-5">
              {/* Top Summary Bar & Filters */}
              <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E5E7EB] flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827] flex items-center gap-2">
                      <span>Vehicle & Fleet Partner Registrations</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-mono text-[#4B5563]">
                        {registrations.length} Total
                      </span>
                    </h2>
                    <p className="text-xs text-[#4B5563] mt-0.5">
                      Lorry owners registering to join the Sithumina transport network via /register-vehicle.
                    </p>
                  </div>
                  {/* Status Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                    <button
                      type="button"
                      onClick={() => setRegFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${regFilter === "all"
                        ? "bg-[#111827] text-[#FFC20E]"
                        : "text-[#4B5563] hover:text-[#111827]"
                        }`}
                    >
                      All ({registrations.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegFilter("pending")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${regFilter === "pending"
                        ? "bg-amber-400 text-[#111827]"
                        : "text-[#4B5563] hover:text-amber-700"
                        }`}
                    >
                      <span>Pending</span>
                      {pendingRegistrationsCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-xs font-mono font-semibold bg-[#111827] text-[#FFC20E]">
                          {pendingRegistrationsCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegFilter("approved")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${regFilter === "approved"
                        ? "bg-emerald-600 text-white"
                        : "text-[#4B5563] hover:text-emerald-700"
                        }`}
                    >
                      Approved ({approvedRegistrationsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegFilter("rejected")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${regFilter === "rejected"
                        ? "bg-rose-600 text-white"
                        : "text-[#4B5563] hover:text-rose-700"
                        }`}
                    >
                      Rejected ({rejectedRegistrationsCount})
                    </button>
                  </div>
                </div>
                {/* Search Input */}
                <div className="pt-3 border-t border-[#E5E7EB] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4B5563] pointer-events-none">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Search..."
                      value={regSearch}
                      onChange={(e) => setRegSearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827] placeholder:text-[#6B7280] transition-colors"
                    />
                    {regSearch.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setRegSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E5E7EB]/70 hover:bg-[#FFC20E] text-[#111827] flex items-center justify-center text-xs font-semibold transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-bold text-[#4B5563] flex-shrink-0">
                    Showing <b className="text-[#111827]">{filteredRegistrations.length}</b> of{" "}
                    <b className="text-[#111827]">{registrations.length}</b>
                  </span>
                </div>
              </div>
              {/* Registrations List / Grid */}
              {loadingRegistrations ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#4B5563]">Syncing vehicle registrations...</p>
                </div>
              ) : filteredRegistrations.length === 0 ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center mb-3 text-[#4B5563]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                      <path d="M15 18H9" />
                      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
                      <circle cx="17" cy="18" r="2" />
                      <circle cx="7" cy="18" r="2" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-[#111827]">No Vehicle Registrations Found</h3>
                  <p className="text-xs text-[#4B5563] mt-1 max-w-sm">
                    {regSearch.trim() || regFilter !== "all"
                      ? "No registrations match your current search or filter criteria."
                      : "No vehicle registration applications have been submitted yet via /register-vehicle."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredRegistrations.map((reg) => {
                    const plate = (reg.plateNumber || reg.vehicleNumber || "UNREGISTERED").toUpperCase();
                    const isActing = regActionId === reg.id;
                    const waUrl = formatWhatsAppUrl(reg.phone);
                    return (
                      <div
                        key={reg.id}
                        className="p-5 sm:p-6 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#FFC20E] transition-all flex flex-col justify-between gap-4"
                      >
                        {/* Header: Plate, Vehicle Type, Status */}
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-3 py-1 rounded-xl bg-[#111827] text-[#FFC20E] font-semibold font-mono text-xs">
                                {plate}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-bold text-[#111827]">
                                {reg.vehicleType || "Lorry"}
                              </span>
                              {reg.capacity && (
                                <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                                  {reg.capacity}
                                </span>
                              )}
                            </div>
                            {/* Status Badge */}
                            <div>
                              {reg.status === "pending" && (
                                <span className="px-2.5 py-1 rounded-full bg-[#FBF8EE] text-[#7A5A00] border border-[#E7DEC0] text-xs font-bold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
                                  Pending Review
                                </span>
                              )}
                              {reg.status === "approved" && (
                                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                  Approved &amp; Active
                                </span>
                              )}
                              {reg.status === "rejected" && (
                                <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-semibold flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                                  Rejected
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Owner Information */}
                          <div className="mt-3.5">
                            <span className="text-xs font-bold text-[#4B5563]">Lorry Owner / Partner</span>
                            <h3 className="text-base font-semibold text-[#111827]">{reg.ownerName}</h3>
                          </div>
                          {/* Details Grid */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Contact Number</span>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-xs font-mono font-bold text-[#111827]">{reg.phone}</span>
                                <a
                                  href={`tel:${reg.phone}`}
                                  className="px-2 py-0.5 rounded-lg bg-white border border-[#E5E7EB] hover:bg-[#FFC20E] text-xs font-bold text-[#111827] transition-colors"
                                  title="Call Phone"
                                >
                                  Call
                                </a>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors"
                                    title="WhatsApp Chat"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                              </div>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">National ID (NIC)</span>
                              <span className="text-xs font-mono font-bold text-[#111827] mt-0.5 block">
                                {reg.idNumber || "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Location / Base</span>
                              <span className="text-xs font-bold text-[#111827] mt-0.5 block">
                                {reg.baseCity ? `${reg.baseCity}, ` : ""}{reg.province || "Western Province"}
                              </span>
                            </div>
                            <div>
                              <span className="text-xs font-bold text-[#4B5563] block">Max Load / Payload</span>
                              <span className="text-xs font-bold text-[#111827] mt-0.5 block">
                                {reg.maxWeight || "—"}{reg.capacity ? ` (${reg.capacity})` : ""}
                              </span>
                            </div>
                            {reg.dimensions && (
                              <div className="sm:col-span-2">
                                <span className="text-xs font-bold text-[#4B5563] block">Cargo Dimensions (L × W × H)</span>
                                <span className="text-xs font-semibold text-[#111827] mt-0.5 block">
                                  {reg.dimensions}
                                </span>
                              </div>
                            )}
                            {/* 3 Vehicle Photos */}
                            {Array.isArray(reg.images) && reg.images.length > 0 && (
                              <div className="sm:col-span-2 pt-2 border-t border-[#E5E7EB]/60">
                                <span className="text-xs font-bold text-[#4B5563] block mb-1.5">
                                  Vehicle Photos ({reg.images.length})
                                </span>
                                <div className="grid grid-cols-3 gap-2">
                                  {reg.images.slice(0, 3).map((img, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => setViewingSlipImage(img)}
                                      className="relative aspect-[16/10] rounded-xl overflow-hidden border border-[#E5E7EB] hover:border-[#FFC20E] transition-all cursor-pointer group/img"
                                    >
                                      <img src={img} alt={`Vehicle ${idx + 1}`} className="w-full h-full object-cover group-hover/img:scale-105 transition-transform" />
                                      <span className="absolute bottom-1 right-1 bg-black/75 text-white text-xs font-bold px-1.5 py-0.2 rounded">
                                        Photo {idx + 1}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Rs. 5,000 Security Deposit Slip */}
                            <div className="sm:col-span-2 pt-2 border-t border-[#E5E7EB]/60">
                              {reg.depositSlipUrl ? (
                                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <span className="text-xs font-bold text-emerald-800 block">
                                        Rs. 5,000 Security Deposit Slip
                                      </span>
                                      <span className="text-xs font-semibold text-emerald-950">
                                        Bank Transfer Receipt Uploaded
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setViewingSlipImage(reg.depositSlipUrl || null)}
                                    className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors cursor-pointer"
                                  >
                                    Inspect Slip
                                  </button>
                                </div>
                              ) : (
                                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                                  <span>No security deposit slip uploaded</span>
                                </div>
                              )}
                            </div>
                            <div className="sm:col-span-2 flex items-center justify-between text-xs text-[#4B5563] pt-1 border-t border-[#E5E7EB]/60">
                              <span>Submitted: {formatInquiryDate(reg.createdAt)}</span>
                              <span className="font-mono text-xs">ID: {reg.id}</span>
                            </div>
                          </div>
                        </div>
                        {/* Action Buttons */}
                        <div className="pt-3 border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {reg.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleApproveRegistration(reg)}
                                  className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#111827] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                                >
                                  {isActing ? (
                                    <span>Approving...</span>
                                  ) : (
                                    <>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      <span>Approve &amp; Add to Live Fleet</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={isActing}
                                  onClick={() => handleUpdateRegistrationStatus(reg.id, "rejected")}
                                  className="px-3 py-2 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {reg.status === "approved" && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateRegistrationStatus(reg.id, "pending")}
                                className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#111827] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Reset to Pending
                              </button>
                            )}
                            {reg.status === "rejected" && (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateRegistrationStatus(reg.id, "pending")}
                                className="px-3 py-1.5 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Re-open as Pending
                              </button>
                            )}
                          </div>
                          {/* Delete button */}
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleDeleteRegistration(reg.id, plate)}
                            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Application"
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
