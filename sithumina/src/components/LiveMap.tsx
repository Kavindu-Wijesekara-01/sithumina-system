"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useLanguage } from "@/context/LanguageContext";
import { LorryList } from "./LorryList";
import { useLiveLorries } from "@/hooks/useLiveLorries";
import { LorryDetailModal } from "./LorryDetailModal";
import { LorryStatusBadge } from "./LorryStatusBadge";

// Dynamic import with SSR disabled so Leaflet window/document references are purely client-side
const DynamicLeafletMap = dynamic(
  () => import("./LeafletMapInner").then((mod) => mod.LeafletMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--y3)] text-[var(--ink)] gap-3 p-4">
        <div className="w-10 h-10 border-4 border-[var(--y)] border-t-[var(--ink)] rounded-full animate-spin" />
        <span className="text-[13px] font-bold text-[var(--ink)] opacity-80">
          Loading Sri Lanka Live Map...
        </span>
      </div>
    ),
  }
);

interface LiveMapProps {
  className?: string;
}

export const LiveMap: React.FC<LiveMapProps> = ({ className = "" }) => {
  const { t } = useLanguage();
  const {
    lorries,
    nearbyLorries,
    loading,
    selectedLorryId,
    selectLorry,
  } = useLiveLorries({ onlyOngoing: true });

  const [userLocation] = useState<[number, number] | null>(null);

  return (
    <div
      id="live-map"
      className={`w-full border border-[var(--line)] rounded-[16px] overflow-hidden bg-[var(--y3)] shadow-xs select-none scroll-mt-24 relative ${className}`}
    >
      {/* UNIFIED MAP + SIDEBAR GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] xl:grid-cols-[1fr_280px] h-[460px] sm:h-[500px] lg:h-[520px] xl:h-[580px]">
        {/* Map Canvas with overlay controls */}
        <div className="relative w-full h-full overflow-hidden bg-[var(--y3)]">
          <DynamicLeafletMap
            lorries={lorries}
            selectedLorryId={selectedLorryId}
            onSelectLorry={selectLorry}
            userLocation={userLocation}
          />

          {/* Live Fleet Indicator Pill */}
          <div
            className="absolute left-3 top-3 z-[1000] bg-[var(--card)] text-[var(--ink)] rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-[12px] font-bold flex items-center gap-1.5 sm:gap-2 shadow-md border border-[var(--line)] select-none pointer-events-none"
            aria-live="polite"
          >
            <i
              className="w-2 h-2 rounded-full bg-[var(--ok)] animate-pu"
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {loading
                ? "Connecting live GPS..."
                : lorries.length > 0
                ? `Live · ${lorries.length} ${
                    lorries.length === 1 ? "lorry" : "lorries"
                  } on the road`
                : "Live · Fleet standby"}
            </span>
            <span className="sm:hidden">
              {loading ? "..." : lorries.length > 0 ? `${lorries.length} live` : "0 live"}
            </span>
          </div>
        </div>

        {/* Desktop / Large Screen: Nearby Lorries list sidebar */}
        <div className="hidden lg:block h-full overflow-hidden">
          <LorryList
            lorries={nearbyLorries}
            selectedLorryId={selectedLorryId}
            onSelectLorry={selectLorry}
            loading={loading}
            className="h-full"
          />
        </div>
      </div>

      {/* Mobile view: Horizontal quick drawer/chip bar below map so mobile users can easily scroll & click nearby lorries too */}
      <div className="lg:hidden p-3 bg-[var(--card)] border-t border-[var(--line)] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-extrabold text-[var(--ink)]">
              {t.map.nearbyTitle || "Nearby Active Lorries"}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[var(--y3)] text-[10.5px] font-bold text-[var(--ink)] border border-[var(--line)]">
              {loading ? "..." : nearbyLorries.length}
            </span>
          </div>
          <span className="text-[10px] text-[var(--mut)] font-medium">
            Tap to view route & details
          </span>
        </div>

        {/* Horizontal scrollable lorry cards for fast thumb-reach on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {loading ? (
            <div className="text-[11.5px] text-[var(--mut)] py-1 font-medium">
              Loading live fleet...
            </div>
          ) : nearbyLorries.length === 0 ? (
            <div className="text-[11.5px] text-[var(--mut)] py-1 font-medium">
              No live broadcast at the moment.
            </div>
          ) : (
            nearbyLorries.map((lorry) => {
              const isSelected = selectedLorryId === lorry.id;
              return (
                <button
                  key={lorry.id}
                  type="button"
                  onClick={() => selectLorry(lorry.id)}
                  className={`flex-none text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 min-w-[170px] max-w-[210px] ${
                    isSelected
                      ? "bg-[var(--y3)] border-[#FFC20E] shadow-sm"
                      : "bg-[#FFFFFF] border-[var(--line)] hover:bg-[var(--y3)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 w-full">
                    <span className="font-extrabold text-[12.5px] text-[#26231B] truncate">
                      {lorry.plate}
                    </span>
                    <LorryStatusBadge status={lorry.status} />
                  </div>
                  <span className="text-[11px] text-[#6F6A5A] font-medium truncate w-full">
                    {lorry.route || "Island-wide"}
                  </span>
                  <span className="text-[10px] text-[#1E9E5A] font-bold">
                    View Route & Contact
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* DEDICATED SINGLE-LORRY ROUTE & CALL-TO-BOOK MODAL */}
      <LorryDetailModal
        lorry={selectedLorryId ? lorries.find((l) => l.id === selectedLorryId) || null : null}
        onClose={() => selectLorry(null)}
      />
    </div>
  );
};
