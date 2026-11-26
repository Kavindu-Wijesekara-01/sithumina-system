"use client";

import { todayYmd } from "@/lib/ledger";
import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import { Lorry } from "@/lib/mock-lorries";
import { Booking, subscribePublicFleet } from "@/lib/db-services";
import {
  createBookingAction,
  trackBookingAction,
} from "@/actions";
import LocationPicker, { type Pin } from "@/components/LocationPicker";
import { normalizePhoneNumber } from "@/lib/phone-utils";
import { findNearestSriLankanCity, getDistanceFromLatLonInKm } from "@/lib/geo-utils";
import { SRI_LANKA_CITIES } from "@/lib/sri-lanka-routes";

function resolveCityCoords(cityName?: string): [number, number] | null {
  if (!cityName) return null;
  const clean = cityName.toLowerCase().trim().replace(/[^a-z]/g, "");
  if (!clean) return null;
  if (SRI_LANKA_CITIES[clean]) return SRI_LANKA_CITIES[clean];
  const keys = Object.keys(SRI_LANKA_CITIES);
  const match = keys.find((k) => clean.includes(k) || k.includes(clean));
  if (match) return SRI_LANKA_CITIES[match];
  return null;
}

function getLorryBaseCity(lorry: Lorry): string {
  const isOutside = (lorry as any).isOutsideLorry || (lorry as any).ownershipType === "outside";
  if (isOutside) {
    return (lorry as any).baseCity || (lorry as any).baseLocation || lorry.route || "Registered Base";
  }
  return "Kiribathgoda";
}

type ViewState = "fleet" | "detail" | "booking-form" | "booking-success" | "track";

const PLACEHOLDER_VEHICLE_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 250' fill='%23F4F2EA'><rect width='400' height='250' fill='%23F4F2EA'/><circle cx='200' cy='125' r='40' fill='%23E5E0D0'/><text x='50%' y='68%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-weight='700' font-size='13' fill='%238C877A'>Verified Fleet Lorry</text></svg>";

function getVehicleImages(lorry: Lorry): string[] {
  const list: string[] = [];
  if (Array.isArray((lorry as any).images) && (lorry as any).images.length > 0) {
    list.push(
      ...(lorry as any).images.filter(
        (img: string) => img && typeof img === "string" && !img.startsWith("/img")
      )
    );
  } else if (
    (lorry as any).imageUrl &&
    typeof (lorry as any).imageUrl === "string" &&
    !(lorry as any).imageUrl.startsWith("/img")
  ) {
    list.push((lorry as any).imageUrl);
  }
  return list;
}

interface FleetVehicleCardProps {
  lorry: Lorry;
  locale: string;
  distanceKm?: number | null;
  onSelect: (lorry: Lorry) => void;
  onBook: (lorry: Lorry) => void;
}

