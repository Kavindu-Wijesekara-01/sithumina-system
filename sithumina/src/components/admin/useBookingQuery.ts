"use client";

/** Add the results of a targeted query to the bookings already on screen. */
import { useEffect, useMemo, useState } from "react";
import type { StoredBooking } from "@/lib/server-store";

export function useBookingQuery(
  /** Changes whenever the query should run again; empty skips it. */
  key: string,
  load: () => Promise<Array<{ id: string }>>,
  live: StoredBooking[]
): { bookings: StoredBooking[]; loading: boolean; error: boolean } {
  const [state, setState] = useState({ key: "", rows: [] as Array<{ id: string }>, error: false });

  useEffect(() => {
    if (!key) return;
    let current = true;
    load()
      .then((rows) => current && setState({ key, rows, error: false }))
      .catch((e) => {
        console.warn("Booking query failed:", e);
        if (current) setState({ key, rows: [], error: true });
      });
    return () => {
      current = false;
    };
    // `key` fully describes the query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const bookings = useMemo(() => {
    const fetched = state.key === key ? (state.rows as StoredBooking[]) : [];
    const merged = new Map(fetched.map((b) => [b.id, b]));
    for (const b of live) merged.set(b.id, b);
    return Array.from(merged.values());
  }, [state, key, live]);

  return { bookings, loading: Boolean(key) && state.key !== key, error: state.key === key && state.error };
}
