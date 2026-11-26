"use client";

import PerformancePanel from "@/components/admin/PerformancePanel";
import type { Admin } from "../state/useAdminDashboard";

export default function FleetSection({ admin }: { admin: Admin }) {
  const {
    activeNav,
    bookings,
    companyDrivers,
    companyVehicles,
    filteredFleet,
    handleDeleteLorry,
    handleOpenAddLorry,
    handleOpenEditLorry,
    loadingFleet,
    lorrySearch,
    outsideEmployees,
    setActiveNav,
    setIndividualSearch,
    setLorrySearch,
    setStatusFilter,
  } = admin;

  return (
    <>
      {activeNav === "fleet" && (
            <div className="flex flex-col gap-5">
              <PerformancePanel
                mode="vehicles"
                bookings={bookings}
                drivers={companyDrivers}
                vehicles={companyVehicles}
                owners={outsideEmployees}
              />
              {/* Top Action & Search Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E5E7EB]">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={lorrySearch}
                    onChange={(e) => setLorrySearch(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-xs text-[#111827] focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleOpenAddLorry}
                  className="px-4 py-2.5 rounded-xl bg-[#111827] hover:bg-[#3D3A31] text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>+ Add New Fleet Lorry</span>
                </button>
              </div>
              {/* Lorries Grid */}
              {loadingFleet ? (
                <div className="p-12 text-center rounded-xl bg-white border border-[#E5E7EB]">
                  <p className="text-sm font-bold text-[#4B5563]">Loading fleet vehicles from Firestore...</p>
                </div>
              ) : filteredFleet.length === 0 ? (
                <div className="p-12 text-center rounded-xl bg-white border border-[#E5E7EB]">
                  <p className="text-sm font-bold text-[#4B5563]">No fleet vehicles found. Click &quot;+ Add New Fleet Lorry&quot; above.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredFleet.map((v) => {
                    const imgs = Array.isArray((v as any).images) && (v as any).images.length > 0
                      ? (v as any).images
                      : (v.imageUrl ? [v.imageUrl] : []);
                    return (
                      <div
                        key={v.id || v.plate}
                        className="p-5 rounded-xl bg-white border border-[#E5E7EB] flex flex-col justify-between gap-4"
                      >
                        {/* Vehicle Photos Gallery / Preview */}
                        <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center">
                          {imgs.length > 0 ? (
                            <img
                              src={imgs[0]}
                              alt={v.plate}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-3 text-xs text-[#4B5563]">
                              <span className="block font-bold">No Photos Uploaded</span>
                              <span className="text-xs">Add photos via Edit button</span>
                            </div>
                          )}
                          {imgs.length > 0 && (
                            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-[#111827]/80 text-white text-xs font-mono font-bold">
                              {imgs.length}/3 Photos
                            </span>
                          )}
                        </div>
                        {/* Vehicle Specs */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <span className="px-2.5 py-1 rounded-lg bg-[#111827] text-[#FFC20E] font-semibold text-xs font-mono">
                              {v.plate}
                            </span>
                            <span className="text-xs font-bold text-[#4B5563]">
                              {v.startLocation || "Head Office"}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-[#111827] mt-1">{v.vehicleType}</h3>
                          <div className="text-xs text-[#4B5563]">
                            <span>Dimensions: </span>
                            <b className="text-[#111827]">{(v as any).capacity || "14.5ft × 6.5ft × 7ft"}</b>
                          </div>
                          <div className="text-xs text-[#4B5563]">
                            <span>Max Payload: </span>
                            <b className="text-[#111827]">{(v as any).maxWeight || "3.5 Tons"}</b>
                          </div>
                          <div className="text-xs text-[#4B5563]">
                            <span>Assigned Rider: </span>
                            <b className="text-[#111827]">{v.driverName || "Unassigned"}</b>
                          </div>
                        </div>
                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-3 border-t border-[#E5E7EB]">
                          <button
                            onClick={() => {
                              setStatusFilter("all");
                              setIndividualSearch(v.plate);
                              setActiveNav("individual_bookings");
                            }}
                            className="text-xs font-semibold text-[#1E9E5A] hover:underline cursor-pointer"
                          >
                            View Bookings
                          </button>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleOpenEditLorry(v)}
                              className="px-3 py-1.5 rounded-xl border border-[#E5E7EB] hover:bg-[#F9FAFB] text-xs font-bold transition-colors cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteLorry(v.plate)}
                              className="px-3 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
    </>
  );
}
