import { NextResponse } from "next/server";
import { updateLorryGpsInStore } from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { lat, lng, heading = 0, speedKmH = 0 } = body;

    if (lat === undefined || lng === undefined) {
      return NextResponse.json(
        { success: false, error: "Latitude and longitude are required" },
        { status: 400 }
      );
    }

    const updated = await updateLorryGpsInStore(
      id,
      Number(lat),
      Number(lng),
      Number(heading) || 0,
      Number(speedKmH) || 0,
      body
    );

    try {
      const safeDocId = (updated.id || "").toString().trim().replace(/\//g, "-");
      const rawLiveKey = (updated.plate || updated.id || id).toString().toLowerCase().replace(/[^a-z0-9]/g, "");
      const liveKey = rawLiveKey || (safeDocId.replace(/^lorry-/i, "") || "");
      const fsPayload = {
        ...updated,
        isLive: true,
        isOnline: true,
        updatedAt: Date.now(),
      };
      if (liveKey && !liveKey.includes("/")) {
        await setDoc(doc(db, "lorries_live", liveKey), fsPayload, { merge: true });
      }
      if (safeDocId && safeDocId !== "lorry-" && !safeDocId.includes("/")) {
        await setDoc(doc(db, "lorries", safeDocId), fsPayload, { merge: true });
      }
    } catch (e) {
      console.warn("Firestore sync notice for lorry location POST:", e);
    }

    return NextResponse.json({ success: true, lorry: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update location";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
