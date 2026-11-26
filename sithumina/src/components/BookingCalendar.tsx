"use client";

import { todayYmd } from "@/lib/ledger";
import React, { useState } from "react";
import type { BookedDateDetail } from "@/actions/bookings";

export interface BookingCalendarProps {
  selectedDate?: string; // YYYY-MM-DD
  selectedDates?: string[]; // List of multiple YYYY-MM-DD
  onSelectDate: (date: string) => void;
  onToggleDate?: (date: string) => void;
  bookedDates: string[]; // List of YYYY-MM-DD that are already reserved
  bookingsByDate?: Record<string, BookedDateDetail>;
  onBookedDateClick?: (date: string, detail?: BookedDateDetail) => void;
  locale?: "en" | "si";
  minDate?: string; // YYYY-MM-DD, defaults to today
  isAdmin?: boolean;
  onCancelBooking?: (bookingId: string) => Promise<void> | void;
}

const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_NAMES_SI = [
  "ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජුනි",
  "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්",
];

const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_SI = ["සඳුදා", "අඟහ", "බදාදා", "බ්‍රහස්", "සිකු", "සෙන", "ඉරිදා"];

export const BookingCalendar: React.FC<BookingCalendarProps> = ({
  selectedDate,
  selectedDates,
  onSelectDate,
  onToggleDate,
  bookedDates = [],
  bookingsByDate = {},
  onBookedDateClick,
  locale = "si",
  minDate,
  isAdmin = false,
  onCancelBooking,
}) => {
  const today = new Date();
  const todayStr = todayYmd(today.getTime());
  const effectiveMin = minDate || todayStr;

  const firstSelected = (selectedDates && selectedDates[0]) || selectedDate;
  const initDate = firstSelected ? new Date(firstSelected) : today;
  const [currentYear, setCurrentYear] = useState(initDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initDate.getMonth()); // 0-11

  // Pop-up modal state for viewing booked date details
  const [viewingDetail, setViewingDetail] = useState<BookedDateDetail | null>(null);
  const [viewingDate, setViewingDate] = useState<string>("");
  const [cancelling, setCancelling] = useState(false);

  // Set of booked dates for fast lookup
  const bookedSet = React.useMemo(() => new Set(bookedDates), [bookedDates]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleBookedClick = (dateStr: string) => {
    const detail = bookingsByDate[dateStr] || null;
    setViewingDate(dateStr);
    setViewingDetail(detail);
    if (onBookedDateClick) {
      onBookedDateClick(dateStr, detail || undefined);
    }
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;

  const cells: Array<{ dayNumber: number; dateStr: string; isCurrentMonth: boolean }> = [];

  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ dayNumber: 0, dateStr: "", isCurrentMonth: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(currentMonth + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const dateStr = `${currentYear}-${mm}-${dd}`;
    cells.push({ dayNumber: d, dateStr, isCurrentMonth: true });
  }

  const monthLabel =
    locale === "en"
      ? `${MONTH_NAMES_EN[currentMonth]} ${currentYear}`
      : `${MONTH_NAMES_SI[currentMonth]} ${currentYear}`;

  const daysHeader = locale === "en" ? DAYS_EN : DAYS_SI;

  return (
    <div className="w-full bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 select-none shadow-xs relative">
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm sm:text-base font-black text-[var(--ink)]">
            {monthLabel}
          </h4>
          <p className="text-[11px] text-[var(--mut)]">
            {locale === "en"
              ? "Select an available date or click booked dates to view details"
              : "වෙන්කරගත හැකි දිනයක් තෝරන්න (වෙන්කළ දින මත ක්ලික් කර විස්තර බලන්න)"}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous Month"
            className="w-8 h-8 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--y3)] text-[var(--ink)] flex items-center justify-center cursor-pointer transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next Month"
            className="w-8 h-8 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--y3)] text-[var(--ink)] flex items-center justify-center cursor-pointer transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Weekdays Row */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
        {daysHeader.map((dayName, idx) => (
          <div
            key={idx}
            className="text-center text-[10px] sm:text-xs font-bold text-[var(--mut)] uppercase py-1"
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {cells.map((cell, idx) => {
          if (!cell.isCurrentMonth) {
            return <div key={`empty-${idx}`} className="h-10 sm:h-11" />;
          }

          const isPast = cell.dateStr < effectiveMin;
          const isBooked = bookedSet.has(cell.dateStr);
          const isSelected = selectedDates ? selectedDates.includes(cell.dateStr) : selectedDate === cell.dateStr;

          // Booked date: RED badge, CLICKABLE to view booking details
          if (isBooked) {
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => handleBookedClick(cell.dateStr)}
                title={locale === "en" ? "Booked — Click to view details" : "වෙන්කර ඇත — විස්තර බැලීමට ඔබන්න"}
                className="h-10 sm:h-11 rounded-xl bg-red-500 hover:bg-red-600 text-white border-2 border-red-600 font-black text-xs sm:text-sm flex flex-col items-center justify-center cursor-pointer shadow-xs relative opacity-95 transition-all active:scale-95"
              >
                <span>{cell.dayNumber}</span>
                <span className="text-[7.5px] uppercase tracking-tighter leading-none font-bold">
                  {locale === "en" ? "Booked" : "වෙන්කළ"}
                </span>
              </button>
            );
          }

          // Past date: Muted, disabled
          if (isPast) {
            return (
              <div
                key={cell.dateStr}
                className="h-10 sm:h-11 rounded-xl border border-transparent text-gray-300 font-semibold text-xs sm:text-sm flex items-center justify-center cursor-not-allowed select-none"
              >
                {cell.dayNumber}
              </div>
            );
          }

          // Selected date: Golden Yellow with bold ink
          if (isSelected) {
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => (onToggleDate ? onToggleDate(cell.dateStr) : onSelectDate(cell.dateStr))}
                className="h-10 sm:h-11 rounded-xl bg-[var(--y,#FFC20E)] text-[#26231B] border-2 border-[#26231B] font-black text-xs sm:text-sm flex flex-col items-center justify-center cursor-pointer shadow-sm scale-105 transition-all"
              >
                <span>{cell.dayNumber}</span>
                <span className="text-[8px] uppercase tracking-tighter leading-none font-black">
                  {locale === "en" ? "Chosen" : "තෝරාගත්"}
                </span>
              </button>
            );
          }

          // Available date: Clean card
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => (onToggleDate ? onToggleDate(cell.dateStr) : onSelectDate(cell.dateStr))}
              className="h-10 sm:h-11 rounded-xl bg-[var(--bg,#F7F5EE)] hover:bg-[#FFEBAA] hover:border-[#FFC20E] border border-[var(--line,#E7E2D0)] text-[#26231B] font-bold text-xs sm:text-sm flex items-center justify-center cursor-pointer transition-all active:scale-95"
            >
              {cell.dayNumber}
            </button>
          );
        })}
      </div>

      {/* Legend Bar */}
      <div className="mt-4 pt-3 border-t border-[var(--line)] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--mut)]">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-red-500 border border-red-600 inline-block" />
          <span className="font-bold text-red-700">
            {locale === "en" ? "Booked / Click to view" : "වෙන්කර ඇත (විස්තර බලන්න)"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-[var(--y)] border border-[#26231B] inline-block" />
          <span className="font-bold text-[var(--ink)]">
            {locale === "en" ? "Selected Date" : "තෝරාගත් දිනය"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-md bg-[var(--bg)] border border-[var(--line)] inline-block" />
          <span className="font-semibold text-[var(--mut)]">
            {locale === "en" ? "Available" : "නිදහස් දින"}
          </span>
        </div>
      </div>

      {/* Booked Date Details Modal */}
      {viewingDate && (
        <div
          className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => { setViewingDetail(null); setViewingDate(""); }}
        >
          <div
            className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-[var(--line)] p-5 flex flex-col gap-3.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-[var(--line)] pb-3">
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-red-50 text-red-700 border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
                  {locale === "en" ? "Confirmed Booking" : "තහවුරු කළ වෙන්කිරීම"}
                </span>
                <h4 className="text-base font-black text-[var(--ink)] mt-1.5 font-mono">
                  {viewingDate}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => { setViewingDetail(null); setViewingDate(""); }}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-700 cursor-pointer border-0"
              >
                ✕
              </button>
            </div>

            {viewingDetail ? (
              <div className="flex flex-col gap-2 text-xs">
                {viewingDetail.assignedPlate && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-[var(--mut)] font-bold">{locale === "en" ? "Vehicle Plate:" : "වාහන අංකය:"}</span>
                    <span className="font-mono font-black text-[var(--ink)]">{viewingDetail.assignedPlate}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-[var(--mut)] font-bold">{locale === "en" ? "Customer Name:" : "පාරිභෝගිකයා:"}</span>
                  <span className="font-bold text-[var(--ink)]">{viewingDetail.customerName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-[var(--mut)] font-bold">{locale === "en" ? "Contact Phone:" : "දුරකථන අංකය:"}</span>
                  <a href={`tel:${viewingDetail.customerPhone}`} className="font-mono font-bold text-[#1E9E5A] hover:underline">
                    {viewingDetail.customerPhone}
                  </a>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-[var(--mut)] font-bold">{locale === "en" ? "Route:" : "ගමන් මාර්ගය:"}</span>
                  <span className="font-bold text-[var(--ink)] text-right">{viewingDetail.pickupCity} → {viewingDetail.deliveryCity}</span>
                </div>
                {viewingDetail.cargoNature && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-[var(--mut)] font-bold">{locale === "en" ? "Cargo Nature:" : "භාණ්ඩයේ ස්වභාවය:"}</span>
                    <span className="font-bold text-[var(--ink)]">{viewingDetail.cargoNature}</span>
                  </div>
                )}
                {viewingDetail.daysNeeded && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-[var(--mut)] font-bold">{locale === "en" ? "Duration:" : "දින ගණන:"}</span>
                    <span className="font-bold text-[var(--ink)]">{viewingDetail.daysNeeded} {locale === "en" ? "Days" : "දින"}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-[var(--mut)] font-bold">{locale === "en" ? "Booking ID:" : "වෙන්කිරීම් අංකය:"}</span>
                  <span className="font-mono text-[11px] font-bold text-gray-500">{viewingDetail.bookingId}</span>
                </div>

                {isAdmin && onCancelBooking && (
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={async () => {
                      setCancelling(true);
                      try {
                        await onCancelBooking(viewingDetail.bookingId);
                        setViewingDetail(null);
                        setViewingDate("");
                      } finally {
                        setCancelling(false);
                      }
                    }}
                    className="mt-2 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs cursor-pointer border-0 transition-all shadow-xs"
                  >
                    {cancelling
                      ? (locale === "en" ? "Cancelling..." : "අවලංගු කරමින්...")
                      : (locale === "en" ? "Cancel / Free This Date" : "මෙම වෙන්කිරීම අවලංගු කර දිනය නිදහස් කරන්න")}
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs text-[var(--mut)] py-2">
                {locale === "en"
                  ? "This vehicle is reserved for an accepted booking on this date. Please select another available date."
                  : "මෙම දිනයේදී මෙම වාහනය තහවුරු කළ ගමනක් සඳහා වෙන්කර ඇත. කරුණාකර වෙනත් නිදහස් දිනයක් තෝරන්න."}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setViewingDetail(null); setViewingDate(""); }}
              className="w-full py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs cursor-pointer border-0 transition-colors"
            >
              {locale === "en" ? "Close" : "වසන්න"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
