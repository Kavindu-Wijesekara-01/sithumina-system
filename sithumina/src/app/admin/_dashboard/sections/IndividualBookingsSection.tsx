"use client";

import type { Admin } from "../state/useAdminDashboard";
import BookingFilterBar from "../bookings/BookingFilterBar";
import IndividualBookingsPanel from "../bookings/IndividualBookingsPanel";

export default function IndividualBookingsSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
  } = admin;

  return (
    <>
      {activeNav === "individual_bookings" && (
            <div className="flex flex-col gap-4">
              {/* Filter & Search Bar */}
              <BookingFilterBar admin={admin} />
              {/* LIST VIEW OF INDIVIDUAL BOOKINGS */}
              <IndividualBookingsPanel admin={admin} />
            </div>
          )}
    </>
  );
}
