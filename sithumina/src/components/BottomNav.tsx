"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { siteConfig } from "@/lib/site-config";

export const BottomNav: React.FC = () => {
  const pathname = usePathname();
  const { locale } = useLanguage();

  const hotline = siteConfig.phoneNumbers[0]?.link || "tel:0112984984";

  const isHomeActive = pathname === "/";
  const isLorriesActive = pathname === "/find-empty-lorry";
  const isAccountActive = pathname === "/login";
  const isCallActive = pathname === "/contact";

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF] rounded-t-[24px] border-t border-[#EAE6D8] shadow-[0_-4px_22px_rgba(0,0,0,0.08)] select-none"
      style={{
        paddingBottom: "max(10px, env(safe-area-inset-bottom))",
      }}
      aria-label="Mobile and Tablet Navigation"
    >
      <div className="max-w-md mx-auto grid grid-cols-4 items-center pt-2 px-2">
        {/* 1. Home */}
        <Link
          href="/"
          className="flex flex-col items-center justify-center group no-underline transition-transform active:scale-95"
          aria-label={locale === "si" ? "මුල් පිටුව" : "Home"}
          aria-current={isHomeActive ? "page" : undefined}
        >
          <div
            className={`flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 ${
              isHomeActive
                ? "bg-[#FFC20E] text-[#26231B] shadow-xs"
                : "text-[#6F6A5A] group-hover:text-[#26231B] group-hover:bg-[#F7F5EE]"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={isHomeActive ? "2.6" : "2.2"}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            </svg>
          </div>
          <span
            className={`text-[11px] sm:text-xs mt-1 leading-tight tracking-tight ${
              isHomeActive
                ? "font-extrabold text-[#26231B]"
                : "font-semibold text-[#6F6A5A] group-hover:text-[#26231B]"
            }`}
          >
            {locale === "si" ? "මුල් පිටුව" : "Home"}
          </span>
        </Link>

        {/* 2. Vehicles */}
        <Link
          href="/find-empty-lorry"
          className="flex flex-col items-center justify-center group no-underline transition-transform active:scale-95"
          aria-label={locale === "si" ? "වාහන" : "Vehicles"}
          aria-current={isLorriesActive ? "page" : undefined}
        >
          <div
            className={`flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 ${
              isLorriesActive
                ? "bg-[#FFC20E] text-[#26231B] shadow-xs"
                : "text-[#6F6A5A] group-hover:text-[#26231B] group-hover:bg-[#F7F5EE]"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={isLorriesActive ? "2.6" : "2.2"}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 7h13v10H1zM14 10h5l3 3v4h-8" />
              <circle cx="6" cy="18" r="2" />
              <circle cx="17" cy="18" r="2" />
            </svg>
          </div>
          <span
            className={`text-[11px] sm:text-xs mt-1 leading-tight tracking-tight ${
              isLorriesActive
                ? "font-extrabold text-[#26231B]"
                : "font-semibold text-[#6F6A5A] group-hover:text-[#26231B]"
            }`}
          >
            {locale === "si" ? "වාහන" : "Vehicles"}
          </span>
        </Link>

        {/* 3. My Account */}
        <Link
          href="/login"
          className="flex flex-col items-center justify-center group no-underline transition-transform active:scale-95"
          aria-label={locale === "si" ? "මගේ ගිණුම" : "My Account"}
          aria-current={isAccountActive ? "page" : undefined}
        >
          <div
            className={`flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 ${
              isAccountActive
                ? "bg-[#FFC20E] text-[#26231B] shadow-xs"
                : "text-[#6F6A5A] group-hover:text-[#26231B] group-hover:bg-[#F7F5EE]"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={isAccountActive ? "2.6" : "2.2"}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <span
            className={`text-[11px] sm:text-xs mt-1 leading-tight tracking-tight ${
              isAccountActive
                ? "font-extrabold text-[#26231B]"
                : "font-semibold text-[#6F6A5A] group-hover:text-[#26231B]"
            }`}
          >
            {locale === "si" ? "ගිණුම" : "Account"}
          </span>
        </Link>

        {/* 4. Call */}
        <a
          href={hotline}
          className="flex flex-col items-center justify-center group no-underline transition-transform active:scale-95"
          aria-label={locale === "si" ? "අමතන්න (Hotline)" : "Call (Hotline)"}
        >
          <div
            className={`flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 ${
              isCallActive
                ? "bg-[#FFC20E] text-[#26231B] shadow-xs"
                : "text-[#6F6A5A] group-hover:text-[#26231B] group-hover:bg-[#F7F5EE]"
            }`}
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={isCallActive ? "2.6" : "2.2"}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <span
            className={`text-[11px] sm:text-xs mt-1 leading-tight tracking-tight ${
              isCallActive
                ? "font-extrabold text-[#26231B]"
                : "font-semibold text-[#6F6A5A] group-hover:text-[#26231B]"
            }`}
          >
            {locale === "si" ? "අමතන්න" : "Call"}
          </span>
        </a>
      </div>
    </nav>
  );
};

