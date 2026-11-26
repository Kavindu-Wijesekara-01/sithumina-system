import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { onAuthStateChanged } from "firebase/auth";
import { LoginScreen } from "./src/screens/LoginScreen";
import { AdminDashboard } from "./src/screens/AdminDashboard";
import { DriverInterface } from "./src/screens/DriverInterface";
import { auth } from "./src/config/firebase";
import { endSession, loadSession, type AppSession } from "./src/services/session";

export default function App() {
  const [session, setSession] = useState<AppSession | null>(null);
  const [checking, setChecking] = useState(true);

  // Restores a saved sign-in, and returns to the login screen if it is revoked
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        try {
          setSession(user ? await loadSession() : null);
        } catch (e) {
          console.warn("Could not restore the session:", e);
          setSession(null);
        }
        setChecking(false);
      }),
    []
  );

  const handleLogout = () => {
    setSession(null);
    endSession().catch((e) => console.warn("Sign-out failed:", e));
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        {checking ? (
          <ActivityIndicator size="large" color="#26231B" style={styles.loader} />
        ) : session?.role === "admin" ? (
          <AdminDashboard onLogout={handleLogout} />
        ) : session?.driver ? (
          <DriverInterface driver={session.driver} onLogout={handleLogout} />
        ) : (
          <LoginScreen onLoginSuccess={setSession} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDB813",
  },
  loader: {
    flex: 1,
  },
});
