import { authorize, deniedResponse, driverOwnsBooking, driverOwnsVehicle, getSession, FORBIDDEN } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { performTripAction, TripError, type TripAction } from "@/lib/trip-workflow";

const ACTIONS: TripAction[] = ["accept", "decline", "loaded", "collect_cash", "complete"];

/** Driver App trip actions. */
export async function POST(request: Request) {
  const auth = await authorize("driver", "admin");
  if (!auth.ok) return deniedResponse(auth.denied);
  try {
    const body = await request.json();
    const action = body?.action as TripAction;
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ success: false, error: "Unknown trip action." }, { status: 400 });
    }
    const result = await performTripAction(String(body.dispatchId || ""), action, {
      // A driver acts only as themselves, whatever the request says
      driverId: auth.session.role === "driver" ? auth.session.driverId : String(body.driverId || ""),
      plate: body.plate ? String(body.plate) : undefined,
      reason: body.reason ? String(body.reason) : undefined,
    });

    try {

      revalidatePath("/admin");
      revalidatePath("/login");
    } catch {
      // Best-effort only
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    if (error instanceof TripError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("Trip action failed:", error);
    return NextResponse.json({ success: false, error: "Could not update the trip. Please retry." }, { status: 500 });
  }
}