function FleetVehicleCard({
  lorry,
  locale,
  distanceKm,
  onSelect,
  onBook,
}: FleetVehicleCardProps) {
  const images = getVehicleImages(lorry);
  const [activeIdx, setActiveIdx] = useState(0);

  const currentIdx = images.length > 0 ? activeIdx % images.length : 0;
  const currentImg = images[currentIdx] || PLACEHOLDER_VEHICLE_IMAGE;

  const baseCity = getLorryBaseCity(lorry);
  const isAvailable = (lorry as any).isAvailable !== false;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length <= 1) return;
    setActiveIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (images.length <= 1) return;
    setActiveIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      className={`rounded-2xl bg-[var(--card)] border transition-all shadow-xs flex flex-col justify-between overflow-hidden group ${
        isAvailable ? "border-[var(--line)] hover:border-[#FFC20E]" : "border-neutral-300 opacity-80"
      }`}
    >
      <div className="flex flex-col">
        {/* Interactive Image Container with Direct On-Card Photo Switching (Zero outer padding) */}
        <div
          onClick={() => onSelect(lorry)}
          className="relative aspect-[16/10] overflow-hidden bg-[var(--bg)] border-b border-[var(--line)] cursor-pointer select-none group/img"
          title={
            locale === "en"
              ? "Click to view full photo gallery and specifications"
              : "ඡායාරූප එකතුව සහ සම්පූර්ණ විස්තර බැලීමට ඔබන්න"
          }
        >
          <img
            src={currentImg}
            alt={`${lorry.plate} - Photo ${currentIdx + 1}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src = PLACEHOLDER_VEHICLE_IMAGE;
            }}
          />

          {/* Vehicle Plate Badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 z-10 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-black/85 text-white font-mono text-[11px] font-black backdrop-blur-xs shadow-xs">
              {lorry.plate}
            </span>
          </div>

          {/* Photo Counter Pill (e.g. 1/3 Photos) */}
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/80 text-white text-[10px] font-bold z-10 backdrop-blur-xs flex items-center gap-1 shadow-xs">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>
              {images.length > 1
                ? `${currentIdx + 1}/${images.length}`
                : images.length === 1
                ? "1 Photo"
                : "Verified"}
            </span>
          </div>

          {/* Previous / Next Arrow Controls for Multiple Photos */}
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label={locale === "en" ? "Previous photo" : "පෙර ඡායාරූපය"}
                onClick={handlePrev}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/65 hover:bg-black/90 active:scale-90 text-white flex items-center justify-center transition-all backdrop-blur-xs shadow-md z-20 cursor-pointer border border-white/20"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <button
                type="button"
                aria-label={locale === "en" ? "Next photo" : "ඊළඟ ඡායාරූපය"}
                onClick={handleNext}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/65 hover:bg-black/90 active:scale-90 text-white flex items-center justify-center transition-all backdrop-blur-xs shadow-md z-20 cursor-pointer border border-white/20"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Indicator Dots at bottom-center of the photo */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs z-20 shadow-xs">
                {images.map((_, dotIdx) => (
                  <button
                    key={dotIdx}
                    type="button"
                    aria-label={`Switch to photo ${dotIdx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveIdx(dotIdx);
                    }}
                    className={`transition-all rounded-full cursor-pointer border-0 p-0 ${
                      currentIdx === dotIdx
                        ? "w-4 h-1.5 bg-[#FFC20E]"
                        : "w-1.5 h-1.5 bg-white/60 hover:bg-white"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-3.5 pb-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-black text-[var(--ink)] truncate">
              {lorry.vehicleType || "Lorry Fleet"}
            </h3>
            <span className="font-mono text-[10px] font-black px-1.5 py-0.5 rounded bg-[var(--y3)] text-[#5B4300] border border-[var(--y2)] shrink-0">
              {lorry.plate}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--mut)]">
            {lorry.capacity && (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--ink)]">
                <span className="text-[10px] text-[var(--mut)] font-normal">
                  {locale === "en" ? "Size:" : "ප්‍රමාණය:"}
                </span>
                {lorry.capacity}
              </span>
            )}
            {lorry.maxWeight && (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--ink)]">
                <span className="text-[10px] text-[var(--mut)] font-normal">
                  {locale === "en" ? "Max:" : "උපරිම බර:"}
                </span>
                {lorry.maxWeight}
              </span>
            )}
          </div>

          {/* Base Location & Distance */}
          <div className="flex items-center justify-between gap-1 text-[11px] pt-1.5 border-t border-[var(--line)]">
            <span className="text-[var(--mut)] flex items-center gap-1 truncate">
              <span className="font-normal">{locale === "en" ? "Base:" : "මූලස්ථානය:"}</span>
              <strong className="text-[var(--ink)] font-bold">{baseCity}</strong>
            </span>
            {typeof distanceKm === "number" ? (
              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px] shrink-0">
                ~{Math.round(distanceKm)} km
              </span>
            ) : null}
          </div>

          {/* Driver & Availability status */}
          <div className="flex items-center justify-between text-[11px] pt-0.5">
            {lorry.driverName ? (
              <span className="text-[var(--mut)] text-[11px] truncate">
                {locale === "en" ? "Driver: " : "රියදුරු: "}<strong className="text-[var(--ink)] font-semibold">{lorry.driverName}</strong>
              </span>
            ) : <span />}

            {isAvailable ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {locale === "en" ? "Available" : "සේවයට සූදානම්"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-600 font-bold text-[10px] shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                {locale === "en" ? "Unavailable" : "දැනට සේවයේ නැත"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3.5 pt-0">
        <button
          type="button"
          onClick={() => onSelect(lorry)}
          className="flex-1 py-2 rounded-xl bg-[var(--bg)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] hover:bg-[var(--y3)] transition-all cursor-pointer"
        >
          {locale === "en" ? "Specs" : "විස්තර"}
        </button>
        {isAvailable ? (
          <button
            type="button"
            onClick={() => onBook(lorry)}
            className="flex-1 py-2 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black border-0 cursor-pointer hover:opacity-90 transition-all shadow-xs"
          >
            {locale === "en" ? "Book Vehicle" : "වෙන්කරන්න"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="flex-1 py-2 rounded-xl bg-neutral-200 text-neutral-500 text-xs font-bold border-0 cursor-not-allowed opacity-75"
            title={locale === "en" ? "This lorry is currently set to unavailable by owner" : "මෙම ලොරිය දැනට සේවයේ නොමැත"}
          >
            {locale === "en" ? "Unavailable" : "සේවයේ නැත"}
          </button>
        )}
      </div>
    </div>
  );
}

function BookVehicleContent() {
  const { locale } = useLanguage();
  const { profile } = useAuth();
  const searchParams = useSearchParams();

  const queryPlate = searchParams.get("plate");
  const queryLorryId = searchParams.get("lorryId");

  const [view, setView] = useState<ViewState>("fleet");

  // Fleet state
  const [fleet, setFleet] = useState<Lorry[]>([]);
  const [fleetLoading, setFleetLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Lorry | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // GPS State for customer live location
  const [isLocating, setIsLocating] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupPin, setPickupPin] = useState<Pin | null>(null);
  const [dropPin, setDropPin] = useState<Pin | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Location Proximity Search state
  const [searchLocation, setSearchLocation] = useState("");

  // Active coordinates derived from search city or live GPS
  const activeSearchCoords = React.useMemo<[number, number] | null>(() => {
    if (searchLocation.trim()) {
      return resolveCityCoords(searchLocation);
    }
    if (gpsCoords) {
      return [gpsCoords.lat, gpsCoords.lng];
    }
    return null;
  }, [searchLocation, gpsCoords]);

  // Proximity sorted and filtered fleet list
  const filteredAndSortedFleet = React.useMemo(() => {
    let list = fleet;

    const withDistance = list.map((lorry) => {
      let dist: number | null = null;
      if (activeSearchCoords) {
        const base = getLorryBaseCity(lorry);
        const lorryCoords = resolveCityCoords(base) || SRI_LANKA_CITIES["kiribathgoda"];
        if (lorryCoords) {
          dist = getDistanceFromLatLonInKm(
            activeSearchCoords[0],
            activeSearchCoords[1],
            lorryCoords[0],
            lorryCoords[1]
          );
        }
      }
      return { lorry, dist };
    });

    if (activeSearchCoords) {
      withDistance.sort((a, b) => {
        if (a.dist === null) return 1;
        if (b.dist === null) return -1;
        return a.dist - b.dist;
      });
    }

    return withDistance;
  }, [fleet, activeSearchCoords]);

  // Booking form state
  const [submitting, setSubmitting] = useState(false);
  const [submittedBooking, setSubmittedBooking] = useState<{
    id: string;
    trackingId: string;
    plate?: string;
    vehicleType?: string;
    dates?: string[];
    phone?: string;
  } | null>(null);

  const DEFAULT_CARGO_NATURE = "ගෘහ භාණ්ඩ / ලී බඩු (Furniture & Household Goods)";

  const [form, setForm] = useState<{
    pickup: string;
    destination: string;
    date: string;
    dates: string[];
    phone: string;
    customerName: string;
    idNumber: string;
    cargoNature: string;
    daysNeeded: string;
    cargoWeight: string;
    helpersCount: string;
    notes: string;
  }>({
    pickup: "",
    destination: "",
    date: "",
    dates: [],
    phone: profile?.phone || "",
    customerName: profile?.name && profile.name !== "Valued Customer" ? profile.name : "",
    idNumber: profile?.idNumber || "",
    cargoNature: DEFAULT_CARGO_NATURE,
    daysNeeded: "1",
    cargoWeight: "",
    helpersCount: "0",
    notes: "",
  });

  // Sync phone, name & idNumber automatically when customer profile hydrates from AuthContext
  useEffect(() => {
    if (!profile) return;
    setForm((prev) => ({
      ...prev,
      phone: prev.phone || profile.phone || "",
      customerName:
        prev.customerName ||
        (profile.name && profile.name !== "Valued Customer" ? profile.name : ""),
      idNumber: prev.idNumber || profile.idNumber || "",
    }));
  }, [profile]);

  // Tracking state
  const [trackQuery, setTrackQuery] = useState("");
  const [trackResults, setTrackResults] = useState<Booking[] | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState("");

  // Registered vehicles (public details only)
  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribePublicFleet((vehicles) => {
      if (!mounted) return;
      setFleet(vehicles);
      setFleetLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Preselect vehicle if provided via URL searchParams
  useEffect(() => {
    if (fleet.length > 0 && (queryPlate || queryLorryId)) {
      const match = fleet.find(
        (v) =>
          (queryPlate && v.plate.toUpperCase() === queryPlate.toUpperCase()) ||
          (queryLorryId && v.id.toUpperCase() === queryLorryId.toUpperCase())
      );
      if (match) {
        setSelectedVehicle(match);
        setView("booking-form");
      }
    }
  }, [fleet, queryPlate, queryLorryId]);

  // Customer Live Location (GPS) capture
  const handleCaptureLiveLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsError(
        locale === "en"
          ? "Geolocation is not supported by your browser."
          : "ඔබගේ බ්‍රවුසරය මඟින් GPS පහසුකම ලබාදිය නොහැක."
      );
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setGpsCoords({ lat, lng });

        // Resolve nearest Sri Lankan city name
        const nearestCity = findNearestSriLankanCity(lat, lng);
        setForm((prev) => ({
          ...prev,
          pickup: nearestCity,
        }));
        setIsLocating(false);
      },
      (err) => {
        console.warn("Geolocation capture error:", err);
        setGpsError(
          locale === "en"
            ? "Could not detect GPS location. Please type your pickup city manually."
            : "GPS ස්ථානය හඳුනාගත නොහැකි විය. කරුණාකර නගරය ඇතුළත් කරන්න."
        );
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  const handleSelectVehicle = (lorry: Lorry) => {
    setSelectedVehicle(lorry);
    setActivePhotoIdx(0);
    setView("detail");
  };

  const handleStartBookingWithVehicle = (lorry: Lorry) => {
    setSelectedVehicle(lorry);
    setView("booking-form");
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) {
      alert(
        locale === "en"
          ? "Please select a vehicle to book."
          : "කරුණාකර වෙන්කරගැනීම සඳහා වාහනයක් තෝරන්න."
      );
      return;
    }

    if ((selectedVehicle as any).isAvailable === false) {
      alert(
        locale === "en"
          ? "This vehicle is currently unavailable. Please choose another lorry."
          : "මෙම වාහනය දැනට සේවයේ නොමැත. කරුණාකර වෙනත් වාහනයක් තෝරාගන්න."
      );
      return;
    }

    const rawDigits = String(form.phone || "").replace(/[^0-9]/g, "");
    const cleanPhone = normalizePhoneNumber(form.phone) || form.phone?.replace(/[\s-]/g, "");
    if (!cleanPhone || rawDigits.length < 9) {
      alert(
        locale === "en"
          ? "A valid contact mobile phone number (at least 9-10 digits) is required."
          : "වලංගු ජංගම දුරකථන අංකයක් ඇතුළත් කිරීම අනිවාර්යයි."
      );
      return;
    }

    const cleanIdNumber = (form.idNumber || "").trim();
    if (!cleanIdNumber) {
      alert(
        locale === "en"
          ? "National ID Number (NIC) is required for customer verification."
          : "පාරිභෝගික තහවුරු කිරීම සඳහා ජාතික හැඳුනුම්පත් අංකය (NIC) ඇතුළත් කිරීම අනිවාර්යයි."
      );
      return;
    }

    const primaryDate = form.date || form.dates[0];
    const allSelectedDates = primaryDate ? [primaryDate] : [];

    if (!primaryDate) {
      alert(
        locale === "en"
          ? "Please select a booking date."
          : "කරුණාකර වෙන්කරන දිනය තෝරන්න."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await createBookingAction({
        pickup: form.pickup,
        destination: form.destination,
        vehicleType: selectedVehicle.vehicleType || "14ft Lorry",
        date: primaryDate,
        dates: allSelectedDates,
        phone: cleanPhone,
        customerName: form.customerName || (profile?.name ? profile.name : undefined),
        customerIdNumber: cleanIdNumber,
        notes: form.notes,
        assignedPlate: selectedVehicle.plate,
        assignedLorryId: selectedVehicle.id,
        pickupLat: pickupPin?.lat ?? gpsCoords?.lat,
        pickupLng: pickupPin?.lng ?? gpsCoords?.lng,
        pickupPinned: Boolean(pickupPin || gpsCoords),
        deliveryLat: dropPin?.lat,
        deliveryLng: dropPin?.lng,
        dropoffPinned: Boolean(dropPin),
        bookingType: "individual_vehicle",
        cargoNature: form.cargoNature,
        daysNeeded: String(allSelectedDates.length || form.daysNeeded || 1),
        cargoWeight: form.cargoWeight,
        helpersCount: form.helpersCount,
      });

      if (res.success) {
        setSubmittedBooking({
          id: res.data.id,
          trackingId: res.data.trackingId,
          plate: selectedVehicle.plate,
          vehicleType: selectedVehicle.vehicleType,
          dates: allSelectedDates,
          phone: cleanPhone,
        });
        setView("booking-success");
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        alert(
          res.error ||
            (locale === "en"
              ? "Failed to save booking. Please try again or call dispatch."
              : "වෙන්කිරීම සුරැකීමට නොහැකි විය. කරුණාකර දුරකථනයෙන් අමතන්න.")
        );
      }
    } catch {
      alert(
        locale === "en"
          ? "Failed to save booking. Please try again or call dispatch."
          : "වෙන්කිරීම සුරැකීමට නොහැකි විය. කරුණාකර දුරකථනයෙන් අමතන්න."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackQuery.trim()) return;
    setTrackLoading(true);
    setTrackError("");
    setTrackResults(null);
    try {
      const res = await trackBookingAction(trackQuery);
      if (!res.success) {
        setTrackError(
          locale === "en"
            ? res.error || "Error searching for bookings."
            : "සොයාගැනීමේ දෝෂයක්. කරුණාකර නැවත උත්සාහ කරන්න."
        );
      } else if (res.data.length === 0) {
        setTrackError(
          locale === "en"
            ? "No bookings found matching that Tracking ID or Phone Number."
            : "මෙම අංකයට අදාළ වෙන්කිරීම් කිසිවක් හමු නොවීය."
        );
      } else {
        const mapped: Booking[] = res.data.map((b) => ({
          id: b.id,
          trackingId: b.id,
          pickup: b.pickupCity,
          destination: b.deliveryCity,
          vehicleType: b.vehicleType,
          date: b.date,
          phone: b.customerPhone,
          notes: b.packageDetails,
          status: b.status as Booking["status"],
          assignedLorryPlate: b.assignedPlate,
          createdAt: b.createdAt,
        }));
        setTrackResults(mapped);
      }
    } catch {
      setTrackError(
        locale === "en"
          ? "Error searching for bookings. Please try again."
          : "සොයාගැනීමේ දෝෂයක්. කරුණාකර නැවත උත්සාහ කරන්න."
      );
    } finally {
      setTrackLoading(false);
    }
  };

  return (
    <main className="p-4 lg:p-[24px_32px] flex flex-col gap-6 max-w-4xl mx-auto w-full select-none">
      {/* Top Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-[var(--ink)] tracking-tight">
            {locale === "en" ? "Individual Vehicle Booking" : "වාහන වෙන්කරවා ගැනීම"}
          </h1>
          <p className="text-xs text-[var(--mut)] mt-0.5">
            {locale === "en"
              ? "Reserve specific lorries with simple date selection & Admin-scheduled dispatch times."
              : "සරල දින තේරීමක් සහ Admin මගින් වේලාව වෙන් කිරීමේ පහසුකම සමඟින් තනි ලොරි රථ වෙන්කරවා ගැනීම."}
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg)] rounded-xl border border-[var(--line)] text-xs font-bold">
          <button
            type="button"
            onClick={() => setView("fleet")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              view === "fleet" || view === "detail"
                ? "bg-[var(--y)] text-[#26231B] shadow-xs"
                : "text-[var(--mut)] hover:text-[var(--ink)]"
            }`}
          >
            {locale === "en" ? "Browse Fleet" : "වාහන ලැයිස්තුව"}
          </button>
          {selectedVehicle && (
            <button
              type="button"
              onClick={() => setView("booking-form")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                view === "booking-form"
                  ? "bg-[var(--y)] text-[#26231B] shadow-xs"
                  : "text-[var(--mut)] hover:text-[var(--ink)]"
              }`}
            >
              {locale === "en" ? "Book Vehicle" : "වෙන්කරන්න"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setView("track")}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
              view === "track"
                ? "bg-[var(--y)] text-[#26231B] shadow-xs"
                : "text-[var(--mut)] hover:text-[var(--ink)]"
            }`}
          >
            {locale === "en" ? "Track Booking" : "ලුහුබඳින්න"}
          </button>
        </div>
      </div>

      {/* VIEW 1: FLEET LIST VIEW */}
      {view === "fleet" && (
        <div className="flex flex-col gap-5">
          {/* Location Proximity Search & Filters */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-3.5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Search City Input */}
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--mut)] pointer-events-none">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder={
                    locale === "en"
                      ? "Search city to find nearest lorries (e.g. Kiribathgoda, Colombo, Kandy, Negombo)..."
                      : "ළඟම ඇති ලොරි සෙවීමට ඔබ සිටින නගරය ඇතුළත් කරන්න (උදා: කිරිබත්ගොඩ, කොළඹ, මහනුවර)..."
                  }
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs font-semibold text-[var(--ink)] placeholder:text-[var(--mut)] focus:outline-none focus:border-[#FFC20E] transition-colors"
                />
                {searchLocation && (
                  <button
                    type="button"
                    onClick={() => setSearchLocation("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-[var(--line)]/50 text-[var(--ink)] text-xs font-black flex items-center justify-center cursor-pointer hover:bg-[#FFC20E]"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Live GPS Locate Me Button */}
              <button
                type="button"
                onClick={handleCaptureLiveLocation}
                disabled={isLocating}
                className="px-3.5 py-2.5 rounded-xl bg-[var(--bg)] hover:bg-[var(--y3)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                </svg>
                <span>
                  {isLocating
                    ? (locale === "en" ? "Locating..." : "ස්ථානය සොයමින්...")
                    : (locale === "en" ? "Use My Location (GPS)" : "මගේ ස්ථානය (GPS)")}
                </span>
              </button>
            </div>

            {/* Quick City Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wider mr-1">
                {locale === "en" ? "Quick Cities:" : "නගර:"}
              </span>
              {["Kiribathgoda", "Colombo", "Gampaha", "Kandy", "Negombo", "Kurunegala", "Galle", "Kalutara"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSearchLocation(c)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    searchLocation.toLowerCase() === c.toLowerCase()
                      ? "bg-[#FFC20E] text-[#26231B] shadow-xs"
                      : "bg-[var(--bg)] text-[var(--ink)] border border-[var(--line)] hover:border-[#FFC20E]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Active Location Distance Indicator */}
            {activeSearchCoords && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                  {locale === "en"
                    ? `Nearest to ${searchLocation || "GPS location"}`
                    : `${searchLocation || "ඔබගේ ස්ථානයට"} ආසන්නතම අනුපිළිවෙළින්`}
                </span>
                <span className="text-xs text-[var(--mut)]">
                  {filteredAndSortedFleet.length} {locale === "en" ? "vehicles available" : "වාහන තිබේ"}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-[var(--ink)] uppercase tracking-wider">
              {locale === "en" ? "Available Fleet Lorries" : "ලියාපදිංචි ලොරි රථ"} ({fleetLoading ? "..." : filteredAndSortedFleet.length})
            </span>
          </div>

          {fleetLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-48 rounded-2xl bg-[var(--card)] border border-[var(--line)] animate-pulse" />
              ))}
            </div>
          ) : filteredAndSortedFleet.length === 0 ? (
            <div className="p-12 text-center bg-[var(--card)] rounded-2xl border border-[var(--line)]">
              <p className="text-sm font-bold text-[var(--ink)]">
                {locale === "en" ? "No fleet vehicles match your criteria." : "ගැලපෙන ලියාපදිංචි වාහන හමු නොවීය."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredAndSortedFleet.map(({ lorry, dist }) => (
                <FleetVehicleCard
                  key={lorry.id}
                  lorry={lorry}
                  locale={locale}
                  distanceKm={dist}
                  onSelect={handleSelectVehicle}
                  onBook={handleStartBookingWithVehicle}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: VEHICLE DETAIL VIEW */}
      {view === "detail" && selectedVehicle && (() => {
        const images = getVehicleImages(selectedVehicle);
        const activeImage = images[activePhotoIdx] || images[0] || PLACEHOLDER_VEHICLE_IMAGE;

        return (
          <div className="flex flex-col gap-5">
            <button
              type="button"
              onClick={() => setView("fleet")}
              className="text-xs font-bold text-[var(--mut)] hover:text-[var(--ink)] w-fit flex items-center gap-1.5 cursor-pointer"
            >
              ← {locale === "en" ? "Back to all vehicles" : "සියලු වාහන වෙත"}
            </button>

            {/* 3 Photos Gallery Section */}
            <div className="flex flex-col gap-3">
              <div className="relative w-full aspect-[16/10] sm:aspect-[21/9] rounded-2xl overflow-hidden bg-[var(--bg)] border border-[var(--line)] shadow-xs">
                <img
                  src={activeImage}
                  alt={`${selectedVehicle.vehicleType} – Photo ${activePhotoIdx + 1}`}
                  className="w-full h-full object-cover transition-opacity duration-200"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PLACEHOLDER_VEHICLE_IMAGE;
                  }}
                />
                {images.length > 0 && (
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/75 text-white text-xs font-bold backdrop-blur-xs flex items-center gap-1.5 shadow-xs">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <span>{locale === "en" ? `Photo ${activePhotoIdx + 1} of ${images.length}` : `ඡායාරූපය ${activePhotoIdx + 1} / ${images.length}`}</span>
                  </div>
                )}
                <div className="absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0]">
                  {locale === "en" ? "Verified Vehicle" : "ලියාපදිංචි වාහනය"}
                </div>

                {/* Left & Right Navigation Arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label={locale === "en" ? "Previous photo" : "කලින් ඡායාරූපය"}
                      onClick={() => setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/65 hover:bg-black/90 active:scale-95 text-white flex items-center justify-center transition-all backdrop-blur-xs shadow-md z-10 cursor-pointer border border-white/20"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      aria-label={locale === "en" ? "Next photo" : "ඊළඟ ඡායාරූපය"}
                      onClick={() => setActivePhotoIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/65 hover:bg-black/90 active:scale-95 text-white flex items-center justify-center transition-all backdrop-blur-xs shadow-md z-10 cursor-pointer border border-white/20"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* 3 Interactive Photo Thumbnails (Photo 1, Photo 2, Photo 3) */}
              {images.length > 1 && (
                <div className="grid grid-cols-3 gap-2.5">
                  {images.slice(0, 3).map((imgUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActivePhotoIdx(idx)}
                      className={`relative aspect-[16/10] rounded-xl overflow-hidden border-2 transition-all cursor-pointer p-0 bg-[var(--bg)] ${
                        activePhotoIdx === idx
                          ? "border-[#FFC20E] ring-2 ring-[#FFC20E]/40 shadow-xs scale-[1.02]"
                          : "border-[var(--line)] opacity-70 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={imgUrl}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = PLACEHOLDER_VEHICLE_IMAGE;
                        }}
                      />
                      <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                        {locale === "en" ? `Photo ${idx + 1}` : `පින්තූරය ${idx + 1}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-black px-2.5 py-1 rounded-md bg-[var(--y3)] text-[#5B4300] border border-[var(--y2)]">
                      {selectedVehicle.plate}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-[var(--bg)] text-[var(--ink)] border border-[var(--line)] font-bold text-xs">
                      {getLorryBaseCity(selectedVehicle)}
                    </span>
                  </div>
                  <h2 className="text-xl font-black text-[var(--ink)] mt-2">
                    {selectedVehicle.vehicleType}
                  </h2>
                  {selectedVehicle.driverName ? (
                    <p className="text-xs text-[var(--mut)] mt-1">
                      {locale === "en" ? "Driver / Owner: " : "රියදුරු / හිමිකරු: "}
                      <span className="font-semibold text-[var(--ink)]">{selectedVehicle.driverName}</span>
                      {selectedVehicle.driverPhone ? ` · ${selectedVehicle.driverPhone}` : ""}
                    </p>
                  ) : null}
                  <p className="text-xs text-[var(--mut)] mt-0.5">
                    {locale === "en" ? "Base Location: " : "මූලස්ථානය: "}
                    <span className="font-semibold text-[var(--ink)]">{getLorryBaseCity(selectedVehicle)}</span>
                  </p>
                </div>

                {(selectedVehicle as any).isAvailable !== false ? (
                  <button
                    type="button"
                    onClick={() => setView("booking-form")}
                    className="px-5 py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black border-0 cursor-pointer hover:opacity-90 shadow-xs"
                  >
                    {locale === "en" ? "Reserve This Lorry" : "මෙම ලොරිය වෙන්කරන්න"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="px-5 py-2.5 rounded-xl bg-neutral-200 text-neutral-500 text-xs font-bold border-0 cursor-not-allowed opacity-75"
                  >
                    {locale === "en" ? "Currently Unavailable" : "දැනට සේවයේ නැත"}
                  </button>
                )}
              </div>

              {/* Grid of All Real Vehicle Specs From App */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-3 border-t border-[var(--line)]">
                {/* 1. Cargo Dimensions / Size (දිග/පළල/උස) */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wider">
                    {locale === "en" ? "Cargo Dimensions (L × W × H)" : "ප්‍රමාණය / මානයන් (දිග × පළල × උස)"}
                  </span>
                  <span className="font-black text-sm text-[var(--ink)]">
                    {selectedVehicle.capacity || "—"}
                  </span>
                </div>

                {/* 2. Max Load Weight (ගත හැකි උපරිම බර) */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wider">
                    {locale === "en" ? "Max Load Weight" : "ගත හැකි උපරිම බර"}
                  </span>
                  <span className="font-black text-sm text-[var(--ink)]">
                    {selectedVehicle.maxWeight || "—"}
                  </span>
                </div>

                {/* 3. Availability Status */}
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wider">
                    {locale === "en" ? "Availability Status" : "වෙන්කිරීමේ තත්ත්වය"}
                  </span>
                  {(selectedVehicle as any).isAvailable !== false ? (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-black text-sm text-emerald-700">
                        {locale === "en" ? "Available for Booking" : "වෙන්කරවා ගත හැක"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="font-black text-sm text-rose-700">
                        {locale === "en" ? "Currently Unavailable" : "දැනට සේවයේ නැත"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Vehicle Details & Features (විශේෂාංග සහ විස්තර) */}
              {selectedVehicle.description ? (
                <div className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--line)] flex flex-col gap-1 text-xs">
                  <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wider">
                    {locale === "en" ? "Vehicle Details & Features" : "වාහනයේ විස්තර සහ විශේෂාංග"}
                  </span>
                  <p className="text-xs text-[var(--ink)] leading-relaxed whitespace-pre-wrap font-medium">
                    {selectedVehicle.description}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        );
      })()}

      {/* VIEW 3: STREAMLINED BOOKING FORM WITH CALENDAR & GPS */}
      {view === "booking-form" && selectedVehicle && (() => {
        const images = getVehicleImages(selectedVehicle);
        const activeImage = images[activePhotoIdx] || images[0] || PLACEHOLDER_VEHICLE_IMAGE;

        return (
          <form onSubmit={handleSubmitBooking} className="flex flex-col gap-6">
            {/* Selected Vehicle Card with 3 Photos Gallery */}
            <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--y)] text-[#26231B] flex items-center justify-center font-black text-sm">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-[var(--y3)] text-[#5B4300] border border-[var(--y2)]">
                        {selectedVehicle.plate}
                      </span>
                      <span className="text-sm font-black text-[var(--ink)]">
                        {selectedVehicle.vehicleType}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--mut)] mt-1">
                      {selectedVehicle.capacity && (
                        <span>
                          <strong className="text-[var(--ink)] font-bold">{locale === "en" ? "Size: " : "ප්‍රමාණය: "}</strong>
                          {selectedVehicle.capacity}
                        </span>
                      )}
                      {selectedVehicle.maxWeight && (
                        <span>
                          <strong className="text-[var(--ink)] font-bold">{locale === "en" ? "Max Load: " : "උපරිම බර: "}</strong>
                          {selectedVehicle.maxWeight}
                        </span>
                      )}
                      {selectedVehicle.driverName && (
                        <span>
                          <strong className="text-[var(--ink)] font-bold">{locale === "en" ? "Driver: " : "රියදුරු: "}</strong>
                          {selectedVehicle.driverName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setView("fleet")}
                  className="text-xs font-bold text-[#5B4300] hover:underline cursor-pointer"
                >
                  {locale === "en" ? "Change Vehicle" : "වෙනත් වාහනයක් තෝරන්න"}
                </button>
              </div>

              {/* Unavailable Warning */}
              {(selectedVehicle as any).isAvailable === false && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2.5">
                  <div>
                    <strong className="font-bold block">
                      {locale === "en" ? "Vehicle Currently Unavailable" : "මෙම වාහනය දැනට සේවයේ නොමැත"}
                    </strong>
                    <span className="text-[11px]">
                      {locale === "en"
                        ? "The owner has marked this vehicle as unavailable. Please choose another active vehicle from the fleet."
                        : "වාහන හිමිකරු විසින් මෙය Unavailable ලෙස සලකුණු කර ඇත. කරුණාකර වෙනත් වාහනයක් තෝරාගන්න."}
                    </span>
                  </div>
                </div>
              )}

              {/* 3 Photos Gallery for Vehicle Inspection Before Booking */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[var(--ink)]">
                    {locale === "en" ? "Vehicle Photos (Inspect Before Booking)" : "වාහනයේ ඡායාරූප (වෙන්කරන්න පෙර පරීක්ෂා කරන්න)"}
                  </span>
                  {images.length > 0 && (
                    <span className="text-[11px] font-bold text-[var(--mut)]">
                      {locale === "en" ? `Viewing Photo ${activePhotoIdx + 1} of ${images.length}` : `ඡායාරූපය ${activePhotoIdx + 1} / ${images.length}`}
                    </span>
                  )}
                </div>

                {/* Main Photo Display */}
                <div className="relative w-full aspect-[16/10] sm:aspect-[21/9] rounded-xl overflow-hidden bg-[var(--bg)] border border-[var(--line)] select-none">
                  <img
                    src={activeImage}
                    alt={`${selectedVehicle.vehicleType} – Photo ${activePhotoIdx + 1}`}
                    className="w-full h-full object-cover transition-opacity duration-200"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = PLACEHOLDER_VEHICLE_IMAGE;
                    }}
                  />
                  <div className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0]">
                    Verified Photos
                  </div>

                  {/* Left & Right navigation arrows on booking form photo */}
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label={locale === "en" ? "Previous photo" : "කලින් ඡායාරූපය"}
                        onClick={() => setActivePhotoIdx((prev) => (prev > 0 ? prev - 1 : images.length - 1))}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/65 hover:bg-black/90 active:scale-95 text-white flex items-center justify-center transition-all backdrop-blur-xs shadow-md z-10 cursor-pointer border border-white/20"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 18 9 12 15 6" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label={locale === "en" ? "Next photo" : "ඊළඟ ඡායාරූපය"}
                        onClick={() => setActivePhotoIdx((prev) => (prev < images.length - 1 ? prev + 1 : 0))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/65 hover:bg-black/90 active:scale-95 text-white flex items-center justify-center transition-all backdrop-blur-xs shadow-md z-10 cursor-pointer border border-white/20"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>

                {/* 3 Photo Thumbnails */}
                {images.length > 1 && (
                  <div className="grid grid-cols-3 gap-2">
                    {images.slice(0, 3).map((imgUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={`relative aspect-[16/10] rounded-lg overflow-hidden border-2 transition-all cursor-pointer p-0 bg-[var(--bg)] ${
                          activePhotoIdx === idx
                            ? "border-[#FFC20E] ring-2 ring-[#FFC20E]/40 shadow-xs scale-[1.02]"
                            : "border-[var(--line)] opacity-70 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={imgUrl}
                          alt={`Photo ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = PLACEHOLDER_VEHICLE_IMAGE;
                          }}
                        />
                        <span className="absolute bottom-1 right-1 bg-black/75 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                          {locale === "en" ? `Photo ${idx + 1}` : `පින්තූරය ${idx + 1}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          {/* Location Details Section: Badu Ganna Thana & Badu Baana Thana */}
          <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
            <h3 className="text-sm font-black text-[var(--ink)]">
              {locale === "en" ? "Pickup & Delivery Locations" : "බඩු පටවන සහ බාන ස්ථාන"}
            </h3>

            {/* Badu Ganna Thana (Pickup) with Live GPS button */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">
                  {locale === "en" ? "Pickup Location (Cargo Loading)" : "බඩු පටවන ස්ථානය (Pickup)"} *
                </label>
                <button
                  type="button"
                  onClick={handleCaptureLiveLocation}
                  disabled={isLocating}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[var(--y)] text-[#26231B] text-[11px] font-black cursor-pointer hover:opacity-90 active:scale-95 transition-all shadow-xs border-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <span>
                    {isLocating
                      ? (locale === "en" ? "Detecting GPS..." : "ස්ථානය හඳුනාගනිමින්...")
                      : (locale === "en" ? "Use My Live GPS" : "මගේ සජීවී GPS ස්ථානය")}
                  </span>
                </button>
              </div>

              <input
                type="text"
                required
                value={form.pickup}
                onChange={(e) => setForm({ ...form, pickup: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] font-semibold"
              />
              <LocationPicker
                label={locale === "en" ? "Pickup location" : "බඩු ගන්නා ස්ථානය"}
                address={form.pickup}
                pin={pickupPin}
                onChange={setPickupPin}
                locale={locale}
              />

              {gpsCoords && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
                  <span>
                    GPS Lat: {gpsCoords.lat.toFixed(4)}, Lng: {gpsCoords.lng.toFixed(4)} ({form.pickup})
                  </span>
                </div>
              )}

              {gpsError && (
                <p className="text-[11px] text-amber-700 mt-1 font-semibold">{gpsError}</p>
              )}
            </div>

            {/* Badu Baana Thana (Destination) */}
            <div>
              <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                {locale === "en" ? "Delivery Destination (Cargo Drop-off)" : "බඩු බාන ස්ථානය (Destination)"} *
              </label>
              <input
                type="text"
                required
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] font-semibold"
              />
              <LocationPicker
                label={locale === "en" ? "Drop-off location" : "බඩු බාන ස්ථානය"}
                address={form.destination}
                pin={dropPin}
                onChange={setDropPin}
                locale={locale}
              />
            </div>
          </div>

          {/* Simple Booking Date Input (No calendar or date locking — Admin allocates exact time & rider on review) */}
          <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-black text-[var(--ink)]">
                {locale === "en" ? "Booking Date *" : "වෙන්කරන දිනය *"}
              </h3>
              <p className="text-xs text-[var(--mut)] mt-0.5">
                {locale === "en"
                  ? "Select your preferred trip date. Head Office will review your request and allocate the exact time duration and rider."
                  : "ඔබට අවශ්‍ය ගමන් දිනය තෝරා එවන්න. ප්‍රධාන කාර්යාලය මඟින් පරීක්ෂා කර සුදුසු වේලාව සහ රියදුරෙකු වෙන්කර දෙනු ඇත."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label
                  htmlFor="individual-booking-date"
                  className="block text-xs font-bold text-[var(--ink)] mb-1.5"
                >
                  {locale === "en" ? "Preferred Trip Date *" : "අවශ්‍ය දිනය *"}
                </label>
                <input
                  id="individual-booking-date"
                  type="date"
                  required
                  min={todayYmd()}
                  value={form.date}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      date: nextDate,
                      dates: nextDate ? [nextDate] : [],
                    }));
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm font-mono font-bold text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
                />
              </div>

              {form.date && (
                <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-amber-950">
                    {locale === "en" ? "Selected Date:" : "තෝරාගත් දිනය:"}{" "}
                    <span className="font-mono font-black text-[#26231B]">{form.date}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, date: "", dates: [] }))}
                    className="text-[11px] font-bold text-red-600 hover:underline cursor-pointer"
                  >
                    {locale === "en" ? "Clear" : "ඉවත් කරන්න"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Customer Contact & Cargo Notes */}
          <div className="p-5 rounded-2xl bg-[var(--card)] border border-[var(--line)] shadow-xs flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-black text-[var(--ink)]">
                {locale === "en" ? "Customer Contact & Goods Details" : "පාරිභෝගික තොරතුරු සහ භාණ්ඩයේ විස්තර"}
              </h3>
              <p className="text-[11px] text-[var(--mut)] mt-0.5">
                {locale === "en"
                  ? "Please provide accurate cargo information and your direct phone number for immediate driver coordination."
                  : "රියදුරු සම්බන්ධීකරණය සහ ආරක්ෂිත ප්‍රවාහනය සඳහා නිවැරදි භාණ්ඩ විස්තර සහ දුරකථන අංකය ඇතුළත් කරන්න."}
              </p>
            </div>

            {/* Mobile Phone, Customer Name & National ID Number (NIC) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-black text-[var(--ink)] mb-1">
                  {locale === "en" ? "Mobile Phone Number *" : "ජංගම දුරකථන අංකය *"}
                  <span className="text-red-600 ml-1 font-bold">({locale === "en" ? "Mandatory" : "අනිවාර්යයි"})</span>
                </label>
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm font-mono font-bold text-[var(--ink)] focus:outline-none focus:border-[#26231B]"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-[var(--ink)] mb-1">
                  {locale === "en" ? "National ID (NIC) *" : "ජාතික හැඳුනුම්පත් අංකය (NIC) *"}
                  <span className="text-red-600 ml-1 font-bold">({locale === "en" ? "Mandatory" : "අනිවාර්යයි"})</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={locale === "en" ? "e.g. 199012345678 or 901234567V" : "උදා: 199012345678 හෝ 901234567V"}
                  value={form.idNumber}
                  onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm font-mono uppercase text-[var(--ink)] focus:outline-none focus:border-[#26231B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  {locale === "en" ? "Customer Name (Optional)" : "ඔබගේ නම (විකල්ප)"}
                </label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] focus:outline-none focus:border-[#26231B]"
                />
              </div>
            </div>

            {/* Nature of Cargo & Days Needed */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  {locale === "en" ? "Nature of Goods / Cargo *" : "ගෙන යන භාණ්ඩයේ ස්වභාවය *"}
                </label>
                <select
                  value={form.cargoNature}
                  onChange={(e) => setForm({ ...form, cargoNature: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none focus:border-[#26231B]"
                >
                  <option value="ගෘහ භාණ්ඩ / ලී බඩු (Furniture & Household Goods)">
                    {locale === "en" ? "Furniture & Household Goods" : "ගෘහ භාණ්ඩ / ලී බඩු"}
                  </option>
                  <option value="එළවළු / පලතුරු / ආහාර ද්‍රව්‍ය (Produce & Perishables)">
                    {locale === "en" ? "Produce & Perishable Food" : "එළවළු / පලතුරු / ආහාර ද්‍රව්‍ය"}
                  </option>
                  <option value="ඉදිකිරීම් ද්‍රව්‍ය / හාඩ්වෙයාර් (Construction & Hardware)">
                    {locale === "en" ? "Construction & Hardware Items" : "ඉදිකිරීම් ද්‍රව්‍ය / හාඩ්වෙයාර්"}
                  </option>
                  <option value="යන්ත්‍රෝපකරණ / කාර්මික භාණ්ඩ (Machinery & Industrial Equipment)">
                    {locale === "en" ? "Machinery & Industrial Equipment" : "යන්ත්‍රෝපකරණ / කාර්මික භාණ්ඩ"}
                  </option>
                  <option value="වීදුරු / බිඳෙනසුලු භාණ්ඩ (Fragile Goods & Glassware)">
                    {locale === "en" ? "Fragile Goods & Glassware" : "වීදුරු / බිඳෙනසුලු භාණ්ඩ"}
                  </option>
                  <option value="ඇඟලුම් / රෙදිපිළි (Garments & Textiles)">
                    {locale === "en" ? "Garments & Textiles" : "ඇඟලුම් / රෙදිපිළි"}
                  </option>
                  <option value="සාමාන්‍ය භාණ්ඩ (General Merchandise)">
                    {locale === "en" ? "General Merchandise / Other" : "වෙනත් සාමාන්‍ය භාණ්ඩ"}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  {locale === "en" ? "Duration / How Many Days Needed? *" : "දින කීයක් අවශ්‍යද? *"}
                </label>
                <select
                  value={form.daysNeeded}
                  onChange={(e) => setForm({ ...form, daysNeeded: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none focus:border-[#26231B]"
                >
                  <option value="1">{locale === "en" ? "1 Day (Single Trip)" : "දින 1යි (තනි ගමන)"}</option>
                  <option value="2">{locale === "en" ? "2 Days" : "දින 2ක්"}</option>
                  <option value="3">{locale === "en" ? "3 Days" : "දින 3ක්"}</option>
                  <option value="4">{locale === "en" ? "4 Days" : "දින 4ක්"}</option>
                  <option value="5">{locale === "en" ? "5 Days" : "දින 5ක්"}</option>
                  <option value="7">{locale === "en" ? "1 Week (7 Days)" : "සතියක් (දින 7ක්)"}</option>
                </select>
              </div>
            </div>

            {/* Estimated Cargo Weight & Helpers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  {locale === "en" ? "Estimated Cargo Weight (Optional)" : "භාණ්ඩයේ ඇස්තමේන්තුගත බර (විකල්ප)"}
                </label>
                <input
                  type="text"
                  value={form.cargoWeight}
                  onChange={(e) => setForm({ ...form, cargoWeight: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] focus:outline-none focus:border-[#26231B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  {locale === "en" ? "Helpers Needed for Loading" : "බඩු පැටවීමට සහ බෑමට සහායකයින්"}
                </label>
                <select
                  value={form.helpersCount}
                  onChange={(e) => setForm({ ...form, helpersCount: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs sm:text-sm font-semibold text-[var(--ink)] focus:outline-none focus:border-[#26231B]"
                >
                  <option value="0">{locale === "en" ? "No Helpers Required (Driver only)" : "සහායකයින් අවශ්‍ය නැත (රියදුරු පමණි)"}</option>
                  <option value="1">{locale === "en" ? "1 Helper Required" : "සහායකයෙකු 1ක් අවශ්‍යයි"}</option>
                  <option value="2">{locale === "en" ? "2 Helpers Required" : "සහායකයින් 2ක් අවශ්‍යයි"}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                {locale === "en" ? "Additional Notes / Package Instructions" : "අමතර විස්තර හෝ විශේෂ උපදෙස්"}
              </label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-[var(--ink)] focus:outline-none focus:border-[#26231B] resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || (form.dates.length === 0 && !form.date)}
              className="mt-2 py-3.5 rounded-xl bg-[var(--y)] text-[#26231B] text-sm font-black border-0 cursor-pointer hover:opacity-90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
            >
              {submitting
                ? (locale === "en" ? "Submitting Booking..." : "වෙන්කිරීම සටහන් කරමින්...")
                : (locale === "en" ? "Confirm Vehicle Booking" : "වාහනය වෙන්කිරීම තහවුරු කරන්න")}
            </button>
          </div>
        </form>
      );
    })()}

      {/* VIEW 4: BOOKING SUCCESS */}
      {view === "booking-success" && submittedBooking && (
        <div className="p-8 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-sm text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#E6F4EA] border border-[#CEEAD6] flex items-center justify-center text-[#137333]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>

          <h2 className="text-xl font-black text-[var(--ink)]">
            {locale === "en" ? "Booking Request Submitted" : "වෙන්කිරීමේ ඉල්ලීම සාර්ථකව යොමු විය"}
          </h2>

          <div className="p-4 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex flex-col items-center gap-1.5 w-full max-w-sm">
            <span className="text-[10px] font-bold text-[var(--mut)] uppercase tracking-wider">
              {locale === "en" ? "Tracking Reference ID" : "ලුහුබැඳීමේ අංකය"}
            </span>
            <span className="font-mono text-xl font-black text-[#5B4300]">
              {submittedBooking.trackingId}
            </span>
            {submittedBooking.plate && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
                <span className="font-mono font-black px-2 py-0.5 rounded bg-[var(--y3)] text-[#5B4300] border border-[var(--y2)]">
                  {submittedBooking.plate}
                </span>
                {submittedBooking.dates && submittedBooking.dates.length > 0 && (
                  <span className="font-semibold text-[var(--ink)]">
                    {submittedBooking.dates.join(", ")}
                  </span>
                )}
              </div>
            )}
            <span className="mt-1 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {locale === "en" ? "Pending Head Office Approval" : "ප්‍රධාන කාර්යාලයේ අනුමැතිය අපේක්ෂාවෙන්"}
            </span>
          </div>

          <p className="text-xs text-[var(--mut)] max-w-md">
            {locale === "en"
              ? "Your individual lorry booking has been added to your Customer Account Dashboard as Pending. Once Head Office sends your quoted amount, you can pay and upload your slip right inside My Account."
              : "ඔබගේ ලොරි වෙන්කිරීම පාරිභෝගික ගිණුමේ 'අනුමැතිය අපේක්ෂාවෙන්' (Pending) ලෙස සටහන් වී ඇත. ප්‍රධාන කාර්යාලය මිල ගණන එවූ පසු ඔබේ ගිණුම හරහා ගෙවීම් Slip එක upload කළ හැක."}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/login"
              className="px-5 py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black no-underline hover:opacity-90 shadow-xs"
            >
              {locale === "en" ? "Open My Account Dashboard" : "මගේ ගිණුමෙන් බලන්න"}
            </Link>
            <button
              type="button"
              onClick={() => {
                setSelectedVehicle(null);
                setForm({
                  pickup: "",
                  destination: "",
                  date: "",
                  dates: [],
                  phone: profile?.phone || "",
                  customerName:
                    profile?.name && profile.name !== "Valued Customer" ? profile.name : "",
                  idNumber: profile?.idNumber || "",
                  cargoNature: DEFAULT_CARGO_NATURE,
                  daysNeeded: "1",
                  cargoWeight: "",
                  helpersCount: "0",
                  notes: "",
                });
                setGpsCoords(null);
                setView("fleet");
              }}
              className="px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs font-bold text-[var(--ink)] cursor-pointer hover:bg-[var(--y3)]"
            >
              {locale === "en" ? "Book Another Vehicle" : "තවත් වාහනයක් වෙන්කරන්න"}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 5: TRACK BOOKING */}
      {view === "track" && (
        <div className="flex flex-col gap-5">
          <form onSubmit={handleTrack} className="flex gap-2">
            <input
              type="text"
              placeholder={locale === "en" ? "Enter Tracking ID or Phone..." : "ලුහුබැඳීමේ අංකය හෝ දුරකථන අංකය..."}
              value={trackQuery}
              onChange={(e) => setTrackQuery(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--card)] text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink)]"
            />
            <button
              type="submit"
              disabled={trackLoading}
              className="px-5 py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black border-0 cursor-pointer hover:opacity-90 shadow-xs"
            >
              {trackLoading ? "..." : (locale === "en" ? "Search" : "සොයන්න")}
            </button>
          </form>

          {trackError && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 font-semibold">
              {trackError}
            </div>
          )}

          {trackResults && trackResults.length > 0 && (
            <div className="flex flex-col gap-3">
              {trackResults.map((res) => {
                const statusLabel =
                  res.status === "awaiting_payment"
                    ? locale === "en"
                      ? "Quoted — Pay & Upload Slip"
                      : "මිල ගණන් එවා ඇත — ගෙවා Slip එවන්න"
                    : res.status === "payment_submitted"
                    ? locale === "en"
                      ? "Payment Slip Under Review"
                      : "ගෙවීම් Slip පරීක්ෂා කරමින්"
                    : res.status === "accepted" || res.status === "booked" || res.status === "confirmed"
                    ? locale === "en"
                      ? "Approved"
                      : "අනුමත කළා"
                    : res.status === "assigned"
                    ? locale === "en"
                      ? "Rider Assigned"
                      : "රයිඩර් වෙන්කළා"
                    : res.status === "in_transit"
                    ? locale === "en"
                      ? "In Transit"
                      : "ගමනේ යෙදෙමින්"
                    : res.status === "delivered"
                    ? locale === "en"
                      ? "Delivered"
                      : "භාර දුන්නා"
                    : res.status === "cancelled"
                    ? locale === "en"
                      ? "Cancelled"
                      : "අවලංගු කළා"
                    : locale === "en"
                    ? "Pending Quote / Review"
                    : "මිල ගණන් අපේක්ෂාවෙන්";

                return (
                  <div key={res.id} className="p-4 rounded-xl bg-[var(--card)] border border-[var(--line)] flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black">{res.id}</span>
                        {res.assignedLorryPlate && (
                          <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-[var(--y3)] text-[#5B4300] border border-[var(--y2)]">
                            {res.assignedLorryPlate}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-[#5B4300]">{statusLabel}</span>
                    </div>
                    <div className="text-xs text-[var(--mut)]">
                      <span>{res.pickup} → {res.destination}</span>
                      <span className="ml-3 font-semibold">Date: {res.date}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function BookVehiclePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs font-bold text-[var(--mut)]">Loading booking system...</div>}>
      <BookVehicleContent />
    </Suspense>
  );
}
