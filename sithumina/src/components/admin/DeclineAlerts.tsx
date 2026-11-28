"use client";

/** Prominent, live notice whenever a driver declines a ringing or upcoming job. */
import { useEffect, useRef } from "react";
import type { StoredBooking } from "@/lib/server-store";

const CLOSED = ["cancelled", "delivered", "completed", "in_transit", "goods_collected"];

function beep() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = 660;
    volume.gain.value = 0.15;
    tone.connect(volume);
    volume.connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.35);
    tone.onended = () => void audio.close();
  } catch {
    // Browsers may block sound until the page has been clicked; the banner still shows
  }
}

export default function DeclineAlerts({
  bookings,
  onReassign,
}: {
  bookings: StoredBooking[];
  onReassign: (booking: StoredBooking) => void;
}) {
  const declined = bookings.filter((b) => b.driverTripStatus === "declined" && !CLOSED.includes(b.status));
  const announced = useRef(new Set<string>());
  const key = declined.map((b) => b.id).join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.some((id) => !announced.current.has(id))) beep();
    announced.current = new Set(ids);
  }, [key]);

  if (declined.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
      <h2 className="text-sm font-semibold text-red-900">
        {declined.length === 1 ? "A driver declined a job" : `${declined.length} jobs were declined by drivers`}
      </h2>
      <ul className="mt-2 divide-y divide-red-200">
        {declined.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm text-red-900">
            <span>
              <span className="font-mono font-semibold">{b.id}</span> · {b.date} {b.startTime} · {b.pickupCity} to{" "}
              {b.deliveryCity} · {b.declinedByName || b.assignedDriverName || "Driver"} ({b.assignedPlate || "no vehicle"})
              {b.declineReason ? <span className="block font-semibold">Reason: {b.declineReason}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => onReassign(b)}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white cursor-pointer"
            >
              Reassign
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
