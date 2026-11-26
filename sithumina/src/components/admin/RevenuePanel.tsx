"use client";

import { useState } from "react";
import { BankTable, PeriodPicker, TotalsGrid, type PeriodValue } from "./ui";
import { formatRs } from "@/lib/commission";
import { periodRange, revenueLines, summarise, todayYmd } from "@/lib/ledger";
import { useLedger } from "./useLedger";
import type { StoredBooking } from "@/lib/server-store";

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // Stop spreadsheet programs treating customer text as a formula
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export default function RevenuePanel({ bookings }: { bookings: StoredBooking[] }) {
  const [range, setRange] = useState<PeriodValue>({ period: "today", from: "", to: "" });
  const [from, to] = periodRange(range.period, range.from, range.to);
  const ledger = useLedger();
  const totals = summarise(bookings, from, to, ledger);

  const byId = new Map(bookings.map((b) => [b.id, b]));
  const payments = revenueLines(bookings, ledger)
    .filter((p) => p.at >= from && p.at < to)
    .map((p) => ({ ...p, booking: p.bookingId ? byId.get(p.bookingId) : undefined }));
  const describe = (p: (typeof payments)[number]) =>
    p.kind === "deposit" || p.kind === "topup"
      ? `Owner ${p.employeeId} ${p.kind === "deposit" ? "registration deposit" : "wallet top-up"}`
      : p.booking?.customerName || "Removed booking";

  const exportCsv = () => {
    const rows = payments.map((p) => [
      new Date(p.at).toLocaleString("en-GB", { timeZone: "Asia/Colombo" }),
      p.bookingId || "",
      describe(p),
      p.booking?.assignedDriverName || "",
      p.booking?.assignedPlate || "",
      p.kind,
      p.method,
      p.bank,
      p.amount,
    ]);
    const header = ["Date", "Booking", "Description", "Driver", "Vehicle", "Type", "Method", "Bank account", "Amount"];
    const blob = new Blob([[header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `revenue-${todayYmd()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker value={range} onChange={setRange} />
        <button
          type="button"
          onClick={exportCsv}
          disabled={payments.length === 0}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 cursor-pointer"
        >
          Export CSV
        </button>
      </div>
      <TotalsGrid totals={totals} />
      {ledger.error && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Deposits or refunds could not be loaded, so these totals are incomplete.
        </p>
      )}
      <BankTable totals={totals} />
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              {["Date", "Source", "Driver / vehicle", "Method", "Amount"].map((h) => (
                <th key={h} className="px-4 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(p.at).toLocaleDateString("en-GB", { timeZone: "Asia/Colombo" })}
                </td>
                <td className="px-4 py-2">
                  <span className="font-mono">{p.bookingId || p.employeeId}</span>
                  <span className="block text-xs text-gray-500">
                    {p.kind === "refund" ? `Refund: ${describe(p)}` : describe(p)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {p.booking?.assignedDriverName || "-"}
                  <span className="block text-xs text-gray-500">{p.booking?.assignedPlate}</span>
                </td>
                <td className="px-4 py-2">{p.method === "bank" ? p.bank : p.method === "cash" ? "Cash" : "Not recorded"}</td>
                <td className={`px-4 py-2 font-semibold tabular-nums whitespace-nowrap ${p.amount < 0 ? "text-red-700" : ""}`}>{formatRs(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {payments.length === 0 && <p className="p-6 text-center text-sm text-gray-500">No payments recorded in this period.</p>}
      </div>
    </div>
  );
}
