import { SRI_LANKA_CITIES } from "./sri-lanka-routes";

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates.
 */
export function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Resolves the closest Sri Lankan city/town from arbitrary GPS coordinates.
 */
export function findNearestSriLankanCity(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "Colombo";
  }

  let minDistance = Infinity;
  let nearestCity = "Colombo";

  for (const [key, coords] of Object.entries(SRI_LANKA_CITIES)) {
    const [cLat, cLng] = coords;
    const dist = getDistanceFromLatLonInKm(lat, lng, cLat, cLng);
    if (dist < minDistance) {
      minDistance = dist;
      // Capitalize city name
      nearestCity = key.charAt(0).toUpperCase() + key.slice(1);
    }
  }

  return nearestCity;
}
