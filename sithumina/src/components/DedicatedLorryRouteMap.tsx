"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Lorry } from "@/lib/mock-lorries";
import { generateLorryRouteWaypoints, isValidCoord, sanitizeCoord, resolveLocationCoordinates, extractViaWaypoints } from "@/lib/sri-lanka-routes";

interface DedicatedLorryRouteMapProps {
  lorry: Lorry;
  className?: string;
  height?: number | string;
}

// Controller component to safely auto-fit bounds to the single lorry's route
function RouteBoundsController({
  bounds,
}: {
  bounds: L.LatLngBounds | null;
}) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {}
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (!bounds || fittedRef.current) return;
    try {
      if (bounds.isValid && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 13, animate: true });
        fittedRef.current = true;
      }
    } catch (e) {
      console.warn("fitBounds notice:", e);
    }
  }, [bounds, map]);

  return null;
}

// Custom Map Zoom Controls placed safely below the close button
function CustomMapZoomControls() {
  const map = useMap();
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (controlsRef.current) {
      L.DomEvent.disableClickPropagation(controlsRef.current);
      L.DomEvent.disableScrollPropagation(controlsRef.current);
    }
  }, []);

  return (
    <div
      ref={controlsRef}
      className="absolute top-14 right-3.5 z-[1000] flex flex-col gap-1.5 pointer-events-auto shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          map.zoomIn();
        }}
        className="w-8 h-8 rounded-xl bg-white/95 hover:bg-white text-[#26231B] border border-[#E7E2D0] flex items-center justify-center font-black text-lg shadow-sm cursor-pointer active:scale-95 transition-all select-none backdrop-blur-sm"
        title="Zoom In"
        aria-label="Zoom In"
      >
        +
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          map.zoomOut();
        }}
        className="w-8 h-8 rounded-xl bg-white/95 hover:bg-white text-[#26231B] border border-[#E7E2D0] flex items-center justify-center font-black text-lg shadow-sm cursor-pointer active:scale-95 transition-all select-none backdrop-blur-sm"
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        −
      </button>
    </div>
  );
}

// Global in-memory and session route cache so road network renders in 0ms without straight-line flicker
const clientRouteCache = new Map<string, [number, number][]>();

