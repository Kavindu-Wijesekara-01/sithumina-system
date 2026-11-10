"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "./Logo";
import { PhoneLinks } from "./PhoneLinks";
import { LanguageSwitch } from "./LanguageSwitch";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

interface TopBarProps {
  onOpenMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenMobileMenu }) => {
  const { t, locale } = useLanguage();
  const { profile } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--y)] text-[#26231B] shadow-sm select-none">
      {/* DESKTOP TOP BAR (≥1024px, ~72px high, 3 columns) */}
      <div className="hidden lg:grid grid-cols-[240px_1fr_auto] items-center h-[72px] px-6 gap-4 max-w-[1920px] mx-auto">
        {/* Left Column: Logo mark from public/logo.png */}
        <div className="flex items-center">
          <Logo variant="desktop" />
        </div>

        {/* Centre Column: Logo from public/logo.png + Sithumina Transport bold Sinhala text in red + Phone links */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex items-center justify-center gap-3">
            <Image
              src="/logo.png"
              alt="Sithumina Transport Logo"
              width={68}
              height={52}
              className="h-[40px] sm:h-[44px] w-auto object-contain flex-none drop-shadow-xs"
              priority
              unoptimized
            />
            <div className="flex flex-col items-stretch w-fit">
              <h1
                className="text-[24px] sm:text-[26px] font-black tracking-tight text-[#C51616] leading-none m-0 select-none text-center whitespace-nowrap"
                style={{
                  WebkitTextStroke: "1px #ffffff",
                  paintOrder: "stroke fill",
                  textShadow: "0 0 2px #ffffff, 0 1px 2px rgba(255,255,255,0.8)",
                }}
              >
                SITHUMINA TRANSPORT
              </h1>
              <PhoneLinks
                size="sm"
                className="mt-1 w-full flex items-center justify-between gap-3"
                itemClassName="!text-[11px] sm:!text-[11.5px]"
              />
            </div>

            {/* 24 Hours / 365 Days Authentic Service Badge */}
            <div className="flex items-center justify-center flex-none pl-1 select-none">
              <Image
                src="/service-badge.png"
                alt="දින 365 පැය 24 පුරා"
                width={80}
                height={197}
                className="h-[46px] sm:h-[50px] w-auto object-contain drop-shadow-xs select-none"
                priority
              />
            </div>
          </div>
        </div>

        {/* Right Column: Login/Profile button + Language Switch */}
        <div className="flex items-center justify-end gap-2">
          <Link
            href="/login"
            className="border-0 bg-[#26231B] text-[var(--y)] text-[12px] font-extrabold py-[7px] px-[14px] rounded-[9px] cursor-pointer hover:bg-[#1a1813] transition-all no-underline shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#26231B] flex items-center gap-1.5"
          >
            <span className="flex items-center gap-1.5" suppressHydrationWarning>
              {mounted && profile ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>
                    {profile.name &&
                    profile.name !== "Valued Customer" &&
                    profile.name !== "Customer"
                      ? profile.name.split(" ")[0]
                      : locale === "en"
                      ? "Account"
                      : "ගිණුම"}
                  </span>
                </>
              ) : (
                <span>{t.login}</span>
              )}
            </span>
          </Link>
          <LanguageSwitch variant="desktop" />
        </div>
      </div>

      {/* MOBILE TOP BAR (<1024px, compact height ~50px) */}
      <div className="lg:hidden flex items-center justify-between h-[50px] sm:h-[54px] px-2 sm:px-3 max-w-full">
        {/* Left Aligned: Logo & Sinhala Text Horizontally */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center justify-center no-underline select-none flex-none"
            aria-label="Sithumina Transport Home"
          >
            <Image
              src="/logo.png"
              alt="Sithumina Transport Logo"
              width={48}
              height={38}
              className="h-[32px] sm:h-[34px] w-auto object-contain drop-shadow-xs"
              priority
              unoptimized
            />
          </Link>

          {/* Sinhala Text (Top) & Phone numbers (Bottom, matching text width) */}
          <div className="flex flex-col justify-center flex-none">
            <Link href="/" className="no-underline select-none">
              <h1
                className="text-[13px] sm:text-[15px] font-black tracking-tight text-[#C51616] leading-tight m-0 whitespace-nowrap"
                style={{
                  WebkitTextStroke: "0.6px #ffffff",
                  paintOrder: "stroke fill",
                  textShadow: "0 0 1.5px rgba(255,255,255,0.9)",
                }}
              >
                SITHUMINA TRANSPORT
              </h1>
            </Link>
            <PhoneLinks
              size="xs"
              limit={2}
              className="w-full flex items-center justify-between gap-2 mt-0.5"
              itemClassName="!text-[9px] sm:!text-[10px]"
            />
          </div>

          {/* 24 Hours / 365 Days Authentic Service Badge */}
          <div className="flex items-center justify-center flex-none pl-0.5 select-none">
            <Image
              src="/service-badge.png"
              alt="දින 365 පැය 24 පුරා"
              width={50}
              height={125}
              className="h-[32px] sm:h-[34px] w-auto object-contain drop-shadow-xs select-none"
              priority
            />
          </div>
        </div>

        {/* Right: Language toggle button and hamburger menu button */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-none pl-1">
          <LanguageSwitch variant="mobile" />
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label={t.menu}
            className="w-[34px] h-[34px] rounded-[10px] bg-[rgba(38,35,27,0.12)] hover:bg-[rgba(38,35,27,0.2)] text-[#26231B] text-[18px] font-extrabold flex items-center justify-center cursor-pointer border-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#26231B]"
          >
            <svg
              className="w-5 h-5 text-[#26231B]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};
