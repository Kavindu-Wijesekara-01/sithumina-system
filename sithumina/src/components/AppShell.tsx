"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { MobileDrawer } from "./MobileDrawer";
import { BottomNav } from "./BottomNav";
import { Footer } from "./Footer";
import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

interface AppShellProps {
  children: React.ReactNode;
}

const SECTION_TITLES: Record<string, { en: string; si: string }> = {
  "/find-empty-lorry": { en: "Find Empty Lorry", si: "හිස් ලොරි සොයන්න" },
  "/book-vehicle": { en: "Book Individual Vehicle", si: "වාහන වෙන්කරන්න" },
  "/register-vehicle": { en: "Register Vehicle", si: "වාහන ලියාපදිංචිය" },
  "/contact": { en: "Contact Details", si: "සම්බන්ධතා විස්තර" },
  "/reviews": { en: "Customer Reviews", si: "පාරිභෝගික සමාලෝචන" },
  "/about": { en: "About Sithumina", si: "අප ගැන" },
  "/faq": { en: "Q&A", si: "ප්‍රශ්න සහ පිළිතුරු" },
  "/login": { en: "User Login", si: "ඇතුල් වන්න" },
  "/admin": { en: "Admin Dashboard", si: "පරිපාලක පුවරුව" },
};

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useLanguage();
  const { profile } = useAuth();

  const isSubpage = pathname !== "/";

  useEffect(() => {
    setMounted(true);
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 240);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleBack = () => {
    if (isSubpage) {
      router.push("/");
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const currentSection = SECTION_TITLES[pathname];
  const sectionLabel =
    pathname === "/login" && mounted && profile
      ? locale === "en"
        ? "My Account"
        : "මගේ ගිණුම"
      : currentSection
      ? locale === "en"
        ? currentSection.en
        : currentSection.si
      : "";

  // Completely isolate Admin Dashboard from public website navbars, sidebar, and footer
  const isAdminRoute = pathname?.startsWith("/admin");
  if (isAdminRoute) {
    return (
      <div className="min-h-screen bg-[#F7F5EE] text-[#26231B] flex flex-col font-sans antialiased">
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {/* Top Bar for Desktop and Mobile */}
      <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />

      {/* Accessible Mobile Slide-in Drawer */}
      <MobileDrawer
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Mobile Sticky Small Back Button Bar (<1024px) */}
      {(isSubpage || isScrolled) && (
        <div className="lg:hidden sticky top-[54px] sm:top-[58px] z-30 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E7E2D0] px-3 py-1.5 flex items-center justify-between text-xs shadow-xs select-none animate-in fade-in duration-150">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 text-[#26231B] font-extrabold py-1 px-2.5 rounded-lg bg-[#FFC20E] hover:bg-[#e6ad00] active:scale-95 transition-all border border-[#D9A300] shadow-2xs cursor-pointer"
            aria-label={isSubpage ? "Go Back" : "Back to Top"}
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
              {isSubpage ? (
                <path d="M19 12H5M12 19l-7-7 7-7" />
              ) : (
                <path d="M12 19V5M5 12l7-7 7 7" />
              )}
            </svg>
            <span className="text-[11.5px] leading-none">
              {isSubpage
                ? locale === "en"
                  ? "Back"
                  : "ආපසු"
                : locale === "en"
                ? "Back to Top"
                : "ආපසු මුලට"}
            </span>
          </button>

          {sectionLabel && (
            <span className="font-extrabold text-[#6F6A5A] text-[11px] truncate max-w-[210px]">
              {sectionLabel}
            </span>
          )}
        </div>
      )}

      {/* Main App Container */}
      <div className="flex flex-1 w-full max-w-[1920px] mx-auto min-h-0">
        {/* Sticky Desktop Sidebar (240px) */}
        <Sidebar />

        {/* Main Routed Content Column */}
        <div className="flex-1 min-w-0 flex flex-col pb-20 lg:pb-0">
          <div className="flex-1 flex flex-col min-h-0">
            {children}
          </div>
          {/* Footer at the end of the main content column */}
          <Footer />
        </div>
      </div>

      {/* Mobile and Tablet Fixed Bottom Navigation Bar (<1024px) */}
      <BottomNav />
    </div>
  );
};
