/**
 * Admin revenue and performance: totals, bank accounts, and drill-down by
 * driver, company vehicle or external owner. All figures come from bookings.
 */
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../config/firebase";
import {
  bookingsForDriver,
  bookingsForVehicle,
  isTripFinished,
  outstandingAmount,
  paymentEntries,
  periodRange,
  summarise,
  withExternalOwners,
  type LedgerBooking,
  type LedgerContext,
  type Reversal,
  type WalletEntry,
  type Period,
  type Totals,
} from "../services/ledger";

type Row = Record<string, any> & { id: string };
type Booking = LedgerBooking & Record<string, any>;

const rs = (n: number) => `${n < 0 ? "-" : ""}Rs. ${Math.abs(Number(n) || 0).toLocaleString("en-US")}`;
const plateKey = (v?: string) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const when = (ts?: number) =>
  ts ? new Date(ts).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "-";

/** Live copy of a Firestore collection. `error` is set if it cannot be read. */
export function useCollection(name: string): { rows: Row[]; loading: boolean; error: boolean } {
  const [state, setState] = useState({ rows: [] as Row[], loading: true, error: false });
  useEffect(
    () =>
      onSnapshot(
        collection(db, name),
        (snap) =>
          setState({
            rows: snap.docs.map((d) => ({ ...d.data(), id: d.id })),
            loading: false,
            error: false,
          }),
        () => setState((s) => ({ ...s, loading: false, error: true }))
      ),
    [name]
  );
  return state;
}

/** Only the bookings this screen needs: the period, plus the selected history. */
function useBookings(from: number, to: number, driverId: string, plate: string) {
  const [state, setState] = useState({ rows: [] as Booking[], loading: true, error: false });
  useEffect(() => {
    let current = true;
    setState((s0) => ({ ...s0, loading: true }));
    const source = collection(db, "bookings");
    const run = async (...constraints: QueryConstraint[]) =>
      (await getDocs(query(source, ...constraints))).docs.map((d) => ({ ...d.data(), id: d.id }) as Booking);
    const allTime = from <= 0 && to >= Number.MAX_SAFE_INTEGER;
    const queries = allTime
      ? [run(orderBy("createdAt", "desc"), limit(1000))]
      : ["rideEndedAt", "paymentApprovedAt", "finalPaymentAt"].map((field) =>
          run(where(field, ">=", Math.max(1, from)), where(field, "<", to))
        );
    if (driverId) queries.push(run(where("assignedDriverId", "==", driverId)));
    if (plate) queries.push(run(where("assignedPlate", "==", plate)));
    // Unpaid completed trips count towards outstanding amounts
    queries.push(run(where("status", "==", "delivered")));
    Promise.all(queries)
      .then((lists) => {
        const rows = Array.from(new Map(lists.flat().map((b) => [b.id, b])).values());
        if (current) setState({ rows, loading: false, error: false });
      })
      .catch((e) => {
        console.warn("Booking figures query failed:", e);
        if (current) setState({ rows: [], loading: false, error: true });
      });
    return () => {
      current = false;
    };
  }, [from, to, driverId, plate]);
  return state;
}

export function useTodayBookings() {
  const [from, to] = periodRange("today");
  return useBookings(from, to, "", "");
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={s.stat}>
    <Text style={s.muted}>{label}</Text>
    <Text style={s.statValue}>{value}</Text>
  </View>
);

