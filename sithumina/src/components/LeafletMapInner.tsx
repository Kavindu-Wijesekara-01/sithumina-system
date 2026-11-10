"use client";

import React, { useEffect, useMemo, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Lorry, LorryStatus } from "@/lib/mock-lorries";
import { LorryStatusBadge } from "./LorryStatusBadge";

interface LeafletMapInnerProps {
  lorries: Lorry[];
  selectedLorryId?: string | null;
  onSelectLorry?: (id: string) => void;
  userLocation: [number, number] | null;
}

export function isValidLatLng(coords: unknown): coords is [number, number] {
  if (!coords || !Array.isArray(coords) || coords.length !== 2) return false;
  const lat = Number(coords[0]);
  const lng = Number(coords[1]);


  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= 4.0 &&
    lat <= 12.0 &&
    lng >= 78.0 &&
    lng <= 84.0
  );
}

// Controller component to handle programmatically centering and flying on the map
function MapController({
  selectedLorry,
  userLocation,
  lorries,
}: {
  selectedLorry: Lorry | null;
  userLocation: [number, number] | null;
  lorries: Lorry[];
}) {
  const map = useMap();
  const prevUserLocation = useRef<[number, number] | null>(null);
  const autoCenteredRef = useRef<boolean>(false);
  const lastSelectedLorryIdRef = useRef<string | null>(null);

  // Invalidate map size on mount to ensure dimensions are measured accurately
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 200);
  

  return () => clearTimeout(timer);
  }, [map]);

  // Auto-focus on active broadcast lorry on start
  useEffect(() => {
    if (!selectedLorry && !autoCenteredRef.current && lorries.length > 0) {
      const active = lorries[0];
      const lat = Number(active.lat);
      const lng = Number(active.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        try {
          const size = map.getSize();
          if (size && size.x > 50 && size.y > 50) {
            autoCenteredRef.current = true;
            map.flyTo([lat, lng], 10, { animate: true, duration: 1.2 });
          }
        } catch {}
      }
    }
  }, [lorries, selectedLorry, map]);

  useEffect(() => {
    if (!isValidLatLng(userLocation)) return;

    const isSame =
      prevUserLocation.current &&
      prevUserLocation.current[0] === userLocation[0] &&
      prevUserLocation.current[1] === userLocation[1];

    if (!isSame) {
      prevUserLocation.current = userLocation;
      try {
        const size = map.getSize();
        if (size && size.x > 50 && size.y > 50) {
          map.flyTo(userLocation, 12, { animate: true, duration: 1.5 });
        } else {
          map.setView(userLocation, 12);
        }
      } catch (err) {
        console.warn("Leaflet flyTo user location error:", err);
      }
    }
  }, [userLocation, map]);

  useEffect(() => {
    if (selectedLorry && selectedLorry.id !== lastSelectedLorryIdRef.current) {
      lastSelectedLorryIdRef.current = selectedLorry.id;
      const lat = Number(selectedLorry.lat);
      const lng = Number(selectedLorry.lng);
      if (isValidLatLng([lat, lng])) {
        try {
          const size = map.getSize();
          if (size && size.x > 50 && size.y > 50) {
            map.flyTo([lat, lng], 11, {
              animate: true,
              duration: 1.2,
            });
          } else {
            map.setView([lat, lng], 11);
          }
        } catch (err) {
          console.warn("Leaflet flyTo selected lorry error:", err);
        }
      }
    } else if (!selectedLorry) {
      lastSelectedLorryIdRef.current = null;
    }
  }, [selectedLorry?.id, selectedLorry, map]);

  return null;
}

