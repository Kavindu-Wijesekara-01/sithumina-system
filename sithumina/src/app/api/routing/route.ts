import { NextResponse } from "next/server";

interface CachedRoute {
  polyline: [number, number][];
  distanceKm: number;
  durationMins: number;
  timestamp: number;
}

const memoryRouteCache = new Map<string, CachedRoute>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const points = searchParams.get("points");

    if (!points || !points.includes(";")) {
      return NextResponse.json(
        { success: false, error: "Invalid points parameter. Format: lng1,lat1;lng2,lat2" },
        { status: 400 }
      );
    }

    // Check memory cache
    const now = Date.now();
    const cached = memoryRouteCache.get(points);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        polyline: cached.polyline,
        distanceKm: cached.distanceKm,
        durationMins: cached.durationMins,
        cached: true,
      });
    }

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${points}?overview=full&geometries=geojson`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(osrmUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SithuminaTransportWeb/1.0",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `OSRM error status ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || !data.routes[0]) {
      return NextResponse.json(
        { success: false, error: "No road route found" },
        { status: 404 }
      );
    }

    const route = data.routes[0];
    const rawCoords = route.geometry?.coordinates || [];
    // Convert OSRM GeoJSON [lng, lat] to Leaflet [lat, lng]
    const polyline: [number, number][] = rawCoords.map((c: [number, number]) => [c[1], c[0]]);
    const distanceKm = Number((route.distance / 1000).toFixed(1));
    const durationMins = Math.round(route.duration / 60);

    const result: CachedRoute = {
      polyline,
      distanceKm,
      durationMins,
      timestamp: now,
    };
    memoryRouteCache.set(points, result);

    return NextResponse.json({
      success: true,
      polyline,
      distanceKm,
      durationMins,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Routing service error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

