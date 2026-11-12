import { normalizePlate, phonesMatch } from "./phone-utils";

export interface SchedulableBooking {
  id?: string;
  date?: string;
  dates?: string[];
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

const INACTIVE_STATUSES = new Set(["cancelled", "delivered"]);

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
 * Validates that both startTime and endTime are valid HH:MM values with endTime > startTime.
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

  const lorryA = String(a.assignedLorryId || "").trim().toLowerCase();
  const lorryB = String(b.assignedLorryId || "").trim().toLowerCase();
  if (lorryA && lorryB && lorryA !== "lorry-" && lorryA === lorryB) return true;

  return false;
}

function sameRider(a: SchedulableBooking, b: SchedulableBooking): boolean {
  const idA = String(a.assignedDriverId || "").trim().toUpperCase();
  const idB = String(b.assignedDriverId || "").trim().toUpperCase();
  if (idA && idB && idA === idB) return true;

  if (a.assignedDriverPhone && b.assignedDriverPhone && phonesMatch(a.assignedDriverPhone, b.assignedDriverPhone)) {
    return true;
  }

  const nameA = cleanRiderName(a.assignedDriverName).toLowerCase();
  const nameB = cleanRiderName(b.assignedDriverName).toLowerCase();
  if (nameA && nameB && nameA === nameB) return true;

  return false;
}

/**
 * Detects whether a candidate scheduled slot overlaps any active booking on the same date
 * for either the same Lorry OR the same Rider/Driver.
 */
export function findBookingScheduleConflict(
  candidate: SchedulableBooking & { excludeBookingId?: string },
  existingBookings: SchedulableBooking[]
): ScheduleConflictResult {
  const timeCheck = validateTimeRange(candidate.startTime, candidate.endTime);
  if (!timeCheck.valid) {
    return { hasConflict: false };
  }

  const candidateDates = new Set(extractBookingDates(candidate));
  if (candidateDates.size === 0) {
    return { hasConflict: false };
  }

  const excludeId = String(candidate.excludeBookingId || candidate.id || "").trim();

  for (const existing of existingBookings) {
    if (!existing) continue;
    if (excludeId && String(existing.id || "").trim() === excludeId) continue;
    if (INACTIVE_STATUSES.has(String(existing.status || "").toLowerCase())) continue;

    const existingTime = validateTimeRange(existing.startTime, existing.endTime);
    if (!existingTime.valid) continue;

    const existingDates = extractBookingDates(existing);
    const sharedDate = existingDates.find((d) => candidateDates.has(d));
    if (!sharedDate) continue;

    // Half-open interval overlap check: back-to-back slots (e.g. 08:00-12:00 & 12:00-15:00) do not overlap
    const timesOverlap = timeCheck.startMin < existingTime.endMin && existingTime.startMin < timeCheck.endMin;
    if (!timesOverlap) continue;

    const lorryClash = sameLorry(candidate, existing);
    const riderClash = sameRider(candidate, existing);
    if (!lorryClash && !riderClash) continue;

    const conflictType = lorryClash && riderClash ? "both" : lorryClash ? "lorry" : "rider";
    const conflictTimeRange = formatTimeDurationLabel(existingTime.startTime, existingTime.endTime);
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

    return {
      hasConflict: true,
      conflictType,
      conflictingBookingId: existing.id,
      conflictDate: sharedDate,
      conflictTimeRange,
      conflictPlate,
      conflictDriver,
      message: `Schedule conflict on ${sharedDate}: ${reasonLabel} is already allocated to booking ${existing.id || ""} (${conflictTimeRange}). Overlapping times on the same date are not allowed.`,
    };
  }

  return { hasConflict: false };
}

