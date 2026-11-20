import { normalizePlate, phonesMatch } from "./phone-utils";

export interface SchedulableBooking {
  id?: string;
  date?: string;
  endDate?: string;
  dates?: string[];
  daysNeeded?: number | string;
  startTime?: string;
  endTime?: string;
  status?: string;
  bookingType?: string;
  assignedPlate?: string;
  selectedVehiclePlate?: string;
  assignedLorryId?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
}

export interface ScheduleConflictResult {
  hasConflict: boolean;
  conflictType?: "lorry" | "rider" | "both";
  conflictingBookingId?: string;
  conflictDate?: string;
  conflictTimeRange?: string;
  conflictPlate?: string;
  conflictDriver?: string;
  message?: string;
}

const INACTIVE_STATUSES = new Set(["cancelled", "delivered", "completed"]);

const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Adds N days to a YYYY-MM-DD date string.
 */
export function addDaysToYYYYMMDD(dateStr?: string | null, days: number = 1): string {
  if (!dateStr) return "";
  const parts = String(dateStr).trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return d.toISOString().split("T")[0];
}

/**
 * Returns contiguous array of dates from startDateStr to endDateStr inclusive (YYYY-MM-DD).
 */
export function getDatesBetween(startDateStr?: string | null, endDateStr?: string | null): string[] {
  const start = String(startDateStr || "").trim();
  const end = String(endDateStr || "").trim();
  if (!start) return [];
  if (!end || end <= start) return [start];

  const results: string[] = [];
  const startParts = start.split("-").map(Number);
  const endParts = end.split("-").map(Number);
  if (startParts.length !== 3 || endParts.length !== 3) return [start];

  const current = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]));
  const stop = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));
  if (Number.isNaN(current.getTime()) || Number.isNaN(stop.getTime())) return [start];

  let count = 0;
  while (current <= stop && count < 60) {
    results.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
    count++;
  }
  return results.length > 0 ? results : [start];
}

/**
 * Returns UTC timestamp for a specific Sri Lanka date (YYYY-MM-DD) and time (HH:MM).
 */
export function getSriLankaTimestampForDateTime(
  dateStr?: string | null,
  timeStr?: string | null
): number | null {
  if (!dateStr) return null;
  const dateParts = String(dateStr).trim().split("-").map(Number);
  if (dateParts.length !== 3 || dateParts.some(Number.isNaN)) return null;
  const mins = parseTimeToMinutes(timeStr) ?? 0;
  const hour = Math.floor(mins / 60);
  const min = mins % 60;
  return Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], hour, min) - SRI_LANKA_OFFSET_MS;
}

/**
 * Normalizes a rider/driver name and filters out generic placeholder labels.
 */
export function cleanRiderName(raw?: string | null): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "driver" || trimmed.toLowerCase() === "unassigned") {
    return "";
  }
  return trimmed;
}

/**
 * Parses a 24-hour HH:MM string into minutes since midnight (0..1440).
 */