function getCachedRoute(key: string): [number, number][] | null {
  if (clientRouteCache.has(key)) return clientRouteCache.get(key)!;
  if (typeof window !== "undefined") {
    try {
      const stored = sessionStorage.getItem(`sithumina_route_${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          clientRouteCache.set(key, parsed);
          return parsed;
        }
      }
    } catch {}
  }
  return null;
}

function setCachedRoute(key: string, polyline: [number, number][]) {
  clientRouteCache.set(key, polyline);
  if (typeof window !== "undefined") {
    try {
      sessionStorage.setItem(`sithumina_route_${key}`, JSON.stringify(polyline));
    } catch {}
  }
}

export const DedicatedLorryRouteMap: React.FC<DedicatedLorryRouteMapProps> = ({
  lorry,
  className = "",
  height = 240,
}) => {
  const currentCoords = useMemo<[number, number]>(() => {
    const lat = Number(lorry?.lat);
    const lng = Number(lorry?.lng);
    return sanitizeCoord([lat, lng], [6.9271, 79.8612]);
  }, [lorry?.lat, lorry?.lng]);

  const startCoord = useMemo<[number, number] | null>(() => {
    if (isValidCoord([Number(lorry?.startLat), Number(lorry?.startLng)])) {
      return [Number(lorry.startLat), Number(lorry.startLng)];
    }
    return resolveLocationCoordinates(lorry?.startLocation);
  }, [lorry?.startLat, lorry?.startLng, lorry?.startLocation]);

  const endCoord = useMemo<[number, number] | null>(() => {
    if (isValidCoord([Number(lorry?.endLat), Number(lorry?.endLng)])) {
      return [Number(lorry.endLat), Number(lorry.endLng)];
    }
    return resolveLocationCoordinates(lorry?.endLocation);
  }, [lorry?.endLat, lorry?.endLng, lorry?.endLocation]);

  const resolvedViaWaypoints = useMemo(() => {
    if (Array.isArray(lorry?.viaWaypoints) && lorry.viaWaypoints.length > 0) {
      return lorry.viaWaypoints;
    }
    return extractViaWaypoints(lorry?.travelRoute, lorry?.returnRoute, startCoord, endCoord);
  }, [lorry?.viaWaypoints, lorry?.travelRoute, lorry?.returnRoute, startCoord, endCoord]);

  // Trip key based strictly on Start, Via Waypoints & Destination so real-time GPS pings don't flicker the route
  const tripKey = useMemo(() => {
    const s = startCoord ? `${startCoord[0].toFixed(3)},${startCoord[1].toFixed(3)}` : "start";
    const e = endCoord ? `${endCoord[0].toFixed(3)},${endCoord[1].toFixed(3)}` : "end";
    const v = (resolvedViaWaypoints || []).map((wp) => `${wp.lat.toFixed(3)},${wp.lng.toFixed(3)}`).join("|");
    return `${lorry.id || lorry.plate}_${s}_[${v}]_${e}`;
  }, [lorry.id, lorry.plate, startCoord, endCoord, resolvedViaWaypoints]);

  const routeData = useMemo(() => {
    return generateLorryRouteWaypoints(
      currentCoords,
      lorry?.startLocation,
      lorry?.endLocation,
      lorry?.route,
      startCoord,
      endCoord
    );
  }, [currentCoords, lorry?.startLocation, lorry?.endLocation, lorry?.route, startCoord, endCoord]);

  const lorryIcon = useMemo(() => {
    return L.divIcon({
      className: "dedicated-lorry-marker",
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="position:absolute;top:0;width:38px;height:38px;border-radius:50%;background:rgba(255,194,14,0.4);animation:pu 1.8s infinite;"></div>
          <div style="position:relative;z-index:2;display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:#FFC20E;border:2.5px solid #26231B;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,0.35);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#26231B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #26231B;margin-top:-1px;"></div>
        </div>
      `,
      iconSize: [38, 42],
      iconAnchor: [19, 39],
      popupAnchor: [0, -40],
    });
  }, []);

  const startIcon = useMemo(() => {
    return L.divIcon({
      className: "start-point-marker",
      html: `
        <div style="display:flex;align-items:center;gap:4px;background:#1E9E5A;color:#FFFFFF;border:1.5px solid #FFFFFF;border-radius:12px;padding:3px 7px;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:10px;font-weight:700;">
          <div style="width:6px;height:6px;border-radius:50%;background:#FFFFFF;"></div>
          <span>Start</span>
        </div>
      `,
      iconSize: [60, 24],
      iconAnchor: [30, 24],
    });
  }, []);

  const endIcon = useMemo(() => {
    return L.divIcon({
      className: "end-point-marker",
      html: `
        <div style="display:flex;align-items:center;gap:4px;background:#D9381E;color:#FFFFFF;border:1.5px solid #FFFFFF;border-radius:12px;padding:3px 7px;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:10px;font-weight:700;">
          <div style="width:6px;height:6px;border-radius:50%;background:#FFFFFF;"></div>
          <span>Destination</span>
        </div>
      `,
      iconSize: [80, 24],
      iconAnchor: [40, 24],
    });
  }, []);

  // Initialize from cache immediately so 0 straight-line flash occurs on render
  const [roadPolyline, setRoadPolyline] = useState<[number, number][]>(() => {
    return getCachedRoute(tripKey) || [];
  });

  const bounds = useMemo(() => {
    try {
      if (roadPolyline.length >= 2) {
        return L.latLngBounds(roadPolyline);
      }
      const validPoints = [routeData.start, routeData.current, routeData.end].filter(isValidCoord);
      if (validPoints.length >= 2) {
        return L.latLngBounds(validPoints);
      }
      return null;
    } catch {
      return null;
    }
  }, [roadPolyline, routeData]);

  useEffect(() => {
    // If already in memory cache or session storage, restore immediately
    const cached = getCachedRoute(tripKey);
    if (cached && cached.length >= 2) {
      setRoadPolyline(cached);
      return;
    }

    let isCancelled = false;

    const fetchRoad = async () => {
      const from = startCoord || currentCoords;
      const to = endCoord;

      if (!isValidCoord(from) || !isValidCoord(to)) {
        return;
      }

      // Build multi-waypoint OSRM query
      let pointsSegments = [`${from[1]},${from[0]}`];

      // Add via-waypoints if available
      if (Array.isArray(resolvedViaWaypoints) && resolvedViaWaypoints.length > 0) {
        for (const wp of resolvedViaWaypoints) {
          if (wp && Number.isFinite(wp.lat) && Number.isFinite(wp.lng)) {
            pointsSegments.push(`${wp.lng},${wp.lat}`);
          }
        }
      }

      pointsSegments.push(`${to[1]},${to[0]}`);
      const pointsParam = pointsSegments.join(';');

      try {
        const res = await fetch(`/api/routing?points=${encodeURIComponent(pointsParam)}`);
        if (!res.ok) throw new Error("Local routing response not ok");
        const json = await res.json();
        if (!isCancelled && json.success && Array.isArray(json.polyline) && json.polyline.length >= 2) {
          setCachedRoute(tripKey, json.polyline);
          setRoadPolyline(json.polyline);
          return;
        }
      } catch {
        // Direct OSRM fallback
        try {
          const directUrl = `https://router.project-osrm.org/route/v1/driving/${pointsParam}?overview=full&geometries=geojson`;
          const directRes = await fetch(directUrl);
          const directJson = await directRes.json();
          if (!isCancelled && directJson.code === "Ok" && directJson.routes?.[0]?.geometry?.coordinates) {
            const pts: [number, number][] = directJson.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]]
            );
            if (pts.length >= 2) {
              setCachedRoute(tripKey, pts);
              setRoadPolyline(pts);
            }
          }
        } catch {
          // Keep current line
        }
      }
    };

    fetchRoad();
    return () => {
      isCancelled = true;
    };
  }, [tripKey, startCoord, endCoord]);

  // If roadPolyline is ready (>=3 points), use it. Otherwise, use routeData.polyline only if it has authentic highway corridor waypoints (>=3 points).
  // Strictly prevent any 2-point direct straight line cutting across terrain.
  const effectivePolyline = roadPolyline.length >= 3
    ? roadPolyline
    : (routeData.polyline && routeData.polyline.length >= 3 ? routeData.polyline : []);

  const safeCenter: [number, number] = isValidCoord(currentCoords) ? currentCoords : [6.9271, 79.8612];

  return (
    <div
      className={`relative w-full overflow-hidden bg-[#F7F5EE] select-none ${className}`}
      style={{ height }}
    >
      <MapContainer
        center={safeCenter}
        zoom={9}
        scrollWheelZoom={true}
        doubleClickZoom={true}
        touchZoom={true}
        attributionControl={false}
        zoomControl={false}
        className="w-full h-full z-0"
        style={{ background: "#F7F5EE" }}
      >
        <TileLayer
          attribution=""
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CustomMapZoomControls />
        <RouteBoundsController bounds={bounds} />

        {/* Visual Route Corridor: Golden Glow Underlay + Crisp Dashed Directional Polyline */}
        {effectivePolyline && effectivePolyline.length >= 2 && (
          <>
            <Polyline
              positions={effectivePolyline}
              pathOptions={{
                color: "#FFC20E",
                weight: 8,
                opacity: 0.55,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <Polyline
              positions={effectivePolyline}
              pathOptions={{
                color: "#26231B",
                weight: 4,
                dashArray: "6, 8",
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}

        {/* Start Point */}
        {isValidCoord(routeData.start) && (
          <Marker position={routeData.start} icon={startIcon}>
            <Popup>
              <div className="text-xs font-sans">
                <strong className="text-[#26231B]">Trip Origin</strong>
                <div>{lorry?.startLocation || "Start Point"}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Point */}
        {isValidCoord(routeData.end) && (
          <Marker position={routeData.end} icon={endIcon}>
            <Popup>
              <div className="text-xs font-sans">
                <strong className="text-[#26231B]">Final Destination</strong>
                <div>{lorry?.endLocation || "Destination"}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Via Towns */}
        {resolvedViaWaypoints && resolvedViaWaypoints.map((wp, idx) => {
          if (!wp || !Number.isFinite(wp.lat) || !Number.isFinite(wp.lng)) return null;
          const viaIcon = L.divIcon({
            className: "via-point-marker",
            html: `
              <div style="display:flex;align-items:center;gap:4px;background:#26231B;color:#FFC20E;border:1.5px solid #FFC20E;border-radius:12px;padding:2px 7px;box-shadow:0 2px 6px rgba(0,0,0,0.25);font-size:10px;font-weight:700;">
                <span style="font-size:9px;">#${idx + 1}</span>
                <span>${wp.name || "Via"}</span>
              </div>
            `,
            iconSize: [75, 22],
            iconAnchor: [37, 22],
          });
          return (
            <Marker key={`via-${idx}`} position={[wp.lat, wp.lng]} icon={viaIcon}>
              <Popup>
                <div className="text-xs font-sans">
                  <strong className="text-[#26231B]">Via Town #{idx + 1}</strong>
                  <div>{wp.name}</div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Live Current Lorry Marker */}
        {isValidCoord(routeData.current) && (
          <Marker position={routeData.current} icon={lorryIcon}>
            <Popup>
              <div className="p-1 font-sans text-xs">
                <b className="text-sm font-bold text-[#26231B]">{lorry?.plate}</b>
                <div className="text-[#6F6A5A] mt-0.5">Route: {lorry?.route}</div>
                {lorry?.speedKmH !== undefined && (
                  <div className="text-[#1E9E5A] font-bold mt-1">
                    Speed: {Math.round(lorry.speedKmH)} km/h
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Floating Live Telemetry Badge (Top Left) */}
      <div className="absolute top-3 left-3 z-[1000] bg-[#26231B]/90 backdrop-blur-md text-[#FFFFFF] text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 border border-white/10 pointer-events-none">
        <span className="w-2.5 h-2.5 rounded-full bg-[#1E9E5A] animate-pulse"></span>
        <span className="tracking-wide">LIVE ROUTE TRACKING</span>
      </div>
    </div>
  );
};
