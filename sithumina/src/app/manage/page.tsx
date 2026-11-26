"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ManageRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Graceful automatic redirect to Driver & Employee Portal
    const timer = setTimeout(() => {
      router.replace("/login?tab=employee");
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6 text-center">
      <div className="max-w-md p-8 rounded-3xl bg-[var(--card)] border border-[var(--line)] shadow-lg flex flex-col items-center gap-4">

        <h1 className="text-xl font-black text-[var(--ink)]">
          Sithumina Driver App &amp; Hub
        </h1>

        <p className="text-xs text-[var(--mut)] leading-relaxed">
          Welcome to the official Sithumina Driver Portal. Access your assigned bookings, share live GPS locations, customize journey route waypoints, and track live kilometers.
        </p>

        <div className="pt-2 flex flex-col gap-2.5 w-full">
          <Link
            href="/login?tab=employee"
            className="w-full py-2.5 rounded-xl bg-[#26231B] text-[#FFC20E] text-xs font-black no-underline hover:opacity-90 transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>Open Driver App &amp; Portal (Login) →</span>
          </Link>
          <Link
            href="/"
            className="w-full py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-xs font-bold text-[var(--ink)] no-underline hover:bg-[var(--y3)] transition-all"
          >
            ← Return to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