const TotalsView = ({ t }: { t: Totals }) => (
  <View>
    <View style={s.grid}>
      <Stat label="Company revenue" value={rs(t.received)} />
      <Stat label="Owner deposits and top-ups" value={rs(t.deposits)} />
      <Stat label="Refunded" value={rs(t.refunds)} />
      <Stat label="Collected by owners" value={rs(t.ownerFares)} />
      <Stat label="Outstanding" value={rs(t.outstanding)} />
      <Stat label="Cash" value={rs(t.cash)} />
      <Stat label="Bank transfer" value={rs(t.bank)} />
      <Stat label="Completed trips" value={`${t.trips} (${t.returnTrips} return)`} />
      <Stat label="Distance" value={`${t.km.toLocaleString()} km`} />
    </View>
    {t.unrecorded > 0 && <Text style={s.muted}>{rs(t.unrecorded)} has no payment method recorded.</Text>}
    <View style={s.card}>
      <Text style={s.title}>Received by bank account</Text>
      {t.banks.length === 0 ? (
        <Text style={s.muted}>No bank transfers in this period.</Text>
      ) : (
        t.banks.map((b) => (
          <View key={b.bank} style={s.line}>
            <Text style={s.body}>{b.bank}</Text>
            <Text style={s.strong}>{rs(b.amount)}</Text>
          </View>
        ))
      )}
    </View>
  </View>
);

