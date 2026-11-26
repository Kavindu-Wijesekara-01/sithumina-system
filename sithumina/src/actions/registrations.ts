"use server";

import { revalidatePath } from "next/cache";
import {
  addRegistrationInStore,
  updateRegistrationStatusInStore,
  StoredRegistration,
  StoredOutsideEmployee,
  StoredCommissionTransaction,
  StoredTopupSlip,
} from "@/lib/server-store";
import { ActionResult, VehicleRegistrationActionInput } from "./types";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, updateDoc, getDocs } from "firebase/firestore";
import {
  OwnerError,
  approveOwnerRegistration,
  approveTopup,
  createOutsideOwner,
  createTopupSlip,
  findOutsideOwner,
  listOutsideOwners,
  listOwnerTransactions,
  listTopupSlips,
  removeTopupSlip,
  setOwnerAvailability,
  recordWalletTopup,
  setWalletEntryPayment,
} from "@/lib/outside-owners";

/**
 * Server Action for vehicle owners / fleet partners to register their outside lorry.
 */
export async function registerVehicleAction(
  input: VehicleRegistrationActionInput
): Promise<ActionResult<{ id: string; registration: StoredRegistration }>> {
  try {
    const ownerName = input.ownerName?.trim();
    const phone = input.phone?.trim();
    const idNumber = input.idNumber?.trim();
    const plateNumber = input.plateNumber?.trim().toUpperCase();
    const vehicleType = input.vehicleType?.trim() || "14ft Lorry";
    const baseCity = input.baseCity?.trim() || "Colombo";
    const capacity = input.capacity?.trim() || "Standard Load";
    const maxWeight = input.maxWeight?.trim() || "";
    const dimensions = input.dimensions?.trim() || "";
    const province = input.province?.trim() || "Western";
    const images = Array.isArray(input.images) ? input.images : [];
    const depositSlipUrl = input.depositSlipUrl?.trim() || "";
    const initialDepositAmount = Number(input.initialDepositAmount) || 5000;

    if (!ownerName) {
      return { success: false, error: "Owner name is required / අයිතිකරුගේ නම අවශ්‍ය වේ." };
    }
    if (!phone || phone.length < 8) {
      return { success: false, error: "A valid phone number is required / වලංගු දුරකථන අංකයක් අවශ්‍ය වේ." };
    }
    if (!idNumber || idNumber.length < 5) {
      return { success: false, error: "National ID Number is required / ජාතික හැඳුනුම්පත් අංකය (ID Number) අනිවාර්ය වේ." };
    }
    if (!plateNumber) {
      return { success: false, error: "Vehicle plate number is required (e.g. WP LK-1234) / වාහන අංකය අවශ්‍ය වේ." };
    }

    const registration = await addRegistrationInStore({
      ownerName,
      phone,
      idNumber,
      vehicleNumber: plateNumber,
      plateNumber,
      vehicleType,
      baseCity,
      capacity,
      maxWeight,
      dimensions,
      images,
      depositSlipUrl,
      depositBank: input.depositBank?.trim() || "",
      initialDepositAmount,
      province,
    });

    // Cloud Firestore sync (primary source of truth)
    try {
      const docRef = doc(db, "vehicle_registrations", registration.id);
      await setDoc(
        docRef,
        {
          id: registration.id,
          ownerName,
          phone,
          idNumber,
          plateNumber,
          vehicleNumber: plateNumber,
          vehicleType,
          baseCity,
          capacity,
          maxWeight,
          dimensions,
          images,
          depositSlipUrl,
          initialDepositAmount,
          province,
          status: "pending",
          createdAt: registration.createdAt,
          updatedAt: registration.createdAt,
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn("Firestore registration sync notice:", cloudErr);
    }

    try {
      revalidatePath("/register-vehicle");
      revalidatePath("/manage");
      revalidatePath("/admin");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: {
        id: registration.id,
        registration,
      },
      message: "Vehicle registration submitted successfully with Rs. 5,000 deposit confirmation.",
    };
  } catch (err: unknown) {
    console.error("registerVehicleAction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to register vehicle.",
    };
  }
}

/**
 * Server Action to get all vehicle registrations directly from Firestore.
 */
export async function getAllRegistrationsAction(): Promise<ActionResult<StoredRegistration[]>> {
  try {
    const colRef = collection(db, "vehicle_registrations");
    const snap = await getDocs(colRef);
    const registrations = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as unknown as StoredRegistration[];

    return {
      success: true,
      data: registrations,
    };
  } catch (err: unknown) {
    console.error("getAllRegistrationsAction error:", err);
    return {
      success: false,
      error: "Failed to retrieve registrations.",
    };
  }
}

/**
 * Server Action to update vehicle registration status.
 */
export async function updateRegistrationStatusAction(
  id: string,
  status: "pending" | "approved" | "rejected"
): Promise<ActionResult<StoredRegistration>> {
  try {
    if (!id) {
      return { success: false, error: "Registration ID is required." };
    }

    if (status === "approved") {
      const approval = await approveRegistrationAndAddToFleetAction(id);
      return approval;
    }

    const updated = await updateRegistrationStatusInStore(id, status);
    await updateDoc(doc(db, "vehicle_registrations", id), { status, updatedAt: Date.now() });

    try {
      revalidatePath("/register-vehicle");
      revalidatePath("/manage");
    } catch {
      // Ignored
    }

    return {
      success: true,
      data: updated || ({ id, status } as StoredRegistration),
    };
  } catch (err: unknown) {
    console.error("updateRegistrationStatusAction error:", err);
    return {
      success: false,
      error: "Failed to update registration status.",
    };
  }
}

/**
 * Server Action to approve a registration and instantly inject it into the active live fleet.
 */
export async function approveRegistrationAndAddToFleetAction(
  id: string,
  route?: string
): Promise<ActionResult<StoredRegistration>> {
  try {
    const { employee, created } = await approveOwnerRegistration(id, route);
    const updated = await updateRegistrationStatusInStore(id, "approved");
    revalidateOwnerPages();

    return {
      success: true,
      data: {
        ...(updated || ({ id } as StoredRegistration)),
        status: "approved",
        outsideEmployeeId: employee.id,
      },
      message: created
        ? `Registration approved. Driver ID ${employee.id} created with the deposit credited.`
        : `Already approved as ${employee.id}. Wallet balance unchanged.`,
    };
  } catch (err: unknown) {
    return failure("approveRegistrationAndAddToFleetAction", err, "Failed to approve registration.");
  }
}

/**
 * Server Action for Employee Login via ID Number (NIC).
 */
export async function loginOutsideEmployeeAction(
  idNumber: string
): Promise<ActionResult<{ employee: StoredOutsideEmployee; transactions: StoredCommissionTransaction[] }>> {
  try {
    if (!(idNumber || "").trim()) {
      return { success: false, error: "National ID Number (NIC) or Driver ID is required / හැඳුනුම්පත් අංකය හෝ Driver ID ඇතුළත් කරන්න." };
    }
    const employee = await findOutsideOwner(idNumber);
    if (!employee) {
      return {
        success: false,
        error:
          "No registered outside vehicle owner found with this ID Number. Make sure your vehicle registration is approved by Admin / මෙම හැඳුනුම්පත් අංකයට අදාළ ලියාපදිංචියක් හමු නොවීය.",
      };
    }
    const transactions = await listOwnerTransactions(employee.id);
    return { success: true, data: { employee, transactions } };
  } catch (err: unknown) {
    return failure("loginOutsideEmployeeAction", err, "Failed to authenticate employee / පිවිසීම අසාර්ථක විය.");
  }
}

/**
 * Server Action to toggle Outside Employee availability (Available / Unavailable).
 */
export async function toggleOutsideDutyAction(
  idNumber: string,
  isAvailable: boolean
): Promise<ActionResult<{ isAvailable: boolean }>> {
  try {
    if (!(idNumber || "").trim()) return { success: false, error: "ID Number is required." };
    await setOwnerAvailability(idNumber, isAvailable);
    revalidateOwnerPages();
    return {
      success: true,
      data: { isAvailable },
      message: isAvailable
        ? "Status set to Available / සේවයට සූදානම් ලෙස සටහන් විය."
        : "Status set to Unavailable / තාවකාලිකව සේවයෙන් බැහැර ලෙස සටහන් විය.",
    };
  } catch (err: unknown) {
    return failure("toggleOutsideDutyAction", err, "Failed to update availability status.");
  }
}

/**
 * Server Action for Outside Employee to upload a Top-up Bank Slip.
 */
export async function submitOutsideTopupSlipAction(input: {
  idNumber: string;
  amount: number;
  bankUsed?: string;
  slipUrl: string;
}): Promise<ActionResult<StoredTopupSlip>> {
  try {
    const idNumber = (input.idNumber || "").trim();
    const amount = Number(input.amount || 0);
    const slipUrl = (input.slipUrl || "").trim();

    if (!idNumber) return { success: false, error: "ID Number is required." };
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: "Valid top-up amount is required." };
    if (!slipUrl) return { success: false, error: "Please upload the bank deposit slip photo." };

    const slip = await createTopupSlip({ idNumber, amount, bankUsed: input.bankUsed, slipUrl });
    revalidateOwnerPages();
    return {
      success: true,
      data: slip,
      message: "Top-up slip submitted successfully. It will be credited to your balance upon Admin approval.",
    };
  } catch (err: unknown) {
    return failure("submitOutsideTopupSlipAction", err, "Failed to submit top-up slip.");
  }
}

/**
 * Server Action to fetch all outside employees for Admin.
 */
export async function getAllOutsideEmployeesAction(): Promise<ActionResult<StoredOutsideEmployee[]>> {
  try {
    return { success: true, data: await listOutsideOwners() };
  } catch (err: unknown) {
    return failure("getAllOutsideEmployeesAction", err, "Failed to fetch outside employees.");
  }
}

/**
 * Server Action to fetch all topup slips for Admin.
 */
export async function getAllTopupSlipsAction(): Promise<ActionResult<StoredTopupSlip[]>> {
  try {
    return { success: true, data: await listTopupSlips() };
  } catch (err: unknown) {
    return failure("getAllTopupSlipsAction", err, "Failed to fetch top-up slips.");
  }
}

/**
 * Server Action to approve topup slip.
 */
export async function approveTopupSlipAction(
  slipId: string
): Promise<ActionResult<{ slip: StoredTopupSlip }>> {
  try {
    const slip = await approveTopup(slipId);
    revalidateOwnerPages();
    return { success: true, data: { slip }, message: "Top-up slip approved and balance credited." };
  } catch (err: unknown) {
    return failure("approveTopupSlipAction", err, "Failed to approve top-up slip.");
  }
}

/**
 * Server Action to delete/reject topup slip.
 */
export async function deleteTopupSlipAction(slipId: string): Promise<ActionResult<boolean>> {
  try {
    await removeTopupSlip(slipId);
    revalidateOwnerPages();
    return { success: true, data: true, message: "Top-up slip removed." };
  } catch (err: unknown) {
    return failure("deleteTopupSlipAction", err, "Failed to delete top-up slip.");
  }
}

export interface ManualOutsideEmployeeInput {
  adminPin: string;
  name: string;
  idNumber: string;
  phone: string;
  plateNumber: string;
  vehicleType?: string;
  baseCity?: string;
  initialBalance?: number;
  depositMethod?: "cash" | "bank";
  depositBank?: string;
  isAvailable?: boolean;
  status?: "active" | "inactive" | "suspended";
}

/**
 * Server Action (Admin only) - manually register an Outside Employee.
 * Admin is verified with the same PIN the dashboard login uses.
 */
export async function registerOutsideEmployeeManuallyAction(
  input: ManualOutsideEmployeeInput
): Promise<ActionResult<StoredOutsideEmployee>> {
  try {
    if (!isAdminPin(input?.adminPin)) {
      return { success: false, error: "Unauthorized: Admin access required.", code: "UNAUTHORIZED" };
    }

    const name = (input.name || "").trim();
    const idNumber = (input.idNumber || "").trim();
    const phone = (input.phone || "").trim();
    const plateNumber = (input.plateNumber || "").trim().toUpperCase();
    const vehicleType = (input.vehicleType || "").trim() || "14ft Lorry";
    const baseCity = (input.baseCity || "").trim() || "Colombo";
    const initialBalance = Number(input.initialBalance ?? 0);
    const status = input.status && ["active", "inactive", "suspended"].includes(input.status) ? input.status : "active";
    const isAvailable = status === "active" ? input.isAvailable !== false : false;

    if (name.length < 2) return { success: false, error: "Full name is required." };
    if (!/^(\d{9}[vVxX]|\d{12})$/.test(idNumber)) {
      return { success: false, error: "Enter a valid NIC (9 digits + V/X, or 12 digits)." };
    }
    if (!/^(\+94|0)?7\d{8}$/.test(phone.replace(/[\s-]/g, ""))) {
      return { success: false, error: "Enter a valid Sri Lankan mobile number (e.g. 0771234567)." };
    }
    if (!/^[A-Z0-9 \-]{4,20}$/.test(plateNumber)) {
      return { success: false, error: "Enter a valid vehicle number using letters, digits, spaces or dashes." };
    }
    if (!Number.isFinite(initialBalance) || initialBalance < 0) {
      return { success: false, error: "Opening balance must be 0 or more." };
    }

    if (initialBalance > 0 && input.depositMethod !== "cash" && input.depositMethod !== "bank") {
      return { success: false, error: "Choose how the deposit was paid." };
    }
    if (initialBalance > 0 && input.depositMethod === "bank" && !input.depositBank?.trim()) {
      return { success: false, error: "Choose the bank account that received the deposit." };
    }

    const employee = await createOutsideOwner({
      depositMethod: input.depositMethod,
      depositBank: input.depositBank?.trim(),
      name,
      phone,
      idNumber,
      plateNumber,
      vehicleType,
      baseCity,
      openingBalance: initialBalance,
      isAvailable,
      status,
      openingNote: "Manual registration by Admin - opening wallet balance",
    });
    revalidateOwnerPages();

    return { success: true, data: employee, message: `Outside Employee registered. Driver ID: ${employee.id}` };
  } catch (err: unknown) {
    return failure("registerOutsideEmployeeManuallyAction", err, "Failed to register outside employee.");
  }
}

function revalidateOwnerPages(): void {
  try {
    for (const path of ["/", "/admin", "/login", "/manage", "/book-vehicle", "/find-empty-lorry", "/register-vehicle"]) {
      revalidatePath(path);
    }
  } catch {
    // Revalidation is best-effort
  }
}

function failure(context: string, err: unknown, fallback: string): { success: false; error: string } {
  console.error(`${context} error:`, err);
  return { success: false, error: err instanceof OwnerError ? err.message : fallback };
}

function isAdminPin(pin?: string): boolean {
  const expected = process.env.ADMIN_PIN || process.env.NEXT_PUBLIC_ADMIN_PIN || "ST@2024";
  return Boolean(pin) && pin === expected;
}

/** Admin only: record a cash or bank payment into an owner's wallet. */
export async function recordWalletTopupAction(input: {
  adminPin: string;
  employeeId: string;
  amount: number;
  method: "cash" | "bank";
  bank?: string;
}): Promise<ActionResult<boolean>> {
  try {
    if (!isAdminPin(input.adminPin)) return { success: false, error: "Unauthorized: Admin access required." };
    await recordWalletTopup({ ...input, amount: Number(input.amount) });
    revalidateOwnerPages();
    return { success: true, data: true };
  } catch (err: unknown) {
    return failure("recordWalletTopupAction", err, "Failed to record the top-up.");
  }
}

/** Admin only: set how an earlier deposit or top-up was paid. */
export async function setWalletEntryPaymentAction(input: {
  adminPin: string;
  entryId: string;
  method: "cash" | "bank";
  bank?: string;
}): Promise<ActionResult<boolean>> {
  try {
    if (!isAdminPin(input.adminPin)) return { success: false, error: "Unauthorized: Admin access required." };
    await setWalletEntryPayment(input.entryId, input.method, input.bank);
    revalidateOwnerPages();
    return { success: true, data: true };
  } catch (err: unknown) {
    return failure("setWalletEntryPaymentAction", err, "Failed to update the payment method.");
  }
}
