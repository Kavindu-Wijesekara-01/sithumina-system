"use client";

import type { Admin } from "../state/useAdminDashboard";

export default function SettleBalanceModal({ admin }: { admin: Admin }) {
  const {
    bankAccounts,
    handleConfirmSettleBalance,
    setSettleBalanceModal,
    settleBalanceModal,
  } = admin;

  return (
    <>
      {settleBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-400"></span>
                <h3 className="text-base font-bold">Settle Remaining Balance</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettleBalanceModal(null)}
                className="text-gray-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded cursor-pointer"
              >
                ✕
              </button>
            </div>
            {/* Body */}
            <div className="p-6 flex flex-col gap-4">
              {/* Summary Box */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono font-bold text-gray-900">
                  <span>{settleBalanceModal.booking.id}</span>
                  <span className="font-sans font-semibold text-gray-800">
                    {settleBalanceModal.booking.pickupCity} → {settleBalanceModal.booking.deliveryCity}
                  </span>
                </div>
                <div className="text-gray-600">
                  Customer: <strong className="text-gray-900">{settleBalanceModal.booking.customerName}</strong>
                  {settleBalanceModal.booking.customerPhone && (
                    <span className="font-mono ml-1">({settleBalanceModal.booking.customerPhone})</span>
                  )}
                </div>
              </div>
              {/* Balance Amount Due Card */}
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-amber-900 block">
                    Remaining Balance Due
                  </span>
                  <span className="text-xs text-amber-800">
                    Total: Rs. {(settleBalanceModal.booking.quotedAmount || settleBalanceModal.pendingAmount).toLocaleString()}
                    {settleBalanceModal.booking.advanceAmount && settleBalanceModal.booking.advanceAmount > 0
                      ? ` · Paid: Rs. ${settleBalanceModal.booking.advanceAmount.toLocaleString()}`
                      : ""}
                  </span>
                </div>
                <span className="font-mono text-xl font-semibold text-amber-950">
                  Rs. {settleBalanceModal.pendingAmount.toLocaleString()}
                </span>
              </div>
              {/* Settlement Method */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Settlement Method *
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSettleBalanceModal((prev) =>
                        prev ? { ...prev, settleMethod: "cash_manual" } : null
                      )
                    }
                    className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${settleBalanceModal.settleMethod === "cash_manual"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettleBalanceModal((prev) =>
                        prev ? { ...prev, settleMethod: "bank_transfer" } : null
                      )
                    }
                    className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${settleBalanceModal.settleMethod === "bank_transfer"
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
                      }`}
                  >
                    Bank Transfer
                  </button>
                </div>
              </div>
              {settleBalanceModal.settleMethod === "bank_transfer" && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Select Receiving Company Bank *
                  </label>
                  <select
                    value={settleBalanceModal.bankUsed}
                    onChange={(e) =>
                      setSettleBalanceModal((prev) =>
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
              {/* Note (Optional) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Settlement Note (Optional)
                </label>
                <input
                  type="text"
                  value={settleBalanceModal.note}
                  onChange={(e) =>
                    setSettleBalanceModal((prev) =>
                      prev ? { ...prev, note: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-gray-900 text-xs focus:border-gray-900 focus:outline-none"
                />
              </div>
            </div>
            {/* Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSettleBalanceModal(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSettleBalance}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-green-700 hover:bg-green-800 transition-all cursor-pointer"
              >
                Confirm Settlement (Rs. {settleBalanceModal.pendingAmount.toLocaleString()})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
