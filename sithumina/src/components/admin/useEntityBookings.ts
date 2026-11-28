"use client";

/**
 * Every booking of the selected rider, lorry or owner, kept live. The whole
 * history is read so that any date range can be answered, including old trips
 * that have no recorded end time.
 */
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { StoredBooking } from "@/lib/server-store";

/** One equality lookup; entries with an empty value are skipped. */
export type BookingLookup = [field: "assignedDriverId" | "assignedPlate" | "externalOwnerId", value: string];

export function useEntityBookings(lookups: BookingLookup[]) {
  const wanted = lookups.filter(([, value]) => value);
  const key = JSON.stringify(wanted);
  const [state, setState] = useState({ key: "", rows: [] as StoredBooking[], error: false });

  useEffect(() => {
    const list = JSON.parse(key) as BookingLookup[];
    if (list.length === 0) return;
    const results: StoredBooking[][] = list.map(() => []);
    const ready = new Set<number>();
    let failed = false;
    const publish = () => {
      if (ready.size < list.length) return;
      const merged = new Map(results.flat().map((b) => [b.id, b]));
      setState({ key, rows: Array.from(merged.values()), error: failed });
    };
    const stops = list.map(([field, value], i) =>
      onSnapshot(
        query(collection(db, "bookings"), where(field, "==", value)),
        (snap) => {
          results[i] = snap.docs.map((d) => {
            const data = d.data();
            // Old copies stored under another document ID are the same booking
            return { ...data, id: String(data.id || data.trackingId || d.id) } as StoredBooking;
          });
          ready.add(i);
          publish();
        },
        () => {
          failed = true;
          ready.add(i);
          publish();
        }
      )
    );
    return () => stops.forEach((stop) => stop());
  }, [key]);

  const current = state.key === key;
  return {
    rows: current ? state.rows : [],
    loading: wanted.length > 0 && !current,
    error: current && state.error,
  };
}
