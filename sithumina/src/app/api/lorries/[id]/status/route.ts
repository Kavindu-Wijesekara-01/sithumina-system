import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { updateLorryStatusInStore } from "@/lib/server-store";
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
    const body = await request.json();
    const { status } = body;

    if (status !== "empty" && status !== "on_trip") {
      return NextResponse.json(
        { success: false, error: "Status must be 'empty' or 'on_trip'" },
        { status: 400 }
      );
    }

    const updated = await updateLorryStatusInStore(id, status);
    let firestoreOk = false;
    try {
      const rawTarget = (updated?.id || id.trim().toLowerCase()).replace(/\//g, "-");
      const targetId = rawTarget && rawTarget !== "lorry-" ? rawTarget : "";
      const liveKey = (updated?.plate || id).replace(/^lorry-/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const payload = { status, lastUpdated: "Just now", updatedAt: Date.now() };
      if (targetId && !targetId.includes("/")) {
        await setDoc(doc(db, "lorries", targetId), payload, { merge: true });
        firestoreOk = true;
      }
      if (liveKey && !liveKey.includes("/")) {
        await setDoc(doc(db, "lorries_live", liveKey), payload, { merge: true });
        firestoreOk = true;
      }
    } catch (e) {
      console.warn("Firestore status POST notice:", e);
    }

    if (!updated && !firestoreOk) {
      return NextResponse.json(
        { success: false, error: "Lorry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, lorry: updated || { id, status } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update status";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
