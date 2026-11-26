"use client";

/** Record an owner's top-up, or complete the payment method on earlier deposits. */
import { useEffect, useState } from "react";
import { recordWalletTopupAction, setWalletEntryPaymentAction } from "@/actions";
import { subscribePaymentBankAccounts, type BankAccountSetting } from "@/lib/payment-settings";
import { formatRs } from "@/lib/commission";
import type { StoredCommissionTransaction } from "@/lib/server-store";


export const bankLabel = (a: BankAccountSetting) => `${a.bankName} - ${a.accountNumber}`;

export function useBankAccounts(): BankAccountSetting[] {
  const [accounts, setAccounts] = useState<BankAccountSetting[]>([]);
  useEffect(() => subscribePaymentBankAccounts(setAccounts), []);
  return accounts;
}

/** "cash" or a bank account label. */
export function PaidIntoSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const accounts = useBankAccounts();
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
    >
      <option value="">{label}</option>
      <option value="cash">Cash</option>
      {accounts.map((a) => (
        <option key={a.id} value={bankLabel(a)}>
          {bankLabel(a)}
        </option>
      ))}
    </select>
  );
}

const payment = (paidInto: string) =>
  paidInto === "cash" ? { method: "cash" as const } : { method: "bank" as const, bank: paidInto };

export function WalletPayments({ employeeId, entries }: { employeeId: string; entries: StoredCommissionTransaction[] }) {
  const [amount, setAmount] = useState("");
  const [paidInto, setPaidInto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const unrecorded = entries.filter(
    (e) => (e.type === "initial_deposit" || e.type === "topup") && (!e.paymentMethod || e.paymentMethod === "unrecorded") && !e.bank
  );

  const run = async (task: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    setError("");
    try {
      const res = await task();
      if (!res.success) setError(res.error || "Could not save.");
      return res.success;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    const value = Number(amount);
    if (!(value > 0) || !paidInto) {
      setError("Enter an amount and how it was paid.");
      return;
    }
    const saved = await run(() =>
      recordWalletTopupAction({ employeeId, amount: value, ...payment(paidInto) })
    );
    if (saved) {
      setAmount("");
      setPaidInto("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min="1"
          inputMode="numeric"
          aria-label="Top-up amount"
          placeholder="Top-up amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
        <PaidIntoSelect value={paidInto} onChange={setPaidInto} label="Paid by" />
        <button type="button" disabled={busy} onClick={record} className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 cursor-pointer">
          Record top-up
        </button>
      </div>
      {unrecorded.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
          <span>
            {formatRs(e.amount)} received {new Date(e.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}: how was it paid?
          </span>
          <PaidIntoSelect
            value=""
            label="Choose"
            onChange={(v) => v && run(() => setWalletEntryPaymentAction({ entryId: e.id, ...payment(v) }))}
          />
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
