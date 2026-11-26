/**
 * Trip, driver and payment summary for one booking (primary trip or return leg).
 */
import { formatRs } from "@/lib/commission";
import { tripStage, TRIP_STAGE_LABEL } from "@/lib/trip-state";
import { paymentEntries, outstandingAmount } from "@/lib/ledger";
import type { StoredBooking } from "@/lib/server-store";

const when = (ts?: number) =>
  ts
    ? new Date(ts).toLocaleString("en-GB", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" })
    : "—";

interface PaymentLine {
  label: string;
  amount: number;
  detail: string;
}

const KIND = { advance: "Advance", balance: "Balance", full: "Paid" } as const;

export function paymentLines(b: StoredBooking): PaymentLine[] {
  const lines: PaymentLine[] = paymentEntries(b).map((e) => ({
    label: KIND[e.kind],
    amount: e.amount,
    detail:
      e.method === "cash" ? "Cash" : e.method === "bank" ? `Bank Transfer: ${e.bank}` : "Method not recorded",
  }));
  const due = outstandingAmount(b);
  if (due > 0) {
    lines.push({
      label: "Outstanding",
      amount: due,
      detail: b.paymentSlipStatus === "pending_review" ? "Slip awaiting review" : "Not paid yet",
    });
  }
  return lines;
}

export default function TripDetails({
  booking: b,
  locale = "en",
}: {
  booking: StoredBooking;
  locale?: string;
}) {
  const isReturn = b.tripRole === "return";
  const stage = tripStage(b);
  const km = b.actualDistanceKm || b.distanceKm;
  const lines = b.externalOwnerId ? [] : paymentLines(b);
  const rows: Array<[string, string]> = [
    ["Pickup", b.pickupCity || "—"],
    ["Scheduled date", b.date || "—"],
    ["Drop-off", b.deliveryCity || "—"],
    ["Trip started", when(b.rideStartedAt)],
    ["Loaded", when(b.loadedAt)],
    ["Trip ended", when(b.rideEndedAt)],
    ["Distance", km ? `${km} km` : "—"],
    ["Driver / Rider", [b.assignedDriverName, b.assignedDriverId, b.assignedDriverPhone].filter(Boolean).join(" · ") || "Not assigned"],
    ["Vehicle", b.assignedPlate || b.selectedVehiclePlate || "—"],
  ];

  return (
    <div
      className={`rounded-lg border p-3 text-xs text-gray-900 ${isReturn ? "border-sky-300 bg-sky-50" : "border-gray-300 bg-gray-50"}`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span
          className={`px-2 py-0.5 rounded font-semibold text-xs ${isReturn ? "bg-sky-700 text-white" : "bg-gray-900 text-white"}`}
        >
          {isReturn ? `Return booking, attached to ${b.parentBookingId}` : "Primary trip"}
        </span>
        <span className="font-mono font-bold">{b.id}</span>
        <span
          className={`px-2 py-0.5 rounded border font-bold ${
            stage === "loaded"
              ? "bg-emerald-100 border-emerald-300 text-emerald-900"
              : stage === "declined" || stage === "cancelled"
                ? "bg-red-100 border-red-300 text-red-800"
                : "bg-white border-gray-300"
          }`}
        >
          {TRIP_STAGE_LABEL[stage][locale === "si" ? "si" : "en"]}
        </span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-bold text-gray-500">{label}</dt>
            <dd className="font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-2 pt-2 border-t border-gray-300/70 flex flex-wrap gap-x-4 gap-y-1">
        <span className="font-bold">
          {isReturn ? "Return fare" : "Fare"}: {b.quotedAmount ? formatRs(b.quotedAmount) : "Not quoted"}
        </span>
        {b.externalOwnerId && <span className="text-gray-600">Collected by the vehicle owner (not company revenue)</span>}
        {lines.map((line) => (
          <span key={line.label} className={line.label === "Outstanding" ? "text-red-700 font-semibold" : ""}>
            {line.label} {formatRs(line.amount)} · {line.detail}
          </span>
        ))}
      </div>
    </div>
  );
}
