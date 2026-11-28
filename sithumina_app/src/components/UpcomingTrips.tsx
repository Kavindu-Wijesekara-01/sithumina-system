/**
 * Approved trips waiting for their day. Nothing here rings: the office rings the
 * driver when it is time. A driver who cannot make a trip declines it with one
 * confirmation.
 */
import React from "react";
import { Alert, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface UpcomingTrip {
  id: string;
  bookingId: string;
  date: string;
  dates?: string[];
  startTime?: string;
  endTime?: string;
  pickupCity: string;
  deliveryCity: string;
  distanceKm?: number;
  customerName: string;
  customerPhone: string;
  hasPaymentSlip?: boolean;
  cargo: string;
  cargoNature?: string;
  cargoWeight?: string;
  helpersCount?: string;
  assignedPlate?: string;
  vehicleType: string;
  quotedAmount?: number;
  advanceAmount?: number;
  cashDue?: number;
  externalFare?: boolean;
  tripRole?: "primary" | "return";
}

const money = (amount?: number) => `Rs. ${(amount || 0).toLocaleString()}`;

function schedule(trip: UpcomingTrip): string {
  const last = trip.dates && trip.dates.length > 1 ? trip.dates[trip.dates.length - 1] : "";
  if (!trip.date) return "Date to be confirmed";
  if (last) return `${trip.date} ${trip.startTime || ""} to ${last} ${trip.endTime || ""}`.replace(/\s+/g, " ").trim();
  const time = trip.startTime ? `${trip.startTime}${trip.endTime ? ` - ${trip.endTime}` : ""}` : "Time to be confirmed";
  return `${trip.date} · ${time}`;
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function UpcomingTrips({
  trips,
  busy,
  onDecline,
}: {
  trips: UpcomingTrip[];
  busy: boolean;
  onDecline: (trip: UpcomingTrip) => void;
}) {
  const confirmDecline = (trip: UpcomingTrip) =>
    Alert.alert("Decline Trip", `Decline ${trip.bookingId}? The office will give it to another rider.`, [
      { text: "Keep Trip", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: () => onDecline(trip) },
    ]);

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text style={styles.title}>Upcoming Trips</Text>
        <Text style={styles.count}>{trips.length}</Text>
      </View>

      {trips.length === 0 ? (
        <Text style={styles.empty}>No upcoming trips. Approved bookings assigned to you appear here.</Text>
      ) : (
        trips.map((trip) => {
          const cargo = [
            trip.cargoNature || trip.cargo,
            trip.cargoNature && trip.cargo && trip.cargo !== trip.cargoNature ? trip.cargo : "",
            trip.cargoWeight,
            trip.helpersCount && trip.helpersCount !== "0" ? `Helpers: ${trip.helpersCount}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <View key={trip.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.bookingId}>{trip.bookingId}</Text>
                <Text style={styles.when}>{schedule(trip)}</Text>
              </View>
              {trip.tripRole === "return" ? <Text style={styles.returnNote}>Return load</Text> : null}
              <Row label="PICKUP" value={trip.pickupCity} />
              <Row label="DESTINATION" value={trip.deliveryCity} />
              <Row label="DISTANCE" value={trip.distanceKm ? `${trip.distanceKm} km` : ""} />
              <Row label="CUSTOMER" value={trip.customerName} />
              <Row label="CARGO" value={cargo} />
              <Row label="LORRY" value={[trip.assignedPlate, trip.vehicleType].filter(Boolean).join(" · ")} />
              <Row label="FARE" value={trip.quotedAmount ? money(trip.quotedAmount) : "Not quoted yet"} />
              <Row label="ADVANCE" value={trip.advanceAmount ? money(trip.advanceAmount) : ""} />
              <Row
                label="CASH"
                value={
                  trip.externalFare
                    ? "You collect the fare from the customer"
                    : trip.cashDue
                      ? `Collect ${money(trip.cashDue)}`
                      : trip.quotedAmount
                        ? "Nothing to collect"
                        : ""
                }
              />
              <View style={styles.actions}>
                {trip.customerPhone && trip.hasPaymentSlip ? (
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${trip.customerPhone}`)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.callText}>Call Customer</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.declineBtn}
                  disabled={busy}
                  onPress={() => confirmDecline(trip)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.declineText}>Cannot do this trip</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 14 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { fontSize: 16, fontWeight: "700", color: "#111827" },
  count: { fontSize: 13, fontWeight: "700", color: "#111827", backgroundColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  empty: { fontSize: 13, color: "#4B5563", backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 14 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#D1D5DB", padding: 14, marginBottom: 10 },
  cardHeader: { marginBottom: 8, borderBottomWidth: 1, borderBottomColor: "#E5E7EB", paddingBottom: 8 },
  bookingId: { fontSize: 12, fontWeight: "700", color: "#6B7280" },
  when: { fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 2 },
  returnNote: { fontSize: 12, fontWeight: "700", color: "#1D4ED8", marginBottom: 4 },
  row: { flexDirection: "row", paddingVertical: 3 },
  label: { width: 104, fontSize: 11, fontWeight: "700", color: "#6B7280", paddingTop: 2 },
  value: { flex: 1, fontSize: 13, color: "#111827", fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  callBtn: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  callText: { fontSize: 13, fontWeight: "700", color: "#111827" },
  declineBtn: { borderWidth: 1, borderColor: "#FCA5A5", backgroundColor: "#FEF2F2", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  declineText: { fontSize: 13, fontWeight: "700", color: "#B91C1C" },
});
