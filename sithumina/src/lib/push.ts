/**
 * Sends the "new job" push notification to the assigned driver's phone
 * through the Expo push service.
 */
import { db } from "@/lib/fs-server";
import { collection, doc, getDoc, getDocs, limit, query, where } from "@/lib/fs-server";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendDispatchPush(dispatch: {
  id: string;
  driverId?: string;
  assignedPlate?: string;
  pickupCity?: string;
  deliveryCity?: string;
  tripRole?: string;
}): Promise<void> {
  const tokens = new Set<string>();
  const driverId = String(dispatch.driverId || "").toUpperCase();
  const plate = String(dispatch.assignedPlate || "").trim().toUpperCase();

  // Prefer the named driver; fall back to whoever is registered to the vehicle
  let targets: Array<Record<string, any>> = [];
  if (driverId) {
    const snap = await getDoc(doc(db, "drivers", driverId));
    if (snap.exists()) targets = [snap.data()!];
  }
  if (targets.length === 0 && plate) {
    const snap = await getDocs(query(collection(db, "drivers"), where("plate", "==", plate), limit(5)));
    targets = snap.docs.map((d) => d.data());
  }
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
