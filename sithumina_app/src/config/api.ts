import { auth } from "./firebase";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Active Local Wi-Fi IPv4 fallback for local physical device testing
const DEFAULT_LAN_IP = "10.150.41.72";

// Production Vercel backend fallback
const PRODUCTION_WEB_URL = "https://sithumina-system.vercel.app";

export function getBaseApiUrl(): string {
  // 1. Explicit environment variable takes top precedence
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, "");
  }

  // 2. Web browser environment
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location?.origin) {
      const hostname = window.location.hostname;
      if (hostname !== "localhost" && hostname !== "127.0.0.1") {
        return window.location.origin;
      }
      return `http://${hostname}:3000`;
    }
    return "http://localhost:3000";
  }

  // 3. Expo development connection on physical device or emulator
  const hostUri = Constants.expoConfig?.hostUri;
  if (__DEV__ && hostUri) {
    const detectedIp = hostUri.split(":")[0];
    if (detectedIp && detectedIp !== "localhost" && detectedIp !== "127.0.0.1") {
      return `http://${detectedIp}:3000`;
    }
  }

  // 4. In development, fallback to local Wi-Fi LAN IP
  if (__DEV__) {
    return `http://${DEFAULT_LAN_IP}:3000`;
  }

  // 5. In production APK / standalone build, connect to production Vercel deployment
  return PRODUCTION_WEB_URL;
}

/**
 * Perform a resilient fetch to the backend server with an automatic 2-second timeout
 * so the UI NEVER hangs or buffers indefinitely.
 */
export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit = {},
  timeoutMs: number = 2500
): Promise<{ success: boolean; data?: T; error?: string }> {
  const baseUrl = getBaseApiUrl();
  const url = `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // The server identifies the caller from their Firebase ID token
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        error: errJson.error || `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      success: false,
      error: err?.name === "AbortError" ? "Request timed out" : err?.message || "Network error",
    };
  }
}
