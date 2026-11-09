"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ManageRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Graceful automatic redirect to Home / Customer Portal
    const timer = setTimeout(() => {
      router.replace("/");
    }, 2500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6 text-center">
      <div className="max-w-md p-8 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-lg flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[var(--y3)] border border-[var(--y2)] flex items-center justify-center text-[#5B4300]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </div>

        <h1 className="text-xl font-black text-[var(--ink)]">
          Mobile App Admin & Driver Hub
        </h1>

        <p className="text-xs text-[var(--mut)] leading-relaxed">
          The web platform is strictly reserved for customer bookings and live tracking. All Fleet Management, Driver telemetry, and Administrative operations are securely hosted inside the official <b>Sithumina Driver & Admin Mobile App</b>.
        </p>

        <div className="pt-2 flex flex-col gap-2.5 w-full">
          <Link
            href="/"
            className="w-full py-2.5 rounded-xl bg-[var(--y)] text-[#26231B] text-xs font-black no-underline hover:opacity-90 transition-all"
          >
            ← Return to Live Tracking Map
          </Link>
          <Link
            href="/login"
            className="w-full py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs font-bold text-[var(--ink)] no-underline hover:bg-[var(--y3)] transition-all"
          >
            Open Customer Portal
          </Link>
        </div>
      </div>
    </main>
  );
}
