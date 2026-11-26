import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as FirebaseAuth from "firebase/auth";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Provided by the React Native build of firebase/auth but absent from its typings
const { getReactNativePersistence } = FirebaseAuth as unknown as {
  getReactNativePersistence: (storage: unknown) => FirebaseAuth.Persistence;
};

// Sithumina Transport Firebase Configuration loaded securely from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize or reuse Firebase App instance
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore
export const db = getFirestore(app);

// Keep the user signed in across app restarts
function createAuth(): Auth {
  if (Platform.OS === "web") return getAuth(app);
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app);
  }
}
export const auth = createAuth();
