"use client";

/** Primary trips with their return legs nested underneath. */
import { useState, type ReactNode } from "react";
import TripDetails from "@/components/TripDetails";
import { formatRs } from "@/lib/commission";
import { outstandingAmount } from "@/lib/ledger";
import { tripStage, TRIP_STAGE_LABEL, type TripGroup } from "@/lib/trip-state";
import type { StoredBooking } from "@/lib/server-store";

function TripRow({
  booking: b,
  manage,
}: {
  booking: StoredBooking;
  manage?: (b: StoredBooking) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const due = outstandingAmount(b);
  const isReturn = b.tripRole === "return";

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full text-left grid grid-cols-2 md:grid-cols-[1.1fr_2fr_1.4fr_1fr_auto] gap-x-4 gap-y-1 items-center px-4 py-3 hover:bg-gray-50 cursor-pointer"
      >
        <span className="text-sm">
          <span className="block text-xs text-gray-500">{isReturn ? "Return trip" : "Primary trip"}</span>
          <span className="font-mono font-semibold">{b.id}</span>
        </span>
        <span className="text-sm">
          <span className="block font-medium text-gray-900">
            {b.pickupCity} to {b.deliveryCity}
          </span>
          <span className="block text-xs text-gray-500">{b.customerName}</span>
        </span>
        <span className="text-sm">
          <span className="block text-gray-900">{b.assignedDriverName || "No driver"}</span>
          <span className="block text-xs text-gray-500">{b.assignedPlate || b.selectedVehiclePlate || "No vehicle"}</span>
        </span>
        <span className="text-sm tabular-nums">
          <span className="block font-semibold">{b.quotedAmount ? formatRs(b.quotedAmount) : "Not quoted"}</span>
          <span className={`block text-xs ${due > 0 ? "text-red-700" : "text-gray-500"}`}>
            {due > 0 ? `${formatRs(due)} due` : TRIP_STAGE_LABEL[tripStage(b)].en}
          </span>
        </span>
        <span className="text-sm text-gray-500 justify-self-end">{open ? "Hide" : "Details"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <TripDetails booking={b} />
          {manage && (
            <>
              <button
                type="button"
                onClick={() => setManaging(!managing)}
                className="self-start rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm cursor-pointer"
              >
                {managing ? "Close actions" : "Payment and booking actions"}
              </button>
              {managing && manage(b)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TripGroupList({
  groups,
  manage,
  empty,
}: {
  groups: TripGroup<StoredBooking>[];
  manage?: (b: StoredBooking) => ReactNode;
  empty: string;
}) {
  if (groups.length === 0) {
    return <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{empty}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section key={g.key} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {g.primary ? (
            <TripRow booking={g.primary} manage={manage} />
          ) : (
            <p className="px-4 py-3 text-sm text-amber-800">Primary trip {g.key} is no longer on record.</p>
          )}
          {g.legs.length > 0 && (
            <div className="ml-4 sm:ml-8 border-l-2 border-sky-400 border-t border-t-gray-100 divide-y divide-gray-100">
              {g.legs.map((leg) => (
                <TripRow key={leg.id} booking={leg} manage={manage} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
