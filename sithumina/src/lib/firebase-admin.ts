/**
 * Firebase Admin SDK, server only. It bypasses Firestore rules, so every caller
 * must be behind a role check (see lib/auth/server.ts).
 *
 * FIREBASE_SERVICE_ACCOUNT holds the service account key, either as JSON or as
 * base64-encoded JSON. Never prefix it with NEXT_PUBLIC_ and never commit it.
 */
import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function createApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return initializeApp({ credential: cert(JSON.parse(json)), projectId });
  }
  // Local emulators need no credentials; Google hosting supplies default ones
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId });
  return initializeApp({ credential: applicationDefault(), projectId });
}

// Created on first use so that building the app does not require credentials
export const adminAuth = (): Auth => getAuth(createApp());
export const adminDb = (): Firestore => getFirestore(createApp());
