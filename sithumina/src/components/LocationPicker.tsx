"use client";

/** Lets a customer drop an exact pickup or drop-off pin on a map. */
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { resolveLocationCoordinates } from "@/lib/sri-lanka-routes";

export interface Pin {
  lat: number;
  lng: number;
}

const SRI_LANKA: [number, number] = [7.8731, 80.7718];

export default function LocationPicker({
  label,
  address,
  pin,
  onChange,
  locale = "en",
}: {
  label: string;
  /** Typed address, used to centre the map near the right town. */
  address: string;
  pin: Pin | null;
  onChange: (pin: Pin | null) => void;
  locale?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Pin | null>(pin);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const si = locale === "si";

  useEffect(() => {
    if (!open) return;
    let map: LeafletMap | null = null;
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !holder.current) return;
        const near = pin ? ([pin.lat, pin.lng] as [number, number]) : resolveLocationCoordinates(address);
        map = L.map(holder.current).setView(near || SRI_LANKA, pin ? 16 : near ? 13 : 8);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        const icon = L.divIcon({
          className: "",
          html: '<div style="width:22px;height:22px;border-radius:50%;background:#D93025;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        let marker: Marker | null = null;
        const place = (lat: number, lng: number) => {
          if (!map) return;
          if (marker) marker.setLatLng([lat, lng]);
          else {
            marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
            marker.on("dragend", () => {
              const p = marker!.getLatLng();
              setDraft({ lat: p.lat, lng: p.lng });
            });
          }
          setDraft({ lat, lng });
        };
        if (pin) place(pin.lat, pin.lng);
        map.on("click", (e) => place(e.latlng.lat, e.latlng.lng));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // The map is built once per opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => { setDraft(pin); setFailed(false); setOpen(true); }}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-semibold text-gray-800 cursor-pointer"
      >
        {pin ? (si ? "සිතියම් ලකුණ වෙනස් කරන්න" : "Change map pin") : si ? "සිතියමේ ලකුණු කරන්න" : "Pin on map"}
      </button>
      {pin && (
        <>
          <span className="text-emerald-700 font-semibold">
            {si ? "ස්ථානය ලකුණු කර ඇත" : "Exact location pinned"}
          </span>
          <button type="button" onClick={() => onChange(null)} className="underline text-gray-500 cursor-pointer">
            {si ? "ඉවත් කරන්න" : "Remove"}
          </button>
        </>
      )}

      {open && (
        <div className="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={label}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 flex flex-col gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{label}</h2>
              <p className="text-xs text-gray-500">
                {si ? "නිවැරදි ස්ථානය මත ඔබන්න, හෝ ලකුණ ඇදගෙන යන්න." : "Tap the exact spot, then drag the pin to adjust."}
              </p>
            </div>
            {failed ? (
              <p className="text-sm text-red-700">The map could not load. You can still type the address.</p>
            ) : (
              <div ref={holder} className="h-[55vh] w-full rounded-xl border border-gray-200" />
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm cursor-pointer">
                {si ? "අවලංගු කරන්න" : "Cancel"}
              </button>
              <button
                type="button"
                disabled={!draft}
                onClick={() => { onChange(draft); setOpen(false); }}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
              >
                {si ? "මෙම ස්ථානය තෝරන්න" : "Use this location"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
