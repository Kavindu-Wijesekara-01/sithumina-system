"use client";

import SignInForm from "@/components/auth/SignInForm";
import { useAuth } from "@/context/AuthContext";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  loginOutsideEmployeeAction,
  toggleOutsideDutyAction,
  submitOutsideTopupSlipAction,
  getAllTopupSlipsAction,
  getDriverAssignedBookingsAction,
  driverAcceptBookingAction,
  driverUpdateTripRouteAction,
  driverShareLiveGpsAction,
  driverToggleEmptyReturnAction,
  updateBookingStatusAction,
} from "@/actions";
import { formatRs, REGISTRATION_DEPOSIT } from "@/lib/commission";
import {
  StoredOutsideEmployee,
  StoredCommissionTransaction,
  StoredTopupSlip,
  StoredBooking,
} from "@/lib/server-store";
import { SRI_LANKA_CITIES, resolveLocationCoordinates } from "@/lib/sri-lanka-routes";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  BankAccountSetting,
  subscribePaymentBankAccounts,
  DEFAULT_DUMMY_BANK_ACCOUNTS,
} from "@/lib/payment-settings";

interface EmployeePortalProps {
  locale: string;
}

const LOCAL_STORAGE_EMP_KEY = "sithumina_outside_employee_session";

const WAYPOINT_CITY_CHOICES = [
  "Colombo", "Kiribathgoda", "Kadawatha", "Peliyagoda", "Kelaniya", "Wattala",
  "Gampaha", "Nittambuwa", "Negombo", "Ja-Ela", "Katunayake", "Mirigama",
  "Kandy", "Peradeniya", "Katugastota", "Gampola", "Nawalapitiya", "Matale",
  "Kurunegala", "Kegalle", "Mawanella", "Warakapola", "Puttalam", "Chilaw",
  "Kalutara", "Panadura", "Wadduwa", "Beruwala", "Aluthgama", "Bentota",
  "Galle", "Hikkaduwa", "Ambalangoda", "Baddegama", "Elpitiya",
  "Matara", "Weligama", "Akuressa", "Hakmana", "Deniyaya",
  "Hambantota", "Tangalle", "Beliatta", "Ambalantota", "Tissamaharama",
  "Ratnapura", "Avissawella", "Pelmadulla", "Balangoda", "Embilipitiya",
  "Badulla", "Bandarawela", "Haputale", "Ella", "Mahiyanganaya", "Monaragala",
  "Anuradhapura", "Polonnaruwa", "Dambulla", "Habarana",
  "Trincomalee", "Batticaloa", "Jaffna", "Vavuniya"
];

