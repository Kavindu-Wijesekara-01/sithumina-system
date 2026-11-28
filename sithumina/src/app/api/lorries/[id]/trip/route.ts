import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, driverVehiclePayload, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { upsertLorryTripInStore } from "@/lib/server-store";
import { db } from "@/lib/fs-server";
import { doc, setDoc } from "@/lib/fs-server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize("admin", "driver");
  if (!auth.ok) return deniedResponse(auth.denied);
  if (auth.session.role === "driver" && !(await driverOwnsVehicle(auth.session, (await params).id))) {
    return deniedResponse(FORBIDDEN);
  }
  try {
    const { id } = await params;
    const body = await driverVehiclePayload(auth.session, await request.json());
    if (!body) return deniedResponse(FORBIDDEN);

    const lorry = await upsertLorryTripInStore({
      ...body,
      lorryId: id,
    });

    try {
      const safeDocId = (lorry.id || "").toString().trim().replace(/\//g, "-");
      const rawLiveKey = (lorry.plate || id).replace(/^lorry-/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const liveKey = rawLiveKey || (safeDocId.replace(/^lorry-/i, "") || "");
      const fsPayload = { ...lorry, isLive: true, isOnline: true, updatedAt: Date.now() };
      if (liveKey && !liveKey.includes("/")) {
        await setDoc(doc(db, "lorries_live", liveKey), fsPayload, { merge: true });
      }
      if (safeDocId && safeDocId !== "lorry-" && !safeDocId.includes("/")) {
        await setDoc(doc(db, "lorries", safeDocId), fsPayload, { merge: true });
      }
    } catch (e) {
      console.warn("Firestore trip POST notice:", e);
    }

    return NextResponse.json({ success: true, lorry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update trip specifications";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
