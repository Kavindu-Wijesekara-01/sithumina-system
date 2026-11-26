"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function SettingsSection({ admin }: { admin: Admin }) {
  const {
    actionLoading,
    activeNav,
    bankAccounts,
    bookings,
    handleDeleteSlipFromDb,
    handleSaveBankSettings,
    openSlipReviewModal,
    savingBankSettings,
    setBankAccounts,
    storedSlips,
  } = admin;

  return (
    <>
      {activeNav === "settings" && (
            <div className="flex flex-col gap-6">
              {/* 1. Company Bank Account Numbers Config */}
              <form
                onSubmit={handleSaveBankSettings}
                className="p-6 rounded-xl bg-white border border-[#E5E7EB] flex flex-col gap-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">
                      Company Bank Account Numbers
                    </h2>
                    <p className="text-xs text-[#4B5563] mt-0.5">
                      Customers see active accounts when paying for approved quote requests and uploading payment slips. Saved in Cloud Firestore.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setBankAccounts((prev) => [
                        ...prev,
                        {
                          id: `bank-${Date.now()}`,
                          bankName: "",
                          branch: "",
                          accountName: "Sithumina Transport (Pvt) Ltd",
                          accountNumber: "",
                          active: true,
                        },
                      ])
                    }
                    className="px-3.5 py-2 rounded-xl border border-[#E5E7EB] hover:bg-[#F9FAFB] text-xs font-bold text-[#111827] cursor-pointer"
                  >
                    + Add Bank Account
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {bankAccounts.map((acc, idx) => (
                    <div
                      key={acc.id || idx}
                      className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#111827] text-[#FFC20E] text-xs font-semibold font-mono">
                          Bank Account {idx + 1}
                        </span>
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111827] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={acc.active}
                              onChange={(e) =>
                                setBankAccounts((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, active: e.target.checked } : item
                                  )
                                )
                              }
                              className="rounded border-[#E5E7EB]"
                            />
                            <span>Active</span>
                          </label>
                          {bankAccounts.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setBankAccounts((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-xs font-bold text-red-600 hover:underline cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-bold text-[#111827] mb-1">
                            Bank Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={acc.bankName}
                            onChange={(e) =>
                              setBankAccounts((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, bankName: e.target.value } : item
                                )
                              )
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs text-[#111827]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#111827] mb-1">
                            Branch
                          </label>
                          <input
                            type="text"
                            value={acc.branch}
                            onChange={(e) =>
                              setBankAccounts((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, branch: e.target.value } : item
                                )
                              )
                            }
                            className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs text-[#111827]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          Account Holder Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={acc.accountName}
                          onChange={(e) =>
                            setBankAccounts((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, accountName: e.target.value } : item
                              )
                            )
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs text-[#111827]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#111827] mb-1">
                          Account Number *
                        </label>
                        <input
                          type="text"
                          required
                          value={acc.accountNumber}
                          onChange={(e) =>
                            setBankAccounts((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, accountNumber: e.target.value } : item
                              )
                            )
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#E5E7EB] bg-white text-xs font-mono font-bold text-[#111827]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E5E7EB]">
                  <button
                    type="submit"
                    disabled={savingBankSettings}
                    className="px-5 py-2.5 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#111827] text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {savingBankSettings ? "Saving..." : "Save Bank Settings to Database"}
                  </button>
                </div>
              </form>
              {/* 2. Stored Payment Slips Manager (Cloud Firestore DB) */}
              <div className="p-6 rounded-xl bg-white border border-[#E5E7EB] flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-[#111827]">
                      Stored Payment Slips (Cloud Database)
                    </h2>
                    <p className="text-xs text-[#4B5563] mt-0.5">
                      Review uploaded PDFs & image slips directly from Firestore and delete reviewed slips to keep the database clean.
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-[#F9FAFB] border border-[#E5E7EB] text-xs font-mono font-bold text-[#111827]">
                    {storedSlips.length} Stored in DB
                  </span>
                </div>
                {storedSlips.length === 0 ? (
                  <div className="p-8 text-center rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
                    <p className="text-xs font-bold text-[#4B5563]">
                      No payment slips stored in database currently.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {storedSlips.map((slip) => {
                      const linkedBooking = bookings.find((bk) => bk.id === slip.bookingId);
                      const isPdf =
                        slip.mimeType === "application/pdf" ||
                        slip.fileName.toLowerCase().endsWith(".pdf");
                      return (
                        <div
                          key={slip.id}
                          className="p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md bg-[#111827] text-[#FFC20E] text-xs font-mono font-semibold">
                                {isPdf ? "PDF" : "IMAGE"}
                              </span>
                              <span className="font-semibold text-[#111827]">{slip.fileName}</span>
                              <span className="font-mono text-xs text-[#4B5563]">
                                ({Math.max(1, Math.round((slip.fileSize || 0) / 1024))} KB)
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-bold border ${slip.status === "approved"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : slip.status === "rejected"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-purple-50 text-purple-800 border-purple-200"
                                  }`}
                              >
                                {slip.status}
                              </span>
                            </div>
                            <div className="text-xs text-[#4B5563] flex flex-wrap items-center gap-3">
                              <span>Booking: <b className="font-mono text-[#111827]">{slip.bookingId}</b></span>
                              <span>Customer: <b>{slip.customerName}</b> ({slip.customerPhone})</span>
                              <span>Amount: <b className="font-mono text-[#111827]">Rs. {(slip.amount || 0).toLocaleString()}</b></span>
                              {slip.bankAccountUsed && <span>Bank: <b>{slip.bankAccountUsed}</b></span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openSlipReviewModal(linkedBooking, slip)}
                              className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                            >
                              Review / Preview
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading === slip.bookingId || actionLoading === slip.id}
                              onClick={() => {
                                if (confirm("Delete this payment slip permanently from Firestore database?")) {
                                  handleDeleteSlipFromDb(slip.bookingId, slip.id);
                                }
                              }}
                              className="px-3 py-1.5 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                            >
                              Delete from DB
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
    </>
  );
}
