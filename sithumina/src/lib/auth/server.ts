/**
 * Who is calling, verified on the server.
 *
 * The web app sends an httpOnly session cookie; the Driver App sends its
 * Firebase ID token as a Bearer header. Roles come only from custom claims that
 * the server itself sets.
 */
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { db, doc, getDoc } from "@/lib/fs-server";
import type { Role } from "./identity";

export const SESSION_COOKIE = "__session";

export interface Session {
  uid: string;
  role: Role;
  /** Customers: their 9 digit phone key. */
  customerPhone: string;
  /** Drivers and external owners: D-10 style ID. */
  driverId: string;
}

export async function getSession(): Promise<Session | null> {
  try {
    const bearer = (await headers()).get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
    let claims;
    if (bearer) {
      claims = await adminAuth().verifyIdToken(bearer, true);
    } else {
      const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
      if (!cookie) return null;
      claims = await adminAuth().verifySessionCookie(cookie, true);
    }
    const role = claims.role as Role;
    if (role !== "admin" && role !== "driver" && role !== "customer") return null;
    const session: Session = {
      uid: claims.uid,
      role,
      customerPhone: String(claims.customerPhone || ""),
      driverId: String(claims.driverId || ""),
    };
    // A removed or deactivated driver loses access immediately
    if (role === "driver") {
      const driver = await getDoc(doc(db, "drivers", session.driverId));
      if (!driver.exists() || driver.data()?.active === false) return null;
    }
    return session;
  } catch {
    return null;
  }
}

export type Denied = { success: false; error: string; code: "UNAUTHENTICATED" | "FORBIDDEN" };

const UNAUTHENTICATED: Denied = { success: false, error: "Please sign in to continue.", code: "UNAUTHENTICATED" };
export const FORBIDDEN: Denied = { success: false, error: "You do not have permission to do that.", code: "FORBIDDEN" };

/** For Server Actions: `const auth = await authorize("admin"); if (!auth.ok) return auth.denied;` */
export async function authorize(
  ...roles: Role[]
): Promise<{ ok: true; session: Session } | { ok: false; denied: Denied }> {
  const session = await getSession();
  if (!session) return { ok: false, denied: UNAUTHENTICATED };
  if (!roles.includes(session.role)) return { ok: false, denied: FORBIDDEN };
  return { ok: true, session };
}

export const deniedResponse = (denied: Denied) =>
  NextResponse.json(denied, { status: denied.code === "UNAUTHENTICATED" ? 401 : 403 });

/** A driver may act only on bookings assigned to them. */
export async function driverOwnsBooking(session: Session, bookingId: string): Promise<boolean> {
  const booking = (await getDoc(doc(db, "bookings", bookingId))).data();
  return Boolean(
    booking && String(booking.assignedDriverId || "").toUpperCase() === session.driverId.toUpperCase()
  );
}

const vehicleKey = (v: unknown) => String(v || "").replace(/^lorry-/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when the plate or lorry ID is the signed-in driver's own vehicle. */
export async function driverOwnsVehicle(session: Session, vehicle: string): Promise<boolean> {
  const key = vehicleKey(vehicle);
  if (!key) return false;
  const driver = (await getDoc(doc(db, "drivers", session.driverId))).data();
  return Boolean(
    driver && [driver.plate, driver.lorryId, session.driverId].some((own) => vehicleKey(own) === key)
  );
}
