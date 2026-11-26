"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function InquiriesSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    filteredInquiries,
    formatInquiryDate,
    formatWhatsAppUrl,
    handleDeleteInquiry,
    handleUpdateInquiryStatus,
    inquiries,
    inquiryActionId,
    inquiryFilter,
    inquirySearch,
    loadingInquiries,
    resolvedInquiriesCount,
    setInquiryFilter,
    setInquirySearch,
    unreadInquiriesCount,
  } = admin;

  return (
    <>
      {activeNav === "contact_submissions" && (
            <div className="flex flex-col gap-5">
              {/* Top Summary Bar &amp; Filters */}
              <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E5E7EB] flex flex-col gap-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827] flex items-center gap-2">
                      <span>Contact Inquiries &amp; Freight Quotes</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-mono text-[#4B5563]">
                        {inquiries.length} Total
                      </span>
                    </h2>
                    <p className="text-xs text-[#4B5563] mt-0.5">
                      Direct customer inquiries, cargo details and rate quote requests submitted via /contact.
                    </p>
                  </div>
                  {/* Status Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                    <button
                      type="button"
                      onClick={() => setInquiryFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${inquiryFilter === "all"
                        ? "bg-[#111827] text-[#FFC20E]"
                        : "text-[#4B5563] hover:text-[#111827]"
                        }`}
                    >
                      All ({inquiries.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInquiryFilter("unread")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${inquiryFilter === "unread"
                        ? "bg-amber-400 text-[#111827]"
                        : "text-[#4B5563] hover:text-amber-700"
                        }`}
                    >
                      <span>Unread</span>
                      {unreadInquiriesCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-xs font-mono font-semibold bg-[#111827] text-[#FFC20E]">
                          {unreadInquiriesCount}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setInquiryFilter("resolved")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${inquiryFilter === "resolved"
                        ? "bg-emerald-600 text-white"
                        : "text-[#4B5563] hover:text-emerald-700"
                        }`}
                    >
                      Resolved ({resolvedInquiriesCount})
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
                      value={inquirySearch}
                      onChange={(e) => setInquirySearch(e.target.value)}
                      className="w-full pl-9 pr-9 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB]/75 focus:bg-white focus:border-[#FFC20E] focus:outline-none text-xs font-semibold text-[#111827] placeholder:text-[#6B7280] transition-colors"
                    />
                    {inquirySearch.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setInquirySearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[#E5E7EB]/70 hover:bg-[#FFC20E] text-[#111827] flex items-center justify-center text-xs font-semibold transition-colors cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <span className="px-2.5 py-1.5 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-bold text-[#4B5563] flex-shrink-0">
                    Showing <b className="text-[#111827]">{filteredInquiries.length}</b> of{" "}
                    <b className="text-[#111827]">{inquiries.length}</b>
                  </span>
                </div>
              </div>
              {loadingInquiries ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center">
                  <div className="inline-block w-8 h-8 border-3 border-[#FFC20E] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#4B5563]">Loading contact inquiries...</p>
                </div>
              ) : filteredInquiries.length === 0 ? (
                <div className="p-12 rounded-xl bg-white border border-[#E5E7EB] text-center flex flex-col items-center justify-center">
                  <div className="w-14 h-14 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center mb-3 text-[#4B5563]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-[#111827]">No Inquiries Found</h3>
                  <p className="text-xs text-[#4B5563] mt-1 max-w-sm">
                    {inquirySearch.trim() || inquiryFilter !== "all"
                      ? "No contact submissions match your search or filter."
                      : "No customer inquiries have been submitted yet via /contact."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredInquiries.map((inq) => {
                    const isActing = inquiryActionId === inq.id;
                    const waUrl = formatWhatsAppUrl(inq.phone);
                    return (
                      <div
                        key={inq.id}
                        className={`p-5 sm:p-6 rounded-xl bg-white border transition-all flex flex-col gap-4 ${inq.status === "unread"
                          ? "border-amber-300 ring-1 ring-amber-200"
                          : "border-[#E5E7EB] hover:border-[#FFC20E]"
                          }`}
                      >
                        {/* Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-[#111827]">{inq.name}</h3>
                            <span className="px-2.5 py-0.5 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-bold text-[#111827]">
                              {inq.subject || "General Inquiry"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-[#4B5563]">
                              {formatInquiryDate(inq.createdAt)}
                            </span>
                            {inq.status === "unread" ? (
                              <span className="px-2.5 py-1 rounded-full bg-[#FBF8EE] text-[#7A5A00] border border-[#E7DEC0] text-xs font-bold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#B8860B]" />
                                Unread
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                Resolved
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Contact Methods Bar */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-[#4B5563] font-bold">Contact:</span>
                          <span className="font-mono font-bold text-[#111827]">{inq.phone}</span>
                          <a
                            href={`tel:${inq.phone}`}
                            className="px-2.5 py-1 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] hover:bg-[#FFC20E] text-xs font-bold text-[#111827] transition-colors"
                          >
                            Call
                          </a>
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors"
                            >
                              WhatsApp
                            </a>
                          )}
                          {inq.email && (
                            <a
                              href={`mailto:${inq.email}`}
                              className="px-2.5 py-1 rounded-lg bg-[#F9FAFB] border border-[#E5E7EB] hover:bg-sky-100 hover:text-sky-800 text-xs font-bold text-[#111827] transition-colors"
                            >
                              {inq.email}
                            </a>
                          )}
                        </div>
                        {/* Message Body */}
                        <div className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs text-[#111827] leading-relaxed whitespace-pre-wrap font-sans">
                          {inq.message}
                        </div>
                        {/* Bottom Action Footer */}
                        <div className="pt-2 border-t border-[#E5E7EB] flex items-center justify-between">
                          <div>
                            {inq.status === "unread" ? (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateInquiryStatus(inq.id, "resolved")}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                              >
                                {isActing ? (
                                  <span>Updating...</span>
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Mark as Resolved</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isActing}
                                onClick={() => handleUpdateInquiryStatus(inq.id, "unread")}
                                className="px-3.5 py-1.5 rounded-xl border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#111827] text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                              >
                                Mark as Unread
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => handleDeleteInquiry(inq.id, inq.name)}
                            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Inquiry"
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
