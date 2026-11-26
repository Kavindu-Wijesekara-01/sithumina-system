"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function ComplaintsSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    complaintSearch,
    complaints,
    filteredComplaints,
    loadingComplaints,
    setComplaintSearch,
  } = admin;

  return (
    <>
      {activeNav === "complaints" && (
            <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 sm:p-5 flex flex-col gap-4">
              {/* Header & Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E5E7EB]">
                <div>
                  <h2 className="text-base font-bold text-[#111827] flex items-center gap-2">
                    <span>Complaints &amp; Deletions Log ({filteredComplaints.length})</span>
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-mono font-bold">
                      Audit
                    </span>
                  </h2>
                  <p className="text-xs text-[#4B5563]">
                    Mandatory reasons recorded whenever a booking is cancelled or permanently deleted.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-mono font-bold text-[#111827]">
                    {complaints.length} Total Records
                  </span>
                </div>
              </div>
              {/* Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <label
                    htmlFor="complaint-search-input"
                    className="text-xs font-semibold text-[#4B5563] shrink-0"
                  >
                    Search:
                  </label>
                  <div className="relative flex-1">
                    <input
                      id="complaint-search-input"
                      type="text"
                      placeholder="Search..."
                      value={complaintSearch}
                      onChange={(e) => setComplaintSearch(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827] focus:outline-none focus:border-[#111827]"
                    />
                    {complaintSearch && (
                      <button
                        type="button"
                        onClick={() => setComplaintSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#6B7280] hover:text-[#111827] cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {/* Content List */}
              {loadingComplaints && complaints.length === 0 ? (
                <div className="py-12 text-center text-xs font-semibold text-[#4B5563]">
                  Loading complaints &amp; deletion audit records...
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="py-12 px-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-center flex flex-col items-center justify-center gap-2">
                  <p className="text-sm font-bold text-[#111827]">No complaints or deleted booking records found</p>
                  <p className="text-xs text-[#4B5563] max-w-md">
                    {complaintSearch
                      ? "No records matched your search query. Try clearing the search filter."
                      : "When an admin deletes or cancels a booking, the mandatory reason and full trip details are safely logged here."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredComplaints.map((c) => {
                    const cleanPhoneDigits = (c.customerPhone || "").replace(/[^0-9]/g, "");
                    const intlPhone = cleanPhoneDigits.startsWith("0")
                      ? `94${cleanPhoneDigits.slice(1)}`
                      : cleanPhoneDigits.startsWith("94")
                        ? cleanPhoneDigits
                        : `94${cleanPhoneDigits}`;
                    const formattedDate = c.deletedAt
                      ? new Date(c.deletedAt).toLocaleString("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                      : "Recently";
                    return (
                      <div
                        key={c.id}
                        className="rounded-xl border border-red-200 bg-white p-4 sm:p-5 flex flex-col gap-3 hover:border-red-300 transition-colors"
                      >
                        {/* Top Row: Meta info */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#F0ECE1]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md bg-red-100 text-red-900 border border-red-200 text-xs font-mono font-bold">
                              Booking #{c.bookingId}
                            </span>
                            <span className="text-xs text-[#4B5563]">
                              Deleted on: <b className="text-[#111827] font-mono">{formattedDate}</b>
                            </span>
                            {c.deletedBy && (
                              <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-semibold">
                                By: {c.deletedBy}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {c.customerPhone && (
                              <>
                                <a
                                  href={`tel:${c.customerPhone}`}
                                  className="px-2.5 py-1 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#111827] text-xs font-semibold transition-colors"
                                >
                                  Call
                                </a>
                                <a
                                  href={`https://wa.me/${intlPhone}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors"
                                >
                                  WhatsApp
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                        {/* Customer & Route Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-[#4B5563] font-semibold block">Customer</span>
                            <div className="font-bold text-[#111827] text-sm mt-0.5">{c.customerName}</div>
                            <div className="font-mono text-[#4B5563]">{c.customerPhone || "No phone"}</div>
                            {c.customerIdNumber ? (
                              <div className="font-mono text-xs font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">
                                NIC: {c.customerIdNumber}
                              </div>
                            ) : (
                              <div className="text-xs text-[#6B7280] mt-1">NIC: Not recorded</div>
                            )}
                          </div>
                          <div>
                            <span className="text-[#4B5563] font-semibold block">Route &amp; Distance</span>
                            <div className="font-bold text-[#111827] mt-0.5">
                              {c.pickupCity} → {c.deliveryCity}
                            </div>
                            {c.distanceKm ? (
                              <div className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs mt-1 inline-block">
                                {c.distanceKm} km
                              </div>
                            ) : (
                              <div className="text-[#6B7280] text-xs mt-1">Distance not entered</div>
                            )}
                          </div>
                          <div>
                            <span className="text-[#4B5563] font-semibold block">Vehicle &amp; Trip Date</span>
                            <div className="text-[#111827] font-medium mt-0.5">{c.vehicleType || "Lorry"}</div>
                            <div className="text-[#4B5563] font-mono text-xs">
                              {c.date || "Date unspecified"}
                            </div>
                          </div>
                          <div>
                            <span className="text-[#4B5563] font-semibold block">Quoted Amount</span>
                            <div className="font-mono font-bold text-[#111827] text-sm mt-0.5">
                              {c.quotedAmount !== undefined ? `Rs. ${Number(c.quotedAmount).toLocaleString()}` : "Not quoted"}
                            </div>
                          </div>
                        </div>
                        {/* Prominent Mandatory Reason Callout */}
                        <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200 flex flex-col gap-1">
                          <span className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-red-600"></span>
                            Booking Deletion Reason:
                          </span>
                          <p className="text-xs font-semibold text-red-950 leading-relaxed whitespace-pre-wrap pl-3.5 border-l-2 border-red-400">
                            {c.reason}
                          </p>
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
