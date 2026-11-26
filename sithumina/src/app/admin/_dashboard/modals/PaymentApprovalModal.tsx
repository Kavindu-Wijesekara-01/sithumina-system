"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function PaymentApprovalModal({ admin }: { admin: Admin }) {
  const {
    bankAccounts,
    handleConfirmPaymentApproval,
    paymentApprovalModal,
    setPaymentApprovalModal,
  } = admin;

  return (
    <>
      {paymentApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                <h3 className="text-base font-bold">Payment Approval &amp; Setup</h3>
              </div>
              <button
                type="button"
                onClick={() => setPaymentApprovalModal(null)}
                className="text-gray-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
            {/* Body */}
            <div className="p-6 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
              {/* Booking Summary Box */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-gray-900">
                    {paymentApprovalModal.booking.id}
                  </span>
                  <span className="font-semibold text-gray-800">
                    {paymentApprovalModal.booking.pickupCity} → {paymentApprovalModal.booking.deliveryCity}
                  </span>
                </div>
                <div className="text-gray-600">
                  Customer: <strong className="text-gray-900">{paymentApprovalModal.booking.customerName}</strong>
                  {paymentApprovalModal.booking.customerPhone && (
                    <span className="font-mono ml-1">({paymentApprovalModal.booking.customerPhone})</span>
                  )}
                </div>
              </div>
              {/* Total Booking Amount (LKR) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Total Booking Amount (LKR) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={paymentApprovalModal.totalAmount}
                  onChange={(e) =>
                    setPaymentApprovalModal((prev) =>
                      prev ? { ...prev, totalAmount: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-gray-900 text-sm font-semibold focus:border-gray-900 focus:outline-none"
                  aria-label="Total booking amount in LKR"
                />
              </div>
              {/* Payment Collection Mode Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-800 mb-2">
                  Payment Collection Mode *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Option 1: Full Paid */}
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentApprovalModal((prev) =>
                        prev ? { ...prev, collectionMode: "full_paid" } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${paymentApprovalModal.collectionMode === "full_paid"
                      ? "bg-green-50 border-green-600 ring-2 ring-green-500/40"
                      : "bg-white border-gray-300 hover:border-gray-400"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-green-900 flex items-center gap-1.5">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-xs font-bold ${paymentApprovalModal.collectionMode === "full_paid"
                            ? "bg-green-600 text-white border-green-700"
                            : "border-gray-400 text-transparent"
                            }`}
                        >
                          ✓
                        </span>
                        Full Paid
                      </span>
                    </div>
                    <span className="text-xs text-green-800 leading-snug">
                      Full Payment Collected
                    </span>
                  </button>
                  {/* Option 2: Partial Advance */}
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentApprovalModal((prev) =>
                        prev ? { ...prev, collectionMode: "partial_advance" } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${paymentApprovalModal.collectionMode === "partial_advance"
                      ? "bg-amber-50 border-amber-600 ring-2 ring-amber-500/40"
                      : "bg-white border-gray-300 hover:border-gray-400"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-xs font-bold ${paymentApprovalModal.collectionMode === "partial_advance"
                            ? "bg-amber-600 text-white border-amber-700"
                            : "border-gray-400 text-transparent"
                            }`}
                        >
                          ✓
                        </span>
                        Advance Paid
                      </span>
                    </div>
                    <span className="text-xs text-amber-800 leading-snug">
                      Advance Paid (Balance Pending)
                    </span>
                  </button>
                  {/* Option 3: Full Pending */}
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentApprovalModal((prev) =>
                        prev ? { ...prev, collectionMode: "full_pending" } : null
                      )
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${paymentApprovalModal.collectionMode === "full_pending"
                      ? "bg-gray-100 border-gray-700 ring-2 ring-gray-700/30"
                      : "bg-white border-gray-300 hover:border-gray-400"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-xs font-bold ${paymentApprovalModal.collectionMode === "full_pending"
                            ? "bg-gray-800 text-white border-gray-900"
                            : "border-gray-400 text-transparent"
                            }`}
                        >
                          ✓
                        </span>
                        Full Pending
                      </span>
                    </div>
                    <span className="text-xs text-gray-700 leading-snug">
                      Full Payment Pending
                    </span>
                  </button>
                </div>
              </div>
              {/* When Partial Advance: Input for Advance Amount & Show Balance */}
              {paymentApprovalModal.collectionMode === "partial_advance" && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-950 mb-1">
                      Advance Paid Now (LKR) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={paymentApprovalModal.advanceAmount}
                      onChange={(e) =>
                        setPaymentApprovalModal((prev) =>
                          prev ? { ...prev, advanceAmount: e.target.value } : null
                        )
                      }
                      className="w-full px-3.5 py-2 rounded-lg border border-amber-300 bg-white text-gray-900 text-sm font-semibold focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-amber-900 bg-white p-2.5 rounded-lg border border-amber-200">
                    <span>Remaining Balance (Pending):</span>
                    <strong className="font-mono text-sm font-bold text-amber-950">
                      Rs. {Math.max(
                        0,
                        Number(paymentApprovalModal.totalAmount || 0) -
                        Number(paymentApprovalModal.advanceAmount || 0)
                      ).toLocaleString()}
                    </strong>
                  </div>
                </div>
              )}
              {/* Payment Method Selector (For Full Paid or Partial Advance) */}
              {paymentApprovalModal.collectionMode !== "full_pending" && (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Payment Method *
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentApprovalModal((prev) =>
                            prev ? { ...prev, paymentMethod: "cash_manual" } : null
                          )
                        }
                        className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${paymentApprovalModal.paymentMethod === "cash_manual"
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        Cash
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentApprovalModal((prev) =>
                            prev ? { ...prev, paymentMethod: "bank_transfer" } : null
                          )
                        }
                        className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${paymentApprovalModal.paymentMethod === "bank_transfer"
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                          }`}
                      >
                        Bank Transfer
                      </button>
                    </div>
                  </div>
                  {paymentApprovalModal.paymentMethod === "bank_transfer" && (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        Select Company Bank Account *
                      </label>
                      <select
                        value={paymentApprovalModal.bankUsed}
                        onChange={(e) =>
                          setPaymentApprovalModal((prev) =>
                            prev ? { ...prev, bankUsed: e.target.value } : null
                          )
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-900 text-xs font-semibold focus:border-gray-900 focus:outline-none"
                      >
                        {bankAccounts
                          .filter((a) => a.active)
                          .map((acc) => (
                            <option
                              key={acc.id}
                              value={`${acc.bankName} - ${acc.accountNumber} (${acc.accountName})`}
                            >
                              {acc.bankName} - {acc.accountNumber} ({acc.accountName} · {acc.branch})
                            </option>
                          ))}
                        {bankAccounts.filter((a) => a.active).length === 0 && (
                          <option value="Commercial Bank - 100029384920">
                            Commercial Bank - 100029384920
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {/* Payment Note (Optional) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Payment Note (Optional)
                </label>
                <input
                  type="text"
                  value={paymentApprovalModal.note}
                  onChange={(e) =>
                    setPaymentApprovalModal((prev) =>
                      prev ? { ...prev, note: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                  aria-label="Payment note"
                />
              </div>
            </div>
            {/* Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentApprovalModal(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPaymentApproval}
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all cursor-pointer ${paymentApprovalModal.collectionMode === "full_paid"
                  ? "bg-green-700 hover:bg-green-800"
                  : paymentApprovalModal.collectionMode === "partial_advance"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-gray-900 hover:bg-gray-800"
                  }`}
              >
                {paymentApprovalModal.collectionMode === "full_paid"
                  ? "Confirm Full Payment"
                  : paymentApprovalModal.collectionMode === "partial_advance"
                    ? "Confirm Advance Payment"
                    : "Confirm as Full Pending"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
