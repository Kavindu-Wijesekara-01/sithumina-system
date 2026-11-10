import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Linking,
} from "react-native";
import * as Location from "expo-location";
import {
  DriverRecord,
  updateLorryGpsLocation,
  updateLorryTripStatus,
  updateLorryLiveTripDetails,
  updateDriverInDb,
  stopLorryLiveBroadcasting,
  updateBookingDispatch,
  LiveTripDetails,
  resolveCityCoordinates,
  resolveSafeLorryDocId,
} from "../services/database";
import { db } from "../config/firebase";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  startGpsTracking,
  stopGpsTracking,
  getCurrentGpsPosition,
  GpsCoordinate,
} from "../services/location";
import { SriLankaMapViewer, MapLorryItem } from "../components/SriLankaMapViewer";
import CityAutocomplete from "../components/CityAutocomplete";
import { CityEntry } from "../data/sri-lanka-cities";

interface DriverInterfaceProps {
  driver: DriverRecord;
  onLogout: () => void;
}

export const DriverInterface: React.FC<DriverInterfaceProps> = ({
  driver,
  onLogout,
}) => {
  // GPS State
  const [isTracking, setIsTracking] = useState(false);
  const [currentCoords, setCurrentCoords] = useState<GpsCoordinate | null>(null);
  const [currentCity, setCurrentCity] = useState<string>("Detecting location...");
  const [lastSyncTime, setLastSyncTime] = useState<string>("Not yet synced");
  const [syncCount, setSyncCount] = useState(0);
  const [syncingNow, setSyncingNow] = useState(false);

  // Modal & Trip States
  const [modalVisible, setModalVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false); // false = Empty, true = Loaded

  // Loaded form fields
  const [startLoc, setStartLoc] = useState("");
  const [endLoc, setEndLoc] = useState("");
  const [emptyTime, setEmptyTime] = useState("");
  const [returnRoute, setReturnRoute] = useState("");
  const [finalDest, setFinalDest] = useState("");

  // Empty form fields
  const [currentLocName, setCurrentLocName] = useState("");
  const [travelRoute, setTravelRoute] = useState("");
  const [emptyEndDest, setEmptyEndDest] = useState("");
  const [availSpace, setAvailSpace] = useState("Full (100%)");
  const [availKg, setAvailKg] = useState("3,000 Kg");
  const [hasFreezer, setHasFreezer] = useState(false);
  const [hasHelper, setHasHelper] = useState(true);

  // Via Town waypoints & autocomplete input
  const [viaWaypoints, setViaWaypoints] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [viaInput, setViaInput] = useState("");

  // Real Vehicle Number: Never default to dummy WP-R1001
  const initialPlate =
    driver.plate && !driver.plate.toUpperCase().startsWith("WP-R") && !driver.plate.toUpperCase().startsWith("WP LK-XXXX")
      ? driver.plate
      : "";
  const [enteredVehiclePlate, setEnteredVehiclePlate] = useState(initialPlate);

  const plateStorageKey = `@sithumina_driver_real_plate_${(driver.driverId || driver.id || "default").toUpperCase()}`;

  // Load persistently stored per-driver vehicle plate ONLY when driver record lacks a plate
  useEffect(() => {
    if (initialPlate) return;
    AsyncStorage.getItem(plateStorageKey).then((saved) => {
      if (saved && saved.trim()) {
        const cleaned = saved.trim().toUpperCase();
        setEnteredVehiclePlate(cleaned);
        driverRef.current.plate = cleaned;
      }
    });
  }, [initialPlate, plateStorageKey]);

  // Active confirmed trip summary
  const [activeTrip, setActiveTrip] = useState<LiveTripDetails | null>(null);
  const activeTripRef = useRef<LiveTripDetails | null>(null);
  activeTripRef.current = activeTrip;

  const [liveDriver, setLiveDriver] = useState<DriverRecord>(() => ({
    ...driver,
    lorryId: resolveSafeLorryDocId(
      driver.lorryId,
      driver.plate,
      driver.driverId || driver.id
    ),
  }));

  const driverRef = useRef(liveDriver);
  driverRef.current = liveDriver;

  // Keep driver profile synced live from Firestore drivers/{driverId} so cached sessions heal automatically
  useEffect(() => {
    const targetId = String(driver.driverId || driver.id || "").trim();
    if (!targetId || targetId.includes("/")) return;
    const unsub = onSnapshot(
      doc(db, "drivers", targetId),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setLiveDriver((prev) => {
          const nextName = String(d.name || "").trim();
          const nextPhone = String(d.phone || "").trim();
          const nextPlate = String(d.plate || "").trim();
          const nextDriverId = String(d.driverId || targetId);
          return {
            ...prev,
            driverId: nextDriverId,
            name:
              nextName && nextName !== "Driver" && nextName !== "Unassigned"
                ? nextName
                : prev.name,
            phone: nextPhone || prev.phone,
            plate: nextPlate || prev.plate,
            vehicleType: d.vehicleType || prev.vehicleType,
            route: d.route || prev.route,
            lorryId: resolveSafeLorryDocId(
              d.lorryId || prev.lorryId,
              nextPlate || prev.plate,
              nextDriverId
            ),
          };
        });
      },
      () => {}
    );
    return () => unsub();
  }, [driver.driverId, driver.id]);

  // ---- Dispatch notifications from head office ----
  interface DispatchRecord {
    id: string;
    bookingId: string;
    riderId?: string;
    driverId?: string;
    driverName?: string;
    driverPhone?: string;
    assignedPlate?: string;
    customerName: string;
    customerPhone: string;
    pickupCity: string;
    deliveryCity: string;
    pickupLat?: number;
    pickupLng?: number;
    cargo: string;
    vehicleType: string;
    date: string;
    dates?: string[];
    status: string;
    hasPaymentSlip?: boolean;
    paymentSlipStatus?: string;
    quotedAmount?: number;
    createdAt: number;
    updatedAt?: number;
  }
  const [pendingDispatches, setPendingDispatches] = useState<DispatchRecord[]>([]);

  const normalizePlateKey = (plate?: string): string =>
    String(plate || "")
      .trim()
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase();

  const normalizePhoneTail9 = (phone?: string): string => {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.length >= 9 ? digits.slice(-9) : digits;
  };

  useEffect(() => {
    const driverIdUpper = String(driver.driverId || driver.id || "").trim().toUpperCase();
    const driverIdLower = String(driver.driverId || driver.id || "").trim().toLowerCase();
    const driverNameLower = String(driver.name || "").trim().toLowerCase();
    const driverPhone9 = normalizePhoneTail9(driver.phone);

    const matchedLorryIds = new Set<string>();
    if (driver.lorryId) matchedLorryIds.add(driver.lorryId);
    if (driverIdLower) matchedLorryIds.add(`lorry-${driverIdLower}`);

    const matchedPlates = new Set<string>();
    const initialNormPlate = normalizePlateKey(driver.plate);
    if (initialNormPlate && !initialNormPlate.startsWith("WPR") && !initialNormPlate.startsWith("WPLKXXXX")) {
      matchedPlates.add(initialNormPlate);
      matchedLorryIds.add(`lorry-${initialNormPlate.toLowerCase()}`);
    }
    const activeEnteredNorm = normalizePlateKey(enteredVehiclePlate);
    if (activeEnteredNorm) {
      matchedPlates.add(activeEnteredNorm);
      matchedLorryIds.add(`lorry-${activeEnteredNorm.toLowerCase()}`);
    }

    let fleetLorryIds = new Set<string>(matchedLorryIds);
    let fleetPlates = new Set<string>(matchedPlates);
    let individualBookingIds = new Set<string>();
    let latestSnapDocs: Array<{ id: string; data: Record<string, any> }> = [];

    const recomputeDispatches = () => {
      const byBooking = new Map<string, DispatchRecord>();
      for (const entry of latestSnapDocs) {
        const data = entry.data;
        const bookingId = String(
          data.bookingId || (entry.id.startsWith("dispatch-") ? entry.id.replace(/^dispatch-/, "") : entry.id)
        );
        // Strictly ignore Individual Vehicle bookings in Driver Mobile App; only live/empty lorry dispatches appear here
        if (
          data.bookingType === "individual_vehicle" ||
          individualBookingIds.has(bookingId)
        ) {
          continue;
        }
        const st = String(data.status || "pending_acceptance").toLowerCase();
        if (
          st !== "pending_acceptance" &&
          st !== "accepted" &&
          st !== "goods_collected" &&
          st !== "in_transit"
        ) {
          continue;
        }

        const dRiderId = String(data.riderId || "").trim();
        const dDriverId = String(data.driverId || "").trim().toUpperCase();
        const dPlateNorm = normalizePlateKey(data.assignedPlate || data.vehiclePlate || "");
        const dPhone9 = normalizePhoneTail9(data.driverPhone);

        const belongsToDriver =
          (dRiderId && fleetLorryIds.has(dRiderId)) ||
          (driverIdUpper && dDriverId === driverIdUpper) ||
          (dPlateNorm && fleetPlates.has(dPlateNorm)) ||
          (driverPhone9 && dPhone9 === driverPhone9);

        if (!belongsToDriver) continue;

        const rec: DispatchRecord = {
          id: entry.id,
          bookingId,
          riderId: dRiderId || undefined,
          driverId: data.driverId || undefined,
          driverName:
            data.driverName && data.driverName !== "Driver" && data.driverName !== "Unassigned"
              ? data.driverName
              : undefined,
          driverPhone: data.driverPhone || undefined,
          assignedPlate: data.assignedPlate || data.vehiclePlate || undefined,
          customerName: data.customerName || "Customer",
          customerPhone: data.customerPhone || "",
          pickupCity: data.pickupCity || "",
          deliveryCity: data.deliveryCity || "",
          pickupLat: typeof data.pickupLat === "number" ? data.pickupLat : undefined,
          pickupLng: typeof data.pickupLng === "number" ? data.pickupLng : undefined,
          cargo: data.cargo || "",
          vehicleType: data.vehicleType || "",
          date: data.date || "",
          dates: Array.isArray(data.dates) ? data.dates : undefined,
          status: st,
          hasPaymentSlip: Boolean(
            data.hasPaymentSlip ||
            data.paymentSlipStatus === "approved" ||
            data.paymentSlipStatus === "pending" ||
            data.paymentSlipStatus === "manual_approved" ||
            data.paymentSlipId
          ),
          paymentSlipStatus: data.paymentSlipStatus || "",
          quotedAmount: typeof data.quotedAmount === "number" ? data.quotedAmount : undefined,
          createdAt: Number(data.createdAt) || Date.now(),
          updatedAt: Number(data.updatedAt) || Number(data.createdAt) || 0,
        };

        const existing = byBooking.get(bookingId);
        const preferCandidate =
          !existing ||
          (entry.id.startsWith("dispatch-") && !existing.id.startsWith("dispatch-")) ||
          ((rec.updatedAt || 0) > (existing.updatedAt || 0) && entry.id.startsWith("dispatch-") === existing.id.startsWith("dispatch-"));

        if (preferCandidate) {
          byBooking.set(bookingId, rec);
        }
      }

      const items = Array.from(byBooking.values()).sort((a, b) => {
        const weight = (s: string) => (s === "pending_acceptance" ? 0 : s === "accepted" ? 1 : 2);
        const diff = weight(a.status) - weight(b.status);
        if (diff !== 0) return diff;
        return b.createdAt - a.createdAt;
      });
      setPendingDispatches(items);
    };

    const unsubFleet = onSnapshot(
      collection(db, "lorries_registry"),
      (snap) => {
        const nextIds = new Set<string>(matchedLorryIds);
        const nextPlates = new Set<string>(matchedPlates);
        snap.forEach((d) => {
          const data = d.data();
          const fDriverId = String(data.driverId || "").trim().toUpperCase();
          const fDriverName = String(data.driverName || "").trim().toLowerCase();
          const fPhone9 = normalizePhoneTail9(data.driverPhone);
          const fPlateNorm = normalizePlateKey(data.plate);

          if (
            (driverIdUpper && fDriverId === driverIdUpper) ||
            (driverNameLower && fDriverName === driverNameLower) ||
            (driverPhone9 && fPhone9 === driverPhone9) ||
            (fPlateNorm && matchedPlates.has(fPlateNorm))
          ) {
            nextIds.add(d.id);
            if (data.id) nextIds.add(String(data.id));
            if (fPlateNorm) {
              nextPlates.add(fPlateNorm);
              nextIds.add(`lorry-${fPlateNorm.toLowerCase()}`);
            }
          }
        });
        fleetLorryIds = nextIds;
        fleetPlates = nextPlates;
        recomputeDispatches();
      },
      () => {
        // Ignore if offline or rule prevents read
      }
    );

    // Individual vehicle bookings are handled completely by Admin and never streamed to driver phones
    const unsubBookingsGuard = () => {};

    const unsubDispatches = onSnapshot(
      collection(db, "dispatches"),
      (snap) => {
        latestSnapDocs = snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, any>,
        }));
        recomputeDispatches();
      },
      (err: any) => {
        if (err?.code !== "permission-denied" && !err?.message?.includes("insufficient permissions")) {
          console.warn("Dispatch subscription notice:", err);
        }
      }
    );

    return () => {
      unsubFleet();
      unsubBookingsGuard();
      unsubDispatches();
    };
  }, [driver.driverId, driver.id, driver.lorryId, driver.name, driver.phone, driver.plate, enteredVehiclePlate]);

  const resolvePlateForDispatch = (dispatch: DispatchRecord) =>
    dispatch.assignedPlate ||
    (enteredVehiclePlate && enteredVehiclePlate.trim().toUpperCase()) ||
    liveDriver.plate ||
    driver.plate ||
    "";

  const cleanRealDriverName = (name?: string) => {
    const t = String(name || "").trim();
    return t && t !== "Driver" && t !== "Unassigned" ? t : "";
  };

  const resolveDriverIdentity = (dispatch: DispatchRecord) => {
    const resolvedName =
      cleanRealDriverName(liveDriver.name) ||
      cleanRealDriverName(driver.name) ||
      cleanRealDriverName(dispatch.driverName) ||
      "";
    const resolvedPhone =
      String(liveDriver.phone || "").trim() ||
      String(driver.phone || "").trim() ||
      String(dispatch.driverPhone || "").trim() ||
      "";
    return {
      driverId: liveDriver.driverId || driver.driverId,
      driverName: resolvedName || undefined,
      driverPhone: resolvedPhone || undefined,
    };
  };

  const handleAcceptDispatch = async (dispatch: DispatchRecord) => {
    try {
      const plateToUse = resolvePlateForDispatch(dispatch);
      const lorryToUse = dispatch.riderId || liveDriver.lorryId || driver.lorryId;
      const identity = resolveDriverIdentity(dispatch);
      await setDoc(
        doc(db, "dispatches", dispatch.id),
        {
          status: "accepted",
          driverId: identity.driverId,
          ...(identity.driverName ? { driverName: identity.driverName } : {}),
          ...(identity.driverPhone ? { driverPhone: identity.driverPhone } : {}),
          assignedPlate: plateToUse,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      if (dispatch.bookingId) {
        await updateBookingDispatch({
          id: dispatch.bookingId,
          status: "assigned",
          assignedLorryId: lorryToUse,
          ...(identity.driverName ? { assignedDriverName: identity.driverName } : {}),
          ...(identity.driverPhone ? { assignedDriverPhone: identity.driverPhone } : {}),
          assignedPlate: plateToUse,
        });
      }
      Alert.alert("Accepted", "Booking accepted and synced with Head Office & Customer. Navigate to pickup location.");
    } catch (err) {
      Alert.alert("Error", "Could not accept dispatch. Please retry.");
    }
  };

  const handleGoodsCollectedDispatch = async (dispatch: DispatchRecord) => {
    try {
      const plateToUse = resolvePlateForDispatch(dispatch);
      const lorryToUse = dispatch.riderId || liveDriver.lorryId || driver.lorryId;
      const identity = resolveDriverIdentity(dispatch);
      await setDoc(
        doc(db, "dispatches", dispatch.id),
        {
          status: "goods_collected",
          driverId: identity.driverId,
          ...(identity.driverName ? { driverName: identity.driverName } : {}),
          ...(identity.driverPhone ? { driverPhone: identity.driverPhone } : {}),
          assignedPlate: plateToUse,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      if (dispatch.bookingId) {
        await updateBookingDispatch({
          id: dispatch.bookingId,
          status: "goods_collected",
          assignedLorryId: lorryToUse,
          ...(identity.driverName ? { assignedDriverName: identity.driverName } : {}),
          ...(identity.driverPhone ? { assignedDriverPhone: identity.driverPhone } : {}),
          assignedPlate: plateToUse,
        });
      }
      Alert.alert(
        "භාණ්ඩය භාරගත්තා (Goods Collected)",
        "භාණ්ඩය පටවාගත් බව ප්‍රධාන කාර්යාලය (Admin) සහ පාරිභෝගිකයා වෙත යාවත්කාලීන විය."
      );
    } catch (err) {
      Alert.alert("Error", "Could not update status. Please retry.");
    }
  };

  const handleStartTripDispatch = async (dispatch: DispatchRecord) => {
    try {
      const plateToUse = resolvePlateForDispatch(dispatch);
      const lorryToUse = dispatch.riderId || liveDriver.lorryId || driver.lorryId;
      const identity = resolveDriverIdentity(dispatch);
      await setDoc(
        doc(db, "dispatches", dispatch.id),
        {
          status: "in_transit",
          driverId: identity.driverId,
          ...(identity.driverName ? { driverName: identity.driverName } : {}),
          ...(identity.driverPhone ? { driverPhone: identity.driverPhone } : {}),
          assignedPlate: plateToUse,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      if (dispatch.bookingId) {
        await updateBookingDispatch({
          id: dispatch.bookingId,
          status: "in_transit",
          assignedLorryId: lorryToUse,
          ...(identity.driverName ? { assignedDriverName: identity.driverName } : {}),
          ...(identity.driverPhone ? { assignedDriverPhone: identity.driverPhone } : {}),
          assignedPlate: plateToUse,
        });
      }
      Alert.alert("In Transit", "Trip marked as In Transit. Customer can now track progress.");
    } catch (err) {
      Alert.alert("Error", "Could not update trip status. Please retry.");
    }
  };

  const handleCompleteDispatch = async (dispatch: DispatchRecord) => {
    try {
      const plateToUse = resolvePlateForDispatch(dispatch);
      const lorryToUse = dispatch.riderId || liveDriver.lorryId || driver.lorryId;
      const identity = resolveDriverIdentity(dispatch);
      await setDoc(
        doc(db, "dispatches", dispatch.id),
        {
          status: "completed",
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      if (dispatch.bookingId) {
        await updateBookingDispatch({
          id: dispatch.bookingId,
          status: "delivered",
          assignedLorryId: lorryToUse,
          ...(identity.driverName ? { assignedDriverName: identity.driverName } : {}),
          ...(identity.driverPhone ? { assignedDriverPhone: identity.driverPhone } : {}),
          assignedPlate: plateToUse,
        });
      }
      Alert.alert("Completed", "Delivery marked as completed.");
    } catch (err) {
      Alert.alert("Error", "Could not complete delivery. Please retry.");
    }
  };

  const handleDeclineDispatch = async (dispatch: DispatchRecord) => {
    try {
      const docRef = doc(db, "dispatches", dispatch.id);
      await updateDoc(docRef, { status: "declined", updatedAt: Date.now() });
    } catch (err) {
      console.warn("Decline dispatch error:", err);
    }
  };

  const openGoogleMaps = (city: string, lat?: number, lng?: number) => {
    let url = "";
    if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    } else {
      const encoded = encodeURIComponent(city + ", Sri Lanka");
      url = `https://maps.google.com/maps?q=${encoded}`;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert("Error", "Could not open Google Maps.");
    });
  };

  const customerMapPins = pendingDispatches
    .filter((d) => d.status === "pending_acceptance" || d.status === "accepted")
    .map((d) => {
      let lat = typeof d.pickupLat === "number" && Number.isFinite(d.pickupLat) ? d.pickupLat : null;
      let lng = typeof d.pickupLng === "number" && Number.isFinite(d.pickupLng) ? d.pickupLng : null;
      if (lat === null || lng === null) {
        const resolved = resolveCityCoordinates(d.pickupCity);
        if (resolved) {
          lat = resolved[0];
          lng = resolved[1];
        }
      }
      if (lat === null || lng === null) return null;
      return {
        lat,
        lng,
        title: d.customerName || "Customer Pickup",
        subtitle: `${d.pickupCity} → ${d.deliveryCity}`,
        bookingId: d.bookingId,
        phone: d.customerPhone,
        packageDetails: d.cargo || d.vehicleType,
      };
    })
    .filter(Boolean) as any[];

  const chosenPlate =
    activeTrip?.plate ||
    (enteredVehiclePlate && enteredVehiclePlate.trim().toUpperCase()) ||
    liveDriver.plate ||
    driver.plate;

  // Initial GPS location fetch with high satellite accuracy on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const pos = await getCurrentGpsPosition();
        if (pos && isMounted) {
          setCurrentCoords(pos);
          try {
            const geocode = await Location.reverseGeocodeAsync({
              latitude: pos.latitude,
              longitude: pos.longitude,
            });
            if (geocode && geocode.length > 0 && isMounted) {
              const p = geocode[0];
              const cityName = p.city || p.subregion || p.district || "Sri Lanka";
              setCurrentCity(cityName);
              setCurrentLocName(cityName);
              setStartLoc(cityName);
            }
          } catch {
            if (isMounted) {
              setCurrentCity(`${pos.latitude.toFixed(4)}°N, ${pos.longitude.toFixed(4)}°E`);
            }
          }
        }
      } catch {
        // Fallback
      }
    })();

    return () => {
      isMounted = false;
      stopGpsTracking();
    };
  }, []);

  // Handle live continuous GPS streaming
  const handleLocationUpdate = async (coord: GpsCoordinate) => {
    setCurrentCoords(coord);
    try {
      const curTrip = activeTripRef.current;
      const curDrv = driverRef.current;
      const realPlate =
        curTrip?.plate ||
        enteredVehiclePlate.trim().toUpperCase() ||
        curDrv.plate ||
        driver.plate ||
        "";
      const effectivePlate = realPlate || "WP LK-0000";
      const safeLorryId = resolveSafeLorryDocId(
        curTrip?.lorryId || curDrv.lorryId || driver.lorryId,
        realPlate,
        curDrv.driverId || driver.driverId
      );
      if (!safeLorryId) return;

      const meta = {
        plate: effectivePlate,
        driverName: cleanRealDriverName(curDrv.name) || curDrv.driverId,
        driverId: curDrv.driverId,
        driverPhone: curDrv.phone || "",
        route:
          curTrip?.startLocation && curTrip?.endLocation
            ? `${curTrip.startLocation} → ${curTrip.endLocation}`
            : curTrip?.travelRoute || driver.route || "Island-wide Fleet",
        status: (curTrip?.status || (isLoaded ? "on_trip" : "empty")) as "empty" | "on_trip",
        vehicleType: driver.vehicleType || "Lorry Fleet",
        capacity: curTrip?.availableCapacityKg || availKg || "Standard Payload",
        startLocation: curTrip?.startLocation || (isLoaded ? startLoc.trim() : currentLocName.trim()),
        endLocation: curTrip?.endLocation || (isLoaded ? endLoc.trim() : emptyEndDest.trim()),
        startLat: curTrip?.startLat,
        startLng: curTrip?.startLng,
        endLat: curTrip?.endLat,
        endLng: curTrip?.endLng,
        travelRoute: curTrip?.travelRoute || (isLoaded ? returnRoute.trim() : travelRoute.trim()),
        viaWaypoints: curTrip?.viaWaypoints || (viaWaypoints.length > 0 ? viaWaypoints : undefined),
        emptyTime: curTrip?.emptyTime || (isLoaded ? emptyTime.trim() : undefined),
        returnRoute: curTrip?.returnRoute || (isLoaded ? returnRoute.trim() : undefined),
        finalDestination: curTrip?.finalDestination || (isLoaded ? finalDest.trim() : undefined),
        availableSpace: curTrip?.availableSpace || (!isLoaded ? availSpace : undefined),
        availableCapacityKg: curTrip?.availableCapacityKg || (!isLoaded ? availKg.trim() : undefined),
        hasFreezer: curTrip?.hasFreezer ?? (!isLoaded ? hasFreezer : undefined),
        hasHelper: curTrip?.hasHelper ?? (!isLoaded ? hasHelper : undefined),
      };

      await updateLorryGpsLocation(
        safeLorryId,
        coord.latitude,
        coord.longitude,
        coord.heading,
        coord.speed,
        meta
      );
      setSyncCount((prev) => prev + 1);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("Failed to stream GPS:", err);
    }
  };

  const currentCoordsRef = useRef<GpsCoordinate | null>(currentCoords);
  currentCoordsRef.current = currentCoords;

  const isTrackingRef = useRef(isTracking);
  isTrackingRef.current = isTracking;

  // Idle heartbeat loop (every 25 seconds) to keep Firestore updatedAt fresh when vehicle is stationary
  useEffect(() => {
    if (!isTracking) return;

    let isCancelled = false;

    const interval = setInterval(async () => {
      if (isCancelled || !isTrackingRef.current) return;
      try {
        if (currentCoordsRef.current) {
          await handleLocationUpdate(currentCoordsRef.current);
        }
      } catch (err) {
        // Continue broadcasting smoothly
      }
    }, 25000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isTracking]);

  // Open the Trip Details Modal to start or edit live broadcasting
  const handleOpenLiveModal = () => {
    if (activeTrip) {
      setIsLoaded(activeTrip.status === "on_trip");
      if (activeTrip.plate) setEnteredVehiclePlate(activeTrip.plate);
      if (activeTrip.startLocation) {
        setStartLoc(activeTrip.startLocation);
        setCurrentLocName(activeTrip.startLocation);
      }
      if (activeTrip.endLocation) {
        setEndLoc(activeTrip.endLocation);
        setEmptyEndDest(activeTrip.endLocation);
      }
      if (activeTrip.viaWaypoints && activeTrip.viaWaypoints.length > 0) {
        setViaWaypoints(activeTrip.viaWaypoints);
      }
      if (activeTrip.travelRoute) setTravelRoute(activeTrip.travelRoute);
      if (activeTrip.returnRoute) setReturnRoute(activeTrip.returnRoute);
      if (activeTrip.emptyTime) setEmptyTime(activeTrip.emptyTime);
      if (activeTrip.finalDestination) setFinalDest(activeTrip.finalDestination);
      if (activeTrip.availableSpace) setAvailSpace(activeTrip.availableSpace);
      if (activeTrip.availableCapacityKg) setAvailKg(activeTrip.availableCapacityKg);
    } else {
      if (!startLoc && currentCity !== "Detecting location...") {
        setStartLoc(currentCity);
      }
      if (!currentLocName && currentCity !== "Detecting location...") {
        setCurrentLocName(currentCity);
      }
    }
    setModalVisible(true);
  };

  const handleAddViaTown = (city: CityEntry, targetType: "loaded" | "empty") => {
    if (viaWaypoints.length >= 3) return;
    if (!viaWaypoints.some((w) => w.name.toLowerCase() === city.name.toLowerCase())) {
      const next = [...viaWaypoints, { name: city.name, lat: city.lat, lng: city.lng }];
      setViaWaypoints(next);
      const routeStr = "via " + next.map((w) => w.name).join(" → ");
      if (targetType === "loaded") {
        setReturnRoute(routeStr);
      } else {
        setTravelRoute(routeStr);
      }
    }
    setViaInput("");
  };

  const handleRemoveViaTown = (indexToRemove: number, targetType: "loaded" | "empty") => {
    const next = viaWaypoints.filter((_, i) => i !== indexToRemove);
    setViaWaypoints(next);
    const routeStr = next.length > 0 ? "via " + next.map((w) => w.name).join(" → ") : "";
    if (targetType === "loaded") {
      setReturnRoute(routeStr);
    } else {
      setTravelRoute(routeStr);
    }
  };

  // Confirm Trip and Start Live GPS Streaming
  const handleConfirmStartLive = async () => {
    const chosenPlate = enteredVehiclePlate.trim().toUpperCase();
    if (!chosenPlate) {
      Alert.alert(
        "Vehicle Number Required (වාහන අංකය ඇතුළත් කරන්න)",
        "Please enter your real lorry number (e.g. WP LB-4521 or SP LK-8902) to start broadcasting."
      );
      return;
    }

    setSyncingNow(true);

    const resolvedLorryId = resolveSafeLorryDocId(
      driverRef.current.lorryId || driver.lorryId,
      chosenPlate,
      driver.driverId
    );

    // Save real vehicle number & guaranteed valid lorryId per driver
    try {
      await AsyncStorage.setItem(plateStorageKey, chosenPlate);
      const healedDriver: DriverRecord = {
        ...driverRef.current,
        plate: chosenPlate,
        lorryId: resolvedLorryId,
      };
      driverRef.current = healedDriver;
      setLiveDriver(healedDriver);
      AsyncStorage.setItem(
        "sithumina_driver_app_session",
        JSON.stringify({ role: "driver", driver: healedDriver })
      ).catch(() => {});
      updateDriverInDb(driver.driverId, {
        plate: chosenPlate,
        lorryId: resolvedLorryId,
      });
    } catch {}

    // Ensure we have exact real hardware GPS coordinate before publishing
    let coordsToUse = currentCoords;
    if (!coordsToUse || (coordsToUse.latitude === 6.9271 && coordsToUse.longitude === 79.8612)) {
      try {
        const freshGps = await getCurrentGpsPosition();
        if (freshGps) {
          coordsToUse = freshGps;
          setCurrentCoords(freshGps);
        }
      } catch {}
    }

    const chosenStart = isLoaded ? startLoc.trim() : currentLocName.trim();
    const chosenEnd = isLoaded ? endLoc.trim() : emptyEndDest.trim();

    if (!chosenStart || !chosenEnd) {
      Alert.alert(
        "Location Required",
        "Please enter both Start Location and Destination before going live so customers see your exact route on the map."
      );
      setSyncingNow(false);
      return;
    }

    if (!isLoaded && viaWaypoints.length < 2) {
      Alert.alert(
        "අතරමග නගර 2ක් හෝ 3ක් අවශ්‍යයි (2-3 Via Towns Required)",
        "ගමන් මාර්ගය සඳහා කරුණාකර අතරමග නගර 2ක් හෝ 3ක් පිළිවෙළින් එක් කරන්න (Please add at least 2 or 3 towns in sequential order along your route)."
      );
      setSyncingNow(false);
      return;
    }

    const startCoords = resolveCityCoordinates(chosenStart);
    const endCoords = resolveCityCoordinates(chosenEnd);

    let finalViaWaypoints = viaWaypoints;
    if (finalViaWaypoints.length === 0) {
      const rawRoute = isLoaded ? returnRoute.trim() : travelRoute.trim();
      if (rawRoute) {
        const tokens = rawRoute.split(/[,;\-\/→]|(?:\bvia\b)|(?:\bthrough\b)|(?:\bto\b)|(?:හරහා)/i);
        const autoVias: Array<{ name: string; lat: number; lng: number }> = [];
        for (const tok of tokens) {
          const t = tok.trim();
          if (t.length < 3) continue;
          const c = resolveCityCoordinates(t);
          if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
            if (startCoords && Math.abs(startCoords[0] - c[0]) < 0.02 && Math.abs(startCoords[1] - c[1]) < 0.02) continue;
            if (endCoords && Math.abs(endCoords[0] - c[0]) < 0.02 && Math.abs(endCoords[1] - c[1]) < 0.02) continue;
            autoVias.push({ name: t, lat: c[0], lng: c[1] });
          }
        }
        if (autoVias.length > 0) finalViaWaypoints = autoVias;
      }
    }

    const tripData: LiveTripDetails = {
      lorryId: resolvedLorryId,
      driverId: driver.driverId,
      driverName: driver.name,
      driverPhone: driver.phone || "",
      vehicleType: driver.vehicleType || "Lorry Fleet",
      plate: chosenPlate,
      status: isLoaded ? "on_trip" : "empty",
      startLocation: chosenStart,
      endLocation: chosenEnd,
      startLat: startCoords ? startCoords[0] : (coordsToUse?.latitude ?? currentCoords?.latitude),
      startLng: startCoords ? startCoords[1] : (coordsToUse?.longitude ?? currentCoords?.longitude),
      endLat: endCoords ? endCoords[0] : undefined,
      endLng: endCoords ? endCoords[1] : undefined,
      travelRoute: isLoaded ? returnRoute.trim() : travelRoute.trim(),
      viaWaypoints: finalViaWaypoints.length > 0 ? finalViaWaypoints : undefined,
      emptyTime: isLoaded ? emptyTime.trim() : undefined,
      returnRoute: isLoaded ? returnRoute.trim() : undefined,
      finalDestination: isLoaded ? finalDest.trim() : undefined,
      availableSpace: !isLoaded ? availSpace : undefined,
      availableCapacityKg: !isLoaded ? availKg.trim() : undefined,
      hasFreezer: !isLoaded ? hasFreezer : undefined,
      hasHelper: !isLoaded ? hasHelper : undefined,
      isLive: true,
      isOnline: true,
      lat: coordsToUse?.latitude ?? currentCoords?.latitude ?? 6.9271,
      lng: coordsToUse?.longitude ?? currentCoords?.longitude ?? 79.8612,
      speedKmH: coordsToUse?.speed ?? currentCoords?.speed ?? 0,
      heading: coordsToUse?.heading ?? currentCoords?.heading ?? 0,
      updatedAt: Date.now(),
    };

    setActiveTrip(tripData);

    try {
      // 1. Update full trip specifications in Firestore & API
      await updateLorryLiveTripDetails(tripData);

      // 2. Start continuous GPS broadcasting
      const started = await startGpsTracking(handleLocationUpdate);
      if (started) {
        setIsTracking(true);
      } else {
        Alert.alert(
          "Permission Required",
          "Please grant Location / GPS permissions in device settings to stream real-time location."
        );
      }
    } catch (e: any) {
      console.warn("Broadcasting start notice:", e);
    }

    setSyncingNow(false);
    setModalVisible(false);
  };

  // Stop Live Broadcasting & immediately remove from website live map & fleet
  const handleStopLive = async () => {
    const activePlate =
      activeTripRef.current?.plate ||
      enteredVehiclePlate.trim().toUpperCase() ||
      driverRef.current.plate ||
      driver.plate;
    const activeLorryId = resolveSafeLorryDocId(
      activeTripRef.current?.lorryId || driverRef.current.lorryId || driver.lorryId,
      activePlate,
      driverRef.current.driverId || driver.driverId
    );
    stopGpsTracking();
    setIsTracking(false);
    setActiveTrip(null);
    try {
      await stopLorryLiveBroadcasting(activeLorryId, activePlate, driver.driverId);
    } catch (err) {
      console.warn("Failed to stop broadcasting:", err);
    }
  };

  // Safe Logout: Stop broadcasting and remove from live map before logging out
  const handleLogout = async () => {
    const activePlate =
      activeTripRef.current?.plate ||
      enteredVehiclePlate.trim().toUpperCase() ||
      driverRef.current.plate ||
      driver.plate;
    const activeLorryId = resolveSafeLorryDocId(
      activeTripRef.current?.lorryId || driverRef.current.lorryId || driver.lorryId,
      activePlate,
      driverRef.current.driverId || driver.driverId
    );
    stopGpsTracking();
    setIsTracking(false);
    setActiveTrip(null);
    try {
      await stopLorryLiveBroadcasting(activeLorryId, activePlate, driver.driverId);
    } catch {}
    onLogout();
  };

  // Manual one-off GPS ping
  const handleManualPing = async () => {
    setSyncingNow(true);
    const pos = await getCurrentGpsPosition();
    if (pos) {
      await handleLocationUpdate(pos);
      Alert.alert(
        "GPS Synced",
        `Location updated!\nLat: ${pos.latitude.toFixed(4)}, Lng: ${pos.longitude.toFixed(4)}`
      );
    } else {
      Alert.alert("GPS Error", "Could not fetch current coordinates. Check device GPS.");
    }
    setSyncingNow(false);
  };

  // Determine effective origin & destination locations
  const effStartLocation = (activeTrip?.startLocation || (isLoaded ? startLoc : currentLocName) || "").trim();
  const effEndLocation = (activeTrip?.endLocation || (isLoaded ? endLoc : emptyEndDest) || "").trim();

  // Resolve exact GPS coordinates for origin and destination
  const resolvedStartCoords = (activeTrip?.startLat && activeTrip?.startLng)
    ? [activeTrip.startLat, activeTrip.startLng]
    : resolveCityCoordinates(effStartLocation);

  const resolvedEndCoords = (activeTrip?.endLat && activeTrip?.endLng)
    ? [activeTrip.endLat, activeTrip.endLng]
    : resolveCityCoordinates(effEndLocation);

  // Prepare map vehicle item for the live OpenStreetMap view
  const mapLorries: MapLorryItem[] = [
    {
      id: resolveSafeLorryDocId(
        activeTrip?.lorryId || liveDriver.lorryId || driver.lorryId,
        chosenPlate,
        liveDriver.driverId || driver.driverId
      ),
      plate: chosenPlate || "My Lorry",
      route:
        effStartLocation && effEndLocation
          ? `${effStartLocation} → ${effEndLocation}`
          : driver.route || "Current Location",
      driverName: driver.name,
      driverPhone: driver.phone,
      status: activeTrip?.status === "on_trip" || isLoaded ? "On trip" : "Empty",
      lat: currentCoords?.latitude || 6.34099,
      lng: currentCoords?.longitude || 80.56950,
      speedKmH: Math.round(currentCoords?.speed || 0),
      heading: Math.round(currentCoords?.heading || 0),
      isOnline: isTracking,
      startLocation: effStartLocation || (currentCoords ? "Current Location" : "Deniyaya"),
      endLocation: effEndLocation,
      startLat: resolvedStartCoords ? resolvedStartCoords[0] : (currentCoords?.latitude ?? 6.34099),
      startLng: resolvedStartCoords ? resolvedStartCoords[1] : (currentCoords?.longitude ?? 80.56950),
      endLat: resolvedEndCoords ? resolvedEndCoords[0] : undefined,
      endLng: resolvedEndCoords ? resolvedEndCoords[1] : undefined,
      travelRoute: activeTrip?.travelRoute || (isLoaded ? returnRoute : travelRoute),
      viaWaypoints: activeTrip?.viaWaypoints || (viaWaypoints.length > 0 ? viaWaypoints : undefined),
      emptyTime: activeTrip?.emptyTime || emptyTime,
      returnRoute: activeTrip?.returnRoute || returnRoute,
      finalDestination: activeTrip?.finalDestination || finalDest,
      availableSpace: activeTrip?.availableSpace || availSpace,
      availableCapacityKg: activeTrip?.availableCapacityKg || availKg,
      hasFreezer: activeTrip?.hasFreezer ?? hasFreezer,
      hasHelper: activeTrip?.hasHelper ?? hasHelper,
    },
  ];

  return (
    <View style={styles.container}>
      {/* 1. Header Bar - Vehicle number NOT shown as requested */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.badgeRow}>
            <View style={styles.driverBadge}>
              <Text style={styles.driverBadgeText}>DRIVER ON DUTY</Text>
            </View>
            <View
              style={[
                styles.liveDot,
                isTracking ? styles.dotLive : styles.dotOffline,
              ]}
            />
          </View>
          <Text style={styles.driverName}>{cleanRealDriverName(liveDriver.name) || liveDriver.driverId}</Text>
          <Text style={styles.driverSub}>
            Rider ID: <Text style={styles.monoId}>{liveDriver.driverId}</Text>
          </Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        {/* DISPATCH NOTIFICATIONS FROM HEAD OFFICE */}
        {pendingDispatches.length > 0 && pendingDispatches.map((dispatch) => {
          const isPending = dispatch.status === "pending_acceptance";
          const isAccepted = dispatch.status === "accepted";
          const isCollected = dispatch.status === "goods_collected";
          const isInTransit = dispatch.status === "in_transit";
          const badgeLabel = isCollected
            ? "📦 GOODS COLLECTED"
            : isInTransit
            ? "TRIP IN TRANSIT"
            : isAccepted
            ? "ACCEPTED / PROCEED TO PICKUP"
            : "NEW BOOKING ASSIGNED";

          return (
            <View
              key={dispatch.id}
              style={[
                styles.dispatchCard,
                (isAccepted || isCollected) ? styles.dispatchCardAccepted : isInTransit ? styles.dispatchCardTransit : null,
              ]}
            >
              <View
                style={[
                  styles.dispatchHeader,
                  (isAccepted || isCollected) ? styles.dispatchHeaderAccepted : isInTransit ? styles.dispatchHeaderTransit : null,
                ]}
              >
                <View style={styles.dispatchBadge}>
                  <Text style={styles.dispatchBadgeText}>{badgeLabel}</Text>
                </View>
                <Text style={styles.dispatchBookingId}>
                  {dispatch.assignedPlate ? `${dispatch.assignedPlate} | ` : ""}
                  {dispatch.bookingId}
                </Text>
              </View>

              <View style={styles.dispatchBody}>
                <View style={styles.dispatchRow}>
                  <Text style={styles.dispatchLabel}>CUSTOMER</Text>
                  <Text style={styles.dispatchValue}>{dispatch.customerName}</Text>
                </View>
                <View style={styles.dispatchRow}>
                  <Text style={styles.dispatchLabel}>PICKUP</Text>
                  <Text style={[styles.dispatchValue, styles.dispatchCity]}>{dispatch.pickupCity}</Text>
                </View>
                <View style={styles.dispatchRow}>
                  <Text style={styles.dispatchLabel}>DESTINATION</Text>
                  <Text style={styles.dispatchValue}>{dispatch.deliveryCity}</Text>
                </View>
                {dispatch.date ? (
                  <View style={styles.dispatchRow}>
                    <Text style={styles.dispatchLabel}>DATE</Text>
                    <Text style={styles.dispatchValue}>{dispatch.date}</Text>
                  </View>
                ) : null}
                {dispatch.cargo ? (
                  <View style={styles.dispatchRow}>
                    <Text style={styles.dispatchLabel}>CARGO</Text>
                    <Text style={styles.dispatchValue}>{dispatch.cargo}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.dispatchActions}>
                {dispatch.customerPhone && (dispatch.hasPaymentSlip || isAccepted || isCollected || isInTransit) ? (
                  <TouchableOpacity
                    style={styles.dispatchCallBtn}
                    onPress={() => Linking.openURL(`tel:${dispatch.customerPhone}`)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.dispatchCallBtnText}>📞 Call Customer</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.dispatchLockedPill}>
                    <Text style={styles.dispatchLockedPillText}>🔒 Phone unlocks on slip upload</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.dispatchNavBtn}
                  onPress={() => openGoogleMaps(dispatch.pickupCity, dispatch.pickupLat, dispatch.pickupLng)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dispatchNavBtnText}>
                    📍 {typeof dispatch.pickupLat === "number" ? "GPS Navigate" : "Pickup Location"}
                  </Text>
                </TouchableOpacity>
                {isPending ? (
                  <>
                    <TouchableOpacity
                      style={styles.dispatchAcceptBtn}
                      onPress={() => handleAcceptDispatch(dispatch)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.dispatchAcceptBtnText}>✓ Accept Job</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.dispatchDeclineBtn}
                      onPress={() => {
                        Alert.alert(
                          "Decline Booking",
                          "Are you sure you want to decline this booking?",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Decline", style: "destructive", onPress: () => handleDeclineDispatch(dispatch) },
                          ]
                        );
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.dispatchDeclineBtnText}>✕ Decline</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                {isAccepted ? (
                  <TouchableOpacity
                    style={[styles.dispatchStartBtn, { backgroundColor: "#FFC20E" }]}
                    onPress={() => handleGoodsCollectedDispatch(dispatch)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dispatchAcceptBtnText, { color: "#26231B" }]}>📦 Mark Goods Collected</Text>
                  </TouchableOpacity>
                ) : null}
                {isCollected ? (
                  <TouchableOpacity
                    style={styles.dispatchStartBtn}
                    onPress={() => handleStartTripDispatch(dispatch)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.dispatchAcceptBtnText}>🚚 Start Trip / In Transit</Text>
                  </TouchableOpacity>
                ) : null}
                {(isAccepted || isCollected || isInTransit) ? (
                  <TouchableOpacity
                    style={styles.dispatchCompleteBtn}
                    onPress={() => handleCompleteDispatch(dispatch)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.dispatchAcceptBtnText}>✓ Complete Delivery</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* 2. REAL SRI LANKA MAP VIEW (Showing rider's real GPS location) */}
        <View style={styles.mapCard}>
          <View style={styles.mapCardHeader}>
            <View>
              <Text style={styles.mapCardTitle}>Sri Lanka Live Map</Text>
              <Text style={styles.mapCardSub}>
                Your Location: <Text style={styles.boldText}>{currentCity}</Text>
              </Text>
            </View>
            <View style={[styles.liveStatusPill, isTracking ? styles.pillLive : styles.pillStandby]}>
              <View style={[styles.pillDot, isTracking ? styles.dotLive : styles.dotOffline]} />
              <Text style={styles.pillText}>{isTracking ? "BROADCASTING" : "STANDBY"}</Text>
            </View>
          </View>

          {/* Leaflet OpenStreetMap Container */}
          <View style={styles.mapViewerWrapper}>
            <SriLankaMapViewer
              lorries={mapLorries}
              selectedPlate={chosenPlate || liveDriver.plate || driver.plate}
              filter="all"
              height={320}
              isMiniMap={false}
              customerPins={customerMapPins}
            />
          </View>
        </View>

        {/* 3. ACTIVE LIVE TRIP BANNER (Visible if broadcasting) */}
        {isTracking && activeTrip && (
          <View style={styles.activeTripCard}>
            <View style={styles.activeTripHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTripTitle}>
                  {activeTrip.status === "on_trip" ? "LOADED TRIP IN PROGRESS" : "EMPTY / AVAILABLE FOR CARGO"}
                </Text>
                <Text style={styles.activeTripRoute}>
                  {activeTrip.startLocation || "Start"} → {activeTrip.endLocation || "Destination"}
                </Text>
              </View>
              <TouchableOpacity style={styles.editTripBtn} onPress={handleOpenLiveModal}>
                <Text style={styles.editTripBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            {/* Loaded Specific Summary */}
            {activeTrip.status === "on_trip" ? (
              <View style={styles.tripMetaGrid}>
                {activeTrip.emptyTime && (
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Emptying Time</Text>
                    <Text style={styles.metaVal}>{activeTrip.emptyTime}</Text>
                  </View>
                )}
                {activeTrip.returnRoute && (
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Return Route</Text>
                    <Text style={styles.metaVal}>{activeTrip.returnRoute}</Text>
                  </View>
                )}
                {activeTrip.finalDestination && (
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Final Destination</Text>
                    <Text style={styles.metaVal}>{activeTrip.finalDestination}</Text>
                  </View>
                )}
              </View>
            ) : (
              /* Empty Specific Summary */
              <View style={styles.emptyBadgesRow}>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>{activeTrip.availableSpace || "Full Space"}</Text>
                </View>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>{activeTrip.availableCapacityKg || "3,000 Kg"}</Text>
                </View>
                {activeTrip.hasFreezer && (
                  <View style={[styles.badgePill, styles.badgePillHighlight]}>
                    <Text style={styles.badgePillHighlightText}>Freezer Available</Text>
                  </View>
                )}
                {activeTrip.hasHelper && (
                  <View style={[styles.badgePill, styles.badgePillHighlight]}>
                    <Text style={styles.badgePillHighlightText}>Helper Onboard</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* 4. MAIN ACTION BUTTON: START / STOP LIVE */}
        <View style={styles.actionCard}>
          {!isTracking ? (
            <TouchableOpacity
              style={styles.startLiveBtn}
              onPress={handleOpenLiveModal}
              activeOpacity={0.85}
              disabled={syncingNow}
            >
              {syncingNow ? (
                <ActivityIndicator color="#26231B" />
              ) : (
                <Text style={styles.startLiveBtnText}>Start Live Broadcasting</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.stopLiveBtn}
              onPress={handleStopLive}
              activeOpacity={0.85}
            >
              <Text style={styles.stopLiveBtnText}>Stop Live Broadcasting</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.manualPingBtn}
            onPress={handleManualPing}
            disabled={syncingNow}
            activeOpacity={0.8}
          >
            <Text style={styles.manualPingBtnText}>Sync GPS Coordinate Now</Text>
          </TouchableOpacity>
        </View>

        {/* 5. GPS TELEMETRY READOUT CARD */}
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryHeader}>
            <Text style={styles.telemetryTitle}>Live GPS Telemetry</Text>
            <Text style={styles.pingsCount}>{syncCount} Pings Sent</Text>
          </View>

          <View style={styles.coordsGrid}>
            <View style={styles.coordBox}>
              <Text style={styles.coordLabel}>LATITUDE</Text>
              <Text style={styles.coordValue}>
                {currentCoords ? currentCoords.latitude.toFixed(5) : "Searching..."}
              </Text>
            </View>
            <View style={styles.coordBox}>
              <Text style={styles.coordLabel}>LONGITUDE</Text>
              <Text style={styles.coordValue}>
                {currentCoords ? currentCoords.longitude.toFixed(5) : "Searching..."}
              </Text>
            </View>
          </View>

          <View style={styles.coordsGrid}>
            <View style={styles.coordBoxSmall}>
              <Text style={styles.coordLabel}>SPEED</Text>
              <Text style={styles.coordValueSmall}>
                {currentCoords ? `${Math.round(currentCoords.speed)} km/h` : "0 km/h"}
              </Text>
            </View>
            <View style={styles.coordBoxSmall}>
              <Text style={styles.coordLabel}>HEADING</Text>
              <Text style={styles.coordValueSmall}>
                {currentCoords ? `${Math.round(currentCoords.heading)}°` : "0°"}
              </Text>
            </View>
            <View style={styles.coordBoxSmall}>
              <Text style={styles.coordLabel}>ACCURACY</Text>
              <Text style={styles.coordValueSmall}>
                {currentCoords?.accuracy ? `±${Math.round(currentCoords.accuracy)}m` : "Good"}
              </Text>
            </View>
          </View>

          <Text style={styles.lastSyncText}>Last Database Sync: {lastSyncTime}</Text>
        </View>
      </ScrollView>

      {/* 6. BOTTOM MODAL: TRIP DETAILS SETUP BEFORE GOING LIVE */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalSheetHeader}>
              <View>
                <Text style={styles.modalTitle}>Trip Information</Text>
                <Text style={styles.modalSub}>Setup your journey before broadcasting live</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="always"
            >
              {/* VEHICLE NUMBER INPUT (Required: entered plate appears on live map) */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.inputLabel}>Vehicle Number (වාහන අංකය) *</Text>
                <TextInput
                  style={[styles.formInput, { borderColor: "#FFC20E", borderWidth: 1.5, fontWeight: "800" }]}
                  placeholder="e.g. WP LB-4521 / SP LK-8902"
                  placeholderTextColor="#8C877A"
                  value={enteredVehiclePlate}
                  onChangeText={setEnteredVehiclePlate}
                  autoCapitalize="characters"
                />
              </View>

              {/* Trip Type Selector: Loaded vs Empty */}
              <Text style={styles.inputSectionLabel}>Select Trip Status:</Text>
              <View style={styles.tripTypeToggleRow}>
                <TouchableOpacity
                  style={[styles.tripTypeCard, !isLoaded && styles.tripTypeCardActive]}
                  onPress={() => setIsLoaded(false)}
                >
                  <Text style={[styles.tripTypeTitle, !isLoaded && styles.tripTypeTitleActive]}>
                    Empty (හිස්ව)
                  </Text>
                  <Text style={styles.tripTypeDesc}>Available for cargo hire</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tripTypeCard, isLoaded && styles.tripTypeCardActive]}
                  onPress={() => setIsLoaded(true)}
                >
                  <Text style={[styles.tripTypeTitle, isLoaded && styles.tripTypeTitleActive]}>
                    Loaded (පටවා ඇත)
                  </Text>
                  <Text style={styles.tripTypeDesc}>On trip with goods</Text>
                </TouchableOpacity>
              </View>

              {/* DYNAMIC FORM 1: IF LOADED */}
              {isLoaded ? (
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Start location (ආරම්භක ස්ථානය) *</Text>
                  <CityAutocomplete
                    value={startLoc}
                    onChangeText={setStartLoc}
                    onSelectCity={(city: CityEntry) => setStartLoc(city.name)}
                    placeholder="e.g. Deniyaya / කොළඹ / Galle"
                    inlineMode={true}
                  />

                  <Text style={styles.inputLabel}>Destination (ගමනාන්තය) *</Text>
                  <CityAutocomplete
                    value={endLoc}
                    onChangeText={setEndLoc}
                    onSelectCity={(city: CityEntry) => setEndLoc(city.name)}
                    placeholder="e.g. Colombo / Kandy / යාපනය"
                    inlineMode={true}
                  />

                  <Text style={styles.inputLabel}>Emptying time (බඩු බා හිස්වන වෙලාව)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Today 4:30 PM / අද සවස 4ට"
                    placeholderTextColor="#8C877A"
                    value={emptyTime}
                    onChangeText={setEmptyTime}
                  />

                  {/* RETURN ROUTE VIA TOWNS BUILDER (2-3 TOWNS IN ORDER) */}
                  <View style={styles.viaSectionCard}>
                    <View style={styles.viaSectionHeader}>
                      <Text style={styles.inputLabel}>
                        🛣️ Return Route via Towns (අතරමග නගර 2ක් හෝ 3ක්)
                      </Text>
                      <View style={viaWaypoints.length >= 2 ? styles.viaPillSuccess : styles.viaPillWarning}>
                        <Text style={viaWaypoints.length >= 2 ? styles.viaPillSuccessText : styles.viaPillWarningText}>
                          {viaWaypoints.length === 3
                            ? "✓ නගර 3ම සම්පූර්ණයි (3/3)"
                            : viaWaypoints.length === 2
                            ? "✓ නගර 2ක් (2/3)"
                            : `${viaWaypoints.length}/3 තෝරා ඇත`}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 11.5, color: "#6F6A5A", marginBottom: 8, lineHeight: 16 }}>
                      ඔබ ආපසු එන අතරමග ප්‍රධාන නගර 2ක් හෝ 3ක් පිළිවෙළින් එක් කරන්න (උදා: 1. Galle ➔ 2. Ratnapura ➔ 3. Kaduwela).
                    </Text>

                    {/* Slot 1 */}
                    {viaWaypoints.length > 0 ? (
                      <View style={styles.viaSlotCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <Text style={styles.viaSlotNumber}>1️⃣ 1 වන නගරය:</Text>
                          <Text style={styles.viaSlotName}>📍 {viaWaypoints[0].name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.viaRemoveBtn}
                          onPress={() => handleRemoveViaTown(0, "loaded")}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.viaRemoveBtnText}>✕ ඉවත් කරන්න</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.viaSlotEmpty}>
                        <Text style={styles.viaSlotEmptyText}>
                          1️⃣ 1 වන නගරය: තෝරා නැත (පහතින් Type කර සොයා Touch කරන්න)
                        </Text>
                      </View>
                    )}

                    {/* Slot 2 */}
                    {viaWaypoints.length > 1 ? (
                      <View style={styles.viaSlotCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <Text style={styles.viaSlotNumber}>2️⃣ 2 වන නගරය:</Text>
                          <Text style={styles.viaSlotName}>📍 {viaWaypoints[1].name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.viaRemoveBtn}
                          onPress={() => handleRemoveViaTown(1, "loaded")}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.viaRemoveBtnText}>✕ ඉවත් කරන්න</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.viaSlotEmpty}>
                        <Text style={styles.viaSlotEmptyText}>
                          2️⃣ 2 වන නගරය: {viaWaypoints.length === 1 ? "තෝරා නැත (පහතින් සොයන්න)" : "(පළමුව 1 වන නගරය තෝරන්න)"}
                        </Text>
                      </View>
                    )}

                    {/* Slot 3 */}
                    {viaWaypoints.length > 2 ? (
                      <View style={styles.viaSlotCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <Text style={styles.viaSlotNumber}>3️⃣ 3 වන නගරය:</Text>
                          <Text style={styles.viaSlotName}>📍 {viaWaypoints[2].name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.viaRemoveBtn}
                          onPress={() => handleRemoveViaTown(2, "loaded")}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.viaRemoveBtnText}>✕ ඉවත් කරන්න</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.viaSlotEmpty}>
                        <Text style={styles.viaSlotEmptyText}>
                          3️⃣ 3 වන නගරය: (විකල්පයි - අවශ්‍ය නම් 3 වන නගරය එක් කරන්න)
                        </Text>
                      </View>
                    )}

                    {/* Autocomplete Input */}
                    {viaWaypoints.length < 3 ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#26231B", marginBottom: 4 }}>
                          {viaWaypoints.length === 0
                            ? "+ 1 වන අතරමග නගරය සොයන්න (Search 1st via town):"
                            : viaWaypoints.length === 1
                            ? "+ 2 වන අතරමග නගරය සොයන්න (Search 2nd via town):"
                            : "+ 3 වන අතරමග නගරය සොයන්න (Search 3rd via town - Optional):"}
                        </Text>
                        <CityAutocomplete
                          value={viaInput}
                          onChangeText={setViaInput}
                          placeholder={
                            viaWaypoints.length === 0
                              ? "උදා: Galle / ගාල්ල (Type කර Touch කරන්න)..."
                              : viaWaypoints.length === 1
                              ? "උදා: Ratnapura / රත්නපුර (Type කර Touch කරන්න)..."
                              : "උදා: Kaduwela / කඩුවෙල (Type කර Touch කරන්න)..."
                          }
                          inlineMode={true}
                          onSelectCity={(city: CityEntry) => handleAddViaTown(city, "loaded")}
                        />
                      </View>
                    ) : (
                      <View style={{ backgroundColor: "#EBF7F0", padding: 8, borderRadius: 8, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, color: "#1E9E5A", fontWeight: "800", textAlign: "center" }}>
                          ✓ නගර 3ම ඇතුළත් කර ඇත. වෙනත් නගරයක් එක් කිරීමට ඉහතින් [✕ ඉවත් කරන්න] ඔබන්න.
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.inputLabel}>Ending point (ගමන අවසන් කරන තැන)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. Peliyagoda Transport Hub"
                    placeholderTextColor="#8C877A"
                    value={finalDest}
                    onChangeText={setFinalDest}
                  />
                </View>
              ) : (
                /* DYNAMIC FORM 2: IF EMPTY */
                <View style={styles.formSection}>
                  <Text style={styles.inputLabel}>Current location (දැනට සිටින ස්ථානය) *</Text>
                  <View style={{ marginBottom: 6 }}>
                    <CityAutocomplete
                      value={currentLocName}
                      onChangeText={setCurrentLocName}
                      onSelectCity={(city: CityEntry) => setCurrentLocName(city.name)}
                      placeholder="e.g. Deniyaya / Galle Fort / කොළඹ"
                      inlineMode={true}
                    />
                    {currentCity && currentCity !== "Detecting location..." && (
                      <TouchableOpacity
                        style={{ alignSelf: "flex-end", marginTop: 4, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: "#E7E2D0", borderRadius: 6 }}
                        onPress={() => setCurrentLocName(currentCity)}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#26231B" }}>📍 Use GPS: {currentCity}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.inputLabel}>End destination (අවසාන ස්ථානය) *</Text>
                  <CityAutocomplete
                    value={emptyEndDest}
                    onChangeText={setEmptyEndDest}
                    onSelectCity={(city: CityEntry) => setEmptyEndDest(city.name)}
                    placeholder="e.g. Colombo / Kandy / මීගමුව"
                    inlineMode={true}
                  />

                  {/* TRAVELING ROUTE VIA TOWNS BUILDER (2-3 TOWNS MANDATORY IN SEQUENTIAL ORDER) */}
                  <View style={styles.viaSectionCard}>
                    <View style={styles.viaSectionHeader}>
                      <Text style={styles.inputLabel}>
                        🛣️ Traveling route via towns (අතරමග නගර 2ක් හෝ 3ක් පිළිවෙළින්) *
                      </Text>
                      <View style={viaWaypoints.length >= 2 ? styles.viaPillSuccess : styles.viaPillWarning}>
                        <Text style={viaWaypoints.length >= 2 ? styles.viaPillSuccessText : styles.viaPillWarningText}>
                          {viaWaypoints.length === 3
                            ? "✓ නගර 3ම සම්පූර්ණයි (3/3)"
                            : viaWaypoints.length === 2
                            ? "✓ නගර 2ක් (2/3) - තව 1ක් විකල්පයි"
                            : `⚠️ නගර 2ක් හෝ 3ක් අවශ්‍යයි (${viaWaypoints.length}/3)`}
                        </Text>
                      </View>
                    </View>

                    <Text style={{ fontSize: 11.5, color: "#6F6A5A", marginBottom: 8, lineHeight: 16 }}>
                      ඔබ යන පාරේ ප්‍රධාන නගර 2ක් හෝ 3ක් පිළිවෙළින් එක් කරන්න (උදා: 1. Galle ➔ 2. Ratnapura ➔ 3. Kaduwela). Map එකේ පාර ඒ අනුව ස්වයංක්‍රීයව වෙනස් වේ.
                    </Text>

                    {/* Sequential Slots (1st, 2nd, 3rd) */}
                    {/* Slot 1 */}
                    {viaWaypoints.length > 0 ? (
                      <View style={styles.viaSlotCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <Text style={styles.viaSlotNumber}>1️⃣ 1 වන නගරය (1st Town):</Text>
                          <Text style={styles.viaSlotName}>📍 {viaWaypoints[0].name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.viaRemoveBtn}
                          onPress={() => handleRemoveViaTown(0, "empty")}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.viaRemoveBtnText}>✕ ඉවත් කරන්න</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.viaSlotEmpty}>
                        <Text style={styles.viaSlotEmptyText}>
                          1️⃣ 1 වන නගරය: තෝරා නැත (පහතින් Type කර සොයා Touch කරන්න)
                        </Text>
                      </View>
                    )}

                    {/* Slot 2 */}
                    {viaWaypoints.length > 1 ? (
                      <View style={styles.viaSlotCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <Text style={styles.viaSlotNumber}>2️⃣ 2 වන නගරය (2nd Town):</Text>
                          <Text style={styles.viaSlotName}>📍 {viaWaypoints[1].name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.viaRemoveBtn}
                          onPress={() => handleRemoveViaTown(1, "empty")}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.viaRemoveBtnText}>✕ ඉවත් කරන්න</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.viaSlotEmpty}>
                        <Text style={styles.viaSlotEmptyText}>
                          2️⃣ 2 වන නගරය: {viaWaypoints.length === 1 ? "තෝරා නැත (අවශ්‍යයි - පහතින් සොයන්න)" : "(පළමුව 1 වන නගරය තෝරන්න)"}
                        </Text>
                      </View>
                    )}

                    {/* Slot 3 */}
                    {viaWaypoints.length > 2 ? (
                      <View style={styles.viaSlotCard}>
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                          <Text style={styles.viaSlotNumber}>3️⃣ 3 වන නගරය (3rd Town):</Text>
                          <Text style={styles.viaSlotName}>📍 {viaWaypoints[2].name}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.viaRemoveBtn}
                          onPress={() => handleRemoveViaTown(2, "empty")}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Text style={styles.viaRemoveBtnText}>✕ ඉවත් කරන්න</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.viaSlotEmpty}>
                        <Text style={styles.viaSlotEmptyText}>
                          3️⃣ 3 වන නගරය: (විකල්පයි - අවශ්‍ය නම් 3 වන නගරය එක් කරන්න)
                        </Text>
                      </View>
                    )}

                    {/* City Search Input for next sequential slot */}
                    {viaWaypoints.length < 3 ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: 11.5, fontWeight: "700", color: "#26231B", marginBottom: 4 }}>
                          {viaWaypoints.length === 0
                            ? "+ 1 වන අතරමග නගරය සොයන්න (Search 1st via town):"
                            : viaWaypoints.length === 1
                            ? "+ 2 වන අතරමග නගරය සොයන්න (Search 2nd via town):"
                            : "+ 3 වන අතරමග නගරය සොයන්න (Search 3rd via town - Optional):"}
                        </Text>
                        <CityAutocomplete
                          value={viaInput}
                          onChangeText={setViaInput}
                          placeholder={
                            viaWaypoints.length === 0
                              ? "උදා: Galle / ගාල්ල (Type කර Touch කරන්න)..."
                              : viaWaypoints.length === 1
                              ? "උදා: Ratnapura / රත්නපුර (Type කර Touch කරන්න)..."
                              : "උදා: Kaduwela / කඩුවෙල (Type කර Touch කරන්න)..."
                          }
                          inlineMode={true}
                          onSelectCity={(city: CityEntry) => handleAddViaTown(city, "empty")}
                        />
                      </View>
                    ) : (
                      <View style={{ backgroundColor: "#EBF7F0", padding: 8, borderRadius: 8, marginTop: 4 }}>
                        <Text style={{ fontSize: 11, color: "#1E9E5A", fontWeight: "800", textAlign: "center" }}>
                          ✓ නගර 3ම ඇතුළත් කර ඇත. වෙනත් නගරයක් එක් කිරීමට අවශ්‍ය නම් ඉහතින් [✕ ඉවත් කරන්න] ඔබන්න.
                        </Text>
                      </View>
                    )}

                    {/* Live Route Flow Preview */}
                    {(currentLocName || emptyEndDest) && (
                      <View style={styles.routeBreadcrumbCard}>
                        <Text style={styles.routeBreadcrumbTitle}>
                          🗺️ සම්පූර්ණ ගමන් මග (Complete Route Flow):
                        </Text>
                        <View style={styles.routeBreadcrumbRow}>
                          <Text style={styles.routeBreadcrumbText}>🚩 {currentLocName || "Start"}</Text>
                          {viaWaypoints.map((wp, idx) => (
                            <React.Fragment key={`${wp.name}-${idx}`}>
                              <Text style={styles.routeBreadcrumbArrow}>➔</Text>
                              <Text style={styles.routeBreadcrumbText}>
                                {idx === 0 ? "1️⃣" : idx === 1 ? "2️⃣" : "3️⃣"} {wp.name}
                              </Text>
                            </React.Fragment>
                          ))}
                          <Text style={styles.routeBreadcrumbArrow}>➔</Text>
                          <Text style={styles.routeBreadcrumbText}>🏁 {emptyEndDest || "Destination"}</Text>
                        </View>
                        {viaWaypoints.length < 2 && (
                          <Text style={styles.routeBreadcrumbWarning}>
                            ⚠️ කරුණාකර අවම වශයෙන් අතරමග නගර 2ක් වත් පිළිවෙළින් එක් කරන්න.
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* LORRY SPECIFICATIONS & CAPACITY */}
                  <Text style={[styles.inputSectionLabel, { marginTop: 12 }]}>
                    Lorry Availability & Capacity (ලොරි රථයේ විස්තර):
                  </Text>

                  <Text style={styles.inputLabel}>Available Space (ඉඩ ප්‍රමාණය)</Text>
                  <View style={styles.pillSelectionRow}>
                    {["Full (100%)", "Half (50%)", "Quarter (25%)"].map((sp) => (
                      <TouchableOpacity
                        key={sp}
                        style={[styles.spacePill, availSpace === sp && styles.spacePillActive]}
                        onPress={() => setAvailSpace(sp)}
                      >
                        <Text style={[styles.spacePillText, availSpace === sp && styles.spacePillTextActive]}>
                          {sp}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Available weight capacity (පැටවිය හැකි බර)</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g. 3,500 Kg or 3.5 Tons"
                    placeholderTextColor="#8C877A"
                    value={availKg}
                    onChangeText={setAvailKg}
                  />

                  {/* CHECKBOX: FREEZER */}
                  <TouchableOpacity
                    style={[styles.checkboxRow, hasFreezer && styles.checkboxRowActive]}
                    onPress={() => setHasFreezer(!hasFreezer)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.checkboxBox, hasFreezer && styles.checkboxBoxActive]}>
                      {hasFreezer && <Text style={styles.checkboxCheck}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkboxTitle}>Freezer Facility Available</Text>
                      <Text style={styles.checkboxDesc}>Refrigerated cold storage truck</Text>
                    </View>
                  </TouchableOpacity>

                  {/* CHECKBOX: HELPER */}
                  <TouchableOpacity
                    style={[styles.checkboxRow, hasHelper && styles.checkboxRowActive]}
                    onPress={() => setHasHelper(!hasHelper)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.checkboxBox, hasHelper && styles.checkboxBoxActive]}>
                      {hasHelper && <Text style={styles.checkboxCheck}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkboxTitle}>Helper / Assistant Available</Text>
                      <Text style={styles.checkboxDesc}>Assistant onboard for loading/unloading</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* ACTION BUTTONS */}
              <TouchableOpacity
                style={styles.confirmGoLiveBtn}
                onPress={handleConfirmStartLive}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmGoLiveBtnText}>Confirm & Go Live</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  // ---- Dispatch card styles ----
  dispatchCard: {
    backgroundColor: "#FFF8E7",
    borderWidth: 2,
    borderColor: "#D49B00",
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    overflow: "hidden",
  },
  dispatchCardAccepted: {
    backgroundColor: "#F2FAF5",
    borderColor: "#1E9E5A",
  },
  dispatchCardTransit: {
    backgroundColor: "#EEF4FF",
    borderColor: "#1A56A8",
  },
  dispatchHeader: {
    backgroundColor: "#D49B00",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dispatchHeaderAccepted: {
    backgroundColor: "#DDF3E4",
  },
  dispatchHeaderTransit: {
    backgroundColor: "#DCE9FF",
  },
  dispatchBadge: {
    backgroundColor: "#26231B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dispatchBadgeText: {
    color: "#FFC20E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  dispatchBookingId: {
    color: "#26231B",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  dispatchBody: {
    padding: 14,
    gap: 8,
  },
  dispatchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  dispatchLabel: {
    color: "#8A7340",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    width: 90,
    marginTop: 2,
  },
  dispatchValue: {
    color: "#26231B",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  dispatchCity: {
    color: "#1A56A8",
    fontSize: 15,
  },
  dispatchActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    alignItems: "stretch",
  },
  dispatchCallBtn: {
    flexGrow: 1,
    minWidth: "45%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#1A56A8",
    backgroundColor: "#EEF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchCallBtnText: {
    color: "#1A56A8",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  dispatchLockedPill: {
    flexGrow: 1,
    minWidth: "45%",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2D9BC",
    backgroundColor: "#FDFBEF",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchLockedPillText: {
    color: "#856A15",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  dispatchNavBtn: {
    flexGrow: 1,
    minWidth: "45%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#26231B",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchNavBtnText: {
    color: "#FFC20E",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  dispatchAcceptBtn: {
    flexGrow: 1,
    minWidth: "45%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#137333",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchAcceptBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  dispatchStartBtn: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#1A56A8",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchCompleteBtn: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#137333",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchDeclineBtn: {
    flexGrow: 1,
    minWidth: "45%",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D32F2F",
    backgroundColor: "#FFF0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchDeclineBtnText: {
    color: "#D32F2F",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#F4F2EA",
  },
  header: {
    backgroundColor: "#26231B",
    paddingTop: Platform.OS === "ios" ? 44 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  driverBadge: {
    backgroundColor: "#3A3528",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  driverBadgeText: {
    color: "#FFC20E",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLive: {
    backgroundColor: "#1E9E5A",
  },
  dotOffline: {
    backgroundColor: "#8C877A",
  },
  driverName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  driverSub: {
    color: "#D9D3BD",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  monoId: {
    color: "#FFC20E",
    fontWeight: "900",
  },
  logoutBtn: {
    backgroundColor: "#363227",
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  logoutBtnText: {
    color: "#FFC20E",
    fontSize: 12,
    fontWeight: "800",
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },

  /* 2. Map Card */
  mapCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E7E2D0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  mapCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mapCardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#26231B",
  },
  mapCardSub: {
    fontSize: 11.5,
    color: "#6F6A5A",
    marginTop: 2,
  },
  boldText: {
    fontWeight: "800",
    color: "#1E9E5A",
  },
  liveStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  pillLive: {
    backgroundColor: "#DDF3E7",
  },
  pillStandby: {
    backgroundColor: "#EAE7DC",
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#26231B",
  },
  mapViewerWrapper: {
    borderRadius: 14,
    overflow: "hidden",
    height: 320,
    backgroundColor: "#EFECE1",
  },

  /* 3. Active Trip Summary Card */
  activeTripCard: {
    backgroundColor: "#26231B",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#FFC20E",
    gap: 10,
  },
  activeTripHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  activeTripTitle: {
    color: "#FFC20E",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  activeTripRoute: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  editTripBtn: {
    backgroundColor: "#363227",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFC20E",
  },
  editTripBtnText: {
    color: "#FFC20E",
    fontSize: 11,
    fontWeight: "800",
  },
  tripMetaGrid: {
    borderTopWidth: 1,
    borderTopColor: "#3B3727",
    paddingTop: 10,
    gap: 6,
  },
  metaCol: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metaLabel: {
    color: "#B2AB92",
    fontSize: 11,
    fontWeight: "700",
  },
  metaVal: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 6,
  },
  badgePill: {
    backgroundColor: "#363227",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  badgePillText: {
    color: "#D9D3BD",
    fontSize: 11,
    fontWeight: "700",
  },
  badgePillHighlight: {
    backgroundColor: "#173B28",
    borderWidth: 1,
    borderColor: "#1E9E5A",
  },
  badgePillHighlightText: {
    color: "#2FE084",
    fontSize: 11,
    fontWeight: "800",
  },

  /* 4. Action Card */
  actionCard: {
    gap: 10,
  },
  startLiveBtn: {
    backgroundColor: "#FFC20E",
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#FFC20E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  startLiveBtnIcon: {
    fontSize: 14,
    fontWeight: "900",
    color: "#26231B",
  },
  startLiveBtnText: {
    color: "#26231B",
    fontSize: 16,
    fontWeight: "900",
  },
  stopLiveBtn: {
    backgroundColor: "#B3121F",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stopLiveBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  manualPingBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E7E2D0",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  manualPingBtnText: {
    color: "#26231B",
    fontSize: 13,
    fontWeight: "800",
  },

  /* 5. Telemetry Card */
  telemetryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E7E2D0",
    gap: 10,
  },
  telemetryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  telemetryTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#26231B",
  },
  pingsCount: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1E9E5A",
  },
  coordsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  coordBox: {
    flex: 1,
    backgroundColor: "#F8F7F2",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E7E2D0",
  },
  coordBoxSmall: {
    flex: 1,
    backgroundColor: "#F8F7F2",
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E7E2D0",
    alignItems: "center",
  },
  coordLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#6F6A5A",
    marginBottom: 2,
  },
  coordValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#26231B",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  coordValueSmall: {
    fontSize: 12,
    fontWeight: "900",
    color: "#26231B",
  },
  lastSyncText: {
    fontSize: 11,
    color: "#6F6A5A",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 2,
  },

  /* 6. Modal Bottom Sheet */
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "88%",
  },
  modalSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E7E2D0",
    paddingBottom: 12,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#26231B",
  },
  modalSub: {
    fontSize: 11.5,
    color: "#6F6A5A",
    fontWeight: "600",
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseBtnText: {
    fontSize: 18,
    color: "#6F6A5A",
    fontWeight: "800",
  },
  modalScroll: {
    gap: 12,
    paddingBottom: 20,
  },

  /* Toggle Cards */
  inputSectionLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: "#26231B",
  },
  tripTypeToggleRow: {
    flexDirection: "row",
    gap: 10,
  },
  tripTypeCard: {
    flex: 1,
    backgroundColor: "#F8F7F2",
    borderRadius: 14,
    padding: 12,
    borderWidth: 2,
    borderColor: "#E7E2D0",
    alignItems: "center",
  },
  tripTypeCardActive: {
    backgroundColor: "#FFF6D6",
    borderColor: "#FFC20E",
  },
  tripTypeIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  tripTypeTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#6F6A5A",
  },
  tripTypeTitleActive: {
    color: "#26231B",
    fontWeight: "900",
  },
  tripTypeDesc: {
    fontSize: 10,
    color: "#8C877A",
    textAlign: "center",
    marginTop: 2,
  },

  /* Form Section */
  formSection: {
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#26231B",
    marginTop: 4,
  },
  formInput: {
    backgroundColor: "#F8F7F2",
    borderWidth: 1.5,
    borderColor: "#E7E2D0",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 13.5,
    fontWeight: "600",
    color: "#26231B",
  },
  inputWithAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  autoDetectBtn: {
    backgroundColor: "#26231B",
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  autoDetectBtnText: {
    color: "#FFC20E",
    fontSize: 12,
    fontWeight: "800",
  },

  /* Pill selection */
  pillSelectionRow: {
    flexDirection: "row",
    gap: 8,
  },
  spacePill: {
    flex: 1,
    backgroundColor: "#F8F7F2",
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: "#E7E2D0",
    alignItems: "center",
  },
  spacePillActive: {
    backgroundColor: "#FFF6D6",
    borderColor: "#FFC20E",
  },
  spacePillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#6F6A5A",
  },
  spacePillTextActive: {
    color: "#26231B",
    fontWeight: "900",
  },

  /* Checkboxes */
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F8F7F2",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#E7E2D0",
  },
  checkboxRowActive: {
    backgroundColor: "#EBF7F0",
    borderColor: "#1E9E5A",
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#8C877A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxBoxActive: {
    backgroundColor: "#1E9E5A",
    borderColor: "#1E9E5A",
  },
  checkboxCheck: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  checkboxTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#26231B",
  },
  checkboxDesc: {
    fontSize: 11,
    color: "#6F6A5A",
  },

  /* Modal action buttons */
  confirmGoLiveBtn: {
    backgroundColor: "#26231B",
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: "#FFC20E",
  },
  confirmGoLiveBtnText: {
    color: "#FFC20E",
    fontSize: 15,
    fontWeight: "900",
  },
  modalCancelBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelBtnText: {
    color: "#6F6A5A",
    fontSize: 13.5,
    fontWeight: "700",
  },

  /* Sequential Via Towns Builder */
  viaSectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: "#E7E2D0",
    marginTop: 6,
    marginBottom: 6,
  },
  viaSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  viaPillWarning: {
    backgroundColor: "#FFF4E5",
    borderColor: "#FF9800",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  viaPillWarningText: {
    color: "#D47500",
    fontSize: 10.5,
    fontWeight: "800",
  },
  viaPillSuccess: {
    backgroundColor: "#EBF7F0",
    borderColor: "#1E9E5A",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  viaPillSuccessText: {
    color: "#1E9E5A",
    fontSize: 10.5,
    fontWeight: "800",
  },
  viaSlotCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8F7F2",
    borderWidth: 1.5,
    borderColor: "#26231B",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  viaSlotEmpty: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAF7",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#C8C4B7",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  viaSlotNumber: {
    fontSize: 12,
    fontWeight: "900",
    color: "#26231B",
    marginRight: 6,
  },
  viaSlotName: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#26231B",
  },
  viaSlotEmptyText: {
    fontSize: 11.5,
    color: "#8C877A",
    fontWeight: "600",
  },
  viaRemoveBtn: {
    backgroundColor: "#B3121F",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  viaRemoveBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  routeBreadcrumbCard: {
    backgroundColor: "#F4F2EA",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#E7E2D0",
  },
  routeBreadcrumbTitle: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#26231B",
    marginBottom: 6,
  },
  routeBreadcrumbRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  routeBreadcrumbText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#26231B",
  },
  routeBreadcrumbArrow: {
    fontSize: 12,
    fontWeight: "900",
    color: "#FFC20E",
    marginHorizontal: 2,
  },
  routeBreadcrumbWarning: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D47500",
    marginTop: 6,
  },
});