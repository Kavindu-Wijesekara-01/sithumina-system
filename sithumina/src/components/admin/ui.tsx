/** Small shared building blocks for the admin finance and trip views. */
import { formatRs } from "@/lib/commission";
import type { Period, Totals } from "@/lib/ledger";

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function TotalsGrid({ totals: t }: { totals: Totals }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat
        label="Company revenue"
        value={formatRs(t.received)}
        hint={t.refunds ? `after ${formatRs(t.refunds)} refunded` : undefined}
      />
      <Stat label="Owner deposits and top-ups" value={formatRs(t.deposits)} />
      <Stat label="Cash" value={formatRs(t.cash)} />
      <Stat
        label="Bank transfer"
        value={formatRs(t.bank)}
        hint={t.unrecorded ? `${formatRs(t.unrecorded)} has no method recorded` : undefined}
      />
      <Stat label="Outstanding" value={formatRs(t.outstanding)} />
      <Stat label="Completed trips" value={String(t.trips)} hint={`${t.returnTrips} return`} />
      <Stat label="Company trip fares" value={formatRs(t.fareValue)} />
      <Stat label="Collected by owners" value={formatRs(t.ownerFares)} hint="Not company revenue" />
      <Stat label="Distance" value={`${t.km.toLocaleString()} km`} />
    </div>
  );
}

export function BankTable({ totals }: { totals: Totals }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Received by bank account</h3>
      {totals.banks.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No bank transfers in this period.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {totals.banks.map((row) => (
            <li key={row.bank} className="flex justify-between gap-4 py-2 text-sm">
              <span className="text-gray-700 break-words">
                {row.bank} <span className="text-gray-400">({row.payments})</span>
              </span>
              <span className="font-semibold tabular-nums whitespace-nowrap">{formatRs(row.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PERIODS: Array<[Period, string]> = [
  ["today", "Today"],
  ["month", "This month"],
  ["custom", "Custom dates"],
  ["all", "All time"],
];

export interface PeriodValue {
  period: Period;
  from: string;
  to: string;
}

export function PeriodPicker({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value.period === id}
          onClick={() => onChange({ ...value, period: id })}
          className={`rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${
            value.period === id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"
          }`}
        >
          {label}
        </button>
      ))}
      {value.period === "custom" && (
        <>
          <input
            type="date"
            aria-label="From date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
          />
          <span className="text-sm text-gray-500">to</span>
          <input
            type="date"
            aria-label="To date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
          />
        </>
      )}
    </div>
  );
}
