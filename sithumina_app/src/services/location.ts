import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

export interface GpsCoordinate {
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  accuracy: number | null;
  timestamp: number;
}

export type LocationCallback = (coord: GpsCoordinate) => void;

export const SITHUMINA_BACKGROUND_LOCATION_TASK = "SITHUMINA_BACKGROUND_LOCATION_TASK";

let locationSubscription: Location.LocationSubscription | null = null;
let activeLocationCallback: LocationCallback | null = null;
let lastSentCoordinate: { lat: number; lng: number; time: number } | null = null;

/**
 * Request GPS Location permissions (Foreground & Background)
 */
export async function requestGpsPermissions(): Promise<boolean> {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== "granted") {
      return false;
    }

    // Request background permission for persistent screen-off & during-calls tracking
    try {
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== "granted") {
        console.log("Background location permission notice:", bgStatus);
      }
    } catch (bgErr) {
      console.warn("Background permission request notice:", bgErr);
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

/**
 * Filter and process location reading with satellite accuracy check and intelligent debounce.
 * Invoked by both foreground watcher and background task manager.
 */
function processLocationReading(loc: Location.LocationObject): void {
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

  // Intelligent debounce: Protects mobile data, battery life, and cloud database write quotas.
  // 1. If actively moving (distance >= 15m or speed > 5 km/h): stream update every ~8 seconds.
  // 2. If stationary / waiting in traffic (distance < 15m and speed <= 5 km/h): keep-alive heartbeat every 60 seconds.
  if (lastSentCoordinate) {
    const distMeters = calculateDistanceMeters(
      lastSentCoordinate.lat,
      lastSentCoordinate.lng,
      lat,
      lng
    );
    const elapsedSec = (now - lastSentCoordinate.time) / 1000;
    const isMoving = distMeters >= 15 || speedKmH > 5;

    if (isMoving && elapsedSec < 8) {
      return;
    }
    if (!isMoving && elapsedSec < 60) {
      return;
    }
  }

  lastSentCoordinate = { lat, lng, time: now };

  const coord: GpsCoordinate = {
    latitude: lat,
    longitude: lng,
    heading: loc.coords.heading ?? 0,
    speed: speedKmH,
    accuracy: loc.coords.accuracy,
    timestamp: loc.timestamp,
  };

  if (activeLocationCallback) {
    activeLocationCallback(coord);
  }
}

// Register the Background Task at global module scope
if (!TaskManager.isTaskDefined(SITHUMINA_BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(
    SITHUMINA_BACKGROUND_LOCATION_TASK,
    async ({ data, error }: any) => {
      if (error) {
        console.warn("Background location task error:", error);
        return;
      }
      if (data && data.locations && Array.isArray(data.locations)) {
        for (const loc of data.locations) {
          processLocationReading(loc);
        }
      }
    }
  );
}

/**
 * Start continuous GPS position streaming with true real-time GPS accuracy.
 * Runs in Foreground and Background (during phone calls, WhatsApp, Google Maps, or screen locked)
 * via Android Foreground Service.
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
    activeLocationCallback = onLocationUpdate;

    // 1. Start continuous Android Foreground Service & Background Location Tracking
    try {
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(
        SITHUMINA_BACKGROUND_LOCATION_TASK
      );
      if (isTaskRegistered) {
        await Location.stopLocationUpdatesAsync(SITHUMINA_BACKGROUND_LOCATION_TASK).catch(() => {});
      }

      await Location.startLocationUpdatesAsync(SITHUMINA_BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 3000, // sample every 3 seconds
        distanceInterval: 5, // trigger when moved at least 5 meters
        deferredUpdatesInterval: 3000,
        deferredUpdatesDistance: 5,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.AutomotiveNavigation,
        foregroundService: {
          notificationTitle: "Sithumina Driver Live Tracking",
          notificationBody: "ගමන ක්‍රියාත්මකයි · GPS සජීවීව යාවත්කාලීන වේ.",
          notificationColor: "#FFC20E",
        },
      });
    } catch (bgError) {
      console.warn("Could not start background location updates, falling back to foreground watch:", bgError);
    }

    // 2. High accuracy Foreground Watcher for instant in-app reactivity
    try {
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc) => {
          processLocationReading(loc);
        }
      );
    } catch (fgError) {
      console.warn("Foreground watchPositionAsync notice:", fgError);
    }

    return true;
  } catch (error) {
    console.error("Error starting GPS tracking:", error);
    return false;
  }
}

/**
 * Stop active GPS position tracking (both foreground and background service)
 */
export function stopGpsTracking(): void {
  activeLocationCallback = null;
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  TaskManager.isTaskRegisteredAsync(SITHUMINA_BACKGROUND_LOCATION_TASK)
    .then((isRegistered) => {
      if (isRegistered) {
        Location.stopLocationUpdatesAsync(SITHUMINA_BACKGROUND_LOCATION_TASK).catch(() => {});
      }
    })
    .catch(() => {});
}
