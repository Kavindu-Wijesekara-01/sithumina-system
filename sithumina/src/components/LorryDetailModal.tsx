"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Lorry } from "@/lib/mock-lorries";
import { LorryStatusBadge } from "./LorryStatusBadge";
import { useLanguage } from "@/context/LanguageContext";
import { LiveLorryBookingModal } from "./LiveLorryBookingModal";

// Dynamically import the Leaflet dedicated map with SSR disabled
const DynamicDedicatedRouteMap = dynamic(
  () =>
    import("./DedicatedLorryRouteMap").then((mod) => mod.DedicatedLorryRouteMap),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[220px] bg-[#F7F5EE] flex flex-col items-center justify-center gap-2 text-xs font-semibold text-[#6F6A5A]">
        <div className="w-6 h-6 border-2 border-[#FFC20E] border-t-[#26231B] rounded-full animate-spin" />
        <span>Loading Live Route...</span>
      </div>
    ),
  }
);

interface LorryDetailModalProps {
  lorry: Lorry | null;
  onClose: () => void;
}

export const LorryDetailModal: React.FC<LorryDetailModalProps> = ({
  lorry,
  onClose,
}) => {
  const { locale } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Lock background scrolling and handle Escape key
  useEffect(() => {
    if (!lorry) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isMapFullscreen) {
          setIsMapFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [lorry, onClose, isMapFullscreen]);

  if (!mounted || !lorry) return null;

  const hasTripPath = Boolean(lorry.startLocation || lorry.endLocation);
  const isMoving = lorry.speedKmH !== undefined && lorry.speedKmH > 2;

  const modalContent = (
    <div
      className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/65 backdrop-blur-sm transition-opacity duration-200 select-none overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-lorry-plate"
    >
      <div
        className="relative w-full max-w-lg bg-[#FFFFFF] rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden my-0 sm:my-auto max-h-[92vh] sm:max-h-[90vh] flex flex-col border border-[#E7E2D0] animate-in fade-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. TOP SECTION: INTERACTIVE LIVE ROUTE MAP */}
        <div className="relative w-full h-[240px] sm:h-[270px] flex-none bg-[#F7F5EE] overflow-hidden">
          <DynamicDedicatedRouteMap
            lorry={lorry}
            height="100%"
            className="w-full h-full"
            onToggleFullscreen={() => setIsMapFullscreen(true)}
            isFullscreen={false}
          />

          {/* Floating Fullscreen Button on Top-Right next to Close Button */}
          <button
            type="button"
            onClick={() => setIsMapFullscreen(true)}
            className="absolute top-3.5 right-14 z-[1000] h-9 px-3 rounded-full bg-white/95 hover:bg-white text-[#26231B] shadow-md flex items-center gap-1.5 font-extrabold text-xs transition-all border border-[#E7E2D0] cursor-pointer active:scale-95 backdrop-blur-sm"
            aria-label="View Fullscreen Map"
            title="View Fullscreen Map"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
            <span className="text-[11px] font-bold">Fullscreen</span>
          </button>

          {/* Floating Close Button on Top-Right */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 z-[1000] w-9 h-9 rounded-full bg-white/95 hover:bg-white text-[#26231B] shadow-md flex items-center justify-center font-bold text-sm transition-all border border-[#E7E2D0] cursor-pointer active:scale-95 backdrop-blur-sm"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* 2. OVERLAPPING MODERN BOTTOM SHEET */}
        <div className="-mt-8 relative z-10 bg-[#FFFFFF] rounded-t-[28px] sm:rounded-t-[32px] border-t border-[#EAE6D8] shadow-[0_-10px_30px_rgba(0,0,0,0.08)] p-4 sm:p-5 flex flex-col gap-3.5 overflow-y-auto flex-1">
          {/* Subtle Pull Indicator */}
          <div className="w-12 h-1.5 bg-[#DDD7C6] rounded-full mx-auto -mt-1 mb-0.5 flex-none" />

          {/* Header Row: Vehicle Icon, Plate, Status, Vehicle Type */}
          <div className="flex items-center justify-between gap-2.5 pb-2 border-b border-[#F0ECE1]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#FFC20E] flex items-center justify-center text-[#26231B] flex-none shadow-xs">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 7h13v10H1zM14 10h5l3 3v4h-8" />
                  <circle cx="6" cy="18" r="2" />
                  <circle cx="17" cy="18" r="2" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    id="modal-lorry-plate"
                    className="text-base sm:text-lg font-black text-[#26231B] tracking-tight m-0 truncate"
                  >
                    {lorry.plate}
                  </h3>
                  <LorryStatusBadge status={lorry.status} />
                </div>
                <span className="text-[11.5px] font-semibold text-[#6F6A5A] truncate">
                  {lorry.vehicleType || "Commercial Lorry Fleet"}
                </span>
              </div>
            </div>

            {/* Live Movement Telemetry Pill */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#F4F9F5] border border-[#CDE8D5] text-[#1E9E5A] text-[11px] font-bold flex-none">
              <span className="w-2 h-2 rounded-full bg-[#1E9E5A] animate-pulse" />
              <span>
                {isMoving
                  ? `${Math.round(lorry.speedKmH!)} km/h`
                  : (locale === "en" ? "Standby" : "නැවතී ඇත")}
              </span>
            </div>
          </div>

          {/* Start to Destination Live Route Corridor (PickMe / Uber ride style) */}
          {hasTripPath && (
            <div className="bg-[#FAF8F3] border border-[#E7E2D0] rounded-2xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[10.5px] font-bold text-[#8A8474] uppercase tracking-wider">
                <span>{locale === "en" ? "Trip Details" : "ගමන් විස්තර"}</span>
                <span className="text-[#1E9E5A] font-bold">
                  {isMoving
                    ? (locale === "en" ? `Moving · ${Math.round(lorry.speedKmH!)} km/h` : `ධාවනය වේ · ${Math.round(lorry.speedKmH!)} km/h`)
                    : (locale === "en" ? "Live on standby" : "සජීවීව පවතී")}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Start Point */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-3 h-3 rounded-full bg-[#1E9E5A] ring-4 ring-[#1E9E5A]/20 flex-none" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] text-[#8A8474] font-medium leading-none">
                      {locale === "en" ? "Start" : "ආරම්භය"}
                    </span>
                    <span className="font-extrabold text-[#26231B] text-xs sm:text-[13px] truncate">
                      {lorry.startLocation || "Origin"}
                    </span>
                  </div>
                </div>

                {/* Corridor Arrow */}
                <div className="flex items-center text-[#8A8474] flex-none px-1">
                  <span className="text-xs font-mono font-bold">──▶</span>
                </div>

                {/* Destination Point */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-3 h-3 rounded-full bg-[#D9381E] ring-4 ring-[#D9381E]/20 flex-none" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] text-[#8A8474] font-medium leading-none">
                      {locale === "en" ? "Destination" : "ගමනාන්තය"}
                    </span>
                    <span className="font-extrabold text-[#26231B] text-xs sm:text-[13px] truncate">
                      {lorry.endLocation || lorry.finalDestination || "Destination"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Final Destination / Corridor Info */}
              {((lorry.finalDestination && lorry.finalDestination !== lorry.endLocation) || lorry.travelRoute) && (
                <div className="text-[11px] text-[#6F6A5A] pt-1.5 border-t border-[#EAE6D8] flex items-center justify-between">
                  <span className="font-semibold text-[#8A8474]">
                    {locale === "en" ? "Via Corridor:" : "මාර්ගය:"}
                  </span>
                  <span className="font-bold text-[#26231B] truncate ml-1 text-right">
                    {lorry.travelRoute || lorry.route}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Driver & Direct Contact Row */}
          <div className="flex items-center justify-between p-2.5 px-3 rounded-2xl bg-[#F8F6EF] border border-[#E7E2D0]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#26231B] text-white flex items-center justify-center font-black text-xs flex-none shadow-xs">
                {(lorry.driverName || "D").charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[10px] font-bold text-[#8A8474] uppercase tracking-wider">
                  {locale === "en" ? "Driver Name" : "රියදුරු නම"}
                </span>
                <span className="font-extrabold text-[#26231B] text-xs sm:text-[13px] truncate">
                  {lorry.driverName || (locale === "en" ? "Fleet Driver" : "සිතුමිණ රියදුරු")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsBookingModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] active:scale-95 text-[#26231B] font-extrabold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title={locale === "en" ? "Book online to connect with driver" : "රියදුරු සම්බන්ධ කරගැනීමට වෙන්කරන්න"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>{locale === "en" ? "Book to Connect" : "වෙන්කර අමතන්න"}</span>
            </button>
          </div>

          {/* Specifications Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* Payload Capacity */}
            <div className="bg-[#FAF8F3] p-2.5 rounded-xl border border-[#E7E2D0] flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#8A8474] uppercase tracking-wider">
                {locale === "en" ? "Payload Capacity" : "ධාරිතාව"}
              </span>
              <span className="font-extrabold text-[#26231B] text-[12px] truncate">
                {lorry.capacity || lorry.availableCapacityKg || (locale === "en" ? "Standard Payload" : "සම්මත ධාරිතාව")}
              </span>
            </div>

            {/* Available Space */}
            <div className="bg-[#FAF8F3] p-2.5 rounded-xl border border-[#E7E2D0] flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#8A8474] uppercase tracking-wider">
                {locale === "en" ? "Available Space" : "ලබාගත හැකි ඉඩ"}
              </span>
              <span className="font-extrabold text-[#26231B] text-[12px] truncate">
                {lorry.availableSpace || "Full (100%)"}
              </span>
            </div>

            {/* Emptying Time if present */}
            {lorry.emptyTime && (
              <div className="bg-[#FAF8F3] p-2.5 rounded-xl border border-[#E7E2D0] flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-[#8A8474] uppercase tracking-wider">
                  {locale === "en" ? "Emptying Time" : "හිස්වන වෙලාව"}
                </span>
                <span className="font-extrabold text-[#26231B] text-[12px] truncate">
                  {lorry.emptyTime}
                </span>
              </div>
            )}

            {/* Return Route if present */}
            {lorry.returnRoute && (
              <div className="col-span-2 bg-[#FAF8F3] p-2.5 rounded-xl border border-[#E7E2D0] flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-[#8A8474] uppercase tracking-wider">
                  {locale === "en" ? "Return Route" : "ආපසු එන මාර්ගය"}
                </span>
                <span className="font-extrabold text-[#26231B] text-[12px] leading-tight">
                  {lorry.returnRoute}
                </span>
              </div>
            )}

            {/* Route Corridor */}
            <div className="col-span-2 bg-[#FAF8F3] p-2.5 rounded-xl border border-[#E7E2D0] flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-[#8A8474] uppercase tracking-wider">
                {locale === "en" ? "Route Corridor" : "ගමන් මාර්ගය"}
              </span>
              <span className="font-extrabold text-[#26231B] text-[12px] leading-tight">
                {lorry.travelRoute || lorry.route || "Island-wide Fleet Route"}
              </span>
            </div>

            {/* Facility & Feature Badges */}
            <div className="col-span-2 flex flex-wrap gap-1.5 pt-0.5">
              {lorry.availableSpace && (
                <span className="px-2.5 py-1 rounded-lg bg-[#FFF7D6] text-[#5B4300] font-bold text-[11px] border border-[#FFE885] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E5A100]" />
                  <span>Space: {lorry.availableSpace}</span>
                </span>
              )}
              {lorry.hasFreezer && (
                <span className="px-2.5 py-1 rounded-lg bg-[#E6F3FF] text-[#004B87] font-bold text-[11px] border border-[#B8DCFF] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0070BA]" />
                  <span>{locale === "en" ? "Freezer Available" : "ශීතකරණ පහසුකම් ඇත"}</span>
                </span>
              )}
              {lorry.hasHelper && (
                <span className="px-2.5 py-1 rounded-lg bg-[#EAF7EE] text-[#1E9E5A] font-bold text-[11px] border border-[#B3E8CE] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1E9E5A]" />
                  <span>{locale === "en" ? "Helper Onboard" : "ගෝලයෙකු ඇත"}</span>
                </span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-[#F5F2EB] text-[#26231B] font-bold text-[11px] border border-[#E0DBCB] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E9E5A]" />
                <span>
                  {isMoving
                    ? (locale === "en" ? `${Math.round(lorry.speedKmH!)} km/h` : `${Math.round(lorry.speedKmH!)} km/h`)
                    : (locale === "en" ? "Stationary" : "නැවතී ඇත")}
                </span>
              </span>
            </div>
          </div>

          {/* Modern Book Online Now Action Button */}
          <div className="pt-1 mt-auto">
            <button
              type="button"
              onClick={() => setIsBookingModalOpen(true)}
              className="w-full py-3.5 px-5 rounded-2xl bg-[#FFC20E] hover:bg-[#e6ad00] active:scale-[0.99] text-[#26231B] font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg no-underline text-center cursor-pointer"
            >
              <svg
                className="w-4 h-4 text-[#26231B] flex-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>
                {locale === "en"
                  ? "Book Online Now"
                  : "අන්තර්ජාලය හරහා දැන්ම වෙන්කරන්න"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. FULL SCREEN MAP OVERLAY VIEW */}
      {isMapFullscreen && (
        <div
          className="fixed inset-0 z-[1000000] bg-[#26231B] flex flex-col w-screen h-screen animate-in fade-in duration-200 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Bar with Vehicle Plate, Status, Route Corridor & Exit Fullscreen Button */}
          <div className="h-14 bg-[#26231B] border-b border-[#3B3727] px-4 sm:px-6 flex items-center justify-between z-[1001] flex-none shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1E9E5A] animate-pulse flex-none" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[#FFC20E] font-black text-base sm:text-lg tracking-wide truncate">
                  {lorry.plate}
                </span>
                <span className="text-[#E7E2D0] text-xs font-bold hidden sm:inline truncate">
                  {hasTripPath
                    ? `${lorry.startLocation || "Start"} → ${lorry.endLocation || "Destination"}`
                    : (lorry.route || "")}
                </span>
              </div>
              <LorryStatusBadge status={lorry.status} />
            </div>

            <button
              type="button"
              onClick={() => setIsMapFullscreen(false)}
              className="px-3.5 py-1.5 rounded-xl bg-[#B3121F] hover:bg-[#c91826] text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer flex-none"
            >
              ✕ Exit Fullscreen
            </button>
          </div>

          {/* Fullscreen Map Canvas */}
          <div className="relative flex-1 w-full h-full overflow-hidden">
            <DynamicDedicatedRouteMap
              lorry={lorry}
              height="100%"
              className="w-full h-full"
              onToggleFullscreen={() => setIsMapFullscreen(false)}
              isFullscreen={true}
            />

            {/* Floating Bottom Quick Info Card */}
            <div className="absolute bottom-5 left-4 right-4 sm:left-6 sm:w-auto sm:max-w-md z-[1000] bg-[#26231B]/95 backdrop-blur-md border border-[#FFC20E]/40 rounded-2xl p-3 sm:p-4 shadow-2xl flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#FFC20E] text-[#26231B] flex items-center justify-center font-black flex-none">
                  {lorry.plate.slice(0, 2)}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="font-extrabold text-xs sm:text-sm text-[#F6F1DF] truncate">
                    {lorry.driverName ? `${lorry.driverName}` : "Driver On Duty"}
                  </div>
                  <div className="text-[11px] text-[#A8A28E] truncate">
                    {lorry.startLocation && lorry.endLocation
                      ? `${lorry.startLocation} → ${lorry.endLocation}`
                      : (lorry.route || "Island-wide Fleet")}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsMapFullscreen(false);
                  setIsBookingModalOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#FFC20E] hover:bg-[#e6ad00] text-[#26231B] font-black text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer flex-none"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>{locale === "en" ? "Book Online" : "වෙන්කරන්න"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. LIVE LORRY ONLINE BOOKING MODAL */}
      <LiveLorryBookingModal
        lorry={lorry}
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        onSuccess={() => {
          setIsBookingModalOpen(false);
          onClose();
        }}
      />
    </div>
  );

  return createPortal(modalContent, document.body);
};
