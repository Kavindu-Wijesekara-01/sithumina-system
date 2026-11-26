"use client";

import DeclineAlerts from "@/components/admin/DeclineAlerts";
import RevenuePanel from "@/components/admin/RevenuePanel";
import type { Admin } from "../state/useAdminDashboard";
import TripBookingsSection from "../sections/TripBookingsSection";
import ComplaintsSection from "../sections/ComplaintsSection";
import InquiriesSection from "../sections/InquiriesSection";
import CustomersSection from "../sections/CustomersSection";
import FleetSection from "../sections/FleetSection";
import IndividualBookingsSection from "../sections/IndividualBookingsSection";
import OnlineBookingsSection from "../sections/OnlineBookingsSection";
import ExternalOwnersSection from "../sections/ExternalOwnersSection";
import OverviewSection from "../sections/OverviewSection";
import RidersSection from "../sections/RidersSection";
import SettingsSection from "../sections/SettingsSection";
import TopupSlipsSection from "../sections/TopupSlipsSection";
import RegistrationsSection from "../sections/RegistrationsSection";

export default function ContentView({ admin }: { admin: Admin }) {
  const {
    activeNav,
    bookings,
    individualBookings,
    loadingBookings,
    openAssignModal,
    outsideEmployees,
    pendingOnlineCount,
    setActiveNav,
    setStatusFilter,
    slipReviewCount,
    totalPendingCount,
  } = admin;

  return (
    <main className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-7xl w-full mx-auto">
          {/* ========================================================= */}
          {/* HIGH-VISIBILITY ALERT BANNER FOR NEW BOOKINGS             */}
          {/* ========================================================= */}
          {!loadingBookings && totalPendingCount > 0 && (
            <div className="px-4 py-3.5 rounded-lg bg-white border border-gray-300 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">
                  Action Required ({totalPendingCount} Pending)
                </h3>
                <p className="text-sm text-gray-600 mt-0.5">
                  Allocate trip time, assign a rider, send a quote, or check payment slips.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {slipReviewCount > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("individual_bookings");
                      setStatusFilter("payment_submitted");
                    }}
                    className="px-3.5 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 cursor-pointer"
                  >
                    Review Payment Slips ({slipReviewCount})
                  </button>
                )}
                {individualBookings.filter((b) => b.status === "pending").length > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("individual_bookings");
                      setStatusFilter("pending");
                    }}
                    className="px-3.5 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-semibold hover:bg-gray-50 cursor-pointer"
                  >
                    Pending Quotes ({individualBookings.filter((b) => b.status === "pending").length})
                  </button>
                )}
                {pendingOnlineCount > 0 && (
                  <button
                    onClick={() => {
                      setActiveNav("online_bookings");
                      setStatusFilter("pending");
                    }}
                    className="px-3.5 py-2 rounded-md border border-gray-300 bg-white text-gray-900 text-sm font-semibold hover:bg-gray-50 cursor-pointer"
                  >
                    View Live Bookings ({pendingOnlineCount})
                  </button>
                )}
              </div>
            </div>
          )}
          {/* ========================================================= */}
          {/* TAB 1: DASHBOARD OVERVIEW                                 */}
          {/* ========================================================= */}
          <DeclineAlerts bookings={bookings} onReassign={(b) => openAssignModal(b)} />
          <OverviewSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB: ALL BOOKINGS (ONGOING, PENDING PAYMENT & COMPLETED)  */}
          {/* ========================================================= */}
          <TripBookingsSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB 2: INDIVIDUAL VEHICLE BOOKINGS                        */}
          {/* ========================================================= */}
          <IndividualBookingsSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB 3: ONLINE / LIVE LORRY BOOKINGS                       */}
          {/* ========================================================= */}
          <OnlineBookingsSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB: SIMPLE CUSTOMER LIST                                 */}
          {/* ========================================================= */}
          <CustomersSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB: COMPLAINTS & DELETION REASONS AUDIT                  */}
          {/* ========================================================= */}
          <ComplaintsSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB: REVENUE (INDIVIDUAL + LIVE LORRY)                    */}
          {/* ========================================================= */}
          {activeNav === "revenue" && <RevenuePanel bookings={bookings} owners={outsideEmployees} />}
          {/* ========================================================= */}
          {/* TAB 4: FLEET LORRIES MANAGEMENT (Add Lorry)               */}
          {/* ========================================================= */}
          <FleetSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB 5: RIDERS & DRIVERS REGISTRY                          */}
          {/* ========================================================= */}
          <RidersSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB 6: SYSTEM & PAYMENT SETTINGS (Bank Accounts & Slips)  */}
          {/* ========================================================= */}
          <SettingsSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB 7: VEHICLE & PARTNER REGISTRATIONS                    */}
          {/* ========================================================= */}
          <RegistrationsSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB: OUTSIDE EMPLOYEES & FLEET PARTNERS                   */}
          {/* ========================================================= */}
          <ExternalOwnersSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB: TOP-UP BANK SLIPS                                     */}
          {/* ========================================================= */}
          <TopupSlipsSection admin={admin} />
          {/* ========================================================= */}
          {/* TAB 8: CONTACT INQUIRIES &amp; SUPPORT                        */}
          {/* ========================================================= */}
          <InquiriesSection admin={admin} />
        </main>
  );
}