export function parseTimeToMinutes(value?: string | null): number | null {
  const raw = String(value || "").trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) {
    if (raw === "24:00") return 1440;
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Validates that both startTime and endTime are valid HH:MM values with endTime > startTime (for single day).
 */
export function validateTimeRange(
  startTime?: string | null,
  endTime?: string | null
): { valid: true; startTime: string; endTime: string; startMin: number; endMin: number } | { valid: false; error: string } {
  const cleanStart = String(startTime || "").trim();
  const cleanEnd = String(endTime || "").trim();
  if (!cleanStart || !cleanEnd) {
    return { valid: false, error: "Please allocate both Start Time and End Time." };
  }
  const startMin = parseTimeToMinutes(cleanStart);
  const endMin = parseTimeToMinutes(cleanEnd);
  if (startMin === null || endMin === null) {
    return { valid: false, error: "Invalid time format. Please select valid Start and End times." };
  }
  if (endMin <= startMin) {
    return { valid: false, error: "End Time must be later than Start Time on the booking date." };
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const normalizedStart = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
  const normalizedEnd = endMin === 1440 ? "24:00" : `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
  return {
    valid: true,
    startTime: normalizedStart,
    endTime: normalizedEnd,
    startMin,
    endMin,
  };
}

export interface ValidatedScheduleResult {
  valid: true;
  isMultiDate: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  dates: string[];
  daysCount: number;
  startTs: number;
  endTs: number;
}

export type ValidateScheduleResult =
  | ValidatedScheduleResult
  | { valid: false; error: string };

/**
 * Validates single-date and multi-date booking schedules:
 * - Single-date: End Time on that day must be later than Start Time.
 * - Multi-date: Trip departs on Start Date at Start Time, and delivers on End Date at End Time.
 *   Calculates precise start and end timestamps and includes all intermediate dates.
 */
export function validateScheduleTimeAndDates(
  startDate?: string | null,
  startTime?: string | null,
  endDate?: string | null,
  endTime?: string | null,
  existingDates?: string[] | null
): ValidateScheduleResult {
  const cleanStart = String(startTime || "").trim();
  const cleanEnd = String(endTime || "").trim();
  if (!cleanStart || !cleanEnd) {
    return { valid: false, error: "Please allocate both Departure Start Time and Delivery End Time." };
  }
  const startMin = parseTimeToMinutes(cleanStart);
  const endMin = parseTimeToMinutes(cleanEnd);
  if (startMin === null || endMin === null) {
    return { valid: false, error: "Invalid time format. Please select valid Start and End times (HH:MM)." };
  }

  const cleanStartDate = String(startDate || "").trim();
  if (!cleanStartDate) {
    return { valid: false, error: "Please select a Trip Departure Date." };
  }

  const datesFromList = Array.isArray(existingDates) && existingDates.length > 0 ? existingDates : [];
  const rawEndDate = String(endDate || (datesFromList.length > 1 ? datesFromList[datesFromList.length - 1] : "")).trim();
  const cleanEndDate = rawEndDate && rawEndDate >= cleanStartDate ? rawEndDate : cleanStartDate;

  const pad = (n: number) => String(n).padStart(2, "0");
  const normalizedStart = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}`;
  const normalizedEnd = endMin === 1440 ? "24:00" : `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;

  const isMultiDate = cleanEndDate > cleanStartDate || datesFromList.length > 1;

  if (!isMultiDate) {
    // Single Day booking: End time must be later than start time on the same date
    if (endMin <= startMin) {
      return { valid: false, error: "End Time must be later than Start Time on the booking date." };
    }
    const startTs = getSriLankaTimestampForDateTime(cleanStartDate, normalizedStart);
    const endTs = getSriLankaTimestampForDateTime(cleanStartDate, normalizedEnd);
    if (startTs === null || endTs === null) {
      return { valid: false, error: "Unable to calculate date/time timestamps." };
    }
    return {
      valid: true,
      isMultiDate: false,
      startDate: cleanStartDate,
      endDate: cleanStartDate,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      dates: [cleanStartDate],
      daysCount: 1,
      startTs,
      endTs,
    };
  }

  // Multi-day booking: trip starts on cleanStartDate at normalizedStart, and concludes on cleanEndDate at normalizedEnd
  const dates = getDatesBetween(cleanStartDate, cleanEndDate);
  const startTs = getSriLankaTimestampForDateTime(cleanStartDate, normalizedStart);
  const endTs = getSriLankaTimestampForDateTime(cleanEndDate, normalizedEnd);

  if (startTs === null || endTs === null) {
    return { valid: false, error: "Unable to calculate multi-date schedule timestamps." };
  }
  if (endTs <= startTs) {
    return {
      valid: false,
      error: `End date & time (${cleanEndDate} ${formatTime12h(normalizedEnd)}) must be later than departure (${cleanStartDate} ${formatTime12h(normalizedStart)}).`,
    };
  }

  return {
    valid: true,
    isMultiDate: true,
    startDate: cleanStartDate,
    endDate: cleanEndDate,
    startTime: normalizedStart,
    endTime: normalizedEnd,
    dates,
    daysCount: dates.length,
    startTs,
    endTs,
  };
}

/**
 * Formats 24-hour HH:MM into readable 12-hour time (e.g. 08:30 AM).
 */
export function formatTime12h(hhmm?: string | null): string {
  const mins = parseTimeToMinutes(hhmm);
  if (mins === null) return String(hhmm || "").trim();
  if (mins === 1440) return "12:00 AM";
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatTimeDurationLabel(startTime?: string | null, endTime?: string | null): string {
  if (!startTime || !endTime) return "";
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
}

/**
 * Comprehensive formatted label for a booking schedule:
 * - Single day: "2026-11-21 · 08:00 AM – 12:00 PM"
 * - Multi-day:  "2026-11-21 08:00 PM → 2026-11-22 06:00 AM (2 Days)"
 */
export function formatJourneyScheduleSummary(
  startDate?: string | null,
  startTime?: string | null,
  endDate?: string | null,
  endTime?: string | null,
  dates?: string[] | null
): string {
  const datesList = Array.isArray(dates) && dates.length > 0 ? dates : startDate ? [startDate] : [];
  const sDate = startDate || datesList[0] || "";
  const eDate = endDate || (datesList.length > 1 ? datesList[datesList.length - 1] : sDate);
  const isMulti = Boolean(eDate && sDate && eDate > sDate);

  if (isMulti) {
    const sTimeStr = startTime ? formatTime12h(startTime) : "Departure";
    const eTimeStr = endTime ? formatTime12h(endTime) : "Delivery";
    const days = datesList.length || 2;
    return `${sDate} ${sTimeStr} → ${eDate} ${eTimeStr} (${days} Days)`;
  }

  if (sDate && startTime && endTime) {
    return `${sDate} · ${formatTimeDurationLabel(startTime, endTime)}`;
  }
  if (sDate) {
    return `${sDate}${startTime ? ` · ${formatTime12h(startTime)}` : ""}`;
  }
  return "Schedule Not Set";
}

export function extractBookingDates(item: Pick<SchedulableBooking, "date" | "dates">): string[] {
  const list: string[] = [];
  if (Array.isArray(item.dates)) {
    for (const d of item.dates) {
      const s = String(d || "").trim();
      if (s && !list.includes(s)) list.push(s);
    }
  }
  const primary = String(item.date || "").trim();
  if (primary && !list.includes(primary)) {
    list.unshift(primary);
  }
  return list;
}

export function hasAssignedRider(
  target?: Pick<SchedulableBooking, "assignedDriverId" | "assignedDriverName" | "assignedDriverPhone"> | null
): boolean {
  if (!target) return false;
  const hasId = Boolean(String(target.assignedDriverId || "").trim());
  const hasName = Boolean(cleanRiderName(target.assignedDriverName));
  const phoneDigits = String(target.assignedDriverPhone || "").replace(/[^0-9]/g, "");
  return hasId || (hasName && phoneDigits.length >= 8) || (hasName && !target.assignedDriverPhone);
}

function sameLorry(a: SchedulableBooking, b: SchedulableBooking): boolean {
  const plateA = normalizePlate(a.assignedPlate || a.selectedVehiclePlate);
  const plateB = normalizePlate(b.assignedPlate || b.selectedVehiclePlate);
  if (plateA && plateB && plateA === plateB) return true;

  const idA = String(a.assignedLorryId || "").trim().toLowerCase();
  const idB = String(b.assignedLorryId || "").trim().toLowerCase();
  if (idA && idB && idA === idB) return true;

  return false;
}

function sameRider(a: SchedulableBooking, b: SchedulableBooking): boolean {
  const idA = String(a.assignedDriverId || "").trim();
  const idB = String(b.assignedDriverId || "").trim();
  if (idA && idB && idA === idB) return true;

  if (phonesMatch(a.assignedDriverPhone, b.assignedDriverPhone)) return true;

  const nameA = cleanRiderName(a.assignedDriverName).toLowerCase();
  const nameB = cleanRiderName(b.assignedDriverName).toLowerCase();
  if (nameA && nameB && nameA === nameB) return true;

  return false;
}

/**
 * Detects whether a candidate scheduled slot overlaps any active booking in time
 * for either the same Lorry OR the same Rider/Driver.
 * Seamlessly supports both single-day and multi-day (overnight/multi-date) bookings.
 */
export function findBookingScheduleConflict(
  candidate: SchedulableBooking & { excludeBookingId?: string; endDate?: string },
  existingBookings: SchedulableBooking[]
): ScheduleConflictResult {
  const candidateDates = extractBookingDates(candidate);
  const candidateStartDate = candidate.date || candidateDates[0] || "";
  const candidateEndDate = candidate.endDate || (candidateDates.length > 1 ? candidateDates[candidateDates.length - 1] : candidateStartDate);

  const candidateCheck = validateScheduleTimeAndDates(
    candidateStartDate,
    candidate.startTime,
    candidateEndDate,
    candidate.endTime,
    candidateDates
  );
  if (!candidateCheck.valid) {
    return { hasConflict: false };
  }

  const excludeId = String(candidate.excludeBookingId || candidate.id || "").trim();

  for (const existing of existingBookings) {
    if (!existing) continue;
    if (excludeId && String(existing.id || "").trim() === excludeId) continue;
    if (INACTIVE_STATUSES.has(String(existing.status || "").trim().toLowerCase())) continue;

    const existingDates = extractBookingDates(existing);
    const existingStartDate = existing.date || existingDates[0] || "";
    const existingEndDate = existing.endDate || (existingDates.length > 1 ? existingDates[existingDates.length - 1] : existingStartDate);

    const existingCheck = validateScheduleTimeAndDates(
      existingStartDate,
      existing.startTime,
      existingEndDate,
      existing.endTime,
      existingDates
    );
    if (!existingCheck.valid) continue;

    // Half-open interval overlap check on absolute timestamps:
    // Two intervals [A_start, A_end) and [B_start, B_end) overlap iff:
    // A_start < B_end && B_start < A_end
    const timesOverlap = candidateCheck.startTs < existingCheck.endTs && existingCheck.startTs < candidateCheck.endTs;
    if (!timesOverlap) continue;

    const lorryClash = sameLorry(candidate, existing);
    const riderClash = sameRider(candidate, existing);
    if (!lorryClash && !riderClash) continue;

    const conflictType = lorryClash && riderClash ? "both" : lorryClash ? "lorry" : "rider";
    const conflictPlate = String(existing.assignedPlate || existing.selectedVehiclePlate || "").trim();
    const conflictDriver = cleanRiderName(existing.assignedDriverName) || existing.assignedDriverPhone || "Assigned Rider";

    let reasonLabel = "";
    if (conflictType === "both") {
      reasonLabel = `Both Lorry (${conflictPlate || "Vehicle"}) and Rider (${conflictDriver})`;
    } else if (conflictType === "lorry") {
      reasonLabel = `Lorry (${conflictPlate || "Vehicle"})`;
    } else {
      reasonLabel = `Rider (${conflictDriver})`;
    }

    const conflictTimeRange = existingCheck.isMultiDate
      ? `${existingCheck.startDate} ${formatTime12h(existingCheck.startTime)} → ${existingCheck.endDate} ${formatTime12h(existingCheck.endTime)} (${existingCheck.daysCount} Days)`
      : `${existingCheck.startDate} · ${formatTimeDurationLabel(existingCheck.startTime, existingCheck.endTime)}`;

    return {
      hasConflict: true,
      conflictType,
      conflictingBookingId: existing.id,
      conflictDate: existingCheck.startDate,
      conflictTimeRange,
      conflictPlate,
      conflictDriver,
      message: `Schedule conflict: ${reasonLabel} is already allocated to booking ${existing.id || ""} for ${conflictTimeRange}. Overlapping times are not allowed.`,
    };
  }

  return { hasConflict: false };
}
