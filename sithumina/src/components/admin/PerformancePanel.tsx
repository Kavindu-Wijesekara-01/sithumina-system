"use client";

/** Drill into one driver, company vehicle or external vehicle owner. */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BankTable, PeriodPicker, Stat, TotalsGrid, type PeriodValue } from "./ui";
import TripGroupList from "./TripGroupList";
import { formatRs, REGISTRATION_DEPOSIT } from "@/lib/commission";
import { bookingsForDriver, bookingsForVehicle, isTripFinished, periodRange, summarise, withExternalOwners, type LedgerContext } from "@/lib/ledger";
import { useBookingQuery } from "./useBookingQuery";
import { fetchBookingsForDriver, fetchBookingsForPeriod, fetchBookingsForVehicle } from "@/lib/booking-feed";
import { useLedger } from "./useLedger";
import DriverPassword from "./DriverPassword";
import { WalletPayments } from "./WalletPayments";
import { groupTrips, normalizeVehicleKey } from "@/lib/trip-state";
import type { StoredBooking, StoredCommissionTransaction, StoredOutsideEmployee } from "@/lib/server-store";

export interface PerfDriver {
  driverId?: string;
  id?: string;
  name?: string;
  phone?: string;
  plate?: string;
}
export interface PerfVehicle {
  plate?: string;
  vehicleType?: string;
  driverName?: string;
  isOutsideLorry?: boolean;
  ownershipType?: string;
}

interface Item {
  key: string;
  title: string;
  subtitle: string;
  bookings: StoredBooking[];
  owner?: StoredOutsideEmployee;
}

function Wallet({ owner }: { owner: StoredOutsideEmployee }) {
  const [entries, setEntries] = useState<StoredCommissionTransaction[]>([]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "commission_transactions"), where("employeeId", "==", owner.id)),
        (snap) =>
          setEntries(
            snap.docs
              .map((d) => ({ ...(d.data() as StoredCommissionTransaction), id: d.id }))
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          )
      ),
    [owner.id]
  );
  const deposited =
    entries
      .filter((e) => e.type === "initial_deposit" || e.type === "topup")
      .reduce((s, e) => s + (Number(e.amount) || 0), 0) || REGISTRATION_DEPOSIT;
  const used = owner.totalCommissionDeducted || 0;
  const percent = Math.min(100, Math.round((used / deposited) * 100));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Commission wallet</h3>
      <WalletPayments employeeId={owner.id} entries={entries} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label={owner.balance < 0 ? "Owes" : "Balance"} value={formatRs(owner.balance)} />
        <Stat label="Deposited" value={formatRs(deposited)} />
        <Stat label="Commission deducted" value={formatRs(used)} />
      </div>
      <div
        role="progressbar"
        aria-label="Deposit used by commission"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 rounded-full bg-gray-100 overflow-hidden"
      >
        <div className={`h-full ${owner.balance < 0 ? "bg-red-600" : "bg-gray-900"}`} style={{ width: `${percent}%` }} />
      </div>
      <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
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
    </div>
  );
}

