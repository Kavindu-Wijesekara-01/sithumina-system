import type {
  BookingPaymentMethod,
  BookingStatusValue,
  PaymentSlipStatus,
} from "@/lib/server-store";

export type ActionResult<T = unknown> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

export interface BookingActionInput {
  pickup: string;
  destination: string;
  vehicleType: string;
  date: string;
  dates?: string[];
  startTime?: string;
  endTime?: string;
  phone: string;
  customerName?: string;
  weight?: string;
  notes?: string;
  assignedPlate?: string;
  assignedLorryId?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  assignedDriverPhone?: string;
  pickupLat?: number;
  pickupLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  bookingType?: "individual_vehicle" | "live_lorry";
  cargoNature?: string;
  daysNeeded?: number | string;
  cargoWeight?: string;
  helpersCount?: string | number;
  status?: BookingStatusValue;
  quotedAmount?: number;
  quoteNote?: string;
  paymentMethod?: BookingPaymentMethod;
  paymentSlipStatus?: PaymentSlipStatus;
  paymentApprovedAt?: number;
}

export interface VehicleRegistrationActionInput {
  ownerName: string;
  phone: string;
  plateNumber: string;
  vehicleType: string;
  baseCity: string;
  driverCount?: string;
  capacity?: string;
  province?: string;
}

export interface InquiryActionInput {
  name: string;
  phone: string;
  message: string;
  email?: string;
  subject?: string;
  type?: "quote" | "support" | "general";
}

export interface ReviewActionInput {
  name: string;
  rating?: number;
  stars?: number;
  role?: string;
  route?: string;
  commentEn?: string;
  commentSi?: string;
  comment?: string;
  service?: string;
}

export interface DriverRegistrationInput {
  name: string;
  phone: string;
  plate: string;
  vehicleType?: string;
  route?: string;
  driverId?: string;
}
