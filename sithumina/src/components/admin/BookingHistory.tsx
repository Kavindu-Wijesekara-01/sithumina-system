"use client";

/** Completed and pending bookings of one rider, lorry or owner, in two tabs. */
import { Fragment, useState } from "react";
import TripDetails from "@/components/TripDetails";
import { formatRs } from "@/lib/commission";
import { outstandingAmount } from "@/lib/ledger";
import { bookingStatusLabel, expectedCommission, reportDay, scheduledDays, tripDistance } from "@/lib/trip-metrics";
import type { StoredBooking } from "@/lib/server-store";

const PAGE = 50;

export default function BookingHistory({
  completed,
  open,
  showRider = false,
  commission,
}: {
  completed: StoredBooking[];
  open: StoredBooking[];
  showRider?: boolean;
  /** Outside owners: net commission charged per booking. Adds that column. */
  commission?: Map<string, number>;
}) {
  const [tab, setTab] = useState<"completed" | "open">("completed");
  const [expanded, setExpanded] = useState("");
  const [shown, setShown] = useState(PAGE);
  const rows = tab === "completed" ? completed : open;
  const headings = [
    "Booking",
    "Date",
    "Route",
    ...(showRider ? ["Rider"] : []),
    "Distance",
    commission ? "Gross fare" : "Fare",
    ...(commission ? ["20% commission"] : []),
    "Status",
  ];
  const numeric = new Set(["Distance", "Fare", "Gross fare", "20% commission"]);

  const dayLabel = (b: StoredBooking) => {
    const days = tab === "open" ? scheduledDays(b) : [];
    return days.length > 1 ? `${days[0]} to ${days[days.length - 1]}` : reportDay(b) || "No date";
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div role="tablist" aria-label="Bookings" className="flex flex-wrap gap-2 border-b border-gray-100 p-3">
        {(
          [
            ["completed", `Completed (${completed.length})`],
            ["open", `Pending and ongoing (${open.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setExpanded("");
              setShown(PAGE);
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${
              tab === id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-500">
          {tab === "completed" ? "No completed bookings" : "No pending or ongoing bookings"} in this date range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                {headings.map((h) => (
                  <th key={h} className={`px-3 py-2 font-medium whitespace-nowrap ${numeric.has(h) ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.slice(0, shown).map((b) => {
                const distance = tripDistance(b);
                const due = tab === "completed" && !commission ? outstandingAmount(b) : 0;
                const charged = commission?.get(b.id) || 0;
                const isOpen = expanded === b.id;
                return (
                  <Fragment key={b.id}>
                    <tr data-booking={b.id} className="align-top">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setExpanded(isOpen ? "" : b.id)}
                          className="font-mono font-semibold text-gray-900 underline decoration-gray-300 underline-offset-2 cursor-pointer"
                        >
                          {b.id}
                        </button>
                        {b.tripRole === "return" && <span className="block text-xs text-sky-700">Return load</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{dayLabel(b)}</td>
                      <td className="px-3 py-2 min-w-[10rem]">
                        {b.pickupCity || "?"} to {b.deliveryCity || "?"}
                      </td>
                      {showRider && <td className="px-3 py-2">{b.assignedDriverName || b.assignedDriverId || "Not assigned"}</td>}
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {distance.source === "none"
                          ? "-"
                          : `${distance.source === "estimated" ? "~" : ""}${distance.km.toLocaleString("en-US")} km`}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {Number(b.quotedAmount) > 0 ? formatRs(Number(b.quotedAmount)) : "Not quoted"}
                        {due > 0 && <span className="block text-xs text-red-700">{formatRs(due)} due</span>}
                      </td>
                      {commission && (
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                          {tab === "completed" ? (
                            charged > 0 ? formatRs(charged) : <span className="text-gray-500">Not charged</span>
                          ) : expectedCommission(b) > 0 ? (
                            <span className="text-gray-500">
                              {formatRs(expectedCommission(b))}
                              <span className="block text-xs">when completed</span>
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap">{bookingStatusLabel(b)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={headings.length} className="px-3 pb-3">
                          <TripDetails booking={b} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown && (
        <div className="border-t border-gray-100 p-3 text-center">
          <button
            type="button"
            onClick={() => setShown(shown + PAGE)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm cursor-pointer"
          >
            Show more ({rows.length - shown} left)
          </button>
        </div>
      )}
    </div>
  );
}
