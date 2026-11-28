"use client";

/** Drill into one company rider, company lorry or outside vehicle owner. */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PeriodPicker, Stat, type PeriodValue } from "./ui";
import BookingHistory from "./BookingHistory";
import OwnerWallet from "./OwnerWallet";
import DriverPassword from "./DriverPassword";
import { useBookingQuery } from "./useBookingQuery";
import { useEntityBookings, type BookingLookup } from "./useEntityBookings";
import { fetchBookingsForPeriod } from "@/lib/booking-feed";
import { formatRs } from "@/lib/commission";
import { bookingsForDriver, bookingsForVehicle, isTripFinished, periodRange, withExternalOwners } from "@/lib/ledger";
import { commissionByBooking, dayRange, report, type Report } from "@/lib/trip-metrics";
import { normalizeVehicleKey } from "@/lib/trip-state";
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

type Mode = "drivers" | "vehicles" | "external";

interface Item {
  key: string;
  title: string;
  subtitle: string;
  driver?: PerfDriver;
  plate?: string;
  owner?: StoredOutsideEmployee;
}

/**
 * The bookings that belong to one entry. External hires never count for company
 * riders or lorries, and an owner never receives a company trip.
 */
function ownBookings(item: Item, all: StoredBooking[]): StoredBooking[] {
  if (item.owner) {
    const owner = item.owner;
    const plate = normalizeVehicleKey(owner.plateNumber);
    return all.filter((b) => {
      if (b.externalOwnerId) return b.externalOwnerId === owner.id;
      // An empty marker on a finished trip means it was a company trip at the time
      if (b.externalOwnerId === "" && isTripFinished(b)) return false;
      return Boolean(plate) && normalizeVehicleKey(b.assignedPlate || b.selectedVehiclePlate) === plate;
    });
  }
  const matched = item.driver
    ? bookingsForDriver(all, { id: item.key, phone: item.driver.phone, name: item.driver.name })
    : bookingsForVehicle(all, item.plate || "");
  return matched.filter((b) => !b.externalOwnerId);
}

const distanceHint = (r: Report<StoredBooking>) =>
  [
    r.estimatedTrips ? `${r.estimatedTrips} estimated from the route` : "",
    r.unknownDistanceTrips ? `${r.unknownDistanceTrips} without a distance` : "",
  ]
    .filter(Boolean)
    .join(", ") || "From completed trips";

const km = (value: number) => `${value.toLocaleString("en-US")} km`;

