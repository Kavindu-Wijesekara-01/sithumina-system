import { NextResponse } from "next/server";
import { upsertLorryTripInStore } from "@/lib/server-store";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

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
