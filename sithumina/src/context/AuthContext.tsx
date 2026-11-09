"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
  normalizePhoneNumber,
  getCanonicalCustomerId,
} from "@/lib/phone-utils";

export type UserRole = "driver" | "customer" | "admin";

export interface UserProfile {
  uid: string;
  phone: string;
  role: UserRole;
  name: string;
  plateNumber?: string;
  assignedLorryId?: string;
  createdAt: number;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  role: UserRole;
  loginWithPhone: (
    phone: string,
    pin: string,
    role: UserRole,
    extra?: { name?: string; plateNumber?: string }
  ) => Promise<boolean>;
  loginAsAdmin: () => Promise<boolean>;
  logout: () => Promise<void>;
  updateDriverLorry: (lorryId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_PROFILE_KEY = "sithumina_user_profile";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase Auth state & hydrate localStorage safely on mount
  useEffect(() => {
    // 1. Hydrate cached profile from localStorage on client mount (safe after hydration)
    const getSavedProfile = (): UserProfile | null => {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as UserProfile;
        if (parsed && parsed.role === "customer" && parsed.phone) {
          const canonicalPhone = normalizePhoneNumber(parsed.phone) || parsed.phone.trim();
          const canonicalUid = getCanonicalCustomerId(canonicalPhone);
          const normalizedProfile: UserProfile = {
            ...parsed,
            uid: parsed.uid?.startsWith("cust-") || !parsed.uid ? canonicalUid : parsed.uid,
            phone: canonicalPhone,
          };
          if (normalizedProfile.uid !== parsed.uid || normalizedProfile.phone !== parsed.phone) {
            localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(normalizedProfile));
          }
          return normalizedProfile;
        }
        return parsed;
      } catch {
        return null;
      }
    };

    const initialSaved = getSavedProfile();
    if (initialSaved) {
      setProfile(initialSaved);
    }

    // 2. Listen to Firebase Auth state without overwriting an active customer's phone session
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      const activeSaved = getSavedProfile();

      if (fbUser) {
        // Never allow an anonymous/Firebase Auth UID to clobber a logged-in customer phone session
        if (activeSaved && activeSaved.role === "customer" && activeSaved.uid !== fbUser.uid) {
          setProfile(activeSaved);
          setLoading(false);
          return;
        }

        try {
          const userDoc = await getDoc(doc(db, "users", fbUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            if (data && (data.phone || data.role === "admin")) {
              setProfile(data);
              localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(data));
            }
          }
        } catch (e) {
          console.warn("Could not fetch user document:", e);
        }
      } else {
        if (!activeSaved) {
          setProfile(null);
        } else {
          setProfile(activeSaved);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithPhone = async (
    phone: string,
    _pin: string,
    _selectedRole: UserRole,
    extra?: { name?: string; plateNumber?: string }
  ): Promise<boolean> => {
    try {
      const canonicalPhone = normalizePhoneNumber(phone) || phone.trim();
      const canonicalUid = getCanonicalCustomerId(canonicalPhone);

      // Helper so client login state transition never stalls on slow WebChannel/server latency
      const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

      // 1. Sync to Central Store & canonical users/{uid} via Server Action (bounded 3.5s)
      let customerName = extra?.name?.trim() || "";
      let resolvedUid = canonicalUid;
      try {
        const { loginCustomerAction } = await import("@/actions");
        const res = await withTimeout(
          loginCustomerAction(canonicalPhone, customerName || undefined),
          3500,
          null
        );
        if (res && res.success && res.data) {
          if (res.data.name) customerName = res.data.name;
          if (res.data.id) resolvedUid = res.data.id;
        }
      } catch (e) {
        console.warn("Server action customer login notice:", e);
      }

      if (!customerName || customerName === "Valued Customer" || customerName === "Customer") {
        try {
          const existingSnap = await withTimeout(
            getDoc(doc(db, "users", resolvedUid)),
            2000,
            null
          );
          if (existingSnap && existingSnap.exists()) {
            const existingName = String(existingSnap.data()?.name || "").trim();
            if (existingName && existingName !== "Valued Customer" && existingName !== "Customer") {
              customerName = existingName;
            }
          }
        } catch {
          // non-blocking
        }
      }

      const newProfile: UserProfile = {
        uid: resolvedUid,
        phone: canonicalPhone,
        role: "customer", // Web platform is exclusively for customers
        name: customerName || "Valued Customer",
        ...(extra?.plateNumber ? { plateNumber: extra.plateNumber } : {}),
        createdAt: Date.now(),
      };

      // Update React state & localStorage immediately without blocking on Firestore WebChannel commit ack
      setProfile(newProfile);
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));

      // Background client Firestore sync (Server Action also persists users/{resolvedUid})
      void setDoc(doc(db, "users", resolvedUid), newProfile, { merge: true }).catch(() => {});
      return true;
    } catch (err) {
      console.error("Login failed:", err);
      return false;
    }
  };

  const loginAsAdmin = async (): Promise<boolean> => {
    try {
      let fbUser = auth.currentUser;
      if (!fbUser) {
        const cred = await signInAnonymously(auth);
        fbUser = cred.user;
      }
      const adminProfile: UserProfile = {
        uid: fbUser.uid,
        phone: "0112345678",
        role: "admin",
        name: "Sithumina Dispatch Chief",
        createdAt: Date.now(),
      };
      try {
        await setDoc(doc(db, "users", fbUser.uid), adminProfile, { merge: true });
      } catch (e) {
        console.warn(e);
      }
      setProfile(adminProfile);
      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(adminProfile));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setUser(null);
    setProfile(null);
    localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
  };

  const updateDriverLorry = async (lorryId: string) => {
    if (!profile) return;
    const updated = { ...profile, assignedLorryId: lorryId };
    setProfile(updated);
    localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(updated));
    if (user) {
      try {
        await setDoc(doc(db, "users", user.uid), { assignedLorryId: lorryId }, { merge: true });
      } catch {
        // ignore
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        role: profile?.role || "customer",
        loginWithPhone,
        loginAsAdmin,
        logout,
        updateDriverLorry,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
