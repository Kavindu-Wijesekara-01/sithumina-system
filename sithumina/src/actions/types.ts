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
  endDate?: string;
  startTime?: string;
  endTime?: string;
  phone: string;
  customerName?: string;
  customerIdNumber?: string;
  distanceKm?: number;
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
  pickupPinned?: boolean;
  dropoffPinned?: boolean;
  bookingType?: "individual_vehicle" | "live_lorry";
  cargoNature?: string;
  daysNeeded?: number | string;
  cargoWeight?: string;
  helpersCount?: string | number;
  status?: BookingStatusValue;
  quotedAmount?: number;
  quoteNote?: string;
  paymentMethod?: BookingPaymentMethod;
  paymentBankUsed?: string;
  advanceAmount?: number;
  pendingAmount?: number;
  finalPaymentMethod?: BookingPaymentMethod;
  finalPaymentBankUsed?: string;
  finalPaymentAt?: number;
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
  idNumber?: string;
  maxWeight?: string;
  dimensions?: string;
  images?: string[];
  depositSlipUrl?: string;
  depositBank?: string;
  initialDepositAmount?: number;
}

export interface OutsideEmployeeRecord {
  id: string;
  driverId?: string;
  registrationId: string;
  name: string;
  phone: string;
  idNumber: string;
  plateNumber: string;
  vehicleType: string;
  baseCity: string;
  balance: number;
  isAvailable: boolean;
  status: "active" | "inactive" | "suspended";
  totalCommissionDeducted: number;
  totalHiresCompleted: number;
  createdAt: number;
  updatedAt: number;
}

export interface CommissionTransactionRecord {
  id: string;
  employeeId: string;
  idNumber: string;
  bookingId?: string;
  type: "initial_deposit" | "topup" | "commission_deduction" | "adjustment";
  hireAmount?: number;
  commissionRate?: number;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  slipUrl?: string;
  note?: string;
  createdAt: number;
}

export interface TopupSlipRecord {
  id: string;
  employeeId: string;
  idNumber: string;
  employeeName: string;
  phone: string;
  plateNumber: string;
  amount: number;
  bankUsed?: string;
  slipUrl: string;
  status: "pending" | "approved" | "rejected";
  reviewedAt?: number;
  createdAt: number;
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