export default function EmployeePortal({ locale }: EmployeePortalProps) {
  const { profile, logout } = useAuth();
  const signedInDriverId = profile?.role === "driver" ? profile.driverId : "";
  const [loadError, setLoadError] = useState("");
  const [employee, setEmployee] = useState<StoredOutsideEmployee | null>(null);
  const [transactions, setTransactions] = useState<StoredCommissionTransaction[]>([]);
  const [slips, setSlips] = useState<StoredTopupSlip[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountSetting[]>(DEFAULT_DUMMY_BANK_ACCOUNTS);
  const [copiedBankId, setCopiedBankId] = useState<string | null>(null);

  // Login form state
  const [nicInput, setNicInput] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Duty toggle state
  const [dutyLoading, setDutyLoading] = useState(false);

  // Driver App & Trip Dispatch state
  const [activeMainTab, setActiveMainTab] = useState<"driver_app" | "wallet">("driver_app");
  const [driverBookings, setDriverBookings] = useState<StoredBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [activeTrip, setActiveTrip] = useState<StoredBooking | null>(null);
  const [selectedWaypoints, setSelectedWaypoints] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [waypointCityInput, setWaypointCityInput] = useState("");
  const [calculatedKm, setCalculatedKm] = useState<number | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [isSharingGps, setIsSharingGps] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; speed: number } | null>(null);
  const [emptyReturnActive, setEmptyReturnActive] = useState(false);
  const [emptyReturnKm, setEmptyReturnKm] = useState(0);
  const [emptyReturnDestination, setEmptyReturnDestination] = useState("Kiribathgoda");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const watchIdRef = React.useRef<number | null>(null);

  // Topup state
  const [topupAmount, setTopupAmount] = useState("5000");
  const [topupBank, setTopupBank] = useState("Bank of Ceylon (BOC)");
  const [topupSlipImage, setTopupSlipImage] = useState<string>("");
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupFeedback, setTopupFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Hydrate session from localStorage
  useEffect(() => {
    const unsub = subscribePaymentBankAccounts((accs) => {
      if (accs && accs.length > 0) {
        setBankAccounts(accs.filter((a) => a.active));
      }
    });
    return () => unsub();
  }, []);

  // Load this owner's records once they are signed in
  useEffect(() => {
    if (signedInDriverId) void refreshEmployeeData(signedInDriverId);
    else {
      setEmployee(null);
      setTransactions([]);
      setSlips([]);
    }
  }, [signedInDriverId]);

  const refreshEmployeeData = async (idNum: string) => {
    try {
      setLoadError("");
      const res = await loginOutsideEmployeeAction(idNum);
      if (!res.success) setLoadError(res.error);
      if (res.success && res.data) {
        setEmployee(res.data.employee);
        setTransactions(res.data.transactions || []);
        try {
          localStorage.setItem(LOCAL_STORAGE_EMP_KEY, JSON.stringify(res.data.employee));
        } catch {}
      }
      // load slips
      const slipsRes = await getAllTopupSlipsAction();
      if (slipsRes.success && slipsRes.data) {
        setSlips(
          slipsRes.data
        );
      }
    } catch (e) {
      console.warn("Could not refresh employee data:", e);
      setLoadError("Your records could not be loaded. Please try again.");
    }
  };

  const loadDriverBookings = async (targetId: string) => {
    try {
      setLoadingBookings(true);
      const res = await getDriverAssignedBookingsAction(targetId);
      if (res.success && res.data) {
        setDriverBookings(res.data);
        const currentActive = res.data.find(
          (b) =>
            b.status === "in_transit" ||
            b.status === "goods_collected" ||
            b.driverTripStatus === "accepted" ||
            b.isEmptyReturnActive
        );
        if (currentActive) {
          setActiveTrip(currentActive);
          if (Array.isArray(currentActive.waypoints)) {
            setSelectedWaypoints(currentActive.waypoints);
          }
          if (currentActive.actualDistanceKm) {
            setCalculatedKm(currentActive.actualDistanceKm);
          }
          if (currentActive.isEmptyReturnActive) {
            setEmptyReturnActive(true);
            setEmptyReturnKm(currentActive.emptyReturnDistanceKm || 0);
          }
        }
      }
    } catch (e) {
      console.warn("Could not load driver bookings:", e);
    } finally {
      setLoadingBookings(false);
    }
  };

  useEffect(() => {
    if (!employee) return;
    const cleanDriverId = (employee.driverId || employee.id || "").trim().toLowerCase();
    const cleanPlate = (employee.plateNumber || "").trim().toUpperCase();

    void loadDriverBookings(cleanDriverId || cleanPlate);

    try {
      const mine = query(collection(db, "bookings"), where("assignedDriverId", "==", signedInDriverId));
      const unsub = onSnapshot(mine, (snap) => {
        const list: StoredBooking[] = [];
        snap.forEach((d) => {
          const data = d.data() as StoredBooking;
          const bDriverId = (data.assignedDriverId || "").trim().toLowerCase();
          const bPlate = (data.assignedPlate || data.selectedVehiclePlate || "").trim().toUpperCase();
          if (
            (cleanDriverId && bDriverId === cleanDriverId) ||
            (cleanPlate && bPlate === cleanPlate) ||
            (employee.phone && data.assignedDriverPhone && data.assignedDriverPhone.includes(employee.phone))
          ) {
            list.push({ ...data, id: data.id || d.id });
          }
        });
        if (list.length > 0) {
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          setDriverBookings(list);
          const currentActive = list.find(
            (b) =>
              b.status === "in_transit" ||
              b.status === "goods_collected" ||
              b.driverTripStatus === "accepted" ||
              b.isEmptyReturnActive
          );
          if (currentActive && !activeTrip) {
            setActiveTrip(currentActive);
            if (Array.isArray(currentActive.waypoints)) {
              setSelectedWaypoints(currentActive.waypoints);
            }
          }
        }
      });
      return () => unsub();
    } catch (e) {
      console.warn("Firestore bookings snapshot notice:", e);
    }
  }, [employee]);

  const recalculateDistance = async (
    startCity: string,
    endCity: string,
    waypoints: Array<{ name: string; lat: number; lng: number }>
  ) => {
    setCalcLoading(true);
    try {
      const startCoord = resolveLocationCoordinates(startCity);
      const endCoord = resolveLocationCoordinates(endCity);
      if (!startCoord || !endCoord) {
        setCalcLoading(false);
        return;
      }
      const coords: [number, number][] = [
        startCoord,
        ...waypoints.map((w) => [w.lat, w.lng] as [number, number]),
        endCoord,
      ];
      const pointsStr = coords.map((c) => `${c[1].toFixed(5)},${c[0].toFixed(5)}`).join(";");
      const res = await fetch(`/api/routing?points=${pointsStr}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.distanceKm === "number") {
          setCalculatedKm(data.distanceKm);
          setCalcLoading(false);
          return;
        }
      }

      // Fallback
      let total = 0;
      for (let i = 0; i < coords.length - 1; i++) {
        const p1 = coords[i];
        const p2 = coords[i + 1];
        const dLat = ((p2[0] - p1[0]) * Math.PI) / 180;
        const dLon = ((p2[1] - p1[1]) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((p1[0] * Math.PI) / 180) *
            Math.cos((p2[0] * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        total += 6371 * c * 1.25;
      }
      setCalculatedKm(Number(total.toFixed(1)));
    } catch {
      // Fallback
    } finally {
      setCalcLoading(false);
    }
  };

  const handleAddWaypoint = (cityName: string) => {
    if (selectedWaypoints.length >= 3) {
      alert("උපරිම අතරමැදි නගර 3ක් පමණක් තෝරාගත හැකිය (Maximum 3 waypoints allowed).");
      return;
    }
    const cleanCity = cityName.trim();
    if (!cleanCity) return;
    const coords = resolveLocationCoordinates(cleanCity);
    if (!coords) {
      alert(`නගරය හඳුනාගත නොහැක: "${cleanCity}". කරුණාකර ලැයිස්තුවෙන් නගරයක් තෝරන්න.`);
      return;
    }
    const newWp = {
      name: cleanCity.charAt(0).toUpperCase() + cleanCity.slice(1),
      lat: coords[0],
      lng: coords[1],
    };
    const updated = [...selectedWaypoints, newWp];
    setSelectedWaypoints(updated);
    setWaypointCityInput("");
    if (activeTrip) {
      void recalculateDistance(activeTrip.pickupCity, activeTrip.deliveryCity, updated);
    }
  };

  const handleRemoveWaypoint = (index: number) => {
    const updated = selectedWaypoints.filter((_, i) => i !== index);
    setSelectedWaypoints(updated);
    if (activeTrip) {
      void recalculateDistance(activeTrip.pickupCity, activeTrip.deliveryCity, updated);
    }
  };

  const handleSaveRoute = async () => {
    if (!activeTrip) return;
    setSavingRoute(true);
    try {
      const finalKm = calculatedKm || activeTrip.distanceKm || 0;
      const res = await driverUpdateTripRouteAction(activeTrip.id, selectedWaypoints, finalKm);
      if (res.success) {
        alert("✓ පාර සහ නව කිලෝමීටර් ගණන Admin පැනලයට Live update කරන ලදී!");
      }
    } catch {
      alert("Error saving route.");
    } finally {
      setSavingRoute(false);
    }
  };

  const handleToggleGpsSharing = () => {
    if (!activeTrip || !employee) return;
    if (isSharingGps) {
      if (watchIdRef.current !== null && typeof window !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsSharingGps(false);
    } else {
      setIsSharingGps(true);
      if (typeof window !== "undefined" && "geolocation" in navigator) {
        const id = navigator.geolocation.watchPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 40;
            const heading = pos.coords.heading || 0;
            setGpsCoords({ lat, lng, speed });
            await driverShareLiveGpsAction(
              activeTrip.id,
              employee.plateNumber || employee.id,
              lat,
              lng,
              heading,
              speed
            );
          },
          (err) => {
            console.warn("GPS watch position error:", err);
          },
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
        watchIdRef.current = id;
      }
      const startCoord = resolveLocationCoordinates(activeTrip.pickupCity) || [6.9271, 79.8612];
      setGpsCoords({ lat: startCoord[0], lng: startCoord[1], speed: 45 });
      void driverShareLiveGpsAction(
        activeTrip.id,
        employee.plateNumber || employee.id,
        startCoord[0],
        startCoord[1],
        0,
        45
      );
    }
  };

  const handleToggleEmptyReturn = async () => {
    if (!activeTrip || !employee) return;
    const willStart = !emptyReturnActive;
    setActionLoadingId("empty_return");
    try {
      const returnRouteStr = `${activeTrip.deliveryCity} → ${emptyReturnDestination}`;
      const res = await driverToggleEmptyReturnAction(
        activeTrip.id,
        employee.plateNumber || employee.id,
        willStart,
        emptyReturnKm,
        returnRouteStr
      );
      if (res.success) {
        setEmptyReturnActive(willStart);
        alert(
          willStart
            ? "Empty Return ආරම්භ කරන ලදී! ලොරිය දැන් Available Empty Lorry ලෙස පාරිභෝගික සිතියමේ දිස්වේ."
            : "✓ Empty Return ගමන අවසන් කරන ලදී."
        );
      }
    } catch {
      alert("Error toggling empty return mode.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLogout = () => {
    void logout();
  };

  const handleToggleDuty = async () => {
    if (!employee || dutyLoading) return;
    const targetStatus = !employee.isAvailable;
    setDutyLoading(true);
    try {
      const res = await toggleOutsideDutyAction(employee.idNumber, targetStatus);
      if (res.success) {
        const updated = { ...employee, isAvailable: res.data.isAvailable };
        setEmployee(updated);
        try {
          localStorage.setItem(LOCAL_STORAGE_EMP_KEY, JSON.stringify(updated));
        } catch {}
      } else {
        alert(res.error || "Failed to update availability status.");
      }
    } catch {
      alert("Failed to update status.");
    } finally {
      setDutyLoading(false);
    }
  };

  const handleSlipFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setTopupSlipImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) {
      alert(locale === "en" ? "Enter a valid amount." : "වලංගු මුදලක් ඇතුළත් කරන්න.");
      return;
    }
    if (!topupSlipImage) {
      alert(locale === "en" ? "Please upload your bank deposit slip." : "කරුණාකර බැංකු රිසිට්පත Upload කරන්න.");
      return;
    }

    setTopupSubmitting(true);
    setTopupFeedback(null);
    try {
      const res = await submitOutsideTopupSlipAction({
        idNumber: employee.idNumber,
        amount: amt,
        bankUsed: topupBank,
        slipUrl: topupSlipImage,
      });

      if (res.success) {
        setTopupFeedback({
          type: "success",
          msg:
            locale === "en"
              ? "Top-up slip submitted successfully! Admin will verify and credit your balance shortly."
              : "Top-up රිසිට්පත සාර්ථකව යොමු විය! Admin විසින් පරීක්ෂා කර ඔබගේ ශේෂයට මුදල් එක් කරනු ඇත.",
        });
        setTopupSlipImage("");
        void refreshEmployeeData(employee.idNumber);
      } else {
        setTopupFeedback({
          type: "error",
          msg: res.error || "Failed to submit top-up slip.",
        });
      }
    } catch {
      setTopupFeedback({
        type: "error",
        msg: "Failed to submit top-up slip.",
      });
    } finally {
      setTopupSubmitting(false);
    }
  };

  const handleCopyAccount = (id: string, num: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(num.replace(/\s+/g, ""));
      setCopiedBankId(id);
      setTimeout(() => setCopiedBankId(null), 2000);
    }
  };

  const formatDate = (ms: number) => {
    if (!ms) return "";
    return new Date(ms).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // -------------------------------------------------------------
  // VIEW A: NOT LOGGED IN (Employee Login Form)
  // -------------------------------------------------------------
  if (!signedInDriverId) return <SignInForm role="driver" />;
  if (!employee) {
    return (
      <div className="mx-auto w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-700">
          {loadError || "Loading your records. This page is for external vehicle owners; company drivers use the Driver App."}
        </p>
        <button type="button" onClick={handleLogout} className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white cursor-pointer">
          Sign out
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW B: LOGGED IN (Employee Dashboard)
  // -------------------------------------------------------------
  const isOwing = employee.balance < 0;
  const isBalanceLow = employee.balance < 1000;
  // Progress: how much of everything deposited has been used up by commission
  const totalDeposited =
    transactions
      .filter((tx) => tx.type === "initial_deposit" || tx.type === "topup")
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0) || REGISTRATION_DEPOSIT;
  const commissionUsed = employee.totalCommissionDeducted || 0;
  const usedPercent = Math.min(100, Math.round((commissionUsed / totalDeposited) * 100));

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header Profile & Duty Status Card */}
      <div className="p-6 sm:p-7 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-xl bg-[#26231B] text-[#FFC20E] flex items-center justify-center font-semibold text-xl shrink-0">
              {employee.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-semibold text-[var(--ink)]">{employee.name}</h2>
                <span className="px-2 py-0.5 rounded-md bg-[#26231B] text-[#FFC20E] font-mono text-xs font-semibold">
                  ID: {employee.driverId || employee.id}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-950 font-bold text-xs flex items-center gap-1.5 shadow-2xs">
                  <span>Driver App Login:</span>
                  <strong className="font-mono text-xs font-semibold text-emerald-900">{employee.driverId || employee.id}</strong>
                </span>
                <span className="text-xs text-[var(--mut)]">
                  {locale === "en"
                    ? "Use this ID to log in to the Driver App"
                    : "Driver App එකට Log වීමට මෙම අංකය භාවිතා කරන්න"}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--mut)] mt-1.5 flex-wrap">
                <span>Plate: <strong className="text-[var(--ink)] font-mono">{employee.plateNumber}</strong></span>
                <span>•</span>
                <span>Type: <strong className="text-[var(--ink)]">{employee.vehicleType}</strong></span>
                <span>•</span>
                <span>Base: <strong className="text-[var(--ink)]">{employee.baseCity}</strong></span>
                <span>•</span>
                <span>NIC: <strong className="text-[var(--ink)] font-mono">{employee.idNumber}</strong></span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-rose-50 hover:text-rose-700 text-xs font-bold text-[var(--ink)] transition-colors cursor-pointer self-start sm:self-center"
          >
            {locale === "en" ? "Sign Out" : "ඉවත්වන්න"}
          </button>
        </div>

        {/* Duty Availability Toggle (Tick / Switch) */}
        <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={employee.isAvailable}
                onChange={handleToggleDuty}
                disabled={dutyLoading}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-[var(--ink)] flex items-center gap-2">
                <span>{locale === "en" ? "Duty Availability Status:" : "සේවයට සූදානම් තත්ත්වය (Duty Status):"}</span>
                {employee.isAvailable ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                    {locale === "en" ? "Available / සේවයට සූදානම්" : "Available / සේවයට සූදානම්"}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-semibold">
                    {locale === "en" ? "Unavailable / සේවය අත්හිටුවා ඇත" : "Unavailable / තාවකාලිකව සේවයෙන් බැහැරයි"}
                  </span>
                )}
              </span>
              <span className="text-xs text-[var(--mut)] mt-0.5">
                {employee.isAvailable
                  ? locale === "en"
                    ? "Your vehicle is currently visible and bookable by customers in Individual Lorry."
                    : "ඔබගේ වාහනය පද්ධතියේ Available ලෙස සටහන්ව ඇති අතර පාරිභෝගිකයින්ට වෙන්කරවා ගත හැකිය."
                  : locale === "en"
                    ? "Your vehicle is temporarily hidden from booking until you turn duty back on."
                    : "ඔබ Unavailable කර ඇති බැවින් වෙබ් අඩවියේ පාරිභෝගිකයින්ට මෙම වාහනය Unavailable ලෙස පෙන්වයි."}
              </span>
            </div>
          </div>

          <div className="text-xs font-mono text-[var(--mut)] shrink-0">
            {dutyLoading ? "Updating..." : "Click toggle to change status"}
          </div>
        </div>
      </div>

      {/* Main Tab Navigation: Driver App vs Wallet */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] pb-3">
        <button
          type="button"
          onClick={() => setActiveMainTab("driver_app")}
          className={`px-5 py-3 rounded-xl font-semibold text-xs flex items-center gap-2.5 cursor-pointer transition-all ${
            activeMainTab === "driver_app"
              ? "bg-[#26231B] text-[#FFC20E] scale-[1.02]"
              : "bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--y3)] border border-[var(--line)]"
          }`}
        >
          <span>{locale === "en" ? "Driver App & Trips" : "ඩ්‍රයිවර් ඇප් සහ ගමන්වාර"}</span>
          {driverBookings.filter(
            (b) =>
              b.driverTripStatus !== "accepted" &&
              b.driverTripStatus !== "declined" &&
              b.status !== "delivered" &&
              b.status !== "completed" &&
              b.status !== "cancelled"
          ).length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-mono text-xs font-semibold">
              {
                driverBookings.filter(
                  (b) =>
                    b.driverTripStatus !== "accepted" &&
                    b.driverTripStatus !== "declined" &&
                    b.status !== "delivered" &&
                    b.status !== "completed" &&
                    b.status !== "cancelled"
                ).length
              }{" "}
              New
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab("wallet")}
          className={`px-5 py-3 rounded-xl font-semibold text-xs flex items-center gap-2.5 cursor-pointer transition-all ${
            activeMainTab === "wallet"
              ? "bg-[#26231B] text-[#FFC20E] scale-[1.02]"
              : "bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--y3)] border border-[var(--line)]"
          }`}
        >
          <span>{locale === "en" ? "Wallet & Top-up" : "පසුම්බිය සහ තැන්පතු (Wallet)"}</span>
          {isBalanceLow && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-black font-bold text-xs">
              Low
            </span>
          )}
        </button>
      </div>

      {/* ============================================================
       * TAB 1: DRIVER APP CONSOLE & TRIP DISPATCH
       * ============================================================ */}
      {activeMainTab === "driver_app" && (
        <div className="flex flex-col gap-6">
          {/* Section A: New Assigned Booking Requests */}
          {(() => {
            const pendingRequests = driverBookings.filter(
              (b) =>
                b.driverTripStatus !== "accepted" &&
                b.driverTripStatus !== "declined" &&
                b.status !== "delivered" &&
                b.status !== "completed" &&
                b.status !== "cancelled"
            );

            return (
              <div className="p-6 sm:p-7 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--line)] flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-[var(--ink)]">
                        {locale === "en" ? "New Assigned Booking Requests" : "අලුතින් ලැබුණු ගමන්වාර ඉල්ලීම් (Assigned Requests)"}
                      </h3>
                      <p className="text-xs text-[var(--mut)]">
                        {locale === "en"
                          ? "Review trip details carefully before accepting or declining."
                          : "ගමන භාරගැනීමට පෙර ආරම්භක ස්ථානය, ගමනාන්තය සහ බඩු විස්තර පරීක්ෂා කරන්න."}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-mono text-xs font-semibold">
                    {pendingRequests.length} Pending Requests
                  </span>
                </div>

                {pendingRequests.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[var(--mut)] bg-[var(--bg)] rounded-xl border border-[var(--line)] flex flex-col items-center gap-2">
                    <span className="font-bold text-[var(--ink)]">
                      {locale === "en" ? "No new trip requests pending" : "දැනට අලුත් ගමන්වාර ඉල්ලීම් නොමැත"}
                    </span>
                    <span>
                      {locale === "en"
                        ? "When the Admin assigns an individual cargo booking to your vehicle, it will appear here instantly."
                        : "Admin විසින් ඔබගේ වාහනයට Booking එකක් Assign කළ සැණින් මෙහි විස්තර දිස්වේ."}
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {pendingRequests.map((b) => (
                      <div
                        key={b.id}
                        className="p-5 rounded-xl bg-[var(--bg)] border-2 border-amber-300 flex flex-col gap-4 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--line)]">
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-md bg-[#26231B] text-[#FFC20E] font-mono text-xs font-semibold">
                              Trip #{b.id}
                            </span>
                            <span className="font-bold text-gray-700">
                              {b.date} ({b.startTime || "08:00"} – {b.endTime || "17:00"})
                            </span>
                          </div>
                          <span className="px-2.5 py-0.5 rounded bg-blue-100 text-blue-900 font-bold text-xs">
                            {b.bookingType === "individual_vehicle" ? "Individual Cargo Booking" : "Live Lorry Booking"}
                          </span>
                        </div>

                        {/* Detailed trip specifications */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[var(--card)] p-3.5 rounded-xl border border-[var(--line)]">
                          <div>
                            <span className="text-xs text-[var(--mut)] font-bold block">Route (ගමන් මග)</span>
                            <strong className="text-sm text-[var(--ink)] block mt-0.5">
                              {b.pickupCity} ➔ {b.deliveryCity}
                            </strong>
                          </div>

                          <div>
                            <span className="text-xs text-[var(--mut)] font-bold block">Booked Distance (දුර)</span>
                            <strong className="text-sm text-[var(--ink)] font-mono block mt-0.5">
                              {b.distanceKm ? `${b.distanceKm} KM` : "To be calculated"}
                            </strong>
                          </div>

                          <div>
                            <span className="text-xs text-[var(--mut)] font-bold block">Cargo Goods &amp; Weight</span>
                            <span className="text-xs text-[var(--ink)] block mt-0.5 font-medium">
                              {b.cargoNature || "General Cargo"}
                              {b.cargoWeight ? ` (${b.cargoWeight})` : ""}
                              {b.helpersCount ? ` · Helpers: ${b.helpersCount}` : ""}
                            </span>
                          </div>

                          <div>
                            <span className="text-xs text-[var(--mut)] font-bold block">Customer Details</span>
                            <span className="text-xs text-[var(--ink)] block mt-0.5 font-medium">
                              {b.customerName}
                              {b.customerPhone && (
                                <a
                                  href={`tel:${b.customerPhone}`}
                                  className="ml-1 text-blue-700 underline font-mono"
                                >
                                  {b.customerPhone}
                                </a>
                              )}
                            </span>
                          </div>
                        </div>

                        {b.packageDetails && (
                          <div className="text-xs text-[var(--mut)] bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                            <strong>Note:</strong> {b.packageDetails}
                          </div>
                        )}

                        {/* Accept / Decline Action Buttons */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                          <button
                            type="button"
                            disabled={actionLoadingId === b.id}
                            onClick={async () => {
                              setActionLoadingId(b.id);
                              await driverAcceptBookingAction(b.id, false);
                              setActionLoadingId(null);
                              void loadDriverBookings(employee.driverId || employee.id);
                            }}
                            className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-rose-50 text-rose-700 font-bold text-xs cursor-pointer transition-colors"
                          >
                            ✕ Decline (ප්‍රතික්ෂේප කරන්න)
                          </button>

                          <button
                            type="button"
                            disabled={actionLoadingId === b.id}
                            onClick={async () => {
                              setActionLoadingId(b.id);
                              const res = await driverAcceptBookingAction(b.id, true);
                              setActionLoadingId(null);
                              if (res.success) {
                                setActiveTrip(b);
                                if (Array.isArray(b.waypoints)) {
                                  setSelectedWaypoints(b.waypoints);
                                }
                                void recalculateDistance(b.pickupCity, b.deliveryCity, b.waypoints || []);
                                void loadDriverBookings(employee.driverId || employee.id);
                              }
                            }}
                            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs cursor-pointer transition-all flex items-center gap-2"
                          >
                            <span>✓</span>
                            <span>Accept Trip &amp; Start Dispatch (ගමන භාරගන්න)</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Section B: Active Trip Console (Auto-fill, Waypoints & Live KM) */}
          {activeTrip && (
            <div className="p-6 sm:p-7 rounded-xl bg-[var(--card)] border-2 border-emerald-500 flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-[var(--ink)]">
                        Active Journey Console · ක්‍රියාකාරී ගමන් පාලකය
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-950 font-mono text-xs font-semibold">
                        #{activeTrip.id}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--mut)]">
                      {isSharingGps
                        ? "Live GPS broadcast active! Trip status set to Ongoing."
                        : "Set intermediate waypoints and start live location broadcast."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    activeTrip.status === "in_transit"
                      ? "bg-emerald-600 text-white"
                      : "bg-blue-100 text-blue-900"
                  }`}>
                    {activeTrip.status === "in_transit" ? "On Road (Ongoing)" : "Trip Accepted"}
                  </span>
                </div>
              </div>

              {/* 1. Auto-filled Locations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                    <span>Start Location (ආරම්භක ස්ථානය)</span>
                    <span className="bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded text-xs font-mono">Auto-filled</span>
                  </span>
                  <div className="text-base font-semibold text-[var(--ink)] mt-1">
                    {activeTrip.pickupCity}
                  </div>
                  <span className="text-xs text-[var(--mut)]">
                    Auto-selected from booking request. No manual retyping needed.
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-xs font-semibold text-red-800 flex items-center gap-1">
                    <span>End Destination (ගමනාන්තය)</span>
                    <span className="bg-red-200 text-red-900 px-1.5 py-0.2 rounded text-xs font-mono">Auto-filled</span>
                  </span>
                  <div className="text-base font-semibold text-[var(--ink)] mt-1">
                    {activeTrip.deliveryCity}
                  </div>
                  <span className="text-xs text-[var(--mut)]">
                    Auto-selected destination. Ready for waypoint configuration.
                  </span>
                </div>
              </div>

              {/* 2. Intermediate Waypoints (අතරමැදි නගර 3ක් දක්වා) */}
              <div className="p-5 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-sm text-[var(--ink)] flex items-center gap-2">
                      <span>Intermediate Waypoints (අතරමැදි නගර 3ක් දක්වා)</span>
                      <span className="text-xs font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                        {selectedWaypoints.length} / 3 Cities
                      </span>
                    </h4>
                    <p className="text-xs text-[var(--mut)] mt-0.5">
                      Select up to 3 intermediate stops along the route. Edit anytime mid-journey if detour occurs.
                    </p>
                  </div>
                </div>

                {/* Waypoints route corridor representation */}
                <div className="flex flex-wrap items-center gap-2 p-3 bg-[var(--card)] rounded-xl border border-[var(--line)] text-xs font-semibold">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 font-bold flex items-center gap-1">
                    <span>Start:</span> {activeTrip.pickupCity}
                  </span>

                  {selectedWaypoints.map((wp, idx) => (
                    <React.Fragment key={idx}>
                      <span className="text-gray-400 font-bold">➔</span>
                      <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-950 font-bold flex items-center gap-1.5 shadow-2xs">
                        <span>Stop {idx + 1}: {wp.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWaypoint(idx)}
                          className="w-4 h-4 rounded-full bg-blue-200 hover:bg-rose-500 hover:text-white flex items-center justify-center text-xs cursor-pointer"
                          title="Remove waypoint"
                        >
                          ✕
                        </button>
                      </span>
                    </React.Fragment>
                  ))}

                  <span className="text-gray-400 font-bold">➔</span>
                  <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-950 font-bold flex items-center gap-1">
                    <span>End:</span> {activeTrip.deliveryCity}
                  </span>
                </div>

                {/* Waypoint Add Input */}
                {selectedWaypoints.length < 3 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      value={waypointCityInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWaypointCityInput(val);
                        if (val) handleAddWaypoint(val);
                      }}
                      className="px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--card)] text-xs text-[var(--ink)] font-medium focus:outline-none focus:border-[#FFC20E]"
                    >
                      <option value="">+ Add Intermediate City (අතරමැදි නගරයක් තෝරන්න)...</option>
                      {WAYPOINT_CITY_CHOICES.filter(
                        (c) =>
                          c.toLowerCase() !== activeTrip.pickupCity.toLowerCase() &&
                          c.toLowerCase() !== activeTrip.deliveryCity.toLowerCase() &&
                          !selectedWaypoints.some((w) => w.name.toLowerCase() === c.toLowerCase())
                      ).map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>

                    <span className="text-xs text-[var(--mut)]">
                      {3 - selectedWaypoints.length} more waypoint(s) can be added.
                    </span>
                  </div>
                )}

                {/* Distance Comparison & Live Update */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--line)]">
                  <div className="p-3 rounded-xl bg-[var(--card)] border border-[var(--line)]">
                    <span className="text-xs text-[var(--mut)] font-bold block">
                      Booked KM (වෙන්කළ දුර)
                    </span>
                    <strong className="text-base font-mono text-[var(--ink)] block mt-0.5">
                      {activeTrip.distanceKm ? `${activeTrip.distanceKm} km` : "Not recorded"}
                    </strong>
                  </div>

                  <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                    <span className="text-xs text-blue-900 font-bold block">
                      Actual Route KM (ගණනය වූ සැබෑ දුර)
                    </span>
                    <strong className="text-base font-mono text-blue-950 block mt-0.5">
                      {calcLoading
                        ? "Calculating..."
                        : calculatedKm !== null
                        ? `${calculatedKm} km`
                        : "—"}
                    </strong>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col justify-between">
                    <div>
                      <span className="text-xs text-amber-900 font-bold block">
                        KM Difference (වෙනස)
                      </span>
                      <strong className="text-base font-mono text-amber-950 block mt-0.5">
                        {calculatedKm && activeTrip.distanceKm
                          ? `${(calculatedKm - activeTrip.distanceKm) > 0 ? `+${(calculatedKm - activeTrip.distanceKm).toFixed(1)}` : (calculatedKm - activeTrip.distanceKm).toFixed(1)} km`
                          : "0.0 km"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={savingRoute || calcLoading}
                    onClick={handleSaveRoute}
                    className="px-4 py-2 rounded-xl bg-[#26231B] text-[#FFC20E] text-xs font-semibold cursor-pointer hover:bg-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <span>{savingRoute ? "Saving..." : "Save Route & Update KM Live (පාර සුරකින්න)"}</span>
                  </button>
                </div>
              </div>

              {/* 3. Live Location Sharing (Location Share කිරීමෙන් ඔටෝ Ongoing වීම) */}
              <div className="p-5 rounded-xl bg-gradient-to-r from-emerald-950 to-[#26231B] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-white">
                        {locale === "en" ? "Live Location Sharing" : "සජීවී GPS ස්ථානය බෙදාගැනීම (Live GPS)"}
                      </h4>
                      {isSharingGps ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-black text-xs font-semibold">
                          Live Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-bold">
                          Idle
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">
                      {isSharingGps
                        ? "GPS broadcast is active! Admin Dashboard receives ongoing status in real time."
                        : "Click button to share live location. The booking will automatically transition to 'Ongoing' on Admin Dashboard."}
                    </p>
                    {gpsCoords && (
                      <div className="text-xs font-mono text-emerald-300 mt-1 flex items-center gap-2">
                        <span>Speed: {gpsCoords.speed} km/h</span>
                        <span>•</span>
                        <span>Lat: {gpsCoords.lat.toFixed(4)}, Lng: {gpsCoords.lng.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleGpsSharing}
                  className={`px-5 py-3 rounded-xl font-semibold text-xs cursor-pointer shadow-lg transition-all shrink-0 flex items-center justify-center gap-2 ${
                    isSharingGps
                      ? "bg-rose-600 hover:bg-rose-700 text-white"
                      : "bg-[#FFC20E] hover:bg-amber-400 text-black"
                  }`}
                >
                  <span>
                    {isSharingGps
                      ? "Stop Sharing GPS"
                      : "Share Live GPS (Live Location Share කර ගමන ආරම්භ කරන්න)"}
                  </span>
                </button>
              </div>

              {/* 4. Delivery Conclude Button */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)] text-xs">
                <div>
                  <span className="font-bold text-[var(--ink)] block">Conclude Cargo Delivery</span>
                  <span className="text-xs text-[var(--mut)]">
                    Once the goods are unloaded at the destination, mark cargo delivery finished.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("බඩු බෑම අවසන් කර මෙම ගමන අවසන් කිරීමට ඔබට අවශ්‍යද?")) return;
                    await updateBookingStatusAction(activeTrip.id, "delivered");
                    void loadDriverBookings(employee.driverId || employee.id);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <span>Mark Goods Delivered (බඩු බා අවසන්)</span>
                </button>
              </div>

              {/* 5. Empty Return Journey (ආපසු හිස්ව එන ගමන ට්‍රැක් කිරීම) */}
              <div className="p-5 rounded-xl bg-purple-50/80 border-2 border-purple-300 text-purple-950 flex flex-col gap-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-purple-200">
                  <div className="flex items-center gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-purple-950">
                        Empty Return Journey · ආපසු හිස්ව පැමිණීම (Empty Lorry Tracking)
                      </h4>
                      <p className="text-xs text-purple-800">
                        When returning empty after cargo delivery, mark Empty Return so customers can view and book your lorry on the Find Empty Lorry map.
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${
                    emptyReturnActive
                      ? "bg-purple-700 text-white"
                      : "bg-purple-200 text-purple-900"
                  }`}>
                    {emptyReturnActive ? "Empty Return In Transit" : "Return Idle"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-purple-900 mb-1">
                      Return Destination (ආපසු එන නගරය)
                    </label>
                    <select
                      value={emptyReturnDestination}
                      onChange={(e) => setEmptyReturnDestination(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-purple-300 bg-white text-xs font-semibold text-purple-950 focus:outline-none"
                    >
                      {WAYPOINT_CITY_CHOICES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-purple-900 mb-1">
                      Empty Return Distance (ආපසු එන KM ගණන)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={emptyReturnKm}
                      onChange={(e) => setEmptyReturnKm(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-purple-300 bg-white font-mono text-xs font-bold text-purple-950 focus:outline-none"
                      placeholder="e.g. 85"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={actionLoadingId === "empty_return"}
                      onClick={handleToggleEmptyReturn}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                        emptyReturnActive
                          ? "bg-purple-800 hover:bg-purple-900 text-white"
                          : "bg-purple-600 hover:bg-purple-700 text-white"
                      }`}
                    >
                      <span>
                        {emptyReturnActive
                          ? "Conclude Empty Return"
                          : "Start Empty Return (ආපසු හිස්ව පැමිණීම)"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section C: Completed Trips History */}
          <div className="p-6 sm:p-7 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] flex-wrap gap-2">
              <h3 className="text-base font-semibold text-[var(--ink)]">
                {locale === "en" ? "Concluded Trips History" : "සම්පූර්ණ වූ ගමන්වාර ඉතිහාසය"}
              </h3>
              <span className="text-xs font-mono font-bold text-[var(--mut)]">
                {driverBookings.filter((b) => b.status === "delivered" || b.status === "completed").length} Trips
              </span>
            </div>

            {driverBookings.filter((b) => b.status === "delivered" || b.status === "completed").length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--mut)] bg-[var(--bg)] rounded-xl border border-[var(--line)]">
                No concluded trips yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {driverBookings
                  .filter((b) => b.status === "delivered" || b.status === "completed")
                  .map((b) => (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                          ✓
                        </span>
                        <div>
                          <strong className="text-[var(--ink)]">
                            {b.pickupCity} ➔ {b.deliveryCity}
                          </strong>
                          <div className="text-xs text-[var(--mut)] flex items-center gap-2 mt-0.5">
                            <span>Ref: {b.id}</span>
                            <span>•</span>
                            <span>{b.date}</span>
                            <span>•</span>
                            <span>Booked: {b.distanceKm || "—"} KM</span>
                            {b.actualDistanceKm ? (
                              <span>• Actual: {b.actualDistanceKm} KM</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-950 font-mono font-bold text-xs self-start sm:self-center">
                        ✓ Concluded
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
       * TAB 2: WALLET, TOP-UP & COMMISSION LEDGER
       * ============================================================ */}
      {activeMainTab === "wallet" && (
        <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Balance Card */}
        <div className={`p-6 rounded-xl bg-[var(--card)] border ${isOwing ? "border-rose-500" : isBalanceLow ? "border-amber-400" : "border-[var(--line)]"} flex flex-col justify-between`}>
          <div>
            <span className="text-xs font-semibold text-[var(--mut)] block">
              {locale === "en" ? "Current Wallet Balance" : "දැනට ඉතිරිව ඇති මුදල් ශේෂය"}
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className={`text-3xl font-semibold ${isOwing ? "text-rose-700" : "text-[var(--ink)]"}`}>
                {formatRs(employee.balance)}
              </span>
            </div>
            <div className="mt-2">
              {isOwing ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 text-xs font-bold">
                  Commission owed / ගෙවිය යුතු කොමිස් මුදල {formatRs(-employee.balance)}
                </span>
              ) : isBalanceLow ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold">
                  Low Balance / අඩු ශේෂයක්
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-bold">
                  ✓ Healthy Balance / ප්‍රමාණවත් ශේෂයක් පවතී
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-[var(--mut)] mt-4 pt-3 border-t border-[var(--line)]">
            Registration deposit: Rs. 5,000. Top-ups add to this balance.
          </p>
        </div>

        {/* Completed Hires */}
        <div className="p-6 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-[var(--mut)] block">
              {locale === "en" ? "Completed Hires" : "සම්පූර්ණ වූ ගමන් වාර"}
            </span>
            <div className="mt-2 text-3xl font-semibold text-[var(--ink)]">
              {employee.totalHiresCompleted || 0}
            </div>
          </div>
          <p className="text-xs text-[var(--mut)] mt-4 pt-3 border-t border-[var(--line)]">
            Total cargo trips executed through Sithumina system.
          </p>
        </div>

        {/* Commission Deducted */}
        <div className="p-6 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-[var(--mut)] block">
              {locale === "en" ? "Total Commission Deducted" : "අයවූ මුළු කොමිස් මුදල"}
            </span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-xs font-bold text-[var(--mut)]">LKR</span>
              <span className="text-3xl font-semibold text-[#5B4300]">
                {(employee.totalCommissionDeducted || 0).toLocaleString()}
                <span className="text-base font-normal text-[var(--mut)]">.00</span>
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--mut)] mt-4 pt-3 border-t border-[var(--line)]">
            Calculated as 20% of each completed hire.
          </p>
        </div>
      </div>

      {/* Deposit usage progress */}
      <div className="p-5 sm:p-6 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <strong className="text-sm font-semibold text-[var(--ink)]">
            {locale === "en" ? "Deposit Usage" : "තැන්පතු භාවිතය"}
          </strong>
          <span className="font-mono font-bold text-[var(--mut)]">
            {formatRs(commissionUsed)} / {formatRs(totalDeposited)} ({usedPercent}%)
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Deposit used by commission"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usedPercent}
          className="h-3 rounded-full bg-[var(--bg)] border border-[var(--line)] overflow-hidden"
        >
          <div
            className={`h-full rounded-full ${isOwing ? "bg-rose-600" : isBalanceLow ? "bg-amber-500" : "bg-emerald-600"}`}
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <p className={`text-xs ${isOwing ? "text-rose-700 font-bold" : "text-[var(--mut)]"}`}>
          {isOwing
            ? `Your deposit is used up and you owe ${formatRs(-employee.balance)} in commission. You can keep taking hires.`
            : `${formatRs(employee.balance)} remaining. You can keep taking hires even if this goes below zero.`}
        </p>
        {isOwing && (
          <a
            href="#topup-section"
            className="px-4 py-2 rounded-xl bg-[#26231B] text-[#FFC20E] font-bold text-xs self-start no-underline"
          >
            {locale === "en" ? "Top Up Now ↓" : "මුදල් තැන්පත් කරන්න ↓"}
          </a>
        )}
      </div>

      {/* 3. Top-up Section (නැවත මුදල් තැන්පත් කිරීම) */}
      <div id="topup-section" className="p-6 sm:p-8 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col gap-5">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div>
              <h3 className="text-base font-semibold text-[var(--ink)]">
                {locale === "en"
                  ? "Wallet Top-up & Bank Slip Upload"
                  : "මුදල් නැවත තැන්පත් කිරීම (Top-up) සහ රිසිට්පත් Upload කිරීම"}
              </h3>
              <p className="text-xs text-[var(--mut)]">
                {locale === "en"
                  ? "Transfer funds to company bank accounts and upload the deposit receipt."
                  : "ආයතනයේ බැංකු ගිණුමට මුදල් තැන්පත් කර එම බැංකු රිසිට්පත (Bank Slip) මෙහි Upload කරන්න."}
              </p>
            </div>
          </div>
        </div>

        {/* Company Bank Accounts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bankAccounts.map((acc) => (
            <div
              key={acc.id}
              className="p-3.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] flex flex-col gap-1 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[var(--ink)]">{acc.bankName}</span>
                <span className="text-xs text-[var(--mut)]">{acc.branch}</span>
              </div>
              <span className="text-xs text-[var(--mut)]">Acc Name: {acc.accountName}</span>
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-[var(--line)]/50">
                <span className="font-mono font-bold text-sm text-[var(--ink)]">{acc.accountNumber}</span>
                <button
                  type="button"
                  onClick={() => handleCopyAccount(acc.id, acc.accountNumber)}
                  className="px-2.5 py-0.5 rounded-lg bg-[var(--card)] border border-[var(--line)] hover:bg-[var(--y)] text-xs font-bold text-[var(--ink)] cursor-pointer transition-colors"
                >
                  {copiedBankId === acc.id ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Feedback message */}
        {topupFeedback && (
          <div
            className={`p-4 rounded-xl text-xs font-bold leading-relaxed ${
              topupFeedback.type === "success"
                ? "bg-emerald-50 border border-emerald-300 text-emerald-900"
                : "bg-rose-50 border border-rose-300 text-rose-900"
            }`}
          >
            {topupFeedback.msg}
          </div>
        )}

        {/* Top-up Form */}
        <form onSubmit={handleSubmitTopup} className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink)]">
              {locale === "en" ? "Top-up Amount (LKR) *" : "තැන්පත් කළ මුදල (රු.) *"}
            </label>
            <input
              type="number"
              min="500"
              step="500"
              required
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] font-mono font-bold focus:outline-none focus:border-[#FFC20E]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink)]">
              {locale === "en" ? "Bank Transferred To" : "තැන්පත් කළ බැංකුව"}
            </label>
            <select
              value={topupBank}
              onChange={(e) => setTopupBank(e.target.value)}
              className="p-3 text-sm rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[#FFC20E] cursor-pointer"
            >
              {bankAccounts.map((b) => (
                <option key={b.id} value={`${b.bankName} - ${b.branch}`}>
                  {b.bankName} ({b.branch})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--ink)]">
              {locale === "en" ? "Bank Slip Screenshot / Photo *" : "බැංකු රිසිට්පත (Bank Slip) *"}
            </label>
            {topupSlipImage ? (
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-emerald-400">
                <span className="text-xs text-emerald-800 font-bold truncate">✓ Slip attached</span>
                <button
                  type="button"
                  onClick={() => setTopupSlipImage("")}
                  className="px-2 py-0.5 rounded bg-rose-600 text-white text-xs font-bold cursor-pointer"
                >
                  Change
                </button>
              </div>
            ) : (
              <label className="p-2.5 rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[#FFC20E] flex items-center justify-center gap-1.5 text-xs text-[var(--ink)] font-bold cursor-pointer bg-white transition-colors">
                <span>Upload Slip</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSlipFileUpload}
                />
              </label>
            )}
          </div>

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={topupSubmitting}
              className="py-3 px-6 rounded-xl bg-[#26231B] hover:bg-[#1a1813] text-[#FFC20E] font-semibold text-xs cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {topupSubmitting ? "Submitting Top-up Slip..." : "Submit Top-up Slip for Admin Approval / රිසිට්පත යොමු කරන්න"}
            </button>
          </div>
        </form>

        {/* Uploaded Slips History */}
        {slips.length > 0 && (
          <div className="flex flex-col gap-2 pt-3 border-t border-[var(--line)]">
            <span className="text-xs font-bold text-[var(--ink)]">Recent Top-up Slips:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {slips.map((s) => (
                <div
                  key={s.id}
                  className="p-3 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    {s.slipUrl && (
                      <img src={s.slipUrl} alt="Slip" className="w-8 h-8 rounded object-cover border border-[var(--line)]" />
                    )}
                    <div className="flex flex-col">
                      <span className="font-bold text-[var(--ink)]">LKR {s.amount.toLocaleString()}</span>
                      <span className="text-xs text-[var(--mut)]">{formatDate(s.createdAt)}</span>
                    </div>
                  </div>
                  <div>
                    {s.status === "approved" ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                        ✓ Approved &amp; Credited
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
                        Pending Admin Review
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Commission Deductions & Transaction Ledger (කොමිස් අඩු වූ ආකාරය) */}
      <div className="p-6 sm:p-8 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold text-[var(--ink)]">
              {locale === "en"
                ? "Commission Deductions & Balance Ledger"
                : "කොමිස් අඩු වූ ආකාරය සහ ගිණුම් විස්තරය"}
            </h3>
            <p className="text-xs text-[var(--mut)]">
              {locale === "en"
                ? "Every 20% commission deduction, refund and top-up."
                : "සෑම 20% කොමිස් අඩු කිරීමක්ම, ආපසු ගෙවීමක්ම සහ Top-up සටහන්."}
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-[var(--mut)]">
            {transactions.length} Transactions
          </span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--mut)] bg-[var(--bg)] rounded-xl border border-[var(--line)]">
            No transactions recorded yet. Initial Rs. 5,000 security deposit is active.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {transactions.map((tx) => {
              const isDeduction = tx.type === "commission_deduction" || tx.amount < 0;
              return (
                <div
                  key={tx.id}
                  className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        isDeduction
                          ? "bg-rose-100 text-rose-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {isDeduction ? "−" : "+"}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-[var(--ink)]">
                        {tx.note || (isDeduction ? `Commission for ${tx.bookingId || "Booking"}` : "Balance Credit")}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-[var(--mut)] flex-wrap mt-0.5">
                        <span>{formatDate(tx.createdAt)}</span>
                        {tx.bookingId && (
                          <span className="font-mono bg-[var(--card)] px-1.5 py-0.2 rounded border border-[var(--line)]">
                            Ref: {tx.bookingId}
                          </span>
                        )}
                        {tx.hireAmount ? (
                          <span>Hire Total: LKR {Number(tx.hireAmount).toLocaleString()}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center text-right shrink-0">
                    <span
                      className={`text-sm font-semibold font-mono ${
                        isDeduction ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {isDeduction ? "-" : "+"} LKR {Math.abs(tx.amount).toLocaleString()}.00
                    </span>
                    <span className="text-xs font-mono text-[var(--mut)]">
                      <span className={Number(tx.balanceAfter) < 0 ? "text-rose-700 font-bold" : ""}>Bal After: {formatRs(tx.balanceAfter)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
        </div>
      )}
    </div>
  );
}
