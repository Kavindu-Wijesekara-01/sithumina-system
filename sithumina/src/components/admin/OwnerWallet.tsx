"use client";

/** An outside owner's prepaid wallet: money paid in, commission used and what is left. */
import { Stat } from "./ui";
import { WalletPayments } from "./WalletPayments";
import { COMMISSION_PERCENT, formatRs } from "@/lib/commission";
import { walletSummary } from "@/lib/trip-metrics";
import type { StoredCommissionTransaction, StoredOutsideEmployee } from "@/lib/server-store";

/** Same level the partner list uses for its low balance warning. */
const LOW_BALANCE = 2000;

export default function OwnerWallet({
  owner,
  entries,
}: {
  owner: StoredOutsideEmployee;
  entries: StoredCommissionTransaction[];
}) {
  const w = walletSummary(entries, owner.balance);
  const usable = Math.max(0, w.balance);
  const state =
    w.balance <= 0
      ? { label: "Top-up needed", style: "border-red-300 bg-red-50 text-red-800" }
      : w.balance < LOW_BALANCE
        ? { label: "Low balance", style: "border-amber-300 bg-amber-50 text-amber-900" }
        : { label: "Ready for hires", style: "border-emerald-300 bg-emerald-50 text-emerald-800" };

  return (
    <section aria-label="Wallet and deposit" className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Wallet and deposit progress <span className="font-normal text-gray-500">(all time)</span>
        </h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${state.style}`}>{state.label}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="Paid in"
          value={formatRs(w.deposited)}
          hint={`Deposit ${formatRs(w.openingDeposit)} + top-ups ${formatRs(w.topups)}`}
        />
        <Stat
          label="Used by commission"
          value={formatRs(w.used)}
          hint={`${w.hires} ${w.hires === 1 ? "hire" : "hires"} charged at ${COMMISSION_PERCENT}%`}
        />
        <Stat
          label={w.balance < 0 ? "Owes" : "Remaining usable balance"}
          value={formatRs(w.balance < 0 ? -w.balance : usable)}
          hint={
            usable > 0
              ? `Covers commission on about ${formatRs(Math.floor((usable * 100) / COMMISSION_PERCENT))} of hires`
              : "A top-up is needed to cover further commission"
          }
        />
      </div>

      <div>
        <div
          role="progressbar"
          aria-label="Money paid in that has been used by commission"
          aria-valuenow={w.usedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-3 rounded-full bg-emerald-100 overflow-hidden"
        >
          <div className={`h-full ${w.balance < 0 ? "bg-red-600" : "bg-gray-900"}`} style={{ width: `${w.usedPercent}%` }} />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {w.usedPercent}% used, {100 - w.usedPercent}% remaining
        </p>
      </div>
      {w.unexplained !== 0 && (
        <p className="text-xs text-amber-800">
          The balance differs from the recorded entries by {formatRs(w.unexplained)}.
        </p>
      )}

      <WalletPayments employeeId={owner.id} entries={entries} />

      <details>
        <summary className="cursor-pointer text-sm text-gray-700">Wallet history ({entries.length})</summary>
        <ul className="mt-2 divide-y divide-gray-100 max-h-64 overflow-y-auto">
          {entries.map((e) => (
            <li key={e.id} className="flex justify-between gap-4 py-2 text-sm">
              <span className="text-gray-700">
                {e.note}
                <span className="block text-xs text-gray-400">
                  {new Date(e.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}
                </span>
              </span>
              <span className="text-right whitespace-nowrap tabular-nums">
                <span className={`block font-semibold ${e.amount < 0 ? "text-red-700" : ""}`}>{formatRs(e.amount)}</span>
                <span className="block text-xs text-gray-400">{formatRs(e.balanceAfter)}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
