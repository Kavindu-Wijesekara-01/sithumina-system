"use client";

import type { Admin } from "../state/useAdminDashboard";
import IndividualBookingList from "./IndividualBookingList";

export default function IndividualBookingsPanel({ admin }: { admin: Admin }) {

  return (
    <div className="flex flex-col gap-4">
                <IndividualBookingList admin={admin} />
              </div>
  );
}
