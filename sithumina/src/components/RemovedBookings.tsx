"use client";

/** Bookings the office deleted, with the reason, so the customer is not left guessing. */
import { useEffect, useState } from "react";
import { getMyBookingNoticesAction } from "@/actions/bookings";
import type { BookingNotice } from "@/lib/cancellations";

export default function RemovedBookings({
  signedIn,
  refreshKey,
  show,
  locale,
}: {
  signedIn: boolean;
  /** Changes whenever the customer's bookings change. */
  refreshKey: string;
  show: boolean;
  locale: string;
}) {
  const [notices, setNotices] = useState<BookingNotice[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    getMyBookingNoticesAction()
      .then((res) => {
        if (current && res.success) setNotices(res.data);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [signedIn, refreshKey]);

  // Cancelled bookings still have their own card; only deleted ones are listed here
  const removed = notices.filter((n) => n.type === "deleted");
  if (!signedIn || !show || removed.length === 0) return null;

  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-red-900">
        {locale === "en" ? "Removed by our office" : "කාර්යාලය විසින් ඉවත් කළ වෙන්කිරීම්"}
      </h3>
      <ul className="divide-y divide-red-200">
        {removed.map((n) => (
          <li key={n.bookingId} className="py-2 text-xs text-red-900">
            <span className="font-mono font-semibold">{n.bookingId}</span>
            {n.pickupCity ? ` · ${n.pickupCity} ➔ ${n.deliveryCity}` : ""}
            {n.date ? ` · ${n.date}` : ""}
            <span className="mt-0.5 block font-semibold">
              {locale === "en" ? "Reason: " : "හේතුව: "}
              {n.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
