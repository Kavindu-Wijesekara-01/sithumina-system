/**
 * Approved trips waiting for their day. Nothing here rings: the office rings the
 * driver when it is time. A driver who cannot make a trip says why.
 */
import React, { useState } from "react";
import { Linking, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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

const REASONS = ["Not available on that date", "Vehicle breakdown", "Health reason"];

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
  /** Resolves true once the office has been told. */
  onDecline: (trip: UpcomingTrip, reason: string) => Promise<boolean>;
}) {
  const [declining, setDeclining] = useState<UpcomingTrip | null>(null);
  const [reason, setReason] = useState("");
  const canSend = reason.trim().length >= 3 && !busy;

  const close = () => {
    setDeclining(null);
    setReason("");
  };

  const send = async () => {
    if (declining && (await onDecline(declining, reason.trim()))) close();
  };

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
                  onPress={() => setDeclining(trip)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.declineText}>Cannot do this trip</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Modal visible={Boolean(declining)} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Decline {declining?.bookingId}</Text>
            <Text style={styles.dialogText}>
              The office is told at once and will give this trip to another rider.
            </Text>
            {REASONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.reason, reason === option && styles.reasonSelected]}
                onPress={() => setReason(option)}
                activeOpacity={0.8}
              >
                <Text style={styles.reasonText}>{option}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Or type your reason"
              placeholderTextColor="#6B7280"
              maxLength={300}
              multiline
            />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.callBtn} onPress={close} activeOpacity={0.8}>
                <Text style={styles.callText}>Keep Trip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, !canSend && styles.disabled]}
                disabled={!canSend}
                onPress={send}
                activeOpacity={0.8}
              >
                <Text style={styles.sendText}>{busy ? "Sending..." : "Send and Decline"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  dialog: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18 },
  dialogTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  dialogText: { fontSize: 13, color: "#4B5563", marginTop: 4, marginBottom: 12 },
  reason: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, padding: 11, marginBottom: 8 },
  reasonSelected: { borderColor: "#111827", backgroundColor: "#F3F4F6" },
  reasonText: { fontSize: 13, color: "#111827" },
  input: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, padding: 11, minHeight: 64, fontSize: 13, color: "#111827", textAlignVertical: "top" },
  sendBtn: { backgroundColor: "#B91C1C", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
});
