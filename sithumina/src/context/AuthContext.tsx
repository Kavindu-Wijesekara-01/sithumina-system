"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { loginEmail, type Role } from "@/lib/auth/identity";

export type UserRole = Role;

export interface UserProfile {
  uid: string;
  role: UserRole;
  name: string;
  /** Customers only, as stored on their bookings (0XXXXXXXXX). */
  phone: string;
  /** Drivers and external owners only. */
  driverId: string;
  idNumber?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Matches the session cookie lifetime in app/api/auth/session
const SESSION_MS = 5 * 24 * 60 * 60 * 1000;

let session: { key: string; ready: Promise<boolean> } | null = null;

/**
 * The server needs a cookie to recognise this browser in Server Actions and APIs.
 * Created once per sign-in; everyone who needs it awaits the same request.
 */
function startServerSession(user: User, authTime: string): Promise<boolean> {
  const key = `${user.uid}:${authTime}`;
  if (session?.key !== key) {
    const ready = (async () => {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await user.getIdToken() }),
      });
      return res.ok;
    })().catch(() => false);
    session = { key, ready };
    void ready.then((ok) => {
      if (!ok && session?.key === key) session = null;
    });
  }
  return session.ready;
}

const endServerSession = () => {
  session = null;
  return fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (current) => {
        setUser(current);
        try {
          const token = current ? await current.getIdTokenResult() : null;
          // The server cookie lasts five days; end the browser sign-in with it
          if (token && Date.now() - Date.parse(token.authTime) > SESSION_MS) {
            await endServerSession();
            await signOut(auth);
            return;
          }
          // On a new sign-in, pages must not call the server before the cookie exists
          if (current && token && Date.now() - Date.parse(token.authTime) < 4 * 60 * 1000) {
            await startServerSession(current, token.authTime);
          }
          const claims = token?.claims;
          const role = claims?.role as Role | undefined;
          setProfile(
            current && role
              ? {
                  uid: current.uid,
                  role,
                  name: current.displayName || String(claims?.driverId || claims?.customerPhone || "Admin"),
                  phone: String(claims?.customerPhone || ""),
                  driverId: String(claims?.driverId || ""),
                }
              : null
          );
        } catch {
          setProfile(null);
        }
        setLoading(false);
      }),
    []
  );

  const signIn = async (identifier: string, password: string) => {
    const email = loginEmail(identifier);
    if (!email || !password) return { ok: false, error: "Enter your phone number or ID, and your password." };
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const { authTime } = await credential.user.getIdTokenResult();
      if (!(await startServerSession(credential.user, authTime))) {
        await signOut(auth);
        return { ok: false, error: "Sign-in could not be verified. Please try again." };
      }
      return { ok: true };
    } catch (e) {
      const code = String((e as { code?: string }).code || "");
      if (code === "auth/too-many-requests") {
        return { ok: false, error: "Too many attempts. Wait a few minutes and try again." };
      }
      if (code === "auth/network-request-failed") {
        return { ok: false, error: "No connection. Please try again." };
      }
      return { ok: false, error: "The phone number or ID, or the password, is incorrect." };
    }
  };

  const logout = async () => {
    await endServerSession();
    await signOut(auth).catch(() => {});
    try {
      // Remove data cached by the earlier phone-only sign-in
      localStorage.removeItem("sithumina_user_profile");
      localStorage.removeItem("sithumina_outside_employee_session");
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