export const LeafletMapInner: React.FC<LeafletMapInnerProps> = ({
  lorries,
  selectedLorryId,
  onSelectLorry,
  userLocation,
}) => {
  const defaultCenter: [number, number] = [7.8731, 80.7718]; // Sri Lanka geographic center
  const defaultZoom = 7.5;

  const selectedLorry = useMemo(() => {
    return lorries.find((l) => l.id === selectedLorryId) || null;
  }, [lorries, selectedLorryId]);

  // Icon cache to avoid recreating identical icons on every render
  const iconCacheRef = useRef<Map<string, L.DivIcon>>(new Map());

  // Create custom marker icon showing ONLY the lorry emoji with pulsing ring
  const createMarkerIcon = (plate: string, status: LorryStatus, isSelected: boolean) => {
    const cacheKey = `${plate}_${status}_${isSelected ? 1 : 0}`;
    if (iconCacheRef.current.has(cacheKey)) {
      return iconCacheRef.current.get(cacheKey)!;
    }

    const statusBg = status === "empty" ? "#FFC20E" : "#1E9E5A";
    const transformScale = isSelected ? "transform: scale(1.2);" : "";

    const icon = L.divIcon({
      className: "custom-lorry-pin",
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;${transformScale}">
          <div style="position:absolute;top:0;width:38px;height:38px;border-radius:50%;background:${statusBg};opacity:0.4;animation:pu 2s infinite;"></div>
          <div style="position:relative;z-index:2;display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:${statusBg};border:2.5px solid #26231B;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#26231B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #26231B;margin-top:-1px;"></div>
        </div>
      `,
      iconSize: [38, 42],
      iconAnchor: [19, 39],
      popupAnchor: [0, -40],
    });

    iconCacheRef.current.set(cacheKey, icon);
    return icon;
  };

  // User location marker icon
  const userIcon = useMemo(() => {
    return L.divIcon({
      className: "user-loc-pin",
      html: `
        <div style="position:relative;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:28px;height:28px;background:rgba(30,158,90,0.3);border-radius:50%;animation:pu 1.5s infinite;"></div>
          <div style="width:14px;height:14px;background:#1E9E5A;border:2.5px solid #FFFFFF;border-radius:50%;box-shadow:0 0 8px rgba(0,0,0,0.4);"></div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }, []);



  return (
    <MapContainer
      center={defaultCenter}
      zoom={defaultZoom}
      minZoom={6.5}
      maxZoom={15}
      scrollWheelZoom={true}
      attributionControl={true}
      zoomControl={false}
      className="w-full h-full z-0"
      style={{ background: "var(--y3)" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapController
        selectedLorry={selectedLorry}
        userLocation={userLocation}
        lorries={lorries}
      />

      {/* User GPS location marker */}
      {isValidLatLng(userLocation) && (
        <Marker position={userLocation} icon={userIcon}>
          <Popup>
            <div className="p-1 font-sans">
              <b className="text-[12px] text-[#26231B]">You are here</b>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Live Lorry Markers with Lorry Logo and Plate badge */}
      {lorries.map((lorry) => {
        if (!lorry) return null;
        const lat = Number(lorry.lat);
        const lng = Number(lorry.lng);
        if (!isValidLatLng([lat, lng])) {
          return null;
        }

        const isSelected = lorry.id === selectedLorryId;
        const cacheKey = `${lorry.plate}_${lorry.status}_${isSelected}`;
        let icon = iconCacheRef.current.get(cacheKey);
        if (!icon) {
          icon = createMarkerIcon(lorry.plate, lorry.status, isSelected);
          iconCacheRef.current.set(cacheKey, icon);
        }

      

  return (
          <Marker
            key={lorry.id}
            position={[lat, lng]}
            icon={icon}
            eventHandlers={{
              click: () => onSelectLorry?.(lorry.id),
            }}
          >
            <Popup className="sithumina-popup">
              <div className="p-2 flex flex-col gap-1.5 min-w-[210px] max-w-[280px] font-sans">
                {/* Header: Plate & Status Badge */}
                <div className="flex items-center justify-between gap-2 border-b border-[#E7E2D0] pb-1.5">
                  <span className="font-black text-[14px] text-[#26231B] tracking-wide">
                    {lorry.plate}
                  </span>
                  <LorryStatusBadge status={lorry.status} />
                </div>

                {/* Driver Info & Phone */}
                <div className="flex items-center justify-between bg-[#F4F2EA] px-2 py-1 rounded-[6px]">
                  <div className="text-[11.5px] text-[#26231B]">
                    <span className="text-[#6F6A5A]">Driver: </span>
                    <b>{lorry.driverName || "Registered Driver"}</b>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLorry?.(lorry.id);
                    }}
                    className="text-[10.5px] font-extrabold text-[#26231B] bg-[#FFC20E] px-2 py-0.5 rounded border border-[#D9A300] hover:bg-[#e6ad00] transition-colors flex items-center gap-1 cursor-pointer"
                    title="Book online to unlock driver contact"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Book</span>
                  </button>
                </div>

                {/* Route & Destination */}
                <div className="text-[11.5px] text-[#26231B] flex flex-col gap-1">
                  <div>
                    <span className="text-[#6F6A5A] font-medium">Route: </span>
                    <span className="font-bold">{lorry.route}</span>
                  </div>

                  {/* Loaded Trip Details */}
                  {lorry.status === "on_trip" ? (
                    <div className="bg-[#FFF9E6] border border-[#FFE08A] rounded-[6px] p-1.5 flex flex-col gap-0.5 text-[11px]">
                      {lorry.startLocation && (
                        <div>
                          <span className="text-[#7A6200] font-semibold">Start:</span>{" "}
                          <b>{lorry.startLocation}</b>
                        </div>
                      )}
                      {lorry.endLocation && (
                        <div>
                          <span className="text-[#7A6200] font-semibold">Destination:</span>{" "}
                          <b>{lorry.endLocation}</b>
                        </div>
                      )}
                      {lorry.emptyTime && (
                        <div>
                          <span className="text-[#7A6200] font-semibold">Est. Empty:</span>{" "}
                          <b className="text-[#B36200]">{lorry.emptyTime}</b>
                        </div>
                      )}
                      {lorry.returnRoute && (
                        <div>
                          <span className="text-[#7A6200] font-semibold">Return:</span>{" "}
                          <b>{lorry.returnRoute}</b>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Empty Vehicle Availability Details */
                    <div className="bg-[#EBF7EE] border border-[#BDE8C8] rounded-[6px] p-1.5 flex flex-col gap-1 text-[11px]">
                      {lorry.startLocation && (
                        <div>
                          <span className="text-[#137333] font-semibold">Location:</span>{" "}
                          <b>{lorry.startLocation}</b>
                        </div>
                      )}
                      {lorry.endLocation && (
                        <div>
                          <span className="text-[#137333] font-semibold">Bound For:</span>{" "}
                          <b>{lorry.endLocation}</b>
                        </div>
                      )}
                      {lorry.travelRoute && (
                        <div>
                          <span className="text-[#137333] font-semibold">Via Route:</span>{" "}
                          <b>{lorry.travelRoute}</b>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-0.5 border-t border-[#BDE8C8]/60">
                        <span className="text-[#137333]">Space: <b>{lorry.availableSpace || "Full Space"}</b></span>
                        <span className="text-[#137333]">Cap: <b>{lorry.availableCapacityKg || "3,000 Kg"}</b></span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {lorry.hasFreezer && (
                          <span className="bg-[#137333] text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded">
                            Freezer
                          </span>
                        )}
                        {lorry.hasHelper && (
                          <span className="bg-[#137333] text-white text-[9.5px] font-bold px-1.5 py-0.5 rounded">
                            Helper
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {lorry.vehicleType && (
                    <div>
                      <span className="font-semibold text-[#26231B]">Vehicle:</span>{" "}
                      {lorry.vehicleType}
                    </div>
                  )}
                  {lorry.speedKmH !== undefined && (
                    <div className="text-[10.5px] mt-0.5 text-[#1E9E5A] font-bold">
                      Moving at {Math.round(lorry.speedKmH)} km/h
                    </div>
                  )}

                  {/* Live Speed / Telemetry */}
                  <div className="flex items-center justify-between text-[10.5px] text-[#6F6A5A] pt-1 border-t border-[#E7E2D0]">
                    <span className="text-[#1E9E5A] font-bold">
                      ● {lorry.speedKmH && lorry.speedKmH > 0 ? `Moving: ${lorry.speedKmH} km/h` : "Live GPS Active"}
                    </span>
                    <span className="text-[10px]">{lorry.lastUpdated || "Live"}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLorry?.(lorry.id);
                  }}
                  className="mt-1.5 w-full py-1.5 px-2 bg-[#FFC20E] text-[#26231B] font-extrabold text-[11.5px] rounded-lg border-0 cursor-pointer hover:opacity-90 transition-all flex items-center justify-center gap-1 shadow-xs"
                >
                  View Route & Book
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};