function useWallet(employeeId: string) {
  const [state, setState] = useState({ id: "", entries: [] as StoredCommissionTransaction[], error: false });
  useEffect(() => {
    if (!employeeId) return;
    return onSnapshot(
      query(collection(db, "commission_transactions"), where("employeeId", "==", employeeId)),
      (snap) =>
        setState({
          id: employeeId,
          error: false,
          entries: snap.docs
            .map((d) => ({ ...(d.data() as StoredCommissionTransaction), id: d.id }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
        }),
      () => setState({ id: employeeId, entries: [], error: true })
    );
  }, [employeeId]);
  const current = state.id === employeeId;
  return {
    entries: current ? state.entries : [],
    loading: Boolean(employeeId) && !current,
    error: current && state.error,
  };
}

function Detail({
  mode,
  item,
  live,
  owners,
  range,
}: {
  mode: Mode;
  item: Item;
  live: StoredBooking[];
  owners: StoredOutsideEmployee[];
  range: PeriodValue;
}) {
  const plate = String(item.owner?.plateNumber || item.plate || "").trim().toUpperCase();
  const lookups: BookingLookup[] = item.owner
    ? [["externalOwnerId", item.owner.id], ["assignedPlate", plate], ["assignedDriverId", item.owner.id]]
    : item.driver
      ? [["assignedDriverId", item.key.toUpperCase()]]
      : [["assignedPlate", plate]];
  const history = useEntityBookings(lookups);
  const wallet = useWallet(item.owner?.id || "");

  // The dashboard's live copy wins where both hold the same booking
  const merged = new Map(history.rows.map((b) => [b.id, b]));
  for (const b of live) merged.set(b.id, b);
  const all = withExternalOwners(Array.from(merged.values()), owners);
  const totals = report(ownBookings(item, all), dayRange(range.period, range.from, range.to));

  const commission = commissionByBooking(wallet.entries);
  const commissionInRange = totals.completed.reduce((sum, b) => sum + Math.max(0, commission.get(b.id) || 0), 0);
  const tripsHint = totals.returnTrips ? `${totals.returnTrips} return` : undefined;
  const loading = history.loading || wallet.loading;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {loading && <p role="status" className="text-sm text-gray-500">Loading records...</p>}
      {(history.error || wallet.error) && (
        <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Some records could not be loaded, so these figures are incomplete.
        </p>
      )}
      <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>

      {!loading && (
        <>
          {/* Six owner cards sit in two rows of three; the others fill one row of four */}
          <div
            data-testid="summary-cards"
            className={`grid grid-cols-2 gap-3 ${mode === "external" ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}
          >
            {mode === "external" ? (
              <>
                <Stat label="Total hire earnings" value={formatRs(totals.fare)} hint="Gross fares, collected by the owner" />
                <Stat label="Total distance" value={km(totals.km)} hint={distanceHint(totals)} />
                <Stat label="Completed hires" value={String(totals.completed.length)} hint={tripsHint} />
                <Stat label="Pending / upcoming" value={String(totals.open.length)} />
                <Stat label="Commission deducted (20%)" value={formatRs(commissionInRange)} hint="On the completed hires shown" />
                <Stat
                  label="Current wallet balance"
                  value={formatRs(item.owner?.balance || 0)}
                  hint="As of now, not affected by dates"
                />
              </>
            ) : (
              <>
                <Stat
                  label={mode === "drivers" ? "Total revenue generated" : "Total lorry revenue"}
                  value={formatRs(totals.fare)}
                  hint={
                    totals.due > 0
                      ? `${formatRs(totals.paid)} paid, ${formatRs(totals.due)} still due`
                      : "Fares of completed trips"
                  }
                />
                <Stat
                  label={mode === "drivers" ? "Total distance" : "Total distance driven"}
                  value={km(totals.km)}
                  hint={distanceHint(totals)}
                />
                <Stat label="Completed trips" value={String(totals.completed.length)} hint={tripsHint} />
                <Stat label="Pending / upcoming trips" value={String(totals.open.length)} />
              </>
            )}
          </div>
          {item.owner && <OwnerWallet key={`wallet-${item.owner.id}`} owner={item.owner} entries={wallet.entries} />}
          <BookingHistory
            key={`history-${item.key}`}
            completed={totals.completed}
            open={totals.open}
            showRider={mode === "vehicles"}
            commission={mode === "external" ? commission : undefined}
          />
        </>
      )}

      {mode !== "vehicles" && <DriverPassword key={`password-${item.key}`} driverId={item.key} />}
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
  mode: Mode;
  bookings: StoredBooking[];
  drivers?: PerfDriver[];
  vehicles?: PerfVehicle[];
  owners?: StoredOutsideEmployee[];
}) {
  const [range, setRange] = useState<PeriodValue>({ period: "all", from: "", to: "" });
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [from, to] = periodRange(range.period, range.from, range.to);
  const reversed = range.period === "custom" && Boolean(range.from && range.to) && range.from > range.to;
  // The list covers the chosen dates; the selected entry reads its whole history
  const period = useBookingQuery(`${from}-${to}`, () => fetchBookingsForPeriod(from, to), live);
  const listBookings = withExternalOwners(period.bookings, owners);
  const days = dayRange(range.period, range.from, range.to);

  let items: Item[];
  if (mode === "drivers") {
    items = drivers.map((d) => {
      const id = String(d.driverId || d.id || "");
      return {
        key: id,
        title: `${d.name || "Unnamed"} (${id})`,
        subtitle: [d.plate, d.phone].filter(Boolean).join(" · "),
        driver: d,
      };
    });
  } else if (mode === "external") {
    items = owners.map((o) => ({
      key: o.id,
      title: `${o.name} (${o.id})`,
      subtitle: `${o.plateNumber} · ${o.vehicleType} · ${o.phone}`,
      owner: o,
    }));
  } else {
    const seen = new Set<string>();
    items = vehicles
      .filter((v) => {
        const key = normalizeVehicleKey(v.plate);
        if (!key || seen.has(key) || v.isOutsideLorry || v.ownershipType === "outside") return false;
        seen.add(key);
        return true;
      })
      .map((v) => ({
        key: normalizeVehicleKey(v.plate),
        title: String(v.plate),
        subtitle: [v.vehicleType, v.driverName].filter(Boolean).join(" · "),
        plate: String(v.plate),
      }));
  }

  const rows = items
    .filter((i) => `${i.title} ${i.subtitle}`.toLowerCase().includes(search.trim().toLowerCase()))
    .map((i) => ({ ...i, totals: report(ownBookings(i, listBookings), days) }))
    .sort((a, b) => b.totals.fare - a.totals.fare || a.title.localeCompare(b.title));
  const active = items.find((i) => i.key === selected);
  const heading =
    mode === "drivers" ? "Rider performance" : mode === "external" ? "Outside owner performance" : "Lorry performance";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
        <PeriodPicker value={range} onChange={setRange} showDates />
      </div>
      {reversed && (
        <p role="alert" className="text-sm text-red-700">The From date is after the To date, so nothing matches.</p>
      )}
      {period.error && (
        <p role="alert" className="text-sm text-red-700">The list totals could not be fully loaded.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
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
                    {r.totals.completed.length} completed · {formatRs(r.totals.fare)}
                    {r.owner ? ` · wallet ${formatRs(r.owner.balance)}` : ""}
                  </span>
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-6 text-sm text-gray-500">Nothing to show.</li>}
          </ul>
        </div>

        {active ? (
          <Detail key={active.key} mode={mode} item={active} live={live} owners={owners} range={range} />
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            Select an entry to see its figures and bookings.
          </p>
        )}
      </div>
    </div>
  );
}