const Trip = ({ b }: { b: Booking }) => {
  const [open, setOpen] = useState(false);
  const isReturn = b.tripRole === "return";
  const km = b.actualDistanceKm || b.distanceKm;
  const due = outstandingAmount(b);
  return (
    <TouchableOpacity
      style={[s.trip, isReturn && s.tripReturn]}
      onPress={() => setOpen(!open)}
      accessibilityState={{ expanded: open }}
    >
      <View style={s.line}>
        <Text style={s.muted}>
          {isReturn ? "Return trip" : "Primary trip"} · {b.id}
        </Text>
        <Text style={s.strong}>{b.quotedAmount ? rs(b.quotedAmount) : "Not quoted"}</Text>
      </View>
      <Text style={s.body}>
        {b.pickupCity} to {b.deliveryCity}
      </Text>
      {due > 0 && <Text style={s.due}>{rs(due)} outstanding</Text>}
      {open && (
        <View style={s.details}>
          <Text style={s.muted}>Customer: {b.customerName || "-"}</Text>
          <Text style={s.muted}>
            Driver: {b.assignedDriverName || "-"} · {b.assignedPlate || "-"}
          </Text>
          <Text style={s.muted}>Started: {when(b.rideStartedAt)}</Text>
          <Text style={s.muted}>Loaded: {when(b.loadedAt)}</Text>
          <Text style={s.muted}>Dropped: {when(b.rideEndedAt)}</Text>
          <Text style={s.muted}>Distance: {km ? `${km} km` : "-"}</Text>
          {b.externalOwnerId ? <Text style={s.muted}>Fare collected by the vehicle owner</Text> : null}
          {(b.externalOwnerId ? [] : paymentEntries(b)).map((p) => (
            <Text key={p.kind} style={s.muted}>
              {p.kind === "full" ? "Paid" : p.kind === "advance" ? "Advance" : "Balance"} {rs(p.amount)} ·{" "}
              {p.method === "cash" ? "Cash" : p.method === "bank" ? `Bank Transfer: ${p.bank}` : "Method not recorded"}
            </Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
};

/** Primary trips with their return legs nested underneath. */
const TripGroups = ({ trips, all }: { trips: Booking[]; all: Booking[] }) => {
  const roots = Array.from(
    new Set(trips.map((b) => (b.tripRole === "return" && b.parentBookingId ? b.parentBookingId : b.id)))
  );
  if (roots.length === 0) return <Text style={s.muted}>No completed trips in this period.</Text>;
  return (
    <View>
      {roots.map((id) => {
        const primary = all.find((b) => b.id === id);
        const legs = all.filter((b) => b.tripRole === "return" && b.parentBookingId === id && b.status !== "cancelled");
        return (
          <View key={id} style={s.card}>
            {primary ? <Trip b={primary} /> : <Text style={s.muted}>Primary trip {id} is no longer on record.</Text>}
            {legs.length > 0 && (
              <View style={s.legs}>
                {legs.map((leg) => (
                  <Trip key={leg.id} b={leg} />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

type View_ = "revenue" | "drivers" | "company" | "external";
const VIEWS: Array<[View_, string]> = [
  ["revenue", "Revenue"],
  ["drivers", "Drivers"],
  ["company", "Company vehicles"],
  ["external", "External owners"],
];
const PERIODS: Array<[Period, string]> = [
  ["today", "Today"],
  ["month", "This month"],
  ["custom", "Custom"],
  ["all", "All time"],
];
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export const AdminAnalytics: React.FC = () => {
  const drivers = useCollection("drivers").rows;
  const vehicles = useCollection("lorries_registry").rows;
  const owners = useCollection("outside_employees").rows;
  const [view, setView] = useState<View_>("revenue");
  const [period, setPeriod] = useState<Period>("today");
  const [fromText, setFrom] = useState("");
  const [toText, setTo] = useState("");
  const [selected, setSelected] = useState("");

  const [from, to] = periodRange(period, isDate(fromText) ? fromText : "", isDate(toText) ? toText : "");
  const walletState = useCollection("commission_transactions");
  const reversalState = useCollection("payment_reversals");
  const selectedPlate =
    owners.find((o) => o.id === selected)?.plateNumber ||
    vehicles.find((v) => plateKey(v.plate) === selected)?.plate ||
    "";
  const bookingsState = useBookings(from, to, view === "drivers" ? selected : "", view === "drivers" ? "" : selectedPlate);
  const bookings = withExternalOwners(bookingsState.rows, owners);
  const ledger: LedgerContext = {
    wallet: walletState.rows as unknown as WalletEntry[],
    reversals: reversalState.rows as unknown as Reversal[],
  };

  const ownerPlates = new Set(owners.map((o) => plateKey(o.plateNumber)));
  let items: Array<{ key: string; title: string; subtitle: string; trips: Booking[]; wallet?: Row }> = [];
  if (view === "drivers") {
    items = drivers.map((d) => ({
      key: d.id,
      title: `${d.name || "Unnamed"} (${d.driverId || d.id})`,
      subtitle: [d.plate, d.phone].filter(Boolean).join(" · "),
      trips: bookingsForDriver(bookings, { id: d.driverId || d.id, phone: d.phone, name: d.name }),
    }));
  } else if (view === "company") {
    const seen = new Set<string>();
    for (const v of vehicles) {
      const key = plateKey(v.plate);
      if (!key || seen.has(key) || ownerPlates.has(key) || v.isOutsideLorry || v.ownershipType === "outside") continue;
      seen.add(key);
      items.push({
        key,
        title: v.plate,
        subtitle: [v.vehicleType, v.driverName].filter(Boolean).join(" · "),
        trips: bookingsForVehicle(bookings, v.plate),
      });
    }
  } else if (view === "external") {
    items = owners.map((o) => ({
      key: o.id,
      title: `${o.name} (${o.id})`,
      subtitle: `${o.plateNumber} · ${o.phone}`,
      trips: bookingsForVehicle(bookings, o.plateNumber),
      wallet: o,
    }));
  }
  const ranked = items
    .map((i) => {
      const ids = new Set(i.trips.map((b) => b.id));
      const ownerId = i.wallet?.id || (view === "drivers" ? i.key : "");
      return {
        ...i,
        totals: summarise(i.trips, from, to, {
          wallet: ledger.wallet?.filter((w) => w.employeeId === ownerId),
          reversals: ledger.reversals?.filter(
            (r) => ids.has(r.bookingId) || (view === "drivers" ? r.driverId === i.key : plateKey(r.plate) === plateKey(i.wallet?.plateNumber || i.key))
          ),
        }),
      };
    })
    .sort((a, b) => b.totals.received - a.totals.received);
  const active = ranked.find((i) => i.key === selected);
  const finished = (list: Booking[]) =>
    list.filter((b) => {
      const at = b.rideEndedAt || b.updatedAt || b.createdAt || 0;
      return isTripFinished(b) && at >= from && at < to;
    });

  const chip = (on: boolean, label: string, press: () => void) => (
    <TouchableOpacity key={label} style={[s.chip, on && s.chipOn]} onPress={press}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );

  if (bookingsState.loading && bookingsState.rows.length === 0) return <Text style={s.muted}>Loading figures...</Text>;
  if (bookingsState.error || walletState.error || reversalState.error) return <Text style={s.due}>Figures could not be loaded. Check your connection.</Text>;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.row}>{VIEWS.map(([id, label]) => chip(view === id, label, () => { setView(id); setSelected(""); }))}</View>
      <View style={s.row}>{PERIODS.map(([id, label]) => chip(period === id, label, () => setPeriod(id)))}</View>
      {period === "custom" && (
        <View style={s.row}>
          <TextInput style={s.input} value={fromText} onChangeText={setFrom} placeholder="From YYYY-MM-DD" />
          <TextInput style={s.input} value={toText} onChangeText={setTo} placeholder="To YYYY-MM-DD" />
        </View>
      )}

      {period === "all" && <Text style={s.muted}>All time shows the newest 1,000 bookings. Use the web for older history.</Text>}
      {view === "revenue" ? (
        <TotalsView t={summarise(bookings, from, to, ledger)} />
      ) : active ? (
        <View style={{ gap: 12 }}>
          <TouchableOpacity onPress={() => setSelected("")}>
            <Text style={s.link}>Back to list</Text>
          </TouchableOpacity>
          <Text style={s.heading}>{active.title}</Text>
          {active.wallet && (
            <View style={s.card}>
              <Text style={s.title}>Commission wallet</Text>
              <View style={s.line}>
                <Text style={s.body}>{active.wallet.balance < 0 ? "Owes" : "Balance"}</Text>
                <Text style={[s.strong, active.wallet.balance < 0 && s.due]}>{rs(active.wallet.balance)}</Text>
              </View>
              <View style={s.line}>
                <Text style={s.body}>Commission deducted to date</Text>
                <Text style={s.strong}>{rs(active.wallet.totalCommissionDeducted || 0)}</Text>
              </View>
            </View>
          )}
          <TotalsView t={active.totals} />
          <TripGroups trips={finished(active.trips)} all={bookings} />
        </View>
      ) : ranked.length === 0 ? (
        <Text style={s.muted}>Nothing to show.</Text>
      ) : (
        ranked.map((i) => (
          <TouchableOpacity key={i.key} style={s.card} onPress={() => setSelected(i.key)}>
            <Text style={s.title}>{i.title}</Text>
            <Text style={s.muted}>{i.subtitle}</Text>
            <Text style={s.body}>
              {i.totals.trips} trips · {rs(i.totals.received)}
              {i.wallet ? ` · wallet ${rs(i.wallet.balance)}` : ""}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFFFFF" },
  chipOn: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextOn: { color: "#FFFFFF" },
  input: { flex: 1, minWidth: 130, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, padding: 8, backgroundColor: "#FFFFFF", fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  stat: { flexGrow: 1, flexBasis: "46%", backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 12 },
  statValue: { fontSize: 17, fontWeight: "700", color: "#111827", marginTop: 4 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 12, marginTop: 4, gap: 4 },
  heading: { fontSize: 17, fontWeight: "700", color: "#111827" },
  title: { fontSize: 14, fontWeight: "700", color: "#111827" },
  body: { fontSize: 13, color: "#1F2937", flexShrink: 1 },
  strong: { fontSize: 13, fontWeight: "700", color: "#111827" },
  muted: { fontSize: 12, color: "#6B7280" },
  due: { fontSize: 12, color: "#B91C1C" },
  link: { fontSize: 13, color: "#1D4ED8" },
  line: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 2 },
  trip: { paddingVertical: 6 },
  tripReturn: { paddingLeft: 2 },
  legs: { borderLeftWidth: 3, borderLeftColor: "#38BDF8", paddingLeft: 10, marginLeft: 4 },
  details: { marginTop: 6, gap: 3 },
});
