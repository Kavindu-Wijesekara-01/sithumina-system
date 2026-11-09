"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";
import { useLiveLorries } from "@/hooks/useLiveLorries";
import { LorryStatusBadge } from "@/components/LorryStatusBadge";
import { LorryDetailModal } from "@/components/LorryDetailModal";
import { Lorry } from "@/lib/mock-lorries";

export default function FindEmptyLorryPage() {
  const { locale } = useLanguage();
  const { lorries: liveLorries, loading } = useLiveLorries();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeModalLorry, setActiveModalLorry] = useState<Lorry | null>(null);

  // Strictly filter only lorries that are actively LIVE from the driver app with status === "empty"
  const emptyLorries = liveLorries.filter(
    (l) => l.status === "empty" && l.isLive === true
  );

  const filtered = emptyLorries.filter(
    (l) =>
      l.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.route.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.vehicleType && l.vehicleType.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.driverName && l.driverName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <main className="p-4 lg:p-[24px_32px] flex flex-col gap-6 max-w-5xl mx-auto w-full select-none">
      {/* Header Section */}
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--y2)] text-[#5B4300] text-xs font-bold w-fit">
          <span className="w-2 h-2 rounded-full bg-[#1E9E5A] animate-pulse"></span>
          <span>
            {loading
              ? locale === "en"
                ? "Checking live empty lorries..."
                : "සජීවී හිස් ලොරි පරීක්ෂා කරමින්..."
              : `${emptyLorries.length} ${
                  locale === "en" ? "Empty Lorries Available Now" : "හිස් ලොරි සූදානම්"
                }`}
          </span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-extrabold text-[var(--ink)] tracking-tight">
          {locale === "en" ? "Available Empty Return Lorries" : "ආපසු පැමිණෙන හිස් ලොරි"}
        </h1>
        <p className="text-[var(--mut)] text-sm leading-relaxed max-w-2xl">
          {locale === "en"
            ? "Book empty return lorries at discounted rates across Sri Lanka. Instant direct contact with drivers and live GPS route tracking."
            : "දිවයින පුරා ආපසු පැමිණෙන හිස් ලොරි අඩු ගාස්තු යටතේ වෙන්කරවා ගන්න. සෘජුවම රියදුරු සම්බන්ධ කරගැනීමේ සහ සජීවී මාර්ග සිතියම් පහසුකම."}
        </p>
      </div>

      {/* Search Filter */}
      <div className="flex items-center gap-3 bg-[var(--card)] p-3 rounded-2xl border border-[var(--line)] shadow-xs max-w-md">
        <svg
          className="w-4 h-4 text-[var(--mut)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-5-5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={
            locale === "en"
              ? "Filter by city or plate (e.g. Galle, WP LK)..."
              : "නගරය හෝ අංකය අනුව සොයන්න..."
          }
          className="bg-transparent border-0 text-sm w-full outline-none text-[var(--ink)] placeholder:text-[var(--mut)]"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="text-xs text-[var(--mut)] hover:text-[var(--ink)] px-1 cursor-pointer font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {/* Grid of Lorries */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-[var(--card)] border border-[var(--line)] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-14 px-6 rounded-2xl bg-[var(--card)] border border-[var(--line)] text-center flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--y3)] flex items-center justify-center text-[#5B4300]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13"/>
              <polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/>
              <circle cx="5.5" cy="18.5" r="2.5"/>
              <circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <span className="font-extrabold text-base text-[var(--ink)]">
            {searchTerm
              ? (locale === "en" ? "No Live Empty Lorries Match Your Search" : "ගැලපෙන සජීවී හිස් ලොරි රථ හමු නොවීය")
              : (locale === "en" ? "No Empty Return Lorries Live Right Now" : "දැනට සජීවීව ධාවනය වන හිස් ලොරි රථ නොමැත")}
          </span>
          <span className="text-xs text-[var(--mut)] max-w-md leading-relaxed">
            {locale === "en"
              ? "Drivers broadcast their empty return runs live from the Sithumina Driver App. You can also view all registered vehicles to reserve a lorry in advance."
              : "රියදුරන් තම හිස් ලොරි ධාවනය සජීවීව Driver App එක හරහා විකාශනය කරයි. ලියාපදිංචි වාහනයක් කල්තියා වෙන්කර ගැනීමට වාහන ලැයිස්තුවට පිවිසෙන්න."}
          </span>
          <Link
            href="/book-vehicle"
            className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black no-underline hover:opacity-90 transition-all shadow-xs cursor-pointer"
          >
            <span>{locale === "en" ? "Browse All Fleet Lorries →" : "සියලු ලොරි රථ බලන්න →"}</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lorry) => {
            const dialPhone =
              lorry.driverPhone && lorry.driverPhone.length > 5
                ? lorry.driverPhone
                : "+94765550123";

            return (
              <div
                key={lorry.id}
                onClick={() => setActiveModalLorry(lorry)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveModalLorry(lorry);
                  }
                }}
                className="p-4 rounded-2xl bg-[var(--card)] border border-[var(--line)] hover:border-[#FFC20E] transition-all shadow-xs flex flex-col justify-between gap-4 cursor-pointer hover:shadow-md"
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-extrabold text-[var(--ink)] tracking-tight">
                      {lorry.plate}
                    </span>
                    <LorryStatusBadge status={lorry.status} />
                  </div>

                  <div className="text-xs text-[var(--mut)] flex flex-col gap-1.5 bg-[var(--y3)] p-2.5 rounded-xl border border-[var(--line)]">
                    <div>
                      <strong className="text-[var(--ink)] font-bold">
                        {locale === "en" ? "Route:" : "ගමන් මඟ:"}
                      </strong>{" "}
                      <span className="text-[var(--ink)] font-semibold">{lorry.route}</span>
                    </div>

                    {lorry.driverName && (
                      <div>
                        <strong className="text-[var(--ink)] font-bold">
                          {locale === "en" ? "Driver:" : "රියදුරු:"}
                        </strong>{" "}
                        {lorry.driverName}
                      </div>
                    )}

                    {lorry.capacity && (
                      <div>
                        <strong className="text-[var(--ink)] font-bold">
                          {locale === "en" ? "Capacity:" : "ධාරිතාව:"}
                        </strong>{" "}
                        {lorry.capacity}
                      </div>
                    )}

                    {lorry.emptyTime && (
                      <div>
                        <strong className="text-[var(--ink)] font-bold">
                          {locale === "en" ? "Available Time:" : "හිස්වන වේලාව:"}
                        </strong>{" "}
                        {lorry.emptyTime}
                      </div>
                    )}

                    {/* Facility Tags */}
                    {(lorry.hasFreezer || lorry.hasHelper || lorry.availableSpace) && (
                      <div className="flex flex-wrap gap-1 mt-1 pt-1 border-t border-[var(--line)]">
                        {lorry.availableSpace && (
                          <span className="px-2 py-0.5 rounded-md bg-[#FFF3C4] text-[#5B4300] font-bold text-[10px]">
                            {lorry.availableSpace}
                          </span>
                        )}
                        {lorry.hasFreezer && (
                          <span className="px-2 py-0.5 rounded-md bg-[#E1F0FF] text-[#004B87] font-bold text-[10px]">
                            {locale === "en" ? "Freezer" : "ශීතකරණ පහසුකම්"}
                          </span>
                        )}
                        {lorry.hasHelper && (
                          <span className="px-2 py-0.5 rounded-md bg-[#E8F8F0] text-[#1E9E5A] font-bold text-[10px]">
                            {locale === "en" ? "Helper Onboard" : "ගෝලයෙකු ඇත"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div
                  className="flex items-center gap-2 pt-2 border-t border-[var(--line)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/book-vehicle?plate=${encodeURIComponent(lorry.plate)}&lorryId=${encodeURIComponent(lorry.id)}`}
                    className="flex-1 py-2 px-2 text-center rounded-xl bg-[var(--y)] hover:bg-[#e6ad00] text-[#26231B] font-extrabold text-xs transition-all shadow-xs no-underline flex items-center justify-center gap-1"
                  >
                    <svg
                      className="w-3.5 h-3.5 text-[#26231B]"
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
                    <span>{locale === "en" ? "Book" : "වෙන්කරන්න"}</span>
                  </Link>

                  <a
                    href={`tel:${dialPhone}`}
                    className="p-2 rounded-xl bg-[var(--bg)] hover:bg-[var(--y3)] text-[var(--ink)] font-bold text-xs border border-[var(--line)] transition-all shadow-xs no-underline flex items-center justify-center"
                    title={locale === "en" ? "Call Driver" : "රියදුරුට අමතන්න"}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </a>

                  <button
                    type="button"
                    onClick={() => setActiveModalLorry(lorry)}
                    className="flex-1 py-2 px-2 text-center rounded-xl bg-[#26231B] hover:bg-[#1a1813] text-[var(--y)] font-extrabold text-xs transition-all shadow-xs border-0 cursor-pointer"
                  >
                    {locale === "en" ? "Route Map" : "සිතියම"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dedicated Route Map Modal for Selected Lorry */}
      <LorryDetailModal
        lorry={activeModalLorry}
        onClose={() => setActiveModalLorry(null)}
      />
    </main>
  );
}