export default function PerformancePanel({
  mode,
  bookings: live,
  drivers = [],
  vehicles = [],
  owners = [],
}: {
  mode: "drivers" | "vehicles" | "external";
  bookings: StoredBooking[];
  drivers?: PerfDriver[];
  vehicles?: PerfVehicle[];
  owners?: StoredOutsideEmployee[];
}) {
  const [range, setRange] = useState<PeriodValue>({ period: "all", from: "", to: "" });
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [fleet, setFleet] = useState<"company" | "external">("company");
  const [from, to] = periodRange(range.period, range.from, range.to);
  const ledger = useLedger();
  // The list covers the chosen period; the selected entry loads its whole history
  const period = useBookingQuery(`${from}-${to}`, () => fetchBookingsForPeriod(from, to), live);
  const selectedPlate =
    owners.find((o) => o.id === selected)?.plateNumber ||
    vehicles.find((v) => normalizeVehicleKey(v.plate) === selected)?.plate ||
    "";
  const history = useBookingQuery(
    selected ? `${mode}-${selected}` : "",
    () => (mode === "drivers" ? fetchBookingsForDriver(selected) : fetchBookingsForVehicle(selectedPlate)),
    period.bookings
  );
  const bookings = withExternalOwners(history.bookings, owners);

  const ownerPlates = new Set(owners.map((o) => normalizeVehicleKey(o.plateNumber)));
  const isExternal = (v: PerfVehicle) =>
    Boolean(v.isOutsideLorry || v.ownershipType === "outside" || ownerPlates.has(normalizeVehicleKey(v.plate)));

  const ownerItems: Item[] = owners.map((o) => ({
    key: o.id,
    title: `${o.name} (${o.id})`,
    subtitle: `${o.plateNumber} · ${o.vehicleType} · ${o.phone}`,
    bookings: bookingsForVehicle(bookings, o.plateNumber),
    owner: o,
  }));

  let items: Item[];
  if (mode === "drivers") {
    items = drivers.map((d) => {
      const id = String(d.driverId || d.id || "");
      return {
        key: id,
        title: `${d.name || "Unnamed"} (${id})`,
        subtitle: [d.plate, d.phone].filter(Boolean).join(" · "),
        bookings: bookingsForDriver(bookings, { id, phone: d.phone, name: d.name }),
      };
    });
  } else if (mode === "external" || fleet === "external") {
    items = ownerItems;
  } else {
    const seen = new Set<string>();
    items = vehicles
      .filter((v) => {
        const key = normalizeVehicleKey(v.plate);
        if (!key || seen.has(key) || isExternal(v)) return false;
        seen.add(key);
        return true;
      })
      .map((v) => ({
        key: normalizeVehicleKey(v.plate),
        title: String(v.plate),
        subtitle: [v.vehicleType, v.driverName].filter(Boolean).join(" · "),
        bookings: bookingsForVehicle(bookings, String(v.plate)),
      }));
  }

  const rows = items
    .filter((i) => `${i.title} ${i.subtitle}`.toLowerCase().includes(search.trim().toLowerCase()))
    .map((i) => {
      // Only this entry's deposits and refunds
      const ids = new Set(i.bookings.map((b) => b.id));
      const context: LedgerContext = {
        wallet: (ledger.wallet || []).filter((w) => w.employeeId === (i.owner?.id || (mode === "drivers" ? i.key : ""))),
        reversals: (ledger.reversals || []).filter(
          (r) => ids.has(r.bookingId) || (mode === "drivers" ? r.driverId === i.key : normalizeVehicleKey(r.plate) === normalizeVehicleKey(i.owner?.plateNumber || i.key))
        ),
      };
      return { ...i, totals: summarise(i.bookings, from, to, context) };
    })
    .sort((a, b) => b.totals.received - a.totals.received);
  const active = rows.find((r) => r.key === selected);
  const finished = active
    ? active.bookings.filter((b) => {
        const at = b.rideEndedAt || b.updatedAt || b.createdAt || 0;
        return isTripFinished(b) && at >= from && at < to;
      })
    : [];
  const heading = mode === "drivers" ? "Driver performance" : mode === "external" ? "External owners" : "Vehicle performance";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      {mode === "vehicles" && (
        <div className="flex gap-2">
          {(["company", "external"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={fleet === id}
              onClick={() => { setFleet(id); setSelected(""); }}
              className={`rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${fleet === id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-700"}`}
            >
              {id === "company" ? "Company vehicles" : `External vehicles (${owners.length})`}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4 items-start">
        <div className="rounded-xl border border-gray-200 bg-white">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search"
            className="w-full border-b border-gray-100 px-4 py-2.5 text-sm outline-none rounded-t-xl"
          />
          <ul className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
            {rows.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  aria-pressed={selected === r.key}
                  onClick={() => setSelected(r.key)}
                  className={`w-full text-left px-4 py-2.5 cursor-pointer ${selected === r.key ? "bg-gray-100" : "hover:bg-gray-50"}`}
                >
                  <span className="block text-sm font-medium text-gray-900">{r.title}</span>
                  <span className="block text-xs text-gray-500">{r.subtitle}</span>
                  <span className="block text-xs text-gray-700 tabular-nums">
                    {r.totals.trips} trips · {formatRs(r.totals.received)}
                    {r.owner ? ` · wallet ${formatRs(r.owner.balance)}` : ""}
                  </span>
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-6 text-sm text-gray-500">Nothing to show.</li>}
          </ul>
        </div>

        {active ? (
          <div className="flex flex-col gap-4 min-w-0">
            {(period.loading || history.loading) && <p role="status" className="text-sm text-gray-500">Loading trip history...</p>}
            {(period.error || history.error) && <p role="alert" className="text-sm text-red-700">Some records could not be loaded; figures are incomplete.</p>}
            {(mode === "drivers" || active.owner) && <DriverPassword key={active.key} driverId={active.key} />}
            <TotalsGrid totals={active.totals} />
            {active.owner && <Wallet key={active.owner.id} owner={active.owner} />}
            <BankTable totals={active.totals} />
            <h3 className="text-sm font-semibold">Completed trips</h3>
            <TripGroupList groups={groupTrips(finished, bookings)} empty="No completed trips in this period." />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            Select an entry to see its trips and revenue.
          </p>
        )}
      </div>
    </div>
  );
}
