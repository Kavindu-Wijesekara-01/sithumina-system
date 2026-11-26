"use client";

import PerformancePanel from "@/components/admin/PerformancePanel";
import type { Admin } from "../state/useAdminDashboard";

export default function RidersSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    bookings,
    companyDrivers,
    filteredDrivers,
    fleetVehicles,
    handleDeleteRider,
    handleOpenAddRider,
    handleToggleRider,
    loadingDrivers,
    outsideEmployees,
    riderSearch,
    setRiderSearch,
  } = admin;

  return (
    <>
      {activeNav === "riders" && (
            <div className="flex flex-col gap-5">
              <PerformancePanel
                mode="drivers"
                bookings={bookings}
                drivers={companyDrivers}
                vehicles={fleetVehicles}
                owners={outsideEmployees}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E5E7EB]">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={riderSearch}
                    onChange={(e) => setRiderSearch(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827] focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleOpenAddRider}
                  className="px-4 py-2.5 rounded-xl bg-[#111827] hover:bg-[#3D3A31] text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>+ Register New Rider</span>
                </button>
              </div>
              {loadingDrivers ? (
                <div className="p-12 text-center rounded-xl bg-white border border-[#E5E7EB]">
                  <p className="text-sm font-bold text-[#4B5563]">Loading riders from Firestore...</p>
                </div>
              ) : filteredDrivers.length === 0 ? (
                <div className="p-12 text-center rounded-xl bg-white border border-[#E5E7EB]">
                  <p className="text-sm font-bold text-[#4B5563]">No riders registered. Click &quot;+ Register New Rider&quot; above.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDrivers.map((d) => (
                    <div
                      key={d.driverId}
                      className="p-5 rounded-xl bg-white border border-[#E5E7EB] flex flex-col justify-between gap-4"
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#111827] text-[#FFC20E] text-xs font-mono font-semibold">
                            {d.driverId}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${d.active
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                            }`}>
                            {d.active ? "Active On Duty" : "Off Duty"}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-[#111827]">{d.name}</h3>
                        <div className="text-xs text-[#4B5563] flex flex-col gap-1">
                          <div>
                            <span>Phone: </span>
                            <a href={`tel:${d.phone}`} className="font-mono font-bold text-[#1E9E5A] hover:underline">
                              {d.phone}
                            </a>
                          </div>
                          {d.nic && (
                            <div>
                              <span>NIC: </span>
                              <b className="font-mono text-[#111827]">{d.nic}</b>
                            </div>
                          )}
                          <div>
                            <span>Assigned Lorry: </span>
                            <b className="font-mono text-[#111827]">{d.plate || "Unassigned"}</b>
                          </div>
                          <div>
                            <span>Service Route: </span>
                            <b className="text-[#111827]">{d.route || "Island-wide"}</b>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-[#E5E7EB]">
                        <button
                          onClick={() => handleToggleRider(d.driverId, d.active)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${d.active
                            ? "border-amber-300 text-amber-800 hover:bg-amber-50"
                            : "border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                            }`}
                        >
                          {d.active ? "Set Inactive" : "Set Active"}
                        </button>
                        <button
                          onClick={() => handleDeleteRider(d.driverId, d.name)}
                          className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
    </>
  );
}
