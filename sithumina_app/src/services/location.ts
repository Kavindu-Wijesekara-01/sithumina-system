import * as Location from "expo-location";

export interface GpsCoordinate {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  accuracy: number | null;
  timestamp: number;
}

export type LocationCallback = (coord: GpsCoordinate) => void;

let locationSubscription: Location.LocationSubscription | null = null;

/**
 * Request GPS Location permissions (Foreground & optionally Background)
 */
export async function requestGpsPermissions(): Promise<boolean> {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error requesting GPS permissions:", error);
    return false;
  }
}

/**
 * Get current one-off GPS coordinate with maximum hardware satellite accuracy
 */
export async function getCurrentGpsPosition(): Promise<GpsCoordinate | null> {
  try {
    const hasPermission = await requestGpsPermissions();
    if (!hasPermission) return null;

    // 1. Check last known position for instant location (only if fresh)
    let candidate: GpsCoordinate | null = null;
    try {
      const lastKnown = await Location.getLastKnownPositionAsync({});
      if (lastKnown && lastKnown.coords && Number.isFinite(lastKnown.coords.latitude) && Number.isFinite(lastKnown.coords.longitude)) {
        const ageMs = Date.now() - (lastKnown.timestamp || 0);
        if (ageMs < 30_000) { // Only use if less than 30 seconds old
          candidate = {
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
            heading: lastKnown.coords.heading ?? 0,
            speed: lastKnown.coords.speed ? Math.max(0, lastKnown.coords.speed * 3.6) : 0,
            accuracy: lastKnown.coords.accuracy,
            timestamp: lastKnown.timestamp,
          };
        }
      }
    } catch {}

    // 2. Fetch fresh satellite GPS fix with high accuracy (5s timeout)
    try {
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("GPS_TIMEOUT")), 5000)),
      ]);

      if (loc && loc.coords && Number.isFinite(loc.coords.latitude) && Number.isFinite(loc.coords.longitude)) {
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          heading: loc.coords.heading ?? 0,
          speed: loc.coords.speed ? Math.max(0, loc.coords.speed * 3.6) : 0,
          accuracy: loc.coords.accuracy,
          timestamp: loc.timestamp,
        };
      }
    } catch {
      // GPS timed out - return fresh candidate if available, otherwise null
    }

    return candidate;
  } catch (error) {
    console.warn("Error getting current GPS position:", error);
    return null;
  }
}

/**
 * Calculate approximate distance in meters between two GPS coordinates
 */
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

let lastSentCoordinate: { lat: number; lng: number; time: number } | null = null;

/**
 * Start continuous GPS position streaming with true real-time GPS accuracy
 * Updates live whenever the vehicle moves or continuously every 2-3 seconds
 */
export async function startGpsTracking(
  onLocationUpdate: LocationCallback
): Promise<boolean> {
  try {
    const hasPermission = await requestGpsPermissions();
    if (!hasPermission) return false;

    // Stop any existing tracking first
    stopGpsTracking();
    lastSentCoordinate = null;

    // Request high accuracy GPS hardware (High ensures continuous updates outdoors & indoors)
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000, // sample every 2 seconds
        distanceInterval: 0, // distance 0 ensures continuous updates even when stationary or in traffic!
      },
      (loc) => {
        if (!loc || !loc.coords) return;

        // Skip erratic cell-tower readings with poor accuracy (> 50m) to prevent erratic location jumping
        if (typeof loc.coords.accuracy === "number" && loc.coords.accuracy > 50) {
          return;
        }

        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const now = Date.now();
        const speedKmH = loc.coords.speed ? Math.max(0, loc.coords.speed * 3.6) : 0;

        // Debounce if coordinate hasn't changed and less than 2.5s elapsed
        if (lastSentCoordinate) {
          const distMeters = calculateDistanceMeters(
            lastSentCoordinate.lat,
            lastSentCoordinate.lng,
            lat,
            lng
          );
          const elapsedSec = (now - lastSentCoordinate.time) / 1000;

          // If moved less than 1m and less than 2.5s passed, skip to avoid duplicate writes
          if (distMeters < 1 && elapsedSec < 2.5) {
            return;
          }
        }

        lastSentCoordinate = { lat, lng, time: now };

        onLocationUpdate({
          latitude: lat,
          longitude: lng,
          heading: loc.coords.heading ?? 0,
          speed: speedKmH,
          accuracy: loc.coords.accuracy,
          timestamp: loc.timestamp,
        });
      }
    );

    return true;
  } catch (error) {
    console.error("Error starting GPS tracking:", error);
    return false;
  }
}

/**
 * Stop active GPS position tracking
 */
export function stopGpsTracking(): void {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
}
