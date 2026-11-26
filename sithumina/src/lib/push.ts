/**
 * Sends the "new job" push notification to the assigned driver's phone
 * through the Expo push service.
 */
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { normalizeVehicleKey } from "@/lib/trip-state";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendDispatchPush(dispatch: {
  id: string;
  driverId?: string;
  assignedPlate?: string;
  pickupCity?: string;
  deliveryCity?: string;
  tripRole?: string;
}): Promise<void> {
  const drivers = await getDocs(collection(db, "drivers"));
  const tokens = new Set<string>();
  const driverId = String(dispatch.driverId || "").toUpperCase();
  const plate = normalizeVehicleKey(dispatch.assignedPlate);

  const all = drivers.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, any> & { id: string });
  // Prefer the named driver; fall back to whoever is registered to the vehicle
  let targets = all.filter((d) => driverId && String(d.driverId || d.id).toUpperCase() === driverId);
  if (targets.length === 0) targets = all.filter((d) => plate && normalizeVehicleKey(d.plate) === plate);
  for (const d of targets) if (d.expoPushToken) tokens.add(String(d.expoPushToken));
  if (tokens.size === 0) return;

  const isReturn = dispatch.tripRole === "return";
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      Array.from(tokens).map((to) => ({
        to,
        title: isReturn ? "↩ New RETURN booking" : "New booking",
        body: `${dispatch.pickupCity || "Pickup"} → ${dispatch.deliveryCity || "Drop-off"}`,
        data: { dispatchId: dispatch.id },
        priority: "high",
        channelId: "dispatch",
        sound: "ring.wav",
        ttl: 300,
      }))
    ),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Expo push failed with HTTP ${response.status}`);
}
