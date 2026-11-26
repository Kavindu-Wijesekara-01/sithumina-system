/**
 * Sign-in for drivers and admins: ID (or phone) and password. The role comes from
 * claims set by the server, never from anything typed on the phone.
 */
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { loginEmail } from "./identity";
import { resolveSafeLorryDocId, type DriverRecord } from "./database";

export interface AppSession {
  role: "admin" | "driver";
  driver?: DriverRecord;
}

/** Build the session for whoever is signed in. Throws with a readable message. */
export async function loadSession(): Promise<AppSession | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const { claims } = await user.getIdTokenResult();
  if (claims.role === "admin") return { role: "admin" };
  if (claims.role !== "driver") throw new Error("This account cannot use the Driver App.");

  const driverId = String(claims.driverId || "");
  const snap = await getDoc(doc(db, "drivers", driverId));
  if (!snap.exists() || snap.data().active === false) {
    throw new Error("This driver account is not active. Contact the office.");
  }
  const data = snap.data() as DriverRecord;
  return {
    role: "driver",
    driver: {
      ...data,
      id: snap.id,
      driverId,
      lorryId: resolveSafeLorryDocId(data.lorryId, data.plate, driverId),
    },
  };
}

export async function signIn(identifier: string, password: string): Promise<AppSession> {
  try {
    await signInWithEmailAndPassword(auth, loginEmail(identifier), password);
  } catch (e: any) {
    if (e?.code === "auth/network-request-failed") throw new Error("No connection. Please try again.");
    if (e?.code === "auth/too-many-requests") throw new Error("Too many attempts. Wait a few minutes.");
    throw new Error("The ID or password is incorrect.");
  }
  try {
    const session = await loadSession();
    if (!session) throw new Error("Sign-in failed.");
    return session;
  } catch (e) {
    await signOut(auth);
    throw e;
  }
}

export const endSession = () => signOut(auth);
