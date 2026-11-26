import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { SESSION_COOKIE } from "@/lib/auth/server";

const MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

/** Exchange a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(request: Request) {
  // Only our own pages may set the cookie
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ success: false, error: "Cross-site request refused." }, { status: 403 });
  }
  try {
    const { idToken } = await request.json();
    const claims = await adminAuth().verifyIdToken(String(idToken || ""), true);
    // The token must come from a sign-in that just happened
    if (Date.now() / 1000 - claims.auth_time > 5 * 60) {
      return NextResponse.json({ success: false, error: "Please sign in again." }, { status: 401 });
    }
    const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: MAX_AGE_MS });
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_MS / 1000,
    });
    return response;
  } catch (e) {
    console.warn("Session sign-in refused:", e);
    return NextResponse.json({ success: false, error: "Sign-in could not be verified." }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
