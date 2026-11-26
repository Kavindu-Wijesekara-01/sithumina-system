/**
 * New-job alerts: a looping ringtone while the app is running, and push
 * notifications so the phone is alerted when the app is in the background.
 */
import { Platform, Vibration } from "react-native";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";

const CHANNEL_ID = "dispatch";
let player: AudioPlayer | null = null;
let ringing = false;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    // The in-app ringtone already plays while the app is open
    shouldPlaySound: !ringing,
    shouldSetBadge: false,
  }),
});

/** Ring and vibrate until stopRinging() is called. Safe to call repeatedly. */
export async function startRinging(): Promise<void> {
  if (ringing) return;
  ringing = true;
  if (Platform.OS !== "web") Vibration.vibrate([0, 800, 600], true);
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    // The job may have been answered while audio was being set up
    if (!ringing) return;
    if (!player) player = createAudioPlayer(require("../../assets/ring.wav"));
    player.loop = true;
    await player.seekTo(0);
    if (ringing) player.play();
  } catch (e) {
    console.warn("Ringtone could not play:", e);
  }
}

export function stopRinging(): void {
  if (!ringing) return;
  ringing = false;
  Vibration.cancel();
  try {
    player?.pause();
  } catch (e) {
    console.warn("Ringtone could not stop:", e);
  }
}

/**
 * Ask for notification permission and save this phone's push token on the
 * driver record so the server can alert it. Returns false if unavailable.
 */
export async function registerForDispatchPush(driverId: string): Promise<boolean> {
  if (Platform.OS === "web" || !driverId) return false;
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "New bookings",
        importance: Notifications.AndroidImportance.MAX,
        sound: "ring.wav",
        vibrationPattern: [0, 800, 600, 800, 600, 800],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    await setDoc(
      doc(db, "drivers", driverId),
      { expoPushToken: token.data, pushUpdatedAt: Date.now() },
      { merge: true }
    );
    return true;
  } catch (e) {
    console.warn("Push registration failed:", e);
    return false;
  }
}

/** Stop this phone receiving the driver's jobs after logout. */
export async function unregisterDispatchPush(driverId: string): Promise<void> {
  if (!driverId) return;
  try {
    await setDoc(doc(db, "drivers", driverId), { expoPushToken: "" }, { merge: true });
  } catch (e) {
    console.warn("Push unregistration failed:", e);
  }
}